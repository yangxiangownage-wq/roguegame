import './feel.css';

type LayerId = 'time' | 'motion' | 'camera' | 'vfx' | 'audio' | 'numbers' | 'tier';
type Preset = 'current' | 'recommended' | 'custom';
type Pose = { x: number; y: number; angle: number; sx: number; sy: number };
type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; kind: 'streak' | 'dust' | 'rock';
};

const LAYERS: { id: LayerId; name: string; note: string; color: string }[] = [
  { id: 'time', name: '时间 · Hitstop', note: '接触定格', color: '#e8b86d' },
  { id: 'motion', name: '运动 · 挤压击退', note: '预备 / 残影 / 弹簧', color: '#7ec8a4' },
  { id: 'camera', name: '镜头 · Trauma²', note: '方向 kick', color: '#8ab4f8' },
  { id: 'vfx', name: '特效 · 闪光碎屑', note: '钉在接触帧', color: '#f0a0c0' },
  { id: 'audio', name: '声音 · Thump', note: 'WebAudio 示意', color: '#c9a0f0' },
  { id: 'numbers', name: '数字 · −伤害', note: '与接触同拍', color: '#f5d76e' },
  { id: 'tier', name: '伤害档 · Smash', note: '1–10 加层', color: '#e07050' },
];

const CURRENT = { windup: 0.09, impact: 0.24, compress: 0.018, release: 0.3, end: 0.69 };
const REC = { windup: 0.1, impact: 0.22, compress: 0.04, release: 0.34, end: 0.78 };
const CARD_W = 168;
const CARD_H = 312;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (u: number) => u * u * (3 - 2 * u);
const springDisplacement = (t: number, displacement: number, velocity: number, damping: number, frequency: number) =>
  Math.exp(-damping * t) * (displacement * Math.cos(frequency * t)
    + (velocity + damping * displacement) / frequency * Math.sin(frequency * t));
const settleEnvelope = (t: number, duration: number) =>
  1 - smoothstep(clamp01((t - duration + 0.075) / 0.075));

const PRESETS: Record<Exclude<Preset, 'custom'>, Record<LayerId, boolean>> = {
  current: { time: false, motion: true, camera: false, vfx: true, audio: false, numbers: true, tier: false },
  recommended: { time: true, motion: true, camera: true, vfx: true, audio: true, numbers: true, tier: true },
};

const canvas = document.querySelector<HTMLCanvasElement>('#feel-canvas')!;
const ctx = canvas.getContext('2d')!;
const timelineEl = document.querySelector('#feel-timeline')!;
const phaseEl = document.querySelector('#feel-phase')!;
const hintEl = document.querySelector('#feel-hint')!;
const damageInput = document.querySelector<HTMLInputElement>('#feel-damage')!;
const damageLabel = document.querySelector('#feel-damage-label')!;
const loopInput = document.querySelector<HTMLInputElement>('#feel-loop')!;
const playBtn = document.querySelector<HTMLButtonElement>('#feel-play')!;
const toggleRoot = document.querySelector('#feel-toggles')!;

let preset: Preset = 'current';
let layers: Record<LayerId, boolean> = { ...PRESETS.current };
let damage = 4;
let elapsed = 0;
let playing = false;
let hitstop = 0;
let fxAge = 0;
let impacted = false;
let trauma = 0;
let kick = 0;
let camX = 0;
let camY = 0;
let particles: Particle[] = [];
let last = performance.now();
let audioCtx: AudioContext | null = null;

const images = {
  hero: new Image(),
  foe: new Image(),
};
images.hero.src = '/assets/chars/druid.png?v=1';
images.foe.src = '/assets/chars/foe.png?v=1';

const originHero = (): Pose => ({ x: 280, y: 290, angle: 0, sx: 1, sy: 1 });
const originFoe = (): Pose => ({ x: 680, y: 290, angle: 0, sx: 1, sy: 1 });

const timing = () => (preset === 'current' && !layers.time ? CURRENT : layers.time ? REC : CURRENT);

function hitstopDuration(): number {
  if (!layers.time) return 0;
  const frames = layers.tier ? 2 + damage * 0.7 : 3;
  return Math.min(0.16, Math.max(0.033, frames / 60));
}

function traumaPulse(): number {
  if (!layers.camera) return 0;
  const base = layers.tier ? 0.12 + damage * 0.07 : 0.28;
  return Math.min(1, base);
}

function flashAtRelease(): boolean {
  return preset === 'current' && !layers.time;
}

function renderToggles(): void {
  toggleRoot.innerHTML = LAYERS.map((layer) => `
    <li style="--swatch:${layer.color}">
      <input id="layer-${layer.id}" type="checkbox" ${layers[layer.id] ? 'checked' : ''} />
      <label for="layer-${layer.id}">${layer.name}</label>
      <small>${layer.note}</small>
    </li>
  `).join('');
  toggleRoot.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.id.replace('layer-', '') as LayerId;
      layers[id] = input.checked;
      preset = 'custom';
      document.querySelectorAll('.feel-presets button').forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-preset') === 'custom');
      });
      updateHint();
      markLadder();
    });
  });
}

function updateHint(): void {
  const missing = LAYERS.filter((layer) => !layers[layer.id]).map((layer) => layer.name.split(' · ')[0]);
  if (preset === 'current') {
    hintEl.textContent = '当前：有运动和晚到的闪光，没有定格、镜头、声音和伤害档。这就是“打上去发飘”的原因。';
    return;
  }
  if (preset === 'recommended') {
    hintEl.textContent = '推荐：七层同时钉在 impact。拖伤害档看 1 和 10 的差别。';
    return;
  }
  hintEl.textContent = missing.length ? `已关掉：${missing.join('、')}。` : '七层全开，自定义。';
}

function markLadder(): void {
  document.querySelectorAll('.feel-ladder li').forEach((li) => {
    const tier = Number(li.getAttribute('data-tier'));
    li.classList.toggle('is-active', tier === damage);
  });
  damageLabel.textContent = String(damage);
}

function setPreset(next: Preset): void {
  preset = next;
  if (next !== 'custom') layers = { ...PRESETS[next] };
  document.querySelectorAll('.feel-presets button').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-preset') === next);
  });
  renderToggles();
  updateHint();
  markLadder();
}

function buildTimeline(): void {
  const t = timing();
  const hit = layers.time ? hitstopDuration() : 0;
  const total = t.end + hit;
  const parts = [
    { id: 'windup', name: '蓄力', dur: t.windup, color: '#7ec8a4' },
    { id: 'dash', name: '冲刺', dur: t.impact - t.windup, color: '#8ab4f8' },
    { id: 'compress', name: '挤压', dur: t.compress, color: '#f0a0c0' },
    { id: 'stop', name: layers.time ? '定格' : '咬合', dur: (t.release - t.impact - t.compress) + hit, color: '#e8b86d' },
    { id: 'release', name: '回弹', dur: t.end - t.release, color: '#e07050' },
  ];
  timelineEl.innerHTML = parts.map((part) =>
    `<span data-id="${part.id}" style="flex:${Math.max(part.dur, 0.001)};background:${part.color}">${part.name}</span>`
  ).join('');
  timelineEl.dataset.total = String(total);
}

function phaseName(tNow: number): string {
  const t = timing();
  if (!playing && tNow <= 0) return '待机 · 点播放看接触点';
  if (hitstop > 0) return `定格 ${Math.round(hitstop * 1000)}ms · 闪光和镜头继续`;
  if (tNow < t.windup) return `蓄力 ${Math.round(tNow * 1000)}ms`;
  if (tNow < t.impact) return `冲刺 · 接触倒计时 ${Math.round((t.impact - tNow) * 1000)}ms`;
  if (tNow < t.impact + t.compress) return '挤压接触';
  if (tNow < t.release) return '咬合保持';
  return '弹簧回弹';
}

function playHitSound(): void {
  if (!layers.audio) return;
  audioCtx ??= new AudioContext();
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(90 + damage * 6, now);
  thump.frequency.exponentialRampToValueAtTime(42, now + 0.12);
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.35 + damage * 0.04, now + 0.01);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  thump.connect(thumpGain).connect(ctx.destination);
  thump.start(now);
  thump.stop(now + 0.2);

  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = 'triangle';
  click.frequency.setValueAtTime(420 + damage * 40, now);
  clickGain.gain.setValueAtTime(0.12, now);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  click.connect(clickGain).connect(ctx.destination);
  click.start(now);
  click.stop(now + 0.05);

  if (layers.tier && damage >= 6) {
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    const crowd = ctx.createGain();
    crowd.gain.setValueAtTime(0.08 + damage * 0.01, now);
    crowd.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    noise.buffer = buffer;
    noise.connect(filter).connect(crowd).connect(ctx.destination);
    noise.start(now);
  }
}

function spawnImpact(target: Pose, direction: number): void {
  particles = [];
  const count = layers.tier ? 6 + damage * 3 : 9;
  for (let i = 0; i < count; i++) {
    const angle = -1.35 + i * (2.7 / Math.max(1, count - 1));
    const speed = (layers.tier ? 180 + damage * 28 : 260) + (i % 3) * 80;
    particles.push({
      x: target.x, y: target.y - 20,
      vx: Math.cos(angle) * speed * direction,
      vy: Math.sin(angle) * speed - 80,
      life: 0, max: 0.26 + (layers.tier ? damage * 0.01 : 0),
      size: layers.tier && damage >= 6 ? 5 + (i % 3) : 3,
      color: '#fff1bd',
      kind: layers.tier && damage >= 3 && i % 3 === 0 ? 'rock' : 'streak',
    });
  }
  if (layers.tier && damage >= 2) {
    for (let i = 0; i < 8 + damage; i++) {
      const a = Math.random() * Math.PI - Math.PI / 2;
      particles.push({
        x: target.x, y: target.y + 40,
        vx: Math.cos(a) * (40 + Math.random() * 80) * direction,
        vy: -20 - Math.random() * 60,
        life: 0, max: 0.4,
        size: 2 + Math.random() * 3,
        color: '#c4a66b',
        kind: 'dust',
      });
    }
  }
}

function attackPose(tNow: number, origin: Pose, target: Pose): Pose {
  if (!layers.motion) return origin;
  const t = timing();
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / length;
  const ny = dy / length;
  const contact = { x: target.x - nx * CARD_W * 0.52, y: target.y - ny * CARD_W * 0.12 - 8 };
  const back = { x: origin.x - nx * 24, y: origin.y - ny * 18 + 4 };
  const direction = dx >= 0 ? 1 : -1;
  if (tNow < t.windup) {
    const u = smoothstep(clamp01(tNow / t.windup));
    return { x: lerp(origin.x, back.x, u), y: lerp(origin.y, back.y, u),
      angle: -0.085 * u * direction, sx: 1 - 0.045 * u, sy: 1 + 0.025 * u };
  }
  if (tNow < t.impact) {
    const u = clamp01((tNow - t.windup) / (t.impact - t.windup));
    const travel = u * u;
    return { x: lerp(back.x, contact.x, travel), y: lerp(back.y, contact.y, travel) - Math.sin(u * Math.PI) * 10,
      angle: lerp(-0.085, 0.075, travel) * direction, sx: lerp(0.955, 1.065, u), sy: lerp(1.025, 0.965, u) };
  }
  const compression = 1 - Math.pow(1 - clamp01((tNow - t.impact) / t.compress), 2);
  const pressed = { x: contact.x + nx * 10, y: contact.y + ny * 10 };
  if (tNow < t.release) {
    return {
      x: lerp(contact.x, pressed.x, compression), y: lerp(contact.y, pressed.y, compression),
      angle: (0.075 + 0.025 * compression) * direction,
      sx: lerp(1.065, 0.9, compression), sy: lerp(0.965, 1.055, compression),
    };
  }
  const age = tNow - t.release;
  const envelope = settleEnvelope(age, t.end - t.release);
  const spring = (distance: number, velocity: number) =>
    springDisplacement(age, distance, velocity, 14, 11) * envelope;
  const knock = layers.tier ? 1 + damage * 0.06 : 1;
  return {
    x: origin.x + spring(pressed.x - origin.x, -nx * 900) * knock,
    y: origin.y + spring(pressed.y - origin.y, -ny * 900 - 170),
    angle: springDisplacement(age, 0.1 * direction, -direction * 1.5, 12, 19) * envelope,
    sx: 1 + springDisplacement(age, -0.1, 1.8, 17, 23) * envelope,
    sy: 1 + springDisplacement(age, 0.055, -0.9, 17, 23) * envelope,
  };
}

function defenderPose(tNow: number, origin: Pose, attacker: Pose): Pose {
  if (!layers.motion) return origin;
  const t = timing();
  if (tNow < t.impact) return origin;
  const dx = origin.x - attacker.x;
  const dy = origin.y - attacker.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / length;
  const ny = dy / length;
  const direction = dx >= 0 ? 1 : -1;
  const compression = 1 - Math.pow(1 - clamp01((tNow - t.impact) / t.compress), 2);
  if (tNow < t.release) {
    return { ...origin,
      x: origin.x + nx * 8 * compression, y: origin.y + ny * 8 * compression,
      angle: direction * 0.025 * compression, sx: 1 - 0.075 * compression, sy: 1 + 0.035 * compression };
  }
  const age = tNow - t.release;
  const envelope = settleEnvelope(age, t.end - t.release);
  const knock = layers.tier ? 1 + damage * 0.08 : 1;
  const recoil = springDisplacement(age, 8, 1400 * knock, 12, 23) * envelope;
  return { ...origin,
    x: origin.x + nx * recoil,
    y: origin.y + ny * recoil + springDisplacement(age, 0, -90, 12, 23) * envelope,
    angle: direction * springDisplacement(age, 0.025, 3.1, 11, 20) * envelope,
    sx: 1 + springDisplacement(age, -0.075, 1.2, 16, 26) * envelope,
    sy: 1 + springDisplacement(age, 0.035, -0.6, 16, 26) * envelope };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawCard(g: CanvasRenderingContext2D, pose: Pose, img: HTMLImageElement, flash: number, name: string): void {
  g.save();
  g.translate(pose.x, pose.y);
  g.rotate(pose.angle);
  g.scale(pose.sx, pose.sy);
  g.shadowColor = 'rgba(12, 5, 7, 0.55)';
  g.shadowBlur = 18;
  g.shadowOffsetY = 10;
  roundRect(g, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
  g.fillStyle = '#3a2a18';
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = '#e0c48a';
  g.lineWidth = 4;
  g.stroke();
  g.save();
  roundRect(g, -CARD_W / 2 + 8, -CARD_H / 2 + 8, CARD_W - 16, CARD_H - 16, 6);
  g.clip();
  if (img.complete && img.naturalWidth) {
    const scale = Math.max((CARD_W - 16) / img.naturalWidth, (CARD_H - 16) / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    g.drawImage(img, -w / 2, -h / 2 - 10, w, h);
  } else {
    g.fillStyle = '#5a4630';
    g.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
  }
  g.restore();
  if (flash > 0.01) {
    g.globalAlpha = flash;
    g.fillStyle = '#fff8e8';
    roundRect(g, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
    g.fill();
  }
  g.globalAlpha = 1;
  if (name) {
    g.fillStyle = '#efe2c5';
    g.font = '600 14px "PingFang SC", sans-serif';
    g.textAlign = 'center';
    g.fillText(name, 0, CARD_H / 2 - 18);
  }
  g.restore();
}

function drawShockwave(g: CanvasRenderingContext2D, x: number, y: number, age: number): void {
  if (!layers.vfx || !layers.tier || damage < 8 || age > 0.35) return;
  const u = age / 0.35;
  g.save();
  g.strokeStyle = `rgba(255, 243, 206, ${1 - u})`;
  g.lineWidth = 6 - u * 4;
  g.beginPath();
  g.arc(x, y, 30 + u * (90 + damage * 6), 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

function drawNumbers(g: CanvasRenderingContext2D, target: Pose, age: number): void {
  if (!layers.numbers || age < 0) return;
  const t = timing();
  const alpha = clamp01((t.end - elapsed) / 0.12);
  const pop = age < 0.035 ? lerp(0.9, 1.25, age / 0.035) : 1 + springDisplacement(age - 0.035, 0.25, -2, 22, 26);
  g.save();
  g.globalAlpha = alpha;
  g.translate(target.x, target.y - 70 - age * 28);
  g.scale(pop, pop);
  const text = `−${damage}`;
  const radius = Math.max(28, text.length * 9 + 10);
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
  g.fill();
  g.stroke();
  g.fillStyle = '#fff3ce';
  g.font = '700 28px "Settlement Digits", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 1);
  g.restore();
}

function drawParticles(g: CanvasRenderingContext2D): void {
  if (!layers.vfx) return;
  for (const p of particles) {
    const u = clamp01(p.life / p.max);
    if (u >= 1) continue;
    g.save();
    g.globalAlpha = 1 - u * u;
    g.fillStyle = p.color;
    g.strokeStyle = p.color;
    if (p.kind === 'streak') {
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      g.stroke();
    } else {
      g.fillRect(p.x, p.y, p.size, p.size);
    }
    g.restore();
  }
}

function flashValue(): number {
  if (!layers.vfx || !impacted) return 0;
  const t = timing();
  const age = flashAtRelease() ? Math.max(0, elapsed - t.release) : fxAge;
  const peak = layers.tier ? 0.45 + damage * 0.05 : 0.62;
  return Math.exp(-age * 38) * peak;
}

function playStrike(): void {
  elapsed = 0;
  fxAge = 0;
  hitstop = 0;
  impacted = false;
  playing = true;
  trauma = 0;
  kick = 0;
  particles = [];
  buildTimeline();
}

function update(dt: number): void {
  const t = timing();
  if (playing) {
    if (hitstop > 0) {
      hitstop = Math.max(0, hitstop - dt);
      fxAge += dt;
    } else {
      elapsed += dt;
      if (elapsed >= t.impact) fxAge += dt;
    }
    if (!impacted && elapsed >= t.impact) {
      impacted = true;
      hitstop = hitstopDuration();
      trauma = Math.min(1, trauma + traumaPulse());
      kick = layers.camera ? (layers.tier ? 6 + damage * 1.4 : 8) : 0;
      spawnImpact(originFoe(), 1);
      playHitSound();
    }
    if (elapsed >= t.end && hitstop <= 0) {
      playing = false;
      if (loopInput.checked) playStrike();
    }
  } else {
    fxAge += dt;
  }
  trauma = Math.max(0, trauma - 2.4 * dt);
  kick *= Math.exp(-10 * dt);
  const shake = trauma * trauma;
  const dirNoise = Math.sin(performance.now() * 0.08) * 0.35 + (Math.random() * 2 - 1) * 0.65;
  camX = layers.camera ? kick + dirNoise * 14 * shake : 0;
  camY = layers.camera ? (Math.random() * 2 - 1) * 10 * shake : 0;
}

function draw(): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#14110f';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(camX, camY);

  const heroO = originHero();
  const foeO = originFoe();
  const tNow = playing || impacted ? elapsed : 0;
  const hero = attackPose(tNow, heroO, foeO);
  const foe = defenderPose(tNow, foeO, heroO);
  const flash = flashValue();

  if (layers.motion && playing && elapsed > timing().windup + 0.04 && elapsed < timing().impact) {
    ctx.globalAlpha = 0.06;
    drawCard(ctx, attackPose(elapsed - 0.036, heroO, foeO), images.hero, 0, '');
    ctx.globalAlpha = 0.12;
    drawCard(ctx, attackPose(elapsed - 0.018, heroO, foeO), images.hero, 0, '');
    ctx.globalAlpha = 1;
  }

  drawCard(ctx, foe, images.foe, flash, '缝偶');
  drawCard(ctx, hero, images.hero, 0, '德鲁伊');
  if (impacted) {
    drawShockwave(ctx, foe.x, foe.y, fxAge);
    drawParticles(ctx);
    drawNumbers(ctx, foe, fxAge);
  }
  ctx.restore();

  const t = timing();
  const total = t.end + (layers.time ? hitstopDuration() : 0);
  const clock = Math.min(total, elapsed + (impacted ? hitstopDuration() - hitstop : 0));
  let acc = 0;
  timelineEl.querySelectorAll('span').forEach((span) => {
    const flex = Number((span as HTMLElement).style.flex) || 0.001;
    const start = acc;
    acc += flex;
    const local = clamp01((clock - start) / flex);
    (span as HTMLElement).style.setProperty('--fill', `${playing || impacted ? local * 100 : 0}%`);
    span.classList.toggle('is-now', clock >= start && clock < start + flex && (playing || hitstop > 0));
  });
  phaseEl.textContent = phaseName(elapsed);
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  if (layers.vfx && impacted) {
    for (const p of particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
    }
  }
  draw();
  requestAnimationFrame(frame);
}

document.querySelectorAll('.feel-presets button').forEach((btn) => {
  btn.addEventListener('click', () => setPreset(btn.getAttribute('data-preset') as Preset));
});
damageInput.addEventListener('input', () => {
  damage = Number(damageInput.value);
  markLadder();
  buildTimeline();
});
const startStrike = () => {
  audioCtx ??= new AudioContext();
  void audioCtx.resume();
  playStrike();
};
playBtn.addEventListener('click', startStrike);
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat) return;
  const tag = (event.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'BUTTON') return;
  event.preventDefault();
  startStrike();
});
document.querySelectorAll('.feel-ladder li').forEach((li) => {
  li.addEventListener('click', () => {
    damage = Number(li.getAttribute('data-tier'));
    damageInput.value = String(damage);
    markLadder();
    buildTimeline();
    playStrike();
  });
});

setPreset('current');
buildTimeline();
markLadder();
requestAnimationFrame(frame);
