<script>
  import { onMount, onDestroy } from 'svelte';
  import * as BABYLON from '@babylonjs/core';
  import { buildStage } from './lib/stage.js';
  import { Sculptor, BRUSHES } from './lib/sculpt.js';
  import { axisOffset, boundingBox } from './lib/cone.js';

  let canvas;
  let stage, sculptor;

  // 笔刷 / 参数
  let brush = 'inflate';
  let radius = 12;
  let strength = 0.5;
  let falloff = 'smooth';
  let mirror = true;
  let rootLock = false;
  let displayMode = 'solid';   // solid | wire | ghost
  let hideShield = false;

  // 状态
  let vertCount = 0, faceCount = 0, axisDev = 0;
  let undoCount = 0, redoCount = 0;
  let toast = '', toastTimer = null;
  let sculpting = false;

  // 版本
  let versions = [];
  let selected = [];
  let compareResult = null;

  const AXIS_LIMIT = 0.5; // mm

  onMount(() => {
    stage = buildStage(canvas);
    sculptor = new Sculptor(stage.coneMesh, stage.positions, stage.indices, stage.boundary);
    vertCount = stage.vertCount;
    faceCount = stage.indices.length / 3;
    refreshAxisDev();

    sculptor.onBoundaryTouch = () => showToast('笔刷触及封口边缘环：已自动保护，边缘不会被挑破');
    sculptor.onStrokeEnd = () => { refreshAxisDev(); syncStacks(); };

    // 左键雕刻
    stage.scene.onPointerObservable.add((pi) => {
      const evt = pi.event;
      if (pi.type === BABYLON.PointerEventTypes.POINTERDOWN && evt.button === 0) {
        const pick = pickCone();
        if (pick) {
          sculpting = true;
          sculptor.beginStroke(pick);
          sculptor.applyAt(pick);
          syncStacks();
        }
      } else if (pi.type === BABYLON.PointerEventTypes.POINTERMOVE && sculpting) {
        const pick = pickCone() || pickOnViewPlane();
        if (pick) sculptor.applyAt(pick);
      } else if (pi.type === BABYLON.PointerEventTypes.POINTERUP && sculpting) {
        sculpting = false;
        sculptor.endStroke();
      }
    });

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('contextmenu', prevent);
  });

  onDestroy(() => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    stage?.engine.dispose();
  });

  const prevent = (e) => e.preventDefault();
  const onResize = () => stage?.engine.resize();

  function onKey(e) {
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
  }

  function pickCone() {
    const p = stage.scene.pick(stage.scene.pointerX, stage.scene.pointerY, m => m === stage.coneMesh);
    return p && p.hit ? p.pickedPoint : null;
  }

  // 指针移出网格时，在过上一点且垂直视线的平面上继续取点（拉伸笔刷不断线）
  function pickOnViewPlane() {
    if (!sculptor.stroke) return null;
    const ray = stage.scene.createPickingRay(stage.scene.pointerX, stage.scene.pointerY, null, stage.camera);
    const plane = BABYLON.Plane.FromPositionAndNormal(sculptor.stroke.last, stage.camera.getForwardRay().direction);
    const d = ray.intersectsPlane(plane);
    return d === null ? null : ray.origin.add(ray.direction.scale(d));
  }

  function refreshAxisDev() {
    axisDev = axisOffset(stage.positions, stage.rows, stage.segments);
  }

  function syncStacks() {
    undoCount = sculptor.undoStack.length;
    redoCount = sculptor.redoStack.length;
  }

  function showToast(msg) {
    if (toast) return; // 冷却：同一提示不刷屏
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 1600);
  }

  // --- 参数同步到雕刻引擎 ---
  $: if (sculptor) {
    sculptor.brush = brush;
    sculptor.radius = radius;
    sculptor.strength = strength;
    sculptor.falloff = falloff;
    sculptor.mirror = mirror;
    sculptor.rootLock = rootLock;
  }

  // --- 显示模式 ---
  $: if (stage) applyDisplay(displayMode);
  function applyDisplay(mode) {
    const { coneMat, coneMesh } = stage;
    coneMat.wireframe = mode === 'wire';
    coneMat.alpha = mode === 'ghost' ? 0.45 : 1;
    if (mode === 'ghost') coneMesh.enableEdgesRendering(0.999);
    else coneMesh.disableEdgesRendering();
  }

  $: if (stage) stage.shieldMesh.setEnabled(!hideShield);

  // --- 撤销 / 重做（按笔划整体回退） ---
  function undo() { if (sculptor.undo()) { refreshAxisDev(); syncStacks(); } }
  function redo() { if (sculptor.redo()) { refreshAxisDev(); syncStacks(); } }

  // --- 版本管理 ---
  function saveVersion() {
    const bbox = boundingBox(stage.positions);
    versions = [{
      id: versions.length ? Math.max(...versions.map(v => v.id)) + 1 : 1,
      name: `V${versions.length + 1}`,
      time: new Date().toLocaleString(),
      positions: stage.positions.slice(),
      faces: faceCount,
      bbox
    }, ...versions];
    compareResult = null;
  }

  function toggleSelect(id) {
    if (selected.includes(id)) selected = selected.filter(s => s !== id);
    else selected = [...selected, id].slice(-2);
  }

  function compareVersions() {
    if (selected.length !== 2) return;
    const a = versions.find(v => v.id === selected[0]);
    const b = versions.find(v => v.id === selected[1]);
    const n = vertCount;
    const diffs = new Float32Array(n);
    let max = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(
        a.positions[i * 3] - b.positions[i * 3],
        a.positions[i * 3 + 1] - b.positions[i * 3 + 1],
        a.positions[i * 3 + 2] - b.positions[i * 3 + 2]);
      diffs[i] = d; sum += d;
      if (d > max) max = d;
    }
    // 热力图着色到当前网格
    const colors = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const t = max > 0 ? diffs[i] / max : 0;
      colors[i * 4] = 0.15 + 0.85 * t;
      colors[i * 4 + 1] = 0.35 + 0.3 * (1 - Math.abs(t - 0.5) * 2);
      colors[i * 4 + 2] = 1 - 0.8 * t;
      colors[i * 4 + 3] = 1;
    }
    stage.coneMesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, colors, true);
    compareResult = { a: a.name, b: b.name, max, mean: sum / n };
  }

  function clearCompare() {
    stage.coneMesh.removeVerticesData(BABYLON.VertexBuffer.ColorKind);
    compareResult = null;
    selected = [];
  }

  // --- 导出 OBJ + 记录 ---
  function download(filename, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportOBJ() {
    const pos = stage.positions, idx = stage.indices;
    let obj = '# 应力锥网格导出\no stress_cone\n';
    for (let i = 0; i < pos.length; i += 3)
      obj += `v ${pos[i].toFixed(4)} ${pos[i + 1].toFixed(4)} ${pos[i + 2].toFixed(4)}\n`;
    for (let i = 0; i < idx.length; i += 3)
      obj += `f ${idx[i] + 1} ${idx[i + 1] + 1} ${idx[i + 2] + 1}\n`;

    const bb = boundingBox(pos);
    const stamp = new Date().toLocaleString().replace(/[/:]/g, '-');
    const record = [
      '应力锥网格导出记录',
      `时间: ${stamp}`,
      `顶点数: ${vertCount}`,
      `面数: ${faceCount}`,
      `包围盒 min: (${bb.min.map(v => v.toFixed(2)).join(', ')}) mm`,
      `包围盒 max: (${bb.max.map(v => v.toFixed(2)).join(', ')}) mm`,
      `包围盒尺寸: ${bb.size.map(v => v.toFixed(2)).join(' × ')} mm`,
      `对称轴偏移: ${axisDev.toFixed(3)} mm ${axisDev > AXIS_LIMIT ? '(超限!)' : '(合格)'}`
    ].join('\n');

    download(`stress_cone_${Date.now()}.obj`, obj);
    download(`stress_cone_record_${Date.now()}.txt`, record);
  }
</script>

<div class="layout">
  <aside class="panel left">
    <h1>应力锥雕刻工作台</h1>

    <section>
      <h2>笔刷</h2>
      <div class="btn-row">
        {#each BRUSHES as b}
          <button class:active={brush === b.key} on:click={() => (brush = b.key)}>{b.label}</button>
        {/each}
      </div>
    </section>

    <section>
      <h2>参数</h2>
      <label for="radius">半径 <span>{radius} mm</span></label>
      <input id="radius" type="range" min="2" max="30" step="1" bind:value={radius} />
      <label for="strength">强度 <span>{strength.toFixed(2)}</span></label>
      <input id="strength" type="range" min="0.05" max="1" step="0.05" bind:value={strength} />
    </section>

    <section>
      <h2>边缘衰减</h2>
      <div class="btn-row">
        {#each [['linear', '线性'], ['smooth', '平滑'], ['sharp', '锐利']] as [k, label]}
          <button class:active={falloff === k} on:click={() => (falloff = k)}>{label}</button>
        {/each}
      </div>
    </section>

    <section>
      <h2>约束</h2>
      <label class="check"><input type="checkbox" bind:checked={mirror} /> 轴向镜像（另一侧同样受力）</label>
      <label class="check"><input type="checkbox" bind:checked={rootLock} /> 母线锁（防带歪根部）</label>
    </section>

    <section>
      <h2>显示</h2>
      <div class="btn-row">
        {#each [['solid', '实体'], ['wire', '线框'], ['ghost', '半透明叠显']] as [k, label]}
          <button class:active={displayMode === k} on:click={() => (displayMode = k)}>{label}</button>
        {/each}
      </div>
      <label class="check"><input type="checkbox" bind:checked={hideShield} /> 隐藏外屏蔽层</label>
    </section>

    <section>
      <h2>笔划历史</h2>
      <div class="btn-row">
        <button disabled={undoCount === 0} on:click={undo}>撤销 ({undoCount})</button>
        <button disabled={redoCount === 0} on:click={redo}>重做 ({redoCount})</button>
      </div>
    </section>
  </aside>

  <main class="viewport">
    <canvas bind:this={canvas}></canvas>
    <div class="stats">
      <span>顶点数 <b>{vertCount}</b></span>
      <span>面数 <b>{faceCount}</b></span>
      <span class:bad={axisDev > AXIS_LIMIT}>
        对称轴偏移 <b>{axisDev.toFixed(3)} mm</b>{axisDev > AXIS_LIMIT ? ' ⚠ 超限' : ''}
      </span>
    </div>
    <div class="hint">左键拖拽雕刻 · 右键旋转 · 中键平移 · 滚轮缩放 · Ctrl+Z / Ctrl+Y</div>
    {#if toast}<div class="toast">{toast}</div>{/if}
  </main>

  <aside class="panel right">
    <section>
      <h2>导出</h2>
      <button class="wide" on:click={exportOBJ}>导出 OBJ + 记录文件</button>
    </section>

    <section>
      <h2>版本</h2>
      <button class="wide" on:click={saveVersion}>保存当前为版本</button>
      {#if versions.length === 0}
        <p class="dim">尚无版本</p>
      {:else}
        <ul class="vlist">
          {#each versions as v}
            <li>
              <label class="check">
                <input type="checkbox" checked={selected.includes(v.id)} on:change={() => toggleSelect(v.id)} />
                <b>{v.name}</b>
              </label>
              <div class="dim">{v.time} · {v.faces} 面 · {v.bbox.size.map(s => s.toFixed(1)).join('×')} mm</div>
            </li>
          {/each}
        </ul>
        <div class="btn-row">
          <button disabled={selected.length !== 2} on:click={compareVersions}>对比所选</button>
          <button disabled={!compareResult} on:click={clearCompare}>清除对比</button>
        </div>
        {#if compareResult}
          <div class="compare">
            <div>{compareResult.a} ↔ {compareResult.b}</div>
            <div>最大偏差 <b>{compareResult.max.toFixed(3)} mm</b></div>
            <div>平均偏差 <b>{compareResult.mean.toFixed(3)} mm</b></div>
            <div class="dim">网格已按偏差热力图着色（蓝→红）</div>
          </div>
        {/if}
      {/if}
    </section>
  </aside>
</div>

<style>
  :global(body) { margin: 0; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; background: #14161a; color: #d7dbe2; overflow: hidden; }
  .layout { display: flex; height: 100vh; }
  .panel { width: 250px; flex: none; background: #1c1f26; padding: 12px 14px; overflow-y: auto; box-sizing: border-box; }
  .panel.right { width: 270px; }
  h1 { font-size: 15px; margin: 2px 0 10px; color: #9fc3ff; }
  h2 { font-size: 12px; margin: 14px 0 6px; color: #8a93a5; font-weight: 600; letter-spacing: 1px; }
  section { border-top: 1px solid #2a2e38; padding-top: 4px; }
  section:first-of-type { border-top: none; }
  .btn-row { display: flex; flex-wrap: wrap; gap: 6px; }
  button { background: #2a2f3a; color: #d7dbe2; border: 1px solid #3a4152; border-radius: 4px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
  button:hover:not(:disabled) { background: #343b4a; }
  button:disabled { opacity: 0.4; cursor: default; }
  button.active { background: #2f5da8; border-color: #4a80d8; color: #fff; }
  button.wide { width: 100%; }
  label { display: flex; justify-content: space-between; font-size: 12px; margin: 6px 0 2px; }
  label.check { justify-content: flex-start; align-items: center; gap: 6px; cursor: pointer; }
  label span { color: #9fc3ff; }
  input[type='range'] { width: 100%; }
  .viewport { position: relative; flex: 1; min-width: 0; }
  canvas { width: 100%; height: 100%; display: block; outline: none; touch-action: none; }
  .stats { position: absolute; top: 10px; left: 12px; display: flex; gap: 18px; background: rgba(20, 22, 26, 0.75); padding: 6px 14px; border-radius: 6px; font-size: 12px; }
  .stats b { color: #9fc3ff; }
  .stats .bad, .stats .bad b { color: #ff5b5b; }
  .hint { position: absolute; bottom: 10px; left: 12px; font-size: 11px; color: #6b7385; }
  .toast { position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); background: #7a2e2e; border: 1px solid #c05555; color: #ffd9d9; padding: 8px 18px; border-radius: 6px; font-size: 13px; }
  .vlist { list-style: none; margin: 8px 0; padding: 0; max-height: 300px; overflow-y: auto; }
  .vlist li { border-bottom: 1px solid #2a2e38; padding: 5px 0; font-size: 12px; }
  .dim { color: #6b7385; font-size: 11px; }
  .compare { margin-top: 8px; font-size: 12px; background: #232836; border-radius: 6px; padding: 8px 10px; }
  .compare b { color: #ffb84a; }
</style>
