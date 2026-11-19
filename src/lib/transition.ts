/**
 * 全景切换的淡入淡出过渡：先黑场，再换图并回到目标视角。
 */
import { createSignal } from 'solid-js';
import type { Camera } from '../lib/geo';

export interface TransitionEl {
  el: HTMLElement;
}

export function createFader() {
  const [opacity, setOpacity] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  let ticket = 0;

  function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  /** 淡出 → 执行 swap → 淡入 */
  async function crossfade(swap: () => void, fadeMs = 700) {
    const my = ++ticket;
    setBusy(true);
    const half = Math.max(60, fadeMs / 2);
    const steps = 12;
    // 淡出
    for (let i = 1; i <= steps; i++) {
      if (my !== ticket) return;
      setOpacity(i / steps);
      await sleep(half / steps);
    }
    if (my !== ticket) return;
    swap();
    await sleep(16);
    // 淡入
    for (let i = steps - 1; i >= 0; i--) {
      if (my !== ticket) return;
      setOpacity(i / steps);
      await sleep(half / steps);
    }
    if (my === ticket) {
      setOpacity(0);
      setBusy(false);
    }
  }

  function cancel() {
    ticket++;
    setOpacity(0);
    setBusy(false);
  }

  return { opacity, busy, crossfade, cancel };
}

export function waitForPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

export type { Camera };
