<script>
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { scene, season, params, mode, pickedPlant, boxSelected, plantSpeciesId, panelTab } from '../lib/store.js';
  import { movePlant, addPlant } from '../lib/actions.js';
  import { createWebGPURenderer, pickPlantAt } from '../lib/webgpu.js';
  import { createCanvas2DRenderer } from '../lib/canvas2d.js';

  let canvas;
  let wrap;
  let renderer = null;
  let rendererKind = '';
  let view = { scale: 30, ox: 40, oy: 40, dpr: 1 };
  let boxRect = null; // {x0,y0,x1,y1} 屏幕坐标
  let drag = null;    // {type:'pan'|'plant'|'box', ...}
  let ro;

  const unsubscribers = [];

  onMount(async () => {
    renderer = await createWebGPURenderer(canvas);
    if (!renderer) renderer = createCanvas2DRenderer(canvas);
    rendererKind = renderer.kind === 'webgpu' ? 'WebGPU' : 'Canvas2D(回退)';
    fitView();
    ro = new ResizeObserver(() => resize());
    ro.observe(wrap);
    resize();
    const rerender = () => render();
    for (const st of [scene, season, params, pickedPlant, boxSelected]) {
      unsubscribers.push(st.subscribe(rerender));
    }
  });

  onDestroy(() => {
    unsubscribers.forEach((u) => u());
    ro?.disconnect();
  });

  function resize() {
    if (!wrap || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    view.dpr = dpr;
    canvas.width = Math.round(wrap.clientWidth * dpr);
    canvas.height = Math.round(wrap.clientHeight * dpr);
    canvas.style.width = wrap.clientWidth + 'px';
    canvas.style.height = wrap.clientHeight + 'px';
    render();
  }

  export function fitView() {
    if (!wrap) return;
    const p = get(params);
    const cw = wrap.clientWidth || 800;
    const ch = wrap.clientHeight || 600;
    view.scale = Math.min(cw / p.length, ch / p.width) * 0.9;
    view.ox = (cw - p.length * view.scale) / 2;
    view.oy = (ch - p.width * view.scale) / 2;
    render();
  }

  function render() {
    if (!renderer) return;
    renderer.render({
      plants: get(scene).plants,
      rocks: get(scene).rocks,
      params: get(params),
      season: get(season),
      view,
      pickedId: get(pickedPlant),
      boxIds: new Set(get(boxSelected))
    });
  }

  function toWorld(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return { sx, sy, x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale };
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    const pt = toWorld(e);
    const m = get(mode);
    if (m === 'select') {
      drag = { type: 'box', x0: pt.sx, y0: pt.sy };
      boxRect = { x0: pt.sx, y0: pt.sy, x1: pt.sx, y1: pt.sy };
      return;
    }
    const hit = pickPlantAt(get(scene).plants, pt.x, pt.y);
    if (m === 'move' && hit) {
      drag = { type: 'plant', id: hit.id, dx: hit.x - pt.x, dy: hit.y - pt.y, moved: false };
      return;
    }
    if (m === 'view' && hit) {
      drag = { type: 'maybe-pick', id: hit.id, sx: pt.sx, sy: pt.sy };
      return;
    }
    drag = { type: 'pan', sx: pt.sx, sy: pt.sy, ox: view.ox, oy: view.oy };
  }

  function onPointerMove(e) {
    if (!drag) return;
    const pt = toWorld(e);
    if (drag.type === 'pan') {
      view.ox = drag.ox + (pt.sx - drag.sx);
      view.oy = drag.oy + (pt.sy - drag.sy);
      render();
    } else if (drag.type === 'plant') {
      drag.moved = true;
      movePlant(drag.id, pt.x + drag.dx, pt.y + drag.dy);
    } else if (drag.type === 'box') {
      boxRect = { x0: drag.x0, y0: drag.y0, x1: pt.sx, y1: pt.sy };
    } else if (drag.type === 'maybe-pick') {
      if (Math.hypot(pt.sx - drag.sx, pt.sy - drag.sy) > 6) {
        drag = { type: 'pan', sx: drag.sx, sy: drag.sy, ox: view.ox, oy: view.oy };
      }
    }
  }

  function onPointerUp(e) {
    if (!drag) return;
    const pt = toWorld(e);
    const m = get(mode);
    if (drag.type === 'box' && boxRect) {
      const wx0 = (Math.min(boxRect.x0, boxRect.x1) - view.ox) / view.scale;
      const wx1 = (Math.max(boxRect.x0, boxRect.x1) - view.ox) / view.scale;
      const wy0 = (Math.min(boxRect.y0, boxRect.y1) - view.oy) / view.scale;
      const wy1 = (Math.max(boxRect.y0, boxRect.y1) - view.oy) / view.scale;
      const ids = get(scene).plants
        .filter((p) => p.x >= wx0 && p.x <= wx1 && p.y >= wy0 && p.y <= wy1)
        .map((p) => p.id);
      boxSelected.set(ids);
      boxRect = null;
    } else if (drag.type === 'maybe-pick') {
      pickedPlant.set(drag.id);
      panelTab.set('info');
    } else if (drag.type === 'pan' && m === 'plant') {
      const movedDist = Math.hypot(view.ox - drag.ox, view.oy - drag.oy);
      if (movedDist < 4) {
        const p = get(params);
        if (pt.x >= 0 && pt.y >= 0 && pt.x <= p.length && pt.y <= p.width) {
          addPlant(get(plantSpeciesId), pt.x, pt.y);
        }
      }
    } else if (drag.type === 'plant' && !drag.moved) {
      pickedPlant.set(drag.id);
      panelTab.set('info');
    }
    drag = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const pt = toWorld(e);
    const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const ns = Math.min(300, Math.max(2, view.scale * k));
    view.ox = pt.sx - ((pt.sx - view.ox) * ns) / view.scale;
    view.oy = pt.sy - ((pt.sy - view.oy) * ns) / view.scale;
    view.scale = ns;
    render();
  }

  $: boxStyle = boxRect
    ? `left:${Math.min(boxRect.x0, boxRect.x1)}px;top:${Math.min(boxRect.y0, boxRect.y1)}px;` +
      `width:${Math.abs(boxRect.x1 - boxRect.x0)}px;height:${Math.abs(boxRect.y1 - boxRect.y0)}px;`
    : '';
</script>

<div class="viewport" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:wheel={onWheel}
  ></canvas>
  {#if boxRect}<div class="box" style={boxStyle}></div>{/if}
  <div class="hud">
    <span>{rendererKind}</span>
    <button on:click={fitView}>复位视图</button>
  </div>
</div>

<style>
  .viewport { position: relative; flex: 1; min-width: 0; min-height: 0; overflow: hidden; background: #21241f; }
  canvas { display: block; touch-action: none; cursor: crosshair; }
  .box { position: absolute; border: 1.5px dashed #33e0ff; background: rgba(51, 224, 255, 0.12); pointer-events: none; }
  .hud { position: absolute; right: 10px; top: 10px; display: flex; gap: 8px; align-items: center; }
  .hud span { background: rgba(0,0,0,0.55); color: #cfe3c8; font-size: 12px; padding: 3px 8px; border-radius: 4px; }
  .hud button { background: rgba(0,0,0,0.55); color: #fff; border: 1px solid #6a7; border-radius: 4px; padding: 3px 10px; cursor: pointer; font-size: 12px; }
</style>
