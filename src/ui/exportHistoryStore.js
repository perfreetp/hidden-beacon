// 模块级导出历史 store:跨 StrictMode 双挂载保留状态
import { useSyncExternalStore } from 'react';

let history = [];
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

export function addExportRecord(record) {
  history = [record, ...history].slice(0, 12);
  emit();
}

export function getExportHistory() {
  return history;
}

export function clearExportHistory() {
  history = [];
  emit();
}

export function useExportHistory() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => history,
    () => history,
  );
}
