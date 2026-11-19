<script>
  import { push, router } from 'svelte-spa-router';
  import FacadeCanvas from '../components/FacadeCanvas.svelte';
  import { dbStore, getProject, saveFacade, submitReview } from '../lib/repo.js';
  import { session } from '../lib/session.js';
  import { TYPES, TYPE_LIST, modelsOf, getModel } from '../lib/engine/catalog.js';
  import { exportSvg, exportReport } from '../lib/export.js';

  let qs = $state('');
  $effect(() => { qs = router.querystring; });

  let versionIdx = $state(0);
  let facade = $state(null);
  let selectedIds = $state([]);
  let layers = $state({ grid: true, devices: true, pipes: true, labels: true });
  let panMode = $state(false);
  let fitSignal = $state(0);
  let swapType = $state(null);
  let swapFrom = $state('');
  let swapTo = $state('');
  let toast = $state('');

  // 直接访问 /edit 时 session 为空，回退到库中第一个项目
  const projectId = $derived(
    $session.projectId || $dbStore.projects[0]?.id || null
  );
  const project = $derived($dbStore.projects.find((p) => p.id === projectId));
  const version = $derived(project?.versions[versionIdx]);

  const targetVid = $derived(qs.match(/(?:^|&)v=([^&]+)/)?.[1] || '');

  // URL 指定版本 → 版本下标
  $effect(() => {
    if (!project) { versionIdx = 0; return; }
    const idx = targetVid
      ? project.versions.findIndex((v) => v.id === decodeURIComponent(targetVid))
      : -1;
    versionIdx = idx >= 0 ? idx : project.versions.length - 1;
  });

  // 仅在切换项目/版本时重载画布；保存导致的 store 更新不会清空本地编辑与选择
  let loadedKey = '';
  $effect(() => {
    if (!project) { facade = null; return; }
    const ver = project.versions[versionIdx];
    const key = `${project.id}:${ver?.id}`;
    if (key === loadedKey) return;
    loadedKey = key;
    // 响应式代理不能 structuredClone，facade 为纯 JSON 数据
    facade = JSON.parse(JSON.stringify(ver.facade));
    selectedIds = [];
  });

  const allEls = $derived(facade ? [...facade.devices, ...facade.pipes] : []);
  const selected = $derived(allEls.filter((e) => selectedIds.includes(e.id)));

  function findEl(id) {
    return allEls.find((e) => e.id === id);
  }

  // 拖拽提交：写入坐标并加锁（锁住局部，重生成时保持原样）
  function onCommit(updates) {
    for (const u of updates) {
      const el = findEl(u.id);
      if (!el || el.locked) continue;
      Object.assign(el, u);
      el.locked = true;
      if (el.kind === 'device') el.anchorHeight = +(el.y + el.h).toFixed(2);
    }
    facade = facade;
    persist();
  }

  function persist() {
    if (project && version) saveFacade(project.id, version.id, facade);
  }

  function toggleLock(el) {
    el.locked = !el.locked;
    facade = facade;
    persist();
  }

  function toggleVisible(el) {
    el.visible = el.visible === false;
    facade = facade;
    persist();
  }

  function hideSelected() {
    for (const el of selected) el.visible = false;
    facade = facade;
    selectedIds = [];
    persist();
  }

  function selectEl(id) {
    selectedIds = [id];
  }

  // 批量换型号：按类型整体替换尺寸，位置/锁定状态保留
  function openSwap(type) {
    swapType = type;
    swapFrom = modelsOf(type)[0].model;
    swapTo = modelsOf(type).find((m) => m.model !== swapFrom)?.model || swapFrom;
  }

  function applySwap() {
    const target = getModel(swapType, swapTo);
    let n = 0;
    for (const d of facade.devices) {
      if (d.type !== swapType || d.model !== swapFrom) continue;
      const cx = d.x + d.w / 2;
      d.model = target.model;
      if (target.w > 0) {
        d.w = target.w;
        d.x = +(cx - target.w / 2).toFixed(2);
      }
      if (d.type !== 'rack' && d.type !== 'ladder') d.h = target.h;
      else d.h = target.h;
      d.anchorHeight = +(d.y + d.h).toFixed(2);
      n++;
    }
    facade = facade;
    toast = `已更换 ${n} 件${TYPES[swapType]?.name || ''}构件型号`;
    swapType = null;
    persist();
    setTimeout(() => (toast = ''), 3000);
    return n;
  }

  function goRegenerate() {
    session.set({ projectId: project.id, versionId: version.id });
    push('/');
  }

  function goReview() {
    session.set({ projectId: project.id, versionId: version.id });
    push('/review');
  }

  const devVisible = $derived(facade?.devices.filter((d) => d.visible !== false).length || 0);
  const pipeVisible = $derived(facade?.pipes.filter((p) => p.visible !== false).length || 0);
  const lockedN = $derived(facade ? facade.meta.lockedCount : 0);

  function isSel2(id) {
    return selectedIds.includes(id);
  }
</script>

{#if project && facade && version}
  <div class="page">
    <div class="page-body">
      <aside class="sidebar wide panel">
        <div class="row spread">
          <h2 style="margin:0">{project.name}</h2>
          <span class="tag {project.status === 'archived' ? 'green' : 'blue'}">
            {project.status === 'archived' ? '已归档' : project.status === 'review' ? '待审核' : '编辑中'}
          </span>
        </div>
        <div class="row" style="margin:10px 0">
          <select bind:value={versionIdx}>
            {#each project.versions as v, i (v.id)}
              <option value={i}>V{v.n} · {v.note}</option>
            {/each}
          </select>
        </div>

        <h3>视图工具</h3>
        <div class="row wrap">
          <button class:active={panMode} onclick={() => (panMode = !panMode)}>
            {panMode ? '平移中（点击退出）' : '平移视图'}
          </button>
          <button onclick={() => fitSignal++}>适配缩放</button>
        </div>
        <div class="small muted" style="margin-top:6px">
          滚轮缩放 · 空白处拖拽为<span class="kbd">框选</span> · Shift+框选追加 ·
          点构件拖拽微调，自动吸附轴线/层高线并加锁
        </div>

        <h3>图层（{devVisible} 设备 / {pipeVisible} 管线显示中）</h3>
        <div class="row wrap">
          {#each Object.entries(layers) as [key, on] (key)}
            <button class="toggle" class:off={!on} onclick={() => (layers[key] = !layers[key])}>
              {({ grid: '网格', devices: '设备', pipes: '管线', labels: '标注' })[key]}
            </button>
          {/each}
          <button onclick={hideSelected} disabled={!selected.length}>隐藏选中</button>
        </div>

        <h3>批量换型号</h3>
        <div class="row wrap">
          {#each TYPE_LIST as ty (ty.key)}
            <button onclick={() => openSwap(ty.key)}>{ty.name}</button>
          {/each}
        </div>

        <h3>选中构件（{selected.length}）</h3>
        {#if selected.length === 0}
          <div class="box small muted">在画布点选或框选构件后，可查看编号、挂点高度，加锁/解锁或隐藏。</div>
        {:else}
          <div class="sel-list scroll">
            {#each selected as el (el.id)}
              <div class="sel-item">
                <div>
                  <b>{el.code}</b>
                  <span class="tag gray" style="margin-left:6px">{TYPES[el.type]?.name || '管线'}</span>
                  {#if el.locked}<span class="tag violet" style="margin-left:4px">锁定</span>{/if}
                </div>
                <div class="small muted">
                  {#if el.kind === 'device'}
                    {el.model} · 挂点 {el.anchorHeight ?? (el.y + el.h)}m · ({el.x}, {el.y})
                  {:else}
                    DN{Math.round(el.diameter * 1000)} · ({el.x1},{el.y1})→({el.x2},{el.y2})
                  {/if}
                </div>
                <div class="row" style="margin-top:4px">
                  <button onclick={() => toggleLock(el)}>{el.locked ? '解锁' : '加锁'}</button>
                  <button onclick={() => toggleVisible(el)}>{el.visible === false ? '显示' : '隐藏'}</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <h3>构件清册</h3>
        <div class="roster scroll">
          <table>
            <thead><tr><th>编号</th><th>类型</th><th>挂点m</th><th>锁</th></tr></thead>
            <tbody>
              {#each allEls as el (el.id)}
                <tr class:selected={isSel2(el.id)} role="button" tabindex="0"
                  onclick={() => selectEl(el.id)}
                  onkeydown={(e) => e.key === 'Enter' && selectEl(el.id)}>
                  <td>{el.code}</td>
                  <td>{TYPES[el.type]?.name || '管线'}</td>
                  <td>{el.kind === 'device' ? (el.anchorHeight ?? (el.y + el.h)).toFixed(1) : '—'}</td>
                  <td>{el.locked ? '🔒' : ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <h3>版本操作</h3>
        <div class="stack">
          <button onclick={goRegenerate}>调整总参数重新生成（锁局部保留）</button>
          <button class="primary" onclick={goReview}>送审核页对比版本 →</button>
          <div class="row">
            <button class="grow" onclick={() => exportSvg(facade, `${project.id}-V${version.n}.svg`, { layers, title: `${project.name} V${version.n}` })}>导出 SVG</button>
            <button class="grow" onclick={() => exportReport(project, version)}>巡检报告</button>
          </div>
        </div>
      </aside>

      <section class="main-col">
        <div class="panel toolbar">
          <b>V{version.n}</b>
          <span class="tag gray">{version.note}</span>
          <span class="tag violet">锁定 {lockedN}</span>
          <span class="grow"></span>
          <span class="small muted">
            开间 {facade.params.bays} · 跨度 {facade.params.span}m · 种子 {facade.params.seed}
          </span>
        </div>
        <FacadeCanvas {facade} {layers} bind:selectedIds {panMode} {fitSignal} oncommit={onCommit} />
      </section>
    </div>
  </div>
{:else}
  <div class="empty panel">
    <p>暂无项目，请先到「① 生成」页生成立面。</p>
    <button class="primary" onclick={() => push('/')}>去生成</button>
  </div>
{/if}

{#if swapType}
  <div class="modal-mask" onclick={() => (swapType = null)}>
    <div class="modal panel" onclick={(e) => e.stopPropagation()}>
      <h2>批量更换 — {TYPES[swapType].name}</h2>
      <label class="field">
        <span>原型号</span>
        <select bind:value={swapFrom}>
          {#each modelsOf(swapType) as m (m.model)}
            <option value={m.model}>{m.label}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>换为</span>
        <select bind:value={swapTo}>
          {#each modelsOf(swapType) as m (m.model)}
            <option value={m.model}>{m.label}</option>
          {/each}
        </select>
      </label>
      <div class="small muted" style="margin-bottom:10px">
        同类型同型号构件整体替换尺寸，位置中心、锁定与显隐状态保留。
      </div>
      <div class="row spread">
        <button onclick={() => (swapType = null)}>取消</button>
        <button class="primary" onclick={() => applySwap()}>应用更换</button>
      </div>
    </div>
  </div>
{/if}

{#if toast}
  <div class="toast" role="status">{toast}</div>
{/if}

<style>
  .box { background: #f8fafc; border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .sel-list { max-height: 210px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
  .sel-item { border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
  .roster { max-height: 260px; border: 1px solid var(--line); border-radius: 8px; }
  .roster tr { cursor: pointer; }
  .modal-mask {
    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
    display: grid; place-items: center; z-index: 50;
  }
  .modal { width: 420px; padding: 20px; }
  .empty { margin: 40px auto; width: 420px; padding: 36px; text-align: center; }
  .toast {
    position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
    background: #0f172a; color: #fff; padding: 10px 22px; border-radius: 999px;
    font-size: 13px; z-index: 60; box-shadow: var(--shadow);
  }
</style>
