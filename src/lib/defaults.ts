import type { AppState, ShadowSettings, Theater } from '../types';

export const DEFAULT_SHADOW: ShadowSettings = {
  mapSize: 1024,
  splitLambda: 0.5,
  shadowMaxZ: 24,
  pcfKernel: 1, // 0=低(1tap) 1=中(9tap) 2=高(25tap)
};

function t(
  id: string,
  name: string,
  placements: Theater['placements'],
  overrides: Partial<Pick<Theater, 'sun' | 'lamp' | 'sunAzimuth' | 'sunElevation' | 'shadow'>> = {},
): Theater {
  return {
    id,
    name,
    builtin: true,
    placements,
    sun: { intensity: 2.2, temperature: 5500, enabled: true, ...overrides.sun },
    lamp: { intensity: 1.6, temperature: 3000, enabled: true, ...overrides.lamp },
    shadow: { ...DEFAULT_SHADOW, ...overrides.shadow },
    sunAzimuth: overrides.sunAzimuth ?? Math.PI * 0.25,
    sunElevation: overrides.sunElevation ?? 0.9,
    updatedAt: 0,
  };
}

/** 内置小剧场一：午后客厅（均衡布置） */
export function builtinTheaters(): Theater[] {
  return [
    t('builtin-afternoon', '午后小客厅', [
      { id: 'p-house', kind: 'house', x: -3.4, z: -2.2, rotationY: 0.35 },
      { id: 'p-bunny', kind: 'bunny', x: -1.4, z: 0.6, rotationY: 0.2 },
      { id: 'p-bear', kind: 'bear', x: 0.6, z: 1.4, rotationY: -0.4 },
      { id: 'p-duck', kind: 'duck', x: 2.2, z: 0.2, rotationY: 0.9 },
      { id: 'p-lamp', kind: 'lamp', x: 2.8, z: 2.6, rotationY: 0, y: 2.6 },
    ]),
    t(
      'builtin-sunset',
      '夕阳长影子',
      [
        { id: 'p-house', kind: 'house', x: -3.6, z: -2.4, rotationY: 0.35 },
        { id: 'p-bunny', kind: 'bunny', x: -1.8, z: 1.0, rotationY: 0.2 },
        { id: 'p-bear', kind: 'bear', x: 0.4, z: 1.8, rotationY: -0.4 },
        { id: 'p-duck', kind: 'duck', x: 2.0, z: 0.8, rotationY: 0.9 },
        { id: 'p-lamp', kind: 'lamp', x: 3.0, z: 2.8, rotationY: 0, y: 2.6 },
      ],
      {
        sun: { intensity: 1.4, temperature: 2800, enabled: true },
        sunElevation: 0.32,
        sunAzimuth: Math.PI * 0.85,
      },
    ),
    t(
      'builtin-night',
      '台灯小夜场',
      [
        { id: 'p-house', kind: 'house', x: -3.2, z: -2.0, rotationY: 0.35 },
        { id: 'p-bunny', kind: 'bunny', x: -0.8, z: 0.8, rotationY: 0.6 },
        { id: 'p-bear', kind: 'bear', x: 1.2, z: 1.6, rotationY: -0.9 },
        { id: 'p-duck', kind: 'duck', x: 2.6, z: -0.4, rotationY: 1.4 },
        { id: 'p-lamp', kind: 'lamp', x: 0.8, z: 2.4, rotationY: 0, y: 2.6 },
      ],
      {
        sun: { intensity: 0.25, temperature: 9000, enabled: true },
        lamp: { intensity: 3.2, temperature: 2400, enabled: true },
      },
    ),
  ];
}

const STORAGE_KEY = 'shadow-theater-v1';

export function loadState(): AppState {
  const fallback: AppState = {
    currentId: 'builtin-afternoon',
    theaters: builtinTheaters(),
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as AppState;
    if (!Array.isArray(parsed.theaters) || parsed.theaters.length === 0) return fallback;
    // 兜底：确保内置剧场始终在
    const ids = new Set(parsed.theaters.map((x) => x.id));
    for (const b of builtinTheaters()) {
      if (!ids.has(b.id)) parsed.theaters.unshift(b);
    }
    if (!parsed.theaters.some((x) => x.id === parsed.currentId)) {
      parsed.currentId = parsed.theaters[0].id;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储满或被禁用时静默失败，不影响游戏
  }
}

let counter = 0;
export function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
