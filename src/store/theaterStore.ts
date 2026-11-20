import { createSignal } from 'solid-js';
import type { AppState, LightSettings, ObjectPlacement, ShadowSettings, Theater } from '../types';
import { loadState, makeId, saveState } from '../lib/defaults';

const initial = loadState();
// 首次打开也把默认布置落盘，保证“所有布置都在浏览器里”
if (!localStorage.getItem('shadow-theater-v1')) saveState(initial);

export const [state, setState] = createSignal<AppState>(initial);

function persist(next: AppState): void {
  setState(next);
  saveState(next);
}

/** 当前激活的剧场 */
export function currentTheater(): Theater {
  const s = state();
  return s.theaters.find((t) => t.id === s.currentId) ?? s.theaters[0];
}

export function useTheaterStore() {
  return { state, currentTheater };
}

// --------------------------------------------------------------- 剧场管理

export function switchTheater(id: string): void {
  const s = state();
  if (!s.theaters.some((t) => t.id === id)) return;
  persist({ ...s, currentId: id });
}

/** 复制当前剧场（内置剧场也可以复制后再改） */
export function duplicateTheater(): string {
  const s = state();
  const src = currentTheater();
  const copy: Theater = {
    ...structuredClone(src),
    id: makeId('theater'),
    name: `${src.name} · 我的副本`,
    builtin: false,
    updatedAt: Date.now(),
    placements: src.placements.map((p) => ({ ...p, id: makeId(p.kind) })),
  };
  const next: AppState = {
    currentId: copy.id,
    theaters: [...s.theaters, copy],
  };
  persist(next);
  return copy.id;
}

export function renameTheater(id: string, name: string): void {
  const s = state();
  persist({
    ...s,
    theaters: s.theaters.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name, updatedAt: Date.now() } : t)),
  });
}

export function deleteTheater(id: string): void {
  const s = state();
  if (s.theaters.length <= 1) return;
  const theaters = s.theaters.filter((t) => t.id !== id);
  persist({
    theaters,
    currentId: s.currentId === id ? theaters[0].id : s.currentId,
  });
}

// --------------------------------------------------------------- 摆放编辑

function mutateCurrent(mutator: (t: Theater) => Theater): void {
  const s = state();
  persist({
    ...s,
    theaters: s.theaters.map((t) => (t.id === s.currentId ? mutator(t) : t)),
  });
}

/** 引擎拖拽/旋转提交后回写 */
export function commitPlacement(placement: ObjectPlacement): void {
  mutateCurrent((t) => ({
    ...t,
    updatedAt: Date.now(),
    placements: t.placements.map((p) => (p.id === placement.id ? { ...placement } : p)),
  }));
}

export function updateLampHeight(height: number): void {
  mutateCurrent((t) => ({
    ...t,
    placements: t.placements.map((p) => (p.kind === 'lamp' ? { ...p, y: height } : p)),
  }));
}

// --------------------------------------------------------------- 灯光/阴影

export function updateLight(which: 'sun' | 'lamp', patch: Partial<LightSettings>): void {
  mutateCurrent((t) => ({
    ...t,
    updatedAt: Date.now(),
    [which]: { ...t[which], ...patch },
  }));
}

export function updateSunPose(azimuth: number, elevation: number): void {
  mutateCurrent((t) => ({ ...t, sunAzimuth: azimuth, sunElevation: elevation }));
}

export function updateShadow(patch: Partial<ShadowSettings>): void {
  mutateCurrent((t) => ({
    ...t,
    updatedAt: Date.now(),
    shadow: { ...t.shadow, ...patch },
  }));
}
