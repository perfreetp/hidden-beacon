<script>
  // 立面画布：SVG + d3.zoom，支持框选、拖拽微调、吸附轴线/层高线、差异描边
  import { zoom, zoomIdentity, select } from 'd3';
  import { devicePrimitives, pipePrimitives } from '../lib/engine/shapes.js';
  import { liveSnap } from '../lib/engine/generate.js';
  import { TYPES } from '../lib/engine/catalog.js';

  let {
    facade,
    layers: layersProp,
    selectedIds = $bindable([]),
    readonly = false,
    diff = null,
    panMode = false,
    fitSignal = 0,
    oncommit = () => {}
  } = $props();

  let localLayers = $state({ grid: true, devices: true, pipes: true, labels: true });
  const layers = $derived(layersProp ?? localLayers);

  let svgEl, wrapEl;
  let zoomBehavior;
  let t = $state(zoomIdentity.translate(40, 20).scale(14));
  let marquee = $state(null);          // 屏幕坐标框选矩形
  let guides = $state([]);            // 拖拽吸附参考线
  let drag = $state(null);            // { startX, startY, moved, values: Map }

  const H = $derived(facade?.bounds.height || 1);
  const diffMap = $derived(new Map((diff?.items || []).map((it) => [it.id, it.status])));
  const removedGhosts = $derived((diff?.items || []).filter((it) => it.status === 'removed').map((it) => it.before));

  // 外层 T=translate(tx,ty)·scale(k) + 内层 scale(1,-1)：
  // 屏幕 (sx,sy) → 世界 wx=(sx-tx)/k, wy=(ty-sy)/k
  function toWorld(clientX, clientY) {
    const rect = svgEl.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return [(sx - t.x) / t.k, (t.y - sy) / t.k];
  }

  // 内层 scale(1,-1) 把世界 y-up 翻成屏幕 y-down，翻转中心在屏幕原点。
  // 世界 (0,0) → 屏幕 (tx, ty)，世界 (0,H) → 屏幕 y = ty - H·k，
  // 居中时令底边 ty=ch-(ch-Hk)/2、顶边 ty-Hk=(ch-Hk)/2。
  function fit() {
    if (!svgEl || !facade) return;
    const cw = svgEl.clientWidth;
    const ch = svgEl.clientHeight;
    const bw = facade.bounds.width;
    const bh = facade.bounds.height;
    const k = Math.min(cw / (bw + 2), ch / (bh + 2));
    const tx = (cw - bw * k) / 2;
    const ty = ch - (ch - bh * k) / 2;
    const zt = zoomIdentity.translate(tx, ty).scale(k);
    zoomBehavior.transform(select(svgEl), zt);
  }

  $effect(() => {
    if (!svgEl) return;
    zoomBehavior = zoom()
      .filter((ev) => ev.type === 'wheel')
      .scaleExtent([2, 260])
      .on('zoom', (ev) => { t = ev.transform; });
    d3select(svgEl).call(zoomBehavior);
    const raf = requestAnimationFrame(() => fit());
    // 容器尺寸变化（窗口缩放等）后重新适配
    let lastSize = `${svgEl.clientWidth}x${svgEl.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const size = `${svgEl.clientWidth}x${svgEl.clientHeight}`;
      if (size !== lastSize) { lastSize = size; fit(); }
    });
    ro.observe(svgEl);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });

  // d3 选择器封装，供 zoom 行为挂载
  function d3select(el) { return select(el); }

  $effect(() => {
    void fitSignal;
    if (zoomBehavior) requestAnimationFrame(() => fit());
  });

  const isSel = (id) => selectedIds.includes(id);

  function statusOf(id) {
    return diffMap.get(id);
  }

  const DIFF_STROKE = {
    added: '#059669', removed: '#dc2626', moved: '#d97706'
  };

  // ---------- 元素拖拽 ----------
  function onElementDown(ev, el) {
    if (readonly || el.locked) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (!isSel(el.id)) {
      selectedIds = ev.shiftKey ? [...selectedIds, el.id] : [el.id];
    } else if (ev.shiftKey) {
      selectedIds = selectedIds.filter((id) => id !== el.id);
      return;
    }
    const [wx, wy] = toWorld(ev.clientX, ev.clientY);
    const all = [...facade.devices, ...facade.pipes];
    const values = new Map();
    for (const id of selectedIds) {
      const e = all.find((x) => x.id === id);
      // 响应式代理无法 structuredClone，几何数据均为纯 JSON，用 JSON 深拷贝
      if (e && !e.locked) values.set(id, JSON.parse(JSON.stringify(e)));
    }
    drag = { startX: wx, startY: wy, moved: false, values };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp, { once: true });
  }

  function onDragMove(ev) {
    if (!drag) return;
    const [wx, wy] = toWorld(ev.clientX, ev.clientY);
    const dx = +(wx - drag.startX).toFixed(3);
    const dy = +(wy - drag.startY).toFixed(3);
    // 以世界坐标实际位移判定（合成事件的 movementX/Y 可能为 0）
    if (Math.abs(dx) + Math.abs(dy) > 0.05) drag.moved = true;
    const next = new Map();
    const guideSet = [];
    for (const [id, el] of drag.values) {
      const r = liveSnap(el, facade.grid, dx, dy);
      next.set(id, r.value);
      for (const g of r.guides) if (g.active) guideSet.push(g);
    }
    drag = { ...drag, values: next };
    guides = guideSet;
  }

  function onDragUp() {
    window.removeEventListener('pointermove', onDragMove);
    if (drag?.moved) {
      const updates = [...drag.values.values()];
      guides = [];
      drag = null;
      oncommit(updates);
    } else {
      guides = [];
      drag = null;
    }
  }

  function dragEl(el) {
    return drag?.values.get(el.id) || el;
  }

  // ---------- 背景：框选 / 平移 ----------
  function onBackgroundDown(ev) {
    if (readonly) return;
    if (panMode) {
      const start = { x: ev.clientX, y: ev.clientY, tx: t.x, ty: t.y };
      const move = (me) => {
        const zt = zoomIdentity.translate(
          start.tx + (me.clientX - start.x),
          start.ty + (me.clientY - start.y)
        ).scale(t.k);
        zoomBehavior.transform(select(svgEl), zt);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    const rect = svgEl.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    marquee = { x0: sx, y0: sy, x1: sx, y1: sy, additive: ev.shiftKey };
    window.addEventListener('pointermove', onMarqueeMove);
    window.addEventListener('pointerup', onMarqueeUp, { once: true });
  }

  function onMarqueeMove(ev) {
    if (!marquee) return;
    const rect = svgEl.getBoundingClientRect();
    marquee = { ...marquee, x1: ev.clientX - rect.left, y1: ev.clientY - rect.top };
  }

  function onMarqueeUp() {
    window.removeEventListener('pointermove', onMarqueeMove);
    const m = marquee;
    marquee = null;
    if (!m || Math.abs(m.x1 - m.x0) < 4) {
      if (!m?.additive) selectedIds = [];
      return;
    }
    const r = svgEl.getBoundingClientRect();
    // 外层 transform T=translate(tx,ty)·scale(k)，内层 scale(1,-1)。
    // 世界点 (wx,wy) 的屏幕坐标 = (tx+k·wx, ty-k·wy)，
    // 故逆映射：wx=(sx-tx)/k，wy=(ty-sy)/k。
    const k = t.k;
    const toWorldPt = (sx, sy) => [(sx - t.x) / k, (t.y - sy) / k];
    const [ax, ay] = toWorldPt(Math.min(m.x0, m.x1), Math.min(m.y0, m.y1));
    const [bx, by] = toWorldPt(Math.max(m.x0, m.x1), Math.max(m.y0, m.y1));
    const box = { x0: ax, x1: bx, y0: Math.min(ay, by), y1: Math.max(ay, by) };
    const hit = [];
    for (const d of facade.devices) {
      if (d.visible === false) continue;
      if (rectsOverlap(box, d)) hit.push(d.id);
    }
    for (const p of facade.pipes) {
      if (p.visible === false) continue;
      if (segHitsRect(p, box)) hit.push(p.id);
    }
    selectedIds = m.additive ? [...new Set([...selectedIds, ...hit])] : hit;
  }

  function rectsOverlap(box, d) {
    return d.x < box.x1 && d.x + d.w > box.x0 && d.y < box.y1 && d.y + d.h > box.y0;
  }

  function segHitsRect(p, b) {
    const inside = (x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    if (inside(p.x1, p.y1) || inside(p.x2, p.y2)) return true;
    const edges = [
      [b.x0, b.y0, b.x1, b.y0], [b.x1, b.y0, b.x1, b.y1],
      [b.x1, b.y1, b.x0, b.y1], [b.x0, b.y1, b.x0, b.y0]
    ];
    return edges.some((e) => segIntersect(p.x1, p.y1, p.x2, p.y2, ...e));
  }

  function segIntersect(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y) {
    const d = (p2x - p1x) * (p4y - p3y) - (p2y - p1y) * (p4x - p3x);
    if (d === 0) return false;
    const u = ((p3x - p1x) * (p4y - p3y) - (p3y - p1y) * (p4x - p3x)) / d;
    const v = ((p3x - p1x) * (p2y - p1y) - (p3y - p1y) * (p2x - p1x)) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }

  function zoomBy(factor) {
    zoomBehavior.scaleBy(select(svgEl), factor);
  }
</script>

<div class="canvas-wrap" bind:this={wrapEl}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    bind:this={svgEl}
    class:pan-mode={panMode}
    role="application"
    aria-label="立面画布：滚轮缩放，空白拖拽框选，点选构件可拖拽微调"
    onpointerdown={onBackgroundDown}
  >
    <g transform={t.toString()}>
      <!-- 翻转中心固定在屏幕原点，与外层 zoom transform 保持同一坐标参考 -->
      <g transform="scale(1, -1)">
        <!-- 网格：轴线 / 层高线 -->
        {#if layers.grid}
          <g class="grid">
            {#each facade.grid.axes as ax, i (i)}
              <line x1={ax} y1="0" x2={ax} y2={facade.bounds.height} />
              <g transform={`translate(${ax}, -0.45) scale(1,-1)`}>
                <text class="grid-label" font-size="0.55" text-anchor="middle">轴{i + 1}</text>
              </g>
            {/each}
            {#each facade.grid.floors as fy, i (i)}
              <line x1="0" y1={fy} x2={facade.bounds.width} y2={fy} class:floor={i === 0} />
              <g transform={`translate(-0.3, ${fy}) scale(1,-1)`}>
                <text class="grid-label" font-size="0.55" text-anchor="end" dominant-baseline="middle">{fy}m</text>
              </g>
            {/each}
          </g>
        {/if}

        <!-- 吸附参考线 -->
        {#each guides as g, i (i)}
          {#if g.axis === 'x'}
            <line class="guide" x1={g.pos} y1="0" x2={g.pos} y2={facade.bounds.height} />
          {:else}
            <line class="guide" x1="0" y1={g.pos} x2={facade.bounds.width} y2={g.pos} />
          {/if}
        {/each}

        <!-- 管线层 -->
        {#if layers.pipes}
          <g class="pipes">
            {#each facade.pipes as p (p.id)}
              {#if p.visible !== false}
                {@const live = dragEl(p)}
                {@const st = statusOf(p.id)}
                <g class:selected={isSel(p.id)} class:locked={p.locked}>
                  {#each pipePrimitives(live) as pr, i (i)}
                    <svelte:element this={pr.tag} {...pr.attrs}
                      stroke={st ? DIFF_STROKE[st] : pr.attrs.stroke}
                      stroke-width={st ? Math.max(pr.attrs['stroke-width'], 0.3) : pr.attrs['stroke-width']}
                      stroke-dasharray={st === 'removed' ? '0.4 0.25' : pr.attrs['stroke-dasharray']}
                      opacity={st === 'removed' ? 0.55 : 1}
                    />
                  {/each}
                  <!-- 抓取热区 -->
                  {#if !readonly}
                    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_interactive_supports_focus -->
                    <line class="hit" x1={live.x1} y1={live.y1} x2={live.x2} y2={live.y2}
                      role="button" tabindex="0"
                      onpointerdown={(ev) => onElementDown(ev, p)} />
                  {/if}
                  {#if isSel(p.id)}
                    <line class="sel-pipe" x1={live.x1} y1={live.y1} x2={live.x2} y2={live.y2} />
                  {/if}
                </g>
              {/if}
            {/each}
          </g>
        {/if}

        <!-- 设备层 -->
        {#if layers.devices}
          <g class="devices">
            {#each facade.devices as d (d.id)}
              {#if d.visible !== false}
                {@const live = dragEl(d)}
                {@const st = statusOf(d.id)}
                {@const shape = devicePrimitives(live)}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_interactive_supports_focus -->
                <g class:selected={isSel(d.id)} class:locked={d.locked} role="button" tabindex="0"
                  onpointerdown={(ev) => onElementDown(ev, d)}>
                  {#each shape.primitives as pr, i (i)}
                    <svelte:element this={pr.tag} {...pr.attrs}
                      stroke={st ? DIFF_STROKE[st] : pr.attrs.stroke}
                      stroke-width={st ? Math.max(pr.attrs['stroke-width'] || 0.1, 0.26) : pr.attrs['stroke-width']}
                      stroke-dasharray={st === 'removed' ? '0.4 0.25' : pr.attrs['stroke-dasharray']}
                      opacity={st === 'removed' ? 0.55 : 1}
                    />
                  {/each}
                  {#if st}
                    <rect class="diff-box" x={live.x - 0.15} y={live.y - 0.15}
                      width={live.w + 0.3} height={live.h + 0.3}
                      stroke={DIFF_STROKE[st]} />
                  {/if}
                  {#if d.locked && !st}
                    <rect class="lock-box" x={shape.hit.x} y={shape.hit.y} width={shape.hit.w} height={shape.hit.h} />
                  {/if}
                  {#if isSel(d.id)}
                    <rect class="sel-box" x={shape.hit.x - 0.12} y={shape.hit.y - 0.12}
                      width={shape.hit.w + 0.24} height={shape.hit.h + 0.24} />
                  {/if}
                  {#if !readonly}
                    <rect class="hit" x={shape.hit.x} y={shape.hit.y} width={shape.hit.w} height={shape.hit.h} />
                  {/if}
                  {#if layers.labels}
                    <g transform={`translate(${live.x + live.w / 2}, ${Math.min(live.y + live.h + 0.6, facade.bounds.height - 0.5)}) scale(1,-1)`}>
                      <text class="dev-label" font-size="0.55" text-anchor="middle">{d.code}</text>
                      <text class="dev-sub" font-size="0.42" y="0.62" text-anchor="middle">{d.model} · {d.anchorHeight ?? (live.y + live.h)}m</text>
                    </g>
                  {/if}
                  {#if d.locked}
                    <g transform={`translate(${live.x + live.w - 0.1}, ${live.y + 0.7}) scale(1,-1)`}>
                      <text class="lock-flag" font-size="0.45" text-anchor="middle" dominant-baseline="middle">锁</text>
                    </g>
                  {/if}
                </g>
              {/if}
            {/each}

            <!-- 差异中被删除构件的幽灵渲染 -->
            {#each removedGhosts as g2 (g2.id)}
              {#if g2.kind === 'device'}
                {@const shape = devicePrimitives(g2)}
                <g class="ghost">
                  {#each shape.primitives as pr, i (i)}
                    <svelte:element this={pr.tag} {...pr.attrs}
                      stroke="#dc2626" opacity="0.5" stroke-dasharray="0.4 0.25" />
                  {/each}
                </g>
              {:else}
                {#each pipePrimitives(g2) as pr, i (i)}
                  <svelte:element this={pr.tag} {...pr.attrs} stroke="#dc2626" opacity="0.5" stroke-dasharray="0.4 0.25" />
                {/each}
              {/if}
            {/each}
          </g>
        {/if}
      </g>
    </g>

    <!-- 框选矩形（屏幕坐标） -->
    {#if marquee}
      <rect class="marquee"
        x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
        width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)} />
    {/if}
  </svg>

  <div class="zoom-bar">
    <button onclick={() => zoomBy(1.3)} title="放大">＋</button>
    <button onclick={() => zoomBy(1 / 1.3)} title="缩小">－</button>
    <button onclick={fit} title="适配视图">适</button>
  </div>
  {#if drag?.moved}
    <div class="drag-hint">已吸附到最近轴线/层高线，松开即锁定该局部</div>
  {/if}
</div>

<style>
  .canvas-wrap { position: relative; flex: 1; min-height: 0; border-radius: 10px; overflow: hidden; background: #fff; border: 1px solid var(--line); }
  svg { width: 100%; height: 100%; display: block; touch-action: none; cursor: crosshair; }
  svg.pan-mode { cursor: grab; }
  .grid line { stroke: #e2e8f0; stroke-width: 0.04; stroke-dasharray: 0.28 0.2; }
  .grid line.floor { stroke: #94a3b8; stroke-width: 0.07; stroke-dasharray: none; }
  .grid-label { fill: #94a3b8; }
  .guide { stroke: #1d4ed8; stroke-width: 0.06; stroke-dasharray: 0.3 0.18; }
  .hit { fill: transparent; stroke: none; pointer-events: all; cursor: grab; }
  .locked .hit { cursor: not-allowed; }
  .sel-box { fill: none; stroke: #1d4ed8; stroke-width: 0.09; pointer-events: none; }
  .sel-pipe { stroke: #1d4ed8; stroke-width: 0.55; fill: none; pointer-events: none; opacity: 0.85; }
  .lock-box { fill: none; stroke: #7c3aed; stroke-width: 0.08; stroke-dasharray: 0.25 0.15; pointer-events: none; }
  .diff-box { fill: none; stroke-width: 0.09; pointer-events: none; }
  .dev-label { font-weight: 700; fill: #0f172a; paint-order: stroke; stroke: #fff; stroke-width: 0.12; }
  .dev-sub { fill: #475569; paint-order: stroke; stroke: #fff; stroke-width: 0.1; }
  .lock-flag { font-weight: 700; fill: #fff; paint-order: stroke; stroke: #7c3aed; stroke-width: 0.16; }
  .marquee { fill: rgba(29, 78, 216, 0.08); stroke: #1d4ed8; stroke-width: 1; stroke-dasharray: 4 3; pointer-events: none; }
  .zoom-bar { position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 4px; }
  .zoom-bar button { width: 34px; height: 34px; padding: 0; font-weight: 700; box-shadow: var(--shadow); }
  .drag-hint { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); background: #1d4ed8; color: #fff; padding: 6px 14px; border-radius: 999px; font-size: 12px; }
</style>
