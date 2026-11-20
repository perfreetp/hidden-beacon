/**
 * 项目状态：Svelte 5 runes + localStorage 持久化 + 撤销/重做。
 * 所有图层与效果顺序都在这里，渲染器只读取、不修改。
 */
import { writable } from 'svelte/store';
import type {
  ProjectState,
  Dab,
  EffectId,
  TonemapMode,
  ViewState
} from './types';

const STORAGE_KEY = 'magic-light-board:v1';
const HISTORY_LIMIT = 60;

export function defaultState(): ProjectState {
  return {
    version: 1,
    layers: [],
    effectOrder: ['bloom', 'dof', 'tonemap', 'outline'],
    bloom: { enabled: true, intensity: 0.85, radius: 5, threshold: 0.55 },
    dof: {
      enabled: false,
      focusX: 0.5,
      focusY: 0.5,
      range: 0.18,
      blur: 3
    },
    tonemap: { enabled: true, mode: 'soft' },
    outline: { enabled: false, thickness: 1.6, color: '#aef3ff' },
    view: { zoom: 1, panX: 0, panY: 0 },
    highContrast: false
  };
}

function clone(s: ProjectState): ProjectState {
  return structuredClone(s);
}

function migrate(raw: unknown): ProjectState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ProjectState>;
  return {
    ...base,
    ...r,
    bloom: { ...base.bloom, ...(r.bloom ?? {}) },
    dof: { ...base.dof, ...(r.dof ?? {}) },
    tonemap: { ...base.tonemap, ...(r.tonemap ?? {}) },
    outline: { ...base.outline, ...(r.outline ?? {}) },
    view: { ...base.view, ...(r.view ?? {}) },
    layers: Array.isArray(r.layers) ? r.layers : [],
    effectOrder: Array.isArray(r.effectOrder) && r.effectOrder.length
      ? r.effectOrder
      : base.effectOrder
  };
}

function loadInitial(): ProjectState {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return defaultState();
    return migrate(JSON.parse(text));
  } catch {
    return defaultState();
  }
}

function createProjectStore() {
  const initial = loadInitial();
  const { subscribe, update, set } = writable<ProjectState>(initial);
  let history: ProjectState[] = [];
  let future: ProjectState[] = [];
  const historyState = writable({ canUndo: false, canRedo: false });
  const syncHistoryFlags = () =>
    historyState.set({ canUndo: history.length > 0, canRedo: future.length > 0 });
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressSave = false;

  function scheduleSave(state: ProjectState) {
    if (suppressSave) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        // 容量超限（画得太多）时静默降级，不打断孩子画画
        console.warn('作品保存失败，可能是存储空间不足', e);
      }
    }, 400);
  }

  /** 结构性修改前压栈（落笔开始、删图层、拖动效果卡等） */
  function snapshot(prev: ProjectState) {
    history.push(clone(prev));
    if (history.length > HISTORY_LIMIT) history.shift();
    future = [];
    syncHistoryFlags();
  }

  return {
    subscribe,
    historyState,

    /** 普通修改：不进撤销栈（如拖动滑块的连续过程） */
    patch(fn: (s: ProjectState) => void) {
      update((s) => {
        const next = clone(s);
        fn(next);
        scheduleSave(next);
        return next;
      });
    },

    /** 可撤销的修改 */
    commit(fn: (s: ProjectState) => void) {
      update((s) => {
        snapshot(s);
        const next = clone(s);
        fn(next);
        scheduleSave(next);
        return next;
      });
    },

    /** 高频落笔更新：外部在 strokeStart 时调 beginStroke，过程中只 patch */
    beginStroke() {
      update((s) => {
        snapshot(s);
        return s;
      });
    },

    undo() {
      update((s) => {
        const prev = history.pop();
        if (!prev) return s;
        future.push(clone(s));
        syncHistoryFlags();
        scheduleSave(prev);
        return prev;
      });
    },

    redo() {
      update((s) => {
        const next = future.pop();
        if (!next) return s;
        history.push(clone(s));
        syncHistoryFlags();
        scheduleSave(next);
        return next;
      });
    },

    canUndo() {
      return history.length > 0;
    },

    canRedo() {
      return future.length > 0;
    },

    replaceAll(state: ProjectState) {
      suppressSave = false;
      history = [];
      future = [];
      syncHistoryFlags();
      set(state);
      scheduleSave(state);
    },

    clearAll() {
      this.commit((s) => {
        s.layers = [];
      });
    },

    /* ---------------- 图层 ---------------- */

    addLayer(name: string): string {
      const id = 'L' + Math.random().toString(36).slice(2, 9);
      this.commit((s) => {
        s.layers.push({ id, name, visible: true, dabs: [] });
      });
      return id;
    },

    removeLayer(id: string) {
      this.commit((s) => {
        s.layers = s.layers.filter((l) => l.id !== id);
      });
    },

    toggleLayer(id: string) {
      this.commit((s) => {
        const l = s.layers.find((x) => x.id === id);
        if (l) l.visible = !l.visible;
      });
    },

    renameLayer(id: string, name: string) {
      this.patch((s) => {
        const l = s.layers.find((x) => x.id === id);
        if (l) l.name = name;
      });
    },

    moveLayer(id: string, dir: -1 | 1) {
      this.commit((s) => {
        const i = s.layers.findIndex((l) => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= s.layers.length) return;
        [s.layers[i], s.layers[j]] = [s.layers[j], s.layers[i]];
      });
    },

    appendDab(layerId: string, dab: Dab) {
      this.patch((s) => {
        s.layers.find((x) => x.id === layerId)?.dabs.push(dab);
      });
    },

    /* ---------------- 效果顺序与参数 ---------------- */

    moveEffect(id: EffectId, dir: -1 | 1) {
      this.commit((s) => {
        const i = s.effectOrder.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= s.effectOrder.length) return;
        [s.effectOrder[i], s.effectOrder[j]] = [s.effectOrder[j], s.effectOrder[i]];
      });
    },

    reorderEffect(id: EffectId, toIndex: number) {
      this.commit((s) => {
        const i = s.effectOrder.indexOf(id);
        if (i < 0) return;
        const clamped = Math.max(0, Math.min(s.effectOrder.length - 1, toIndex));
        s.effectOrder.splice(i, 1);
        s.effectOrder.splice(clamped, 0, id);
      });
    },

    setView(view: Partial<ViewState>) {
      this.patch((s) => {
        Object.assign(s.view, view);
      });
    },

    setHighContrast(on: boolean) {
      this.commit((s) => {
        s.highContrast = on;
      });
    },

    setTonemapMode(mode: TonemapMode) {
      this.patch((s) => {
        s.tonemap.mode = mode;
      });
    },

    /* ---------------- 导入导出 ---------------- */

    exportConfig(): string {
      let current: ProjectState = defaultState();
      this.subscribe((s) => (current = s))();
      return JSON.stringify(current, null, 2);
    },

    importConfig(json: string): ProjectState {
      const state = migrate(JSON.parse(json));
      this.replaceAll(state);
      return state;
    }
  };
}

export const project = createProjectStore();
export const historyFlags = project.historyState;
