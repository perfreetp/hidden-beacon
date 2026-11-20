import { writable } from 'svelte/store';

export const STORAGE_KEY = 'magic-light-board-v1';

export const tool = writable('brush'); // brush | star | fish | house | pan
export const brushColor = writable('#ffd76a');
export const brushSize = writable(46);

export const layers = writable([]); // 图层元数据镜像（真身在 engine）

export const defaultEffects = () => ({
  order: ['bloom', 'dof', 'tonemap', 'outline'],
  params: {
    bloom: { enabled: true, intensity: 1.4, radius: 2.0 },
    dof: { enabled: true, focusX: 0.5, focusY: 0.45, range: 0.45, strength: 1.2 },
    tonemap: { enabled: true, mode: 'soft' },
    outline: { enabled: true, width: 3, color: '#ffffff' }
  }
});
export const effects = writable(defaultEffects());

export const view = writable({ scale: 1, x: 0, y: 0 });
export const splitX = writable(null); // css px，null 关闭分屏
export const highContrast = writable(false);
export const pickingFocus = writable(false); // 正在画布上拾取景深对焦点

// Board 挂载后填充，供其他组件调用
export const api = {
  engine: null,
  refreshLayers: () => {},
  save: () => {},
  fitView: () => {},
  undo: () => {},
  clearAll: () => {},
  exportPNG: () => {},
  exportConfig: () => {}
};
