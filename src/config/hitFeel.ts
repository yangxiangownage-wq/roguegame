export type HitFeel = {
  force: number;
  forcePerDamage: number;
  duration: number;
  frequency: number;
};

export type HitFeelSave = HitFeel & {
  panelX: number;
  panelY: number;
};

export const DEFAULT_HIT_FEEL: HitFeel = {
  force: 10,
  forcePerDamage: 0.8,
  duration: 0.45,
  frequency: 6.4,
};

const STORAGE_KEY = 'roguegame.hit-feel';
const ENVELOPE_CUTOFF = 0.02;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function shakeDecay(duration: number): number {
  return Math.log(1 / ENVELOPE_CUTOFF) / Math.max(0.08, duration);
}

export function shakeDone(age: number, duration: number): boolean {
  return Math.exp(-shakeDecay(duration) * age) < ENVELOPE_CUTOFF;
}

export function shakeAmplitude(feel: HitFeel, damage: number): number {
  const weight = Math.min(10, Math.max(1, damage));
  return feel.force + weight * feel.forcePerDamage;
}

export function loadHitFeelSave(): HitFeelSave {
  const fallback: HitFeelSave = { ...DEFAULT_HIT_FEEL, panelX: 1524, panelY: 420 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<HitFeelSave>;
    return {
      force: clamp(Number(parsed.force) || DEFAULT_HIT_FEEL.force, 2, 36),
      forcePerDamage: clamp(Number(parsed.forcePerDamage) || DEFAULT_HIT_FEEL.forcePerDamage, 0, 4),
      duration: clamp(Number(parsed.duration) || DEFAULT_HIT_FEEL.duration, 0.12, 1.4),
      frequency: clamp(Number(parsed.frequency) || DEFAULT_HIT_FEEL.frequency, 2, 14),
      panelX: clamp(Number(parsed.panelX) || fallback.panelX, 0, 1920),
      panelY: clamp(Number(parsed.panelY) || fallback.panelY, 0, 1080),
    };
  } catch {
    return fallback;
  }
}

export function saveHitFeelSave(save: HitFeelSave): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}
