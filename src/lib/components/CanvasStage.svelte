<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { project } from '../../lib/state';
  import { Renderer, hexToRgb, type ViewRect } from '../../lib/renderer';
  import type { Dab, Layer, ProjectState, ShapeId } from '../../lib/types';

  interface Props {
    tool: ShapeId;
    brushColor: string;
    brushSize: number;
    activeLayerId: string;
    onLayerPicked: (id: string) => void;
    onFrame?: () => void;
  }
  const props: Props = $props();

  let canvasEl = $state<HTMLCanvasElement>(undefined!);
  let wrapEl = $state<HTMLDivElement>(undefined!);
  let renderer: Renderer | null = null;
  let glError = $state('');

  let split = $state(1); // 1 = 全效果，0 = 全原图
  let showReticle = $state(false);
  let reticlePos = $state<{ left: number; top: number } | null>(null);

  let ro: ResizeObserver | null = null;
  let rafPending = false;
  let latest: ProjectState | null = null;
  let stateUnsub = () => {};

  type Gesture =
    | { kind: 'none' }
    | { kind: 'draw'; pointerId: number; lastX: number; lastY: number }
    | {
        kind: 'pan';
        pointerId: number;
        startX: number;
        startY: number;
        basePanX: number;
        basePanY: number;
      }
    | { kind: 'reticle'; pointerId: number }
    | { kind: 'split'; pointerId: number }
    | { kind: 'pinch'; dist: number; zoom: number };
  let gesture: Gesture = { kind: 'none' };
  const pointers = new Map<number, { x: number; y: number }>();

  onMount(() => {
    try {
      renderer = new Renderer(canvasEl);
    } catch (e) {
      glError = e instanceof Error ? e.message : String(e);
      return;
    }
    ro = new ResizeObserver(() => scheduleFrame());
    ro.observe(wrapEl);
    stateUnsub = project.subscribe((s) => {
      latest = s;
      scheduleFrame();
    });
    // 自动化测试钩子
    const r = renderer;
    (window as unknown as Record<string, unknown>).__magicBoard = {
      readDisplayStats: () =>
        latest && r ? r.readDisplayStats(latest, split) : null,
      exportPng: () => (latest && r ? r.exportPng(latest, 2) : null)
    };
  });

  onDestroy(() => {
    ro?.disconnect();
    stateUnsub();
    renderer?.dispose();
  });

  function scheduleFrame() {
    if (rafPending || !renderer) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!renderer || !latest) return;
      renderer.resize(
        wrapEl.clientWidth,
        wrapEl.clientHeight,
        Math.min(window.devicePixelRatio || 1, 2)
      );
      renderer.render(latest, split);
      showReticle = latest.dof.enabled && latest.effectOrder.includes('dof');
      updateReticle();
      props.onFrame?.();
    });
  }

  function viewOf(s: ProjectState): ViewRect {
    return renderer!.viewRect(s.view.zoom, s.view.panX, s.view.panY);
  }

  function updateReticle() {
    if (!renderer || !latest || !canvasEl || !showReticle) {
      reticlePos = null;
      return;
    }
    const rect = canvasEl.getBoundingClientRect();
    const view = viewOf(latest);
    reticlePos = renderer.worldToScreen(
      latest.dof.focusX,
      latest.dof.focusY,
      rect,
      view
    );
  }

  function ensureLayer(): string {
    const s = latest!;
    if (
      props.activeLayerId &&
      s.layers.some((l: Layer) => l.id === props.activeLayerId)
    ) {
      return props.activeLayerId;
    }
    const id = project.addLayer(
      `图层 ${s.layers.length + 1} · ${shapeName(props.tool)}`
    );
    props.onLayerPicked(id);
    return id;
  }

  function shapeName(t: ShapeId): string {
    const names: Record<ShapeId, string> = {
      brush: '光笔', star: '星星', fish: '小鱼', house: '房子', eraser: '擦除'
    };
    return names[t];
  }

  function makeDab(x: number, y: number): Dab {
    return {
      x,
      y,
      r: props.brushSize,
      rot:
        props.tool === 'star' || props.tool === 'fish'
          ? (Math.random() - 0.5) * 0.5
          : 0,
      color: hexToRgb(props.brushColor),
      shape: props.tool
    };
  }

  function clamp(v: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, v));
  }

  function onPointerDown(e: PointerEvent) {
    if (!renderer || !latest) return;
    canvasEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = {
        kind: 'pinch',
        dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
        zoom: latest.view.zoom
      };
      return;
    }

    const rect = canvasEl.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    if (Math.abs(localX - split * rect.width) < 16) {
      gesture = { kind: 'split', pointerId: e.pointerId };
      updateSplit(e);
      return;
    }

    const view = viewOf(latest);
    const world = renderer.screenToWorld(e.clientX, e.clientY, rect, view);

    const fx =
      ((world.x - latest.dof.focusX) * rect.width) / (view.maxX - view.minX);
    const fy =
      ((world.y - latest.dof.focusY) * rect.height) / (view.maxY - view.minY);
    if (latest.dof.enabled && Math.hypot(fx, fy) < 28) {
      gesture = { kind: 'reticle', pointerId: e.pointerId };
      return;
    }

    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      gesture = {
        kind: 'pan',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        basePanX: latest.view.panX,
        basePanY: latest.view.panY
      };
      return;
    }

    const layerId = ensureLayer();
    project.beginStroke();
    project.appendDab(layerId, makeDab(world.x, world.y));
    gesture = {
      kind: 'draw',
      pointerId: e.pointerId,
      lastX: world.x,
      lastY: world.y
    };
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId) || !renderer || !latest) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = canvasEl.getBoundingClientRect();
    const view = viewOf(latest);

    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      project.setView({
        zoom: clamp(gesture.zoom * (dist / gesture.dist), 0.5, 4)
      });
      return;
    }

    if (gesture.kind === 'split') {
      updateSplit(e);
      return;
    }

    if (gesture.kind === 'pan') {
      const wpx = (view.maxX - view.minX) / rect.width;
      const wpy = (view.maxY - view.minY) / rect.height;
      project.setView({
        panX: clamp(
          gesture.basePanX - (e.clientX - gesture.startX) * wpx,
          -0.6,
          0.6
        ),
        panY: clamp(
          gesture.basePanY - (e.clientY - gesture.startY) * wpy,
          -0.6,
          0.6
        )
      });
      return;
    }

    if (gesture.kind === 'reticle') {
      const w = renderer.screenToWorld(e.clientX, e.clientY, rect, view);
      project.patch((st) => {
        st.dof.focusX = clamp(w.x, 0, 1);
        st.dof.focusY = clamp(w.y, 0, 1);
      });
      return;
    }

    if (gesture.kind === 'draw' && e.pointerId === gesture.pointerId) {
      const w = renderer.screenToWorld(e.clientX, e.clientY, rect, view);
      const gap = props.brushSize * 0.45;
      const d = Math.hypot(w.x - gesture.lastX, w.y - gesture.lastY);
      if (d >= gap) {
        const steps = Math.ceil(d / gap);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          project.appendDab(
            ensureLayer(),
            makeDab(
              gesture.lastX + (w.x - gesture.lastX) * t,
              gesture.lastY + (w.y - gesture.lastY) * t
            )
          );
        }
        gesture.lastX = w.x;
        gesture.lastY = w.y;
      }
    }
  }

  function endPointer(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (gesture.kind === 'pinch' && pointers.size < 2) {
      gesture = { kind: 'none' };
    } else if ('pointerId' in gesture && gesture.pointerId === e.pointerId) {
      gesture = { kind: 'none' };
    }
    try {
      canvasEl.releasePointerCapture(e.pointerId);
    } catch {
      /* 已释放 */
    }
  }

  function updateSplit(e: PointerEvent) {
    const rect = canvasEl.getBoundingClientRect();
    split = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    scheduleFrame();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!latest) return;
    const factor = Math.exp(-e.deltaY * 0.0012);
    project.setView({ zoom: clamp(latest.view.zoom * factor, 0.5, 4) });
  }

  // 暴露给父组件的命令式接口
  export function rerender() {
    scheduleFrame();
  }
  export function setSplit(v: number) {
    split = clamp(v, 0, 1);
    scheduleFrame();
  }
  export function getSplit() {
    return split;
  }
  export function getRenderer(): Renderer | null {
    return renderer;
  }
</script>

<div class="stage" bind:this={wrapEl}>
  {#if glError}
    <div class="gl-error">
      <h2>🌌 魔法画笔需要 WebGL2</h2>
      <p>{glError}</p>
      <p>请用最新版 Chrome、Edge 或 Safari 打开本页。</p>
    </div>
  {:else}
    <canvas
      bind:this={canvasEl}
      class="gl-canvas"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={endPointer}
      onpointercancel={endPointer}
      onwheel={onWheel}
      oncontextmenu={(e) => e.preventDefault()}
    ></canvas>

    {#if showReticle && reticlePos}
      <div
        class="reticle"
        style:left={`${reticlePos.left}px`}
        style:top={`${reticlePos.top}px`}
        title="景深对焦点，可拖动"
      >
        <span class="ring"></span>
        <span class="cross-h"></span>
        <span class="cross-v"></span>
      </div>
    {/if}

    <div
      class="split-line"
      style:left={`${split * 100}%`}
      class:at-edge={split >= 0.999 || split <= 0.001}
    >
      <div class="split-grip">⇔</div>
      {#if split > 0.001 && split < 0.999}
        <div class="split-tag left">加效果前</div>
        <div class="split-tag right">加效果后</div>
      {/if}
    </div>

    <div class="hint">
      左键画画 · Shift/右键拖动 · 滚轮/双指缩放 · 拖竖条对比效果
    </div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    touch-action: none;
    background: var(--bg-deep);
  }
  .gl-canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
  }
  .gl-error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    text-align: center;
  }
  .reticle {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 44px;
    height: 44px;
    pointer-events: none;
  }
  .ring {
    position: absolute;
    inset: 0;
    border: 2.5px solid var(--accent);
    border-radius: 50%;
    box-shadow: 0 0 12px rgba(255, 215, 94, 0.8);
    animation: pulse 1.8s ease-in-out infinite;
  }
  .cross-h,
  .cross-v {
    position: absolute;
    background: var(--accent);
    opacity: 0.8;
  }
  .cross-h {
    left: -8px;
    right: -8px;
    top: 50%;
    height: 1.5px;
  }
  .cross-v {
    top: -8px;
    bottom: -8px;
    left: 50%;
    width: 1.5px;
  }
  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.12);
      opacity: 0.65;
    }
  }
  .split-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: linear-gradient(
      to bottom,
      transparent,
      var(--accent) 12%,
      var(--accent) 88%,
      transparent
    );
    box-shadow: 0 0 10px rgba(255, 215, 94, 0.7);
    pointer-events: none;
  }
  .split-line.at-edge {
    opacity: 0.25;
  }
  .split-grip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--bg-panel-solid);
    border: 2px solid var(--accent);
    display: grid;
    place-items: center;
    font-size: 16px;
    color: var(--accent);
  }
  .split-tag {
    position: absolute;
    top: 14px;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--bg-panel-solid);
    border: 1px solid var(--line);
    white-space: nowrap;
    color: var(--fg-dim);
  }
  .split-tag.left {
    right: 12px;
  }
  .split-tag.right {
    left: 12px;
  }
  .hint {
    position: absolute;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    font-size: 12px;
    color: var(--fg-dim);
    background: var(--bg-panel);
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    pointer-events: none;
    white-space: nowrap;
  }
  @media (max-width: 860px) {
    .hint {
      display: none;
    }
  }
</style>
