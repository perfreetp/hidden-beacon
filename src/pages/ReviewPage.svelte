<script>
  import { push } from 'svelte-spa-router';
  import FacadeCanvas from '../components/FacadeCanvas.svelte';
  import { dbStore, getProject, submitReview } from '../lib/repo.js';
  import { session } from '../lib/session.js';
  import { diffFacade } from '../lib/engine/diff.js';
  import { TYPES } from '../lib/engine/catalog.js';
  import { exportSvg, exportReport } from '../lib/export.js';

  let oldIdx = $state(0);
  let newIdx = $state(1);
  let comment = $state('');
  let layers = $state({ grid: true, devices: true, pipes: true, labels: true });

  // 直接访问 /review 时回退到待审项目或第一个项目
  const projectId = $derived(
    $session.projectId
    || $dbStore.projects.find((p) => p.status === 'review')?.id
    || $dbStore.projects[0]?.id
    || null
  );

  const project = $derived($dbStore.projects.find((p) => p.id === projectId));
  const versions = $derived(project?.versions || []);

  $effect(() => {
    if (versions.length >= 2) {
      oldIdx = versions.length - 2;
      newIdx = versions.length - 1;
    }
  });

  const oldVer = $derived(versions[oldIdx]);
  const newVer = $derived(versions[newIdx]);
  const diff = $derived(oldVer && newVer ? diffFacade(oldVer.facade, newVer.facade) : null);
  const changed = $derived(diff?.items.filter((it) => it.status !== 'same') || []);

  function decide(decision) {
    submitReview(project.id, decision, comment.trim());
  }

  function typeName(el) {
    return TYPES[el.type]?.name || '管线';
  }
</script>

{#if project && versions.length >= 2 && diff}
  <div class="page">
    <div class="review-head panel">
      <div>
        <h2 style="margin:0">{project.name}
          <span class="tag amber" style="margin-left:8px">审核中</span>
        </h2>
        <div class="small muted">{project.area} · 共 {versions.length} 个版本</div>
      </div>
      <div class="row">
        <label class="field" style="margin:0;min-width:150px">
          <span>基准版本</span>
          <select bind:value={oldIdx}>
            {#each versions as v, i (v.id)}<option value={i}>V{v.n} {v.note}</option>{/each}
          </select>
        </label>
        <label class="field" style="margin:0;min-width:150px">
          <span>对比版本</span>
          <select bind:value={newIdx}>
            {#each versions as v, i (v.id)}<option value={i}>V{v.n} {v.note}</option>{/each}
          </select>
        </label>
        <button onclick={() => exportSvg(newVer.facade, `${project.id}-审核对比.svg`, { layers, diff, title: `${project.name} 审核对比 V${oldVer.n}→V${newVer.n}` })}>
          导出对比 SVG
        </button>
        <button onclick={() => exportReport(project, newVer, diff)}>巡检报告</button>
      </div>
    </div>

    <div class="page-body" style="padding-top:0">
      <aside class="sidebar panel">
        <h2>变更摘要</h2>
        <div class="counts">
          <div class="count"><b class="green">{diff.counts.added}</b><span>新增</span></div>
          <div class="count"><b class="red">{diff.counts.removed}</b><span>删除</span></div>
          <div class="count"><b class="amber">{diff.counts.moved}</b><span>移动/改型</span></div>
          <div class="count"><b>{diff.counts.same}</b><span>未变</span></div>
        </div>

        <h3>变更明细（{changed.length}）</h3>
        <div class="changes scroll">
          {#each changed as it (it.id)}
            <div class="change-item">
              <div class="row spread">
                <b>{(it.after || it.before).code}</b>
                <span class="tag {it.status === 'added' ? 'green' : it.status === 'removed' ? 'red' : 'amber'}">
                  {it.status === 'added' ? '新增' : it.status === 'removed' ? '删除' : '移动'}
                </span>
              </div>
              <div class="small muted">
                {typeName(it.after || it.before)} ·
                {#if it.kind === 'device'}
                  {(it.before ? `(${it.before.x.toFixed(1)}, ${it.before.y.toFixed(1)})` : '—')}
                  →
                  {(it.after ? `(${it.after.x.toFixed(1)}, ${it.after.y.toFixed(1)})` : '已移除')}
                {:else}
                  {it.before ? `(${it.before.x1.toFixed(1)},${it.before.y1.toFixed(1)})` : '—'}
                  →
                  {it.after ? `(${it.after.x1.toFixed(1)},${it.after.y1.toFixed(1)})` : '已移除'}
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <h3>图层</h3>
        <div class="row wrap">
          {#each Object.entries(layers) as [key, on] (key)}
            <button class="toggle" class:off={!on} onclick={() => (layers[key] = !layers[key])}>
              {({ grid: '网格', devices: '设备', pipes: '管线', labels: '标注' })[key]}
            </button>
          {/each}
        </div>

        <h3>审核意见</h3>
        {#if project.review}
          <div class="box">
            <b class={project.review.decision === 'approved' ? 'green' : 'red'}>
              {project.review.decision === 'approved' ? '✓ 已通过并归档' : '✗ 已退回修改'}
            </b>
            <div class="small muted">{project.review.reviewer} · {new Date(project.review.decidedAt).toLocaleString('zh-CN')}</div>
            <div style="margin-top:6px">{project.review.comment || '（无意见）'}</div>
          </div>
        {/if}
        <textarea bind:value={comment} rows="4" placeholder="填写审核意见，例如：脱硫塔挂点高度需复核、新增开间探头编号待补……"
          disabled={!!project.review}></textarea>
        <div class="row" style="margin-top:10px">
          <button class="danger grow" onclick={() => decide('rejected')} disabled={!!project.review}>退回修改</button>
          <button class="primary grow" onclick={() => decide('approved')} disabled={!!project.review}>通过并归档</button>
        </div>
        <button class="full" style="margin-top:8px" onclick={() => push('/archive')}>前往档案库 →</button>
      </aside>

      <section class="main-col">
        <div class="panel toolbar">
          <span class="tag gray">V{oldVer.n} → V{newVer.n}</span>
          <span class="tag green">绿描边＝新增</span>
          <span class="tag red">红虚线＝删除（旧位置幽灵）</span>
          <span class="tag amber">琥珀描边＝移动/改型</span>
          <span class="tag violet">紫虚线＝人工锁定局部</span>
        </div>
        <FacadeCanvas facade={newVer.facade} {layers} {diff} readonly selectedIds={[]} />
      </section>
    </div>
  </div>
{:else if project}
  <div class="empty panel">
    <p>该项目只有一个版本，暂无版本可对比。调整参数重新生成后再送审。</p>
    <button class="primary" onclick={() => push('/')}>去生成新版本</button>
  </div>
{:else}
  <div class="empty panel">
    <p>暂无可审核的项目。</p>
    <button class="primary" onclick={() => push('/')}>去生成</button>
  </div>
{/if}

<style>
  .review-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; margin: 12px 16px 0; }
  .counts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .count { background: #f8fafc; border: 1px solid var(--line); border-radius: 8px; padding: 10px 4px; text-align: center; }
  .count b { display: block; font-size: 20px; }
  .count span { font-size: 11px; color: var(--ink-2); }
  .green { color: var(--ok); } .red { color: var(--danger); } .amber { color: var(--warn); }
  .changes { max-height: 340px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
  .change-item { border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
  .box { background: #f8fafc; border: 1px solid var(--line); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
  .empty { margin: 40px auto; width: 440px; padding: 36px; text-align: center; }
  .full { width: 100%; }
</style>
