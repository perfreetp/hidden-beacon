<script>
  import { push } from 'svelte-spa-router';
  import { dbStore, deleteProject, archiveProject } from '../lib/repo.js';
  import { session } from '../lib/session.js';
  import { TYPES, TYPE_LIST } from '../lib/engine/catalog.js';
  import { exportSvg, exportReport } from '../lib/export.js';

  let fArea = $state('');
  let fType = $state('');
  let fParam = $state('');
  let fFrom = $state('');
  let fTo = $state('');
  let fStatus = $state('');
  let expanded = $state(null);

  const areas = $derived([...new Set($dbStore.projects.map((p) => p.area))]);

  function inDate(iso) {
    const d = new Date(iso).getTime();
    if (fFrom && d < new Date(fFrom).getTime()) return false;
    if (fTo && d > new Date(fTo).getTime() + 86399999) return false;
    return true;
  }

  const filtered = $derived($dbStore.projects.filter((p) => {
    if (fArea && p.area !== fArea) return false;
    if (fStatus && p.status !== fStatus) return false;
    if (!inDate(p.createdAt)) return false;
    const latest = p.versions[p.versions.length - 1].facade;
    if (fType && !latest.devices.some((d) => d.type === fType)) return false;
    if (fParam.trim()) {
      const q = fParam.trim().toLowerCase();
      const pa = latest.params;
      const hay = `${pa.seed} ${pa.span} ${pa.floorHeight} ${pa.bays} ${pa.gap} ${pa.pipeDiameter}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }));

  function openInEdit(p, v) {
    session.set({ projectId: p.id, versionId: v.id });
    push('/edit?v=' + encodeURIComponent(v.id));
  }

  function openInReview(p) {
    session.set({ projectId: p.id, versionId: null });
    push('/review');
  }

  function clearFilters() {
    fArea = ''; fType = ''; fParam = ''; fFrom = ''; fTo = ''; fStatus = '';
  }

  function typeCounts(facade) {
    const m = {};
    for (const d of facade.devices) m[d.type] = (m[d.type] || 0) + 1;
    return m;
  }
</script>

<div class="page">
  <div class="page-body">
    <aside class="sidebar panel">
      <h2>档案检索</h2>
      <label class="field">
        <span>厂区</span>
        <select bind:value={fArea}>
          <option value="">全部厂区</option>
          {#each areas as a (a)}<option value={a}>{a}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>设备类型</span>
        <select bind:value={fType}>
          <option value="">全部类型</option>
          {#each TYPE_LIST as t (t.key)}<option value={t.key}>{t.name}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>生成参数（种子 / 跨度 / 开间 / 管径…）</span>
        <input bind:value={fParam} placeholder="例：FLUE 或 6.5 或 5" />
      </label>
      <div class="grid2">
        <label class="field">
          <span>起始日期</span>
          <input type="date" bind:value={fFrom} />
        </label>
        <label class="field">
          <span>截止日期</span>
          <input type="date" bind:value={fTo} />
        </label>
      </div>
      <label class="field">
        <span>状态</span>
        <select bind:value={fStatus}>
          <option value="">全部</option>
          <option value="editing">编辑中</option>
          <option value="review">待审核</option>
          <option value="archived">已归档</option>
        </select>
      </label>
      <button class="full" onclick={clearFilters}>清空条件</button>

      <h3>检索结果</h3>
      <div class="box small muted">命中 <b style="color:var(--ink)">{filtered.length}</b> 个项目 ·
        共 {filtered.reduce((s, p) => s + p.versions.length, 0)} 个版本</div>
    </aside>

    <section class="main-col scroll">
      {#each filtered as p (p.id)}
        {@const latest = p.versions[p.versions.length - 1].facade}
        {@const counts = typeCounts(latest)}
        <div class="card panel">
          <div class="card-head" role="button" tabindex="0"
            onclick={() => (expanded = expanded === p.id ? null : p.id)}
            onkeydown={(e) => e.key === 'Enter' && (expanded = expanded === p.id ? null : p.id)}>
            <div>
              <b style="font-size:15px">{p.name}</b>
              <span class="tag {p.status === 'archived' ? 'green' : p.status === 'review' ? 'amber' : 'blue'}" style="margin-left:8px">
                {p.status === 'archived' ? '已归档' : p.status === 'review' ? '待审核' : '编辑中'}
              </span>
              {#if p.review?.decision === 'approved'}
                <span class="tag green" style="margin-left:4px">审核通过</span>
              {/if}
            </div>
            <div class="row small muted">
              <span>{p.area}</span>
              <span>·</span>
              <span>{p.versions.length} 版</span>
              <span>·</span>
              <span>{new Date(p.updatedAt).toLocaleDateString('zh-CN')}</span>
              <span class="caret">{expanded === p.id ? '▲' : '▼'}</span>
            </div>
          </div>

          <div class="chip-row">
            {#each TYPE_LIST as t (t.key)}
              {#if counts[t.key]}
                <span class="tag gray">{t.name} ×{counts[t.key]}</span>
              {/if}
            {/each}
            <span class="tag gray">管线 ×{latest.pipes.length}</span>
          </div>
          <div class="param-line small muted">
            种子 {latest.params.seed} · 跨度 {latest.params.span}m · 层高 {latest.params.floorHeight}m ·
            开间 {latest.params.bays} · 间距 {latest.params.gap}m · DN{Math.round(latest.params.pipeDiameter * 1000)}
          </div>

          {#if expanded === p.id}
            <div class="versions">
              {#each p.versions as v, vi (v.id)}
                <div class="version-row">
                  <div>
                    <b>V{v.n}</b>
                    <span class="small muted" style="margin-left:8px">{v.note}</span>
                    <div class="small muted">{new Date(v.createdAt).toLocaleString('zh-CN')} ·
                      锁定 {v.facade.meta.lockedCount} 处 · 设备 {v.facade.meta.deviceCount} / 管线 {v.facade.meta.pipeCount}</div>
                  </div>
                  <div class="row">
                    <button onclick={() => openInEdit(p, v)}>打开</button>
                    <button onclick={() => exportSvg(v.facade, `${p.id}-V${v.n}.svg`, { title: `${p.name} V${v.n}` })}>SVG</button>
                    <button onclick={() => exportReport(p, v)}>巡检报告</button>
                  </div>
                </div>
              {/each}
            </div>
            <div class="row spread card-actions">
              <div class="row">
                {#if p.status !== 'archived'}
                  <button onclick={() => openInReview(p)}>送审核</button>
                  <button onclick={() => archiveProject(p.id)}>手动归档</button>
                {/if}
              </div>
              <button class="danger" onclick={() => { if (confirm(`确认删除项目「${p.name}」及其全部版本？`)) deleteProject(p.id); }}>
                删除项目
              </button>
            </div>
          {/if}
        </div>
      {/each}
      {#if filtered.length === 0}
        <div class="empty panel">没有符合条件的档案，调整检索条件或去生成新项目。</div>
      {/if}
    </section>
  </div>
</div>

<style>
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .box { background: #f8fafc; border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .full { width: 100%; }
  .card { padding: 14px 16px; margin-bottom: 12px; }
  .card-head { display: flex; justify-content: space-between; align-items: center; cursor: pointer; gap: 10px; flex-wrap: wrap; }
  .caret { font-size: 11px; }
  .chip-row { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 6px; }
  .param-line { margin-bottom: 4px; }
  .versions { border-top: 1px solid var(--line); margin-top: 10px; padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
  .version-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px; background: #f8fafc; border-radius: 8px; flex-wrap: wrap; }
  .card-actions { margin-top: 10px; }
  .empty { padding: 40px; text-align: center; color: var(--ink-2); }
</style>
