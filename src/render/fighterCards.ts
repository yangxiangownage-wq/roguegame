import type { Battle } from '@/game/battle';
import { boardMetrics, type BoardSettings } from '@/config/board';
import {
  DEFAULT_HIT_FEEL,
  shakeAmplitude,
  shakeDecay,
  shakeDone,
  type HitFeel,
} from '@/config/hitFeel';
import {
  drawImpactBurst,
  spawnImpact,
  updateImpact,
  type ImpactBurst,
} from '@/render/impactFx';

export const CARD_W = 268;
export const CARD_H = 500;
const CARD_GAP = 36;

type StrikeRequest = {
  damage: number;
  reducedMotion: boolean;
  attacker?: 'hero' | 'foe';
  onImpact: () => void;
  onComplete: () => void;
};
type Strike = StrikeRequest & { elapsed: number; impacted: boolean; fxSpawned: boolean; sounded: boolean };
type FighterPose = { x: number; y: number; angle: number; sx: number; sy: number };
const STRIKE = { windup: 0.09, impact: 0.24, compress: 0.018, release: 0.3, end: 0.69 };
const REDUCED_STRIKE = { impact: 0.04, end: 0.34 };
let hitAudio: AudioContext | null = null;
let hitSources: AudioScheduledSourceNode[] = [];
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Red fill snaps in ~0.08s; white remnant holds briefly, then drains at a constant HP/s.
const HP_FILL_K = 26;
const HP_GHOST_HOLD = 0.14;
const HP_GHOST_SPEED = 28;
const HP_SNAP = 0.04;
type HpTrail = { target: number; fill: number; ghost: number; hold: number };

// Damped displacement with an explicit initial velocity: recoil carries momentum
// through the rest position instead of stopping there like an eased interpolation.
const springDisplacement = (t: number, displacement: number, velocity: number, damping: number, frequency: number) =>
  Math.exp(-damping * t) * (displacement * Math.cos(frequency * t)
    + (velocity + damping * displacement) / frequency * Math.sin(frequency * t));
const smoothstep = (u: number) => u * u * (3 - 2 * u);
const settleEnvelope = (t: number, duration: number) =>
  1 - smoothstep(clamp01((t - duration + 0.075) / 0.075));

/** Bleed beneath the opaque gold rim so filtering cannot reveal the stage. */
const INNER = { x: 0.025, y: 0.01, w: 0.95, h: 0.98 };

type FighterDef = {
  src: string;
  name: string;
  atk: number;
  armor?: number;
  statLabel?: string;
  hp: number;
  maxHp: number;
  inner: string;
};

const FIGHTERS: FighterDef[] = [
  {
    src: '/assets/chars/druid.png?v=1',
    name: '德鲁伊',
    atk: 0,
    armor: 0,
    hp: 20,
    maxHp: 20,
    inner: '#2a241c',
  },
  {
    src: '/assets/chars/elder.png?v=1',
    name: '老者',
    atk: 8,
    hp: 5,
    maxHp: 20,
    inner: '#2a241c',
  },
];

function stopHitSound(): void {
  for (const src of hitSources) {
    try { src.stop(); } catch { /* already finished */ }
  }
  hitSources = [];
}

function ensureHitAudio(): AudioContext | null {
  try {
    hitAudio ??= new AudioContext({ latencyHint: 'interactive' });
    if (hitAudio.state === 'suspended') void hitAudio.resume();
    return hitAudio;
  } catch {
    return null;
  }
}

/**
 * How far before the contact frame to start the graph so the speaker peak
 * lands on the slam. Windows/Chrome often reports 0 and then buffers 80–160ms.
 */
function hitAudioLead(ctx: AudioContext): number {
  const output = typeof ctx.outputLatency === 'number' ? ctx.outputLatency : 0;
  const base = typeof ctx.baseLatency === 'number' ? ctx.baseLatency : 0;
  const reported = output > 0.01 ? output : base;
  const lead = reported > 0.01 ? reported + 0.04 : 0.14;
  return Math.min(0.22, Math.max(0.12, lead));
}

function playHitSound(damage: number): boolean {
  try {
    const ctx = ensureHitAudio();
    if (!ctx) return false;
    const t0 = ctx.currentTime;
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(90 + damage * 6, t0);
    thump.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
    const thumpPeak = 0.32 + damage * 0.03;
    thumpGain.gain.setValueAtTime(thumpPeak, t0);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(t0);
    thump.stop(t0 + 0.18);

    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(420 + damage * 40, t0);
    clickGain.gain.setValueAtTime(0.12, t0);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    click.connect(clickGain).connect(ctx.destination);
    click.start(t0);
    click.stop(t0 + 0.045);

    hitSources.push(thump, click);

    if (damage >= 6) {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.22), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 720;
      const crowd = ctx.createGain();
      crowd.gain.setValueAtTime(0.07 + damage * 0.008, t0);
      crowd.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
      noise.buffer = buffer;
      noise.connect(filter).connect(crowd).connect(ctx.destination);
      noise.start(t0);
      hitSources.push(noise);
    }
    return true;
  } catch {
    // Audio is optional juice; a blocked Autoplay policy should not stall combat.
    return false;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

// Preserve the stage's painted art; use quiet, antique-gold HUD typography.
const LABEL_FONT = '"PingFang SC", "Hiragino Sans GB", sans-serif';
const GOLD = '#b49156';
const IVORY = '#f4e6c9';

export class FighterCards {
  private readonly cards: HTMLCanvasElement[] = [];
  private readonly fighters = FIGHTERS.map(f => ({ ...f }));
  private battleRevision = -1;
  private strike: Strike | null = null;
  private shakeAge = 0;
  private shakeAmp = 0;
  private shakeDir = 1;
  private feel: HitFeel = { ...DEFAULT_HIT_FEEL };
  private burst: ImpactBurst | null = null;
  private originHero: FighterPose | null = null;
  private originFoe: FighterPose | null = null;
  private settlementPreview: { attack: number; armor: number; foeHp?: number } | null = null;
  private readonly hpTrails: HpTrail[] = FIGHTERS.map(f => ({ target: f.hp, fill: f.hp, ghost: f.hp, hold: 0 }));
  private readonly reducedMotion = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  private constructor(
    private readonly portraits: HTMLImageElement[],
    private readonly frame: HTMLImageElement,
    private readonly fxDust: HTMLImageElement | null,
    private readonly fxStar: HTMLImageElement | null,
  ) {
    // Rasterize at the maximum stage DPR; HP trails re-blit the cards while catching up.
    for (let i = 0; i < FIGHTERS.length; i++) {
      const card = document.createElement('canvas');
      card.width = CARD_W * 2;
      card.height = CARD_H * 2;
      const context = card.getContext('2d');
      if (!context) throw new Error('fighter canvas unavailable');
      context.scale(2, 2);
      this.drawCard(context, 0, 0, i);
      this.cards.push(card);
    }
  }

  static async create(): Promise<FighterCards> {
    const loadFx = (src: string) => loadImage(src).catch(() => null);
    const [portraits, frame, fxDust, fxStar] = await Promise.all([
      Promise.all(FIGHTERS.map((f) => loadImage(f.src))),
      loadImage('/assets/ui/card-frame.png'),
      loadFx('/assets/fx/impact-dust.png?v=2'),
      loadFx('/assets/fx/impact-star.png?v=3'),
    ]);
    return new FighterCards(portraits, frame, fxDust, fxStar);
  }

  setBattle(battle: Battle): void {
    if (this.battleRevision === battle.revision) return;
    this.battleRevision = battle.revision;
    const boardAttack = battle.units
      .filter(unit => unit.owner === 'player')
      .reduce((total, unit) => total + (unit.attack ?? 0), 0);
    const incoming = battle.enemyIncoming();
    Object.assign(this.fighters[0]!, { hp: battle.heroHp, maxHp: battle.heroMaxHp, atk: boardAttack, armor: battle.block, statLabel: undefined });
    Object.assign(this.fighters[1]!, { hp: battle.foeHp, maxHp: battle.foeMaxHp, atk: incoming.total, statLabel: '来袭' });
    this.syncHpTrails();
    this.redrawCards();
  }

  setSettlementPreview(values: { attack: number; armor: number; foeHp?: number } | null): void {
    this.settlementPreview = values;
    this.syncHpTrails();
    this.redrawCards();
  }

  private shownHp(i: number): number {
    const f = this.fighters[i]!;
    const raw = i === 1 ? this.settlementPreview?.foeHp ?? f.hp : f.hp;
    return Math.max(0, Math.min(raw, f.maxHp));
  }

  private syncHpTrails(): void {
    const reduced = this.reducedMotion.matches;
    for (let i = 0; i < this.hpTrails.length; i++) {
      const trail = this.hpTrails[i]!;
      const hp = this.shownHp(i);
      if (reduced) {
        trail.target = trail.fill = trail.ghost = hp;
        trail.hold = 0;
        continue;
      }
      if (hp < trail.target - 0.001) {
        trail.ghost = Math.max(trail.ghost, trail.fill);
        trail.hold = HP_GHOST_HOLD;
      } else if (hp > trail.target + 0.001) {
        trail.fill = trail.ghost = hp;
        trail.hold = 0;
      }
      trail.target = hp;
    }
  }

  private updateHpTrails(dt: number): boolean {
    let moved = false;
    for (const trail of this.hpTrails) {
      const prevFill = trail.fill;
      const prevGhost = trail.ghost;
      trail.fill += (trail.target - trail.fill) * (1 - Math.exp(-HP_FILL_K * dt));
      if (Math.abs(trail.fill - trail.target) < HP_SNAP) trail.fill = trail.target;
      if (trail.hold > 0) trail.hold = Math.max(0, trail.hold - dt);
      else if (trail.ghost > trail.fill) {
        trail.ghost = Math.max(trail.fill, trail.ghost - HP_GHOST_SPEED * dt);
        if (trail.ghost - trail.fill < HP_SNAP) trail.ghost = trail.fill;
      } else {
        trail.ghost = trail.fill;
      }
      if (trail.fill !== prevFill || trail.ghost !== prevGhost) moved = true;
    }
    return moved;
  }

  private redrawCards(): void {
    for (let i = 0; i < this.cards.length; i++) {
      const canvas = this.cards[i]!;
      const g = canvas.getContext('2d')!;
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.clearRect(0, 0, CARD_W, CARD_H);
      this.drawCard(g, 0, 0, i);
    }
  }

  setHitFeel(feel: HitFeel): void {
    this.feel = feel;
    this.redrawCards();
  }

  refreshCards(): void {
    this.redrawCards();
  }

  primeAudio(): void {
    ensureHitAudio();
  }

  playStrike(request: StrikeRequest): number {
    const timing = request.reducedMotion ? REDUCED_STRIKE : STRIKE;
    stopHitSound();
    ensureHitAudio();
    this.strike = { ...request, elapsed: 0, impacted: false, fxSpawned: false, sounded: false };
    return timing.end;
  }

  previewShake(damage: number): void {
    stopHitSound();
    playHitSound(damage);
    this.shakeAge = 0;
    this.shakeAmp = shakeAmplitude(this.feel, damage);
  }

  previewStrike(damage: number): void {
    if (this.strike) {
      this.previewShake(damage);
      return;
    }
    this.playStrike({
      damage,
      reducedMotion: false,
      onImpact: () => {},
      onComplete: () => {},
    });
  }

  cancelStrike(): void {
    stopHitSound();
    this.strike = null;
  }

  clearBurst(): void {
    this.burst = null;
  }

  private spawnContactFx(direction: number, hero: FighterPose, foe: FighterPose, damage: number): void {
    if (!this.feel.showBurst) {
      this.burst = null;
      return;
    }
    const punch = this.attackPose(STRIKE.impact, hero, foe);
    this.burst = spawnImpact(
      punch.x + direction * CARD_W * 0.48,
      punch.y,
      direction,
      damage,
      0,
    );
  }

  cameraShake(): { x: number; y: number } {
    if (this.shakeAmp < 0.2) return { x: 0, y: 0 };
    const decay = shakeDecay(this.feel.duration);
    const envelope = Math.exp(-decay * this.shakeAge);
    if (envelope < 0.02) return { x: 0, y: 0 };
    const omega = Math.PI * 2 * this.feel.frequency;
    const wave = Math.sin(omega * this.shakeAge);
    const lift = Math.sin(omega * this.shakeAge + 0.9);
    return {
      x: this.shakeDir * this.shakeAmp * envelope * wave,
      y: this.shakeAmp * 0.42 * envelope * lift,
    };
  }

  update(dt: number): void {
    if (this.shakeAmp > 0) {
      this.shakeAge += dt;
      if (shakeDone(this.shakeAge, this.feel.duration)) this.shakeAmp = 0;
    }
    if (this.burst && !updateImpact(this.burst, dt)) this.burst = null;
    if (this.updateHpTrails(dt)) this.redrawCards();
    const strike = this.strike;
    if (!strike) return;
    strike.elapsed += dt;
    const timing = strike.reducedMotion ? REDUCED_STRIKE : STRIKE;
    if (!strike.sounded && !strike.reducedMotion) {
      const ctx = ensureHitAudio();
      const lead = ctx ? hitAudioLead(ctx) : 0.14;
      if (strike.elapsed >= timing.impact - lead) {
        stopHitSound();
        strike.sounded = playHitSound(strike.damage);
      }
    }
    if (!strike.impacted && strike.elapsed >= timing.impact) {
      strike.impacted = true;
      if (!strike.reducedMotion) {
        this.shakeAge = 0;
        this.shakeAmp = shakeAmplitude(this.feel, strike.damage);
        const hero = this.originHero;
        const foe = this.originFoe;
        const towardFoe = hero && foe && foe.x >= hero.x ? 1 : -1;
        const dir = strike.attacker === 'foe' ? -towardFoe : towardFoe;
        this.shakeDir = dir;
        if (hero && foe && !strike.fxSpawned) {
          strike.fxSpawned = true;
          const from = strike.attacker === 'foe' ? foe : hero;
          const to = strike.attacker === 'foe' ? hero : foe;
          this.spawnContactFx(dir, from, to, strike.damage);
        }
      }
      strike.onImpact();
    }
    if (this.strike === strike && strike.elapsed >= timing.end) {
      this.strike = null;
      strike.onComplete();
    }
  }

  private attackPose(t: number, origin: FighterPose, target: FighterPose): FighterPose {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / length;
    const ny = dy / length;
    const contact = { x: target.x - nx * CARD_W * 0.48, y: target.y - ny * CARD_W * 0.48 - 12 };
    const back = { x: origin.x - nx * 30, y: origin.y - ny * 30 + 5 };
    const direction = dx >= 0 ? 1 : -1;
    if (t < STRIKE.windup) {
      const u = smoothstep(clamp01(t / STRIKE.windup));
      return { x: lerp(origin.x, back.x, u), y: lerp(origin.y, back.y, u),
        angle: -0.085 * u * direction, sx: 1 - 0.045 * u, sy: 1 + 0.025 * u };
    }
    if (t < STRIKE.impact) {
      const u = clamp01((t - STRIKE.windup) / (STRIKE.impact - STRIKE.windup));
      const travel = u * u;
      return { x: lerp(back.x, contact.x, travel), y: lerp(back.y, contact.y, travel) - Math.sin(u * Math.PI) * 14,
        angle: lerp(-0.085, 0.075, travel) * direction, sx: lerp(0.955, 1.065, u), sy: lerp(1.025, 0.965, u) };
    }
    // Compress into contact, then hold both bodies for a short hit stop.
    const compression = 1 - Math.pow(1 - clamp01((t - STRIKE.impact) / STRIKE.compress), 2);
    const pressed = { x: contact.x + nx * 14, y: contact.y + ny * 14 };
    if (t < STRIKE.release) return {
      x: lerp(contact.x, pressed.x, compression), y: lerp(contact.y, pressed.y, compression),
      angle: (0.075 + 0.025 * compression) * direction,
      sx: lerp(1.065, 0.9, compression), sy: lerp(0.965, 1.055, compression),
    };
    const age = t - STRIKE.release;
    const envelope = settleEnvelope(age, STRIKE.end - STRIKE.release);
    const spring = (distance: number, velocity: number) =>
      springDisplacement(age, distance, velocity, 14, 11) * envelope;
    return {
      x: origin.x + spring(pressed.x - origin.x, -nx * 900),
      y: origin.y + spring(pressed.y - origin.y, -ny * 900 - 170),
      // Rotation lags behind translation; the frame swings once as it settles.
      angle: springDisplacement(age, 0.1 * direction, -direction * 1.5, 12, 19) * envelope,
      sx: 1 + springDisplacement(age, -0.1, 1.8, 17, 23) * envelope,
      sy: 1 + springDisplacement(age, 0.055, -0.9, 17, 23) * envelope,
    };
  }

  private defenderPose(t: number, origin: FighterPose, attacker: FighterPose): FighterPose {
    if (t < STRIKE.impact) return origin;
    const dx = origin.x - attacker.x;
    const dy = origin.y - attacker.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / length;
    const ny = dy / length;
    const direction = dx >= 0 ? 1 : -1;
    const compression = 1 - Math.pow(1 - clamp01((t - STRIKE.impact) / STRIKE.compress), 2);
    if (t < STRIKE.release) return { ...origin,
      x: origin.x + nx * 10 * compression, y: origin.y + ny * 10 * compression,
      angle: direction * 0.025 * compression, sx: 1 - 0.075 * compression, sy: 1 + 0.035 * compression,
    };
    const age = t - STRIKE.release;
    const envelope = settleEnvelope(age, STRIKE.end - STRIKE.release);
    // The same collision launches the defender forward and the attacker backward.
    const recoil = springDisplacement(age, 10, 1550, 12, 23) * envelope;
    return { ...origin,
      x: origin.x + nx * recoil,
      y: origin.y + ny * recoil + springDisplacement(age, 0, -110, 12, 23) * envelope,
      angle: direction * springDisplacement(age, 0.025, 3.1, 11, 20) * envelope,
      sx: 1 + springDisplacement(age, -0.075, 1.2, 16, 26) * envelope,
      sy: 1 + springDisplacement(age, 0.035, -0.6, 16, 26) * envelope,
    };
  }

  private paintFighter(g: CanvasRenderingContext2D, index: number, pose: FighterPose, alpha = 1, flash = 0): void {
    g.save();
    g.globalAlpha = alpha;
    g.translate(pose.x, pose.y);
    g.rotate(pose.angle);
    g.scale(pose.sx, pose.sy);
    g.shadowColor = 'rgba(12, 5, 7, 0.6)';
    g.shadowBlur = 24;
    g.shadowOffsetY = 12;
    g.drawImage(this.cards[index]!, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
    if (flash > 0.01) {
      g.shadowBlur = 0;
      g.globalAlpha = flash;
      g.filter = 'brightness(2.4) saturate(0.25)';
      g.drawImage(this.cards[index]!, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
    }
    g.restore();
  }

  draw(g: CanvasRenderingContext2D, s: BoardSettings): void {
    const m = boardMetrics(s);
    const baseY = Math.round(m.originY + (m.spanH - CARD_H) / 2);
    const hero: FighterPose = { x: m.originX - CARD_GAP - CARD_W / 2 + s.heroNudgeX, y: baseY + s.heroNudgeY + CARD_H / 2, angle: 0, sx: 1, sy: 1 };
    const foe: FighterPose = { x: m.originX + m.spanW + CARD_GAP + CARD_W / 2 + s.foeNudgeX, y: baseY + s.foeNudgeY + CARD_H / 2, angle: 0, sx: 1, sy: 1 };
    this.originHero = hero;
    this.originFoe = foe;
    const strike = this.strike;
    if (!strike) {
      this.paintFighter(g, 0, hero);
      this.paintFighter(g, 1, foe);
      if (this.burst) {
        drawImpactBurst(g, this.burst, { dust: this.fxDust ?? undefined, star: this.fxStar ?? undefined });
      }
      return;
    }
    const timing = strike.reducedMotion ? REDUCED_STRIKE : STRIKE;
    const age = strike.elapsed - timing.impact;
    const hit = strike.impacted;
    const fromFoe = strike.attacker === 'foe';
    const attackerOrigin = fromFoe ? foe : hero;
    const defenderOrigin = fromFoe ? hero : foe;
    const attackerIndex = fromFoe ? 1 : 0;
    const defenderIndex = fromFoe ? 0 : 1;
    const direction = fromFoe ? (hero.x >= foe.x ? 1 : -1) : (foe.x >= hero.x ? 1 : -1);
    if (hit) this.shakeDir = direction;
    const defender = strike.reducedMotion ? defenderOrigin : this.defenderPose(strike.elapsed, defenderOrigin, attackerOrigin);
    const attacker = strike.reducedMotion ? attackerOrigin : this.attackPose(strike.elapsed, attackerOrigin, defenderOrigin);
    if (hit && !strike.reducedMotion && !strike.fxSpawned) {
      strike.fxSpawned = true;
      this.spawnContactFx(direction, attackerOrigin, defenderOrigin, strike.damage);
    }
    this.paintFighter(g, defenderIndex, defender, 1, hit ? Math.exp(-Math.max(0, age) * 38) * 0.55 : 0);
    if (!strike.reducedMotion && strike.elapsed > STRIKE.windup + 0.05 && strike.elapsed < STRIKE.impact) {
      this.paintFighter(g, attackerIndex, this.attackPose(strike.elapsed - 0.036, attackerOrigin, defenderOrigin), 0.06);
      this.paintFighter(g, attackerIndex, this.attackPose(strike.elapsed - 0.018, attackerOrigin, defenderOrigin), 0.12);
    }
    this.paintFighter(g, attackerIndex, attacker);
    if (this.burst) {
      drawImpactBurst(g, this.burst, { dust: this.fxDust ?? undefined, star: this.fxStar ?? undefined });
    }
    if (hit) this.drawImpact(g, defender, strike, age);
  }

  private drawImpact(g: CanvasRenderingContext2D, target: FighterPose, strike: Strike, age: number): void {
    const end = strike.reducedMotion ? REDUCED_STRIKE.end : STRIKE.end;
    const alpha = clamp01((end - strike.elapsed) / 0.1);
    const pop = strike.reducedMotion ? 1 : age < 0.035 ? lerp(0.9, 1.25, age / 0.035) : 1 + springDisplacement(age - 0.035, 0.25, -2, 22, 26);
    const text = `−${strike.damage}`;
    const radius = Math.max(46, text.length * 10 + 12);
    g.save();
    g.globalAlpha = alpha;
    g.translate(target.x, target.y - 68 - (strike.reducedMotion ? 0 : age * 32));
    g.scale(pop, pop);
    g.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = i * Math.PI / 10 - Math.PI / 2;
      const r = radius * (i % 2 ? 0.76 : 1);
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#71291f';
    g.strokeStyle = '#ffe0a0';
    g.lineWidth = 3;
    g.shadowColor = '#170c08aa';
    g.shadowBlur = 12;
    g.fill();
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#fff3ce';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.min(44, 140 / text.length)}px "Settlement Digits", sans-serif`;
    g.fillText(text, 0, 1);
    g.restore();
  }

  private drawCard(g: CanvasRenderingContext2D, x: number, y: number, i: number): void {
    const f = this.fighters[i]!;
    const portrait = this.portraits[i]!;
    const w = CARD_W;
    const h = CARD_H;
    const ix = x + w * INNER.x;
    const iy = y + h * INNER.y;
    const iw = w * INNER.w;
    const ih = h * INNER.h;

    g.save();
    roundRect(g, ix, iy, iw, ih, 18);
    g.clip();

    const backdrop = g.createRadialGradient(x + w * 0.5, y + 130, 12, x + w * 0.5, y + 190, 290);
    backdrop.addColorStop(0, f.inner);
    backdrop.addColorStop(1, '#151311');
    g.fillStyle = backdrop;
    g.fillRect(ix, iy, iw, ih);

    const portraitHeight = 376;
    const scale = Math.min(iw / portrait.naturalWidth, portraitHeight / portrait.naturalHeight) * 1.08;
    const dw = portrait.naturalWidth * scale;
    const dh = portrait.naturalHeight * scale;
    const px = x + (w - dw) / 2;
    const py = iy + 8;
    g.drawImage(portrait, px, py, dw, dh);

    const fade = g.createLinearGradient(0, y + 282, 0, y + 382);
    fade.addColorStop(0, 'rgba(23, 18, 17, 0)');
    fade.addColorStop(0.7, 'rgba(23, 18, 17, 0.88)');
    fade.addColorStop(1, '#171211');
    g.fillStyle = fade;
    g.fillRect(ix, y + 282, iw, 100);
    g.fillStyle = '#171211';
    g.fillRect(ix, y + 382, iw, h - 382);

    // Name and attack share a baseline, outside the portrait's focal area.
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = IVORY;
    g.font = `600 26px ${LABEL_FONT}`;
    g.fillText(f.name, x + 22, y + 372);
    if (i === 0) {
      const displayedAttack = this.settlementPreview?.attack ?? f.atk;
      const displayedArmor = this.settlementPreview?.armor ?? f.armor ?? 0;
      g.font = `500 11px ${LABEL_FONT}`;
      g.fillStyle = '#d08b70';
      g.textAlign = 'left';
      g.fillText('攻', x + 126, y + 374);
      g.textAlign = 'right';
      g.fillStyle = '#f0c0a9';
      g.font = '600 19px Georgia, serif';
      g.fillText(String(displayedAttack), x + 168, y + 374);
      g.textAlign = 'left';
      g.fillStyle = '#92b69c';
      g.font = `500 11px ${LABEL_FONT}`;
      g.fillText('甲', x + 184, y + 374);
      g.textAlign = 'right';
      g.fillStyle = '#c9e2d0';
      g.font = '600 19px Georgia, serif';
      g.fillText(String(displayedArmor), x + w - 22, y + 374);
    } else {
      g.fillStyle = '#bcaa8b';
      g.font = `500 12px ${LABEL_FONT}`;
      g.fillText(f.statLabel ?? '攻击', x + 170, y + 374);
      g.textAlign = 'right';
      g.fillStyle = IVORY;
      g.font = '600 27px Georgia, serif';
      g.fillText(String(f.atk), x + w - 30, y + 373);
    }

    const rule = g.createLinearGradient(x + 30, 0, x + w - 30, 0);
    rule.addColorStop(0, '#5c4931');
    rule.addColorStop(0.5, GOLD);
    rule.addColorStop(1, '#5c4931');
    g.fillStyle = rule;
    g.fillRect(x + 30, y + 398, w - 60, 1);

    const hp = this.shownHp(i);
    const trail = this.hpTrails[i]!;
    const maxHp = Math.max(1, f.maxHp);
    const fillRatio = clamp01(trail.fill / maxHp);
    const ghostRatio = clamp01(Math.max(trail.ghost, trail.fill) / maxHp);
    const ratio = clamp01(hp / maxHp);
    const low = ratio > 0 && ratio <= 0.25;
    g.textAlign = 'left';
    g.fillStyle = low ? '#e9a08b' : '#bcaa8b';
    g.font = `500 13px ${LABEL_FONT}`;
    g.fillText(low ? '生命 · 濒危' : '生命', x + 30, y + 418);
    g.textAlign = 'right';
    g.fillStyle = IVORY;
    g.font = '600 18px Georgia, serif';
    g.fillText(`${hp} / ${f.maxHp}`, x + w - 30, y + 418);

    const barX = x + 30;
    const barY = y + 437;
    const barW = w - 60;
    const barH = 16;
    const innerW = barW - 6;
    const innerH = barH - 6;
    roundRect(g, barX, barY, barW, barH, 4);
    g.fillStyle = '#0e0d0c';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = '#846740';
    g.stroke();
    // Clip the fill so zero HP is truly empty and tiny values remain proportional.
    g.save();
    roundRect(g, barX + 3, barY + 3, innerW, innerH, 2);
    g.clip();
    if (ghostRatio > fillRatio + 0.002) {
      const ghost = g.createLinearGradient(0, barY + 3, 0, barY + barH - 3);
      ghost.addColorStop(0, '#fffdf6');
      ghost.addColorStop(0.45, '#f3ead4');
      ghost.addColorStop(1, '#d8cbb0');
      g.fillStyle = ghost;
      g.fillRect(barX + 3, barY + 3, innerW * ghostRatio, innerH);
    }
    const fill = g.createLinearGradient(0, barY + 3, 0, barY + barH - 3);
    fill.addColorStop(0, low ? '#e88465' : '#c96550');
    fill.addColorStop(0.45, low ? '#c54b38' : '#a73f35');
    fill.addColorStop(1, '#6f2527');
    g.fillStyle = fill;
    g.fillRect(barX + 3, barY + 3, innerW * fillRatio, innerH);
    g.fillStyle = 'rgba(22, 12, 12, 0.5)';
    for (let n = 1; n < 4; n++) {
      g.fillRect(barX + 3 + innerW * n / 4, barY + 3, 1, innerH);
    }
    g.restore();
    g.restore();

    g.save();
    g.filter = 'saturate(0.75)';
    g.drawImage(this.frame, x, y, w, h);
    g.restore();
  }
}
