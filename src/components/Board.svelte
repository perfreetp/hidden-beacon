<script>
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { Engine, SCENE_W, SCENE_H } from '../lib/gl/engine.js';
  import {
    tool, brushColor, brushSize, layers, effects, view,
    splitX, highContrast, pickingFocus, api, STORAGE_KEY, defaultEffects
  } from '../lib/stores.js';

  let wrap, canvas;
  let engine;
  let drawing = false;
  let panning = null;
  let splitDrag = false;
  let saveTimer = null;
  const unsubs = [];

  $: focusScreen = (() => {
    const v = $view;
    const p = $effects.params.dof;
    return {
      x: p.focusX * SCENE_W * v.scale + v.x,
      y: p.focusY * SCENE_H * v.scale + v.y
    };
  })();

  $: showFocus = $effects.params.dof.enabled && $effects.order.includes('dof');

  onMount(() => {
    engine = new Engine(canvas);
    api.engine = engine;
    engine.onChange = () => {
      layers.set(engine.layerMeta());
      scheduleSave();
    };

    // 还原上次的内容
    let savedView = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.effects && d.effects.order && d.effects.params) effects.set(d.effects);
        if (typeof d.highContrast === 'boolean') highContrast.set(d.highContrast);
        if (d.view) savedView = d.view;
        if (Array.isArray(d.strokes) && d.strokes.length) engine.replay(d.strokes);
      }
    } catch (e) {
      console.warn('还原存档失败', e);
    }

    // 订阅状态 → 引擎
    unsubs.push(effects.subscribe((v) => { engine.setEffects(v); engine.render(); scheduleSave(); }));
    unsubs.push(view.subscribe((v) => { engine.setView(v); engine.render(); scheduleSave(); }));
    unsubs.push(splitX.subscribe((v) => { engine.setSplit(v); engine.render(); }));
    unsubs.push(highContrast.subscribe((v) => { engine.setHighContrast(v); engine.render(); scheduleSave(); }));

    // 尺寸
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      engine.resize(r.width, r.height, window.devicePixelRatio || 1);
      engine.render();
    });
    ro.observe(wrap);
    const r = wrap.getBoundingClientRect();
    engine.resize(r.width, r.height, window.devicePixelRatio || 1);

    if (savedView) view.set(savedView);
    else fitView();
    engine.render();

    return () => {
      ro.disconnect();
      unsubs.forEach((u) => u());
    };
  });

  function fitView() {
    const r = wrap.getBoundingClientRect();
    const scale = Math.min(r.width / SCENE_W, r.height / SCENE_H) * 0.92;
    view.set({
      scale,
      x: (r.width - SCENE_W * scale) / 2,
      y: (r.height - SCENE_H * scale) / 2
    });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function save() {
    if (!engine) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        strokes: engine.serialize(),
        effects: get(effects),
        view: get(view),
        highContrast: get(highContrast)
      }));
    } catch (e) {
      console.warn('保存失败', e);
    }
  }

  function download(filename, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // 暴露给其他组件
  api.refreshLayers = () => layers.set(engine.layerMeta());
  api.save = save;
  api.fitView = () => fitView();
  api.undo = () => { engine.undoLast(); };
  api.clearAll = () => { engine.clearAll(); };
  api.exportPNG = () => {
    engine.render();
    engine.exportPNG(2).toBlob((b) => {
      if (b) download('魔法光影画.png', b);
    }, 'image/png');
  };
  api.exportConfig = () => {
    const cfg = {
      version: 1,
      app: 'magic-light-board',
      exportedAt: new Date().toISOString(),
      strokes: engine.serialize(),
      effects: get(effects),
      view: get(view),
      highContrast: get(highContrast)
    };
    download('魔法光影画配置.json', new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }));
  };

  function localPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = localPos(e);

    if ($pickingFocus) {
      const s = engine.screenToScene(p.x, p.y);
      effects.update((fx) => ({
        ...fx,
        params: { ...fx.params, dof: { ...fx.params.dof,
          focusX: Math.min(1, Math.max(0, s.x / SCENE_W)),
          focusY: Math.min(1, Math.max(0, s.y / SCENE_H)) } }
      }));
      pickingFocus.set(false);
      return;
    }

    canvas.setPointerCapture(e.pointerId);

    if ($tool === 'pan' || e.button === 1) {
      panning = { x: e.clientX, y: e.clientY };
      return;
    }

    drawing = true;
    engine.beginStroke($tool, $brushColor, $brushSize);
    const s = engine.screenToScene(p.x, p.y);
    engine.strokeTo(s.x, s.y);
  }

  function onPointerMove(e) {
    if (splitDrag) {
      const p = localPos(e);
      splitX.set(Math.min(Math.max(p.x, 0), wrap.clientWidth));
      return;
    }
    if (panning) {
      const dx = e.clientX - panning.x, dy = e.clientY - panning.y;
      panning = { x: e.clientX, y: e.clientY };
      view.update((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
    if (!drawing) return;
    const p = localPos(e);
    const s = engine.screenToScene(p.x, p.y);
    engine.strokeTo(s.x, s.y);
  }

  function onPointerUp() {
    if (splitDrag) { splitDrag = false; return; }
    if (panning) { panning = null; return; }
    if (drawing) {
      drawing = false;
      engine.endStroke();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const p = localPos(e);
    view.update((v) => {
      const ns = Math.min(8, Math.max(0.2, v.scale * Math.exp(-e.deltaY * 0.0012)));
      const sx = (p.x - v.x) / v.scale, sy = (p.y - v.y) / v.scale;
      return { scale: ns, x: p.x - sx * ns, y: p.y - sy * ns };
    });
  }

  function startSplitDrag(e) {
    e.stopPropagation();
    splitDrag = true;
    e.target.setPointerCapture(e.pointerId);
  }

  onDestroy(() => {
    clearTimeout(saveTimer);
    save();
  });
</script>

<div class="board" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    class:panning={$tool === 'pan'}
    class:picking={$pickingFocus}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
    on:wheel|preventDefault={onWheel}
    on:contextmenu|preventDefault
  ></canvas>

  {#if $splitX != null}
    <div class="split-line" style="left: {$splitX}px"></div>
    <button class="split-handle" style="left: {$splitX}px" on:pointerdown={startSplitDrag}>⟷</button>
    <span class="split-tag" style="left: 10px">效果前</span>
    <span class="split-tag" style="right: 10px">效果后</span>
  {/if}

  {#if showFocus}
    <div class="focus-dot" style="left: {focusScreen.x}px; top: {focusScreen.y}px">◎</div>
  {/if}

  {#if $pickingFocus}
    <div class="pick-banner">点一下画布，设置景深对焦点</div>
  {/if}
</div>

<style>
  .board {
    flex: 1; position: relative; min-width: 0; overflow: hidden;
    background: #07081a;
  }
  canvas {
    position: absolute; inset: 0; width: 100%; height: 100%;
    touch-action: none; cursor: crosshair;
  }
  canvas.panning { cursor: grab; }
  canvas.picking { cursor: cell; }
  .split-line {
    position: absolute; top: 0; bottom: 0; width: 0;
    border-left: 1px dashed rgba(255,255,255,0.35);
    pointer-events: none;
  }
  .split-handle {
    position: absolute; top: 50%; transform: translate(-50%, -50%);
    width: 40px; height: 40px; border-radius: 50%;
    border: 2px solid #fff; background: rgba(30,32,70,0.9);
    color: #fff; font-size: 1.1rem; cursor: ew-resize;
    touch-action: none; z-index: 5;
  }
  .split-tag {
    position: absolute; top: 10px;
    background: rgba(20,22,50,0.75); color: #cfd3ff;
    font-size: 0.8rem; padding: 2px 10px; border-radius: 999px;
    pointer-events: none;
  }
  .focus-dot {
    position: absolute; transform: translate(-50%, -50%);
    color: #7ef0ff; font-size: 1.6rem; pointer-events: none;
    text-shadow: 0 0 8px #7ef0ff;
  }
  .pick-banner {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    background: #7ef0ff; color: #062a30; font-weight: 700;
    padding: 6px 16px; border-radius: 999px; pointer-events: none;
  }
</style>
