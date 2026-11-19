<script>
  import { push } from 'svelte-spa-router';
  import FacadeCanvas from '../components/FacadeCanvas.svelte';
  import { generate, DEFAULT_PARAMS } from '../lib/engine/generate.js';
  import { createProject, addVersion, getProject } from '../lib/repo.js';
  import { session } from '../lib/session.js';
  import { exportSvg } from '../lib/export.js';

  let params = $state({ ...DEFAULT_PARAMS });
  let projectName = $state('');
  let targetProject = $state(null);
  let facade = $state(null);
  let selectedIds = $state([]);
  let layers = $state({ grid: true, devices: true, pipes: true, labels: true });
  let note = $state('');
  let regenerated = $state(false);

  // 从编辑页带项目返回：载入项目最新版参数
  $effect(() => {
    const s = $session;
    if (s.projectId) {
      const prj = getProject(s.projectId);
      if (prj) {
        targetProject = prj;
        const ver = prj.versions[prj.versions.length - 1];
        params = { ...ver.facade.params };
        projectName = prj.name;
      }
    }
  });

  function regen() {
    const prev = targetProject
      ? targetProject.versions[targetProject.versions.length - 1].facade
      : null;
    facade = generate(params, prev);
    regenerated = true;
  }
  regen();

  function updateParam(key, value) {
    params[key] = value;
    regenerated = false;
  }

  function newSeed() {
    params.seed = 'FLUE-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    regenerated = false;
  }

  function saveAsProject() {
    const name = projectName.trim() || `${params.area}烟气监测立面`;
    const id = createProject({ name, area: params.area }, facade);
    session.set({ projectId: id, versionId: null });
    push('/edit?new=1');
  }

  function saveAsNewVersion() {
    if (!targetProject) return saveAsProject();
    const vid = addVersion(targetProject.id, facade, note.trim() || '参数调整重生成');
    session.set({ projectId: targetProject.id, versionId: vid });
    push('/edit?v=' + encodeURIComponent(vid));
  }

  function resetTarget() {
    targetProject = null;
    projectName = '';
    params = { ...DEFAULT_PARAMS };
    note = '';
    session.set({ projectId: null, versionId: null });
    regen();
  }

  const lockN = $derived(facade ? facade.meta.lockedCount : 0);
</script>

<div class="page">
  <div class="page-body">
    <aside class="sidebar panel">
      <h2>厂区走廊参数</h2>

      {#if targetProject}
        <div class="target box">
          <div class="small muted">当前编辑项目</div>
          <b>{targetProject.name}</b>
          <div class="small">最新 V{targetProject.versions.length} · 已锁定局部 {lockN} 处</div>
          <button class="ghost small-btn" onclick={resetTarget}>← 另开新项目</button>
        </div>
      {/if}

      <label class="field">
        <span>厂区名称</span>
        <input bind:value={params.area} oninput={(e) => updateParam('area', e.target.value)} />
      </label>
      <div class="grid2">
        <label class="field">
          <span>跨度（m）</span>
          <input type="number" min="3" max="15" step="0.5" bind:value={params.span}
            oninput={(e) => updateParam('span', +e.target.value)} />
        </label>
        <label class="field">
          <span>层高（m）</span>
          <input type="number" min="2.5" max="9" step="0.1" bind:value={params.floorHeight}
            oninput={(e) => updateParam('floorHeight', +e.target.value)} />
        </label>
      </div>
      <div class="grid2">
        <label class="field">
          <span>开间数</span>
          <input type="number" min="2" max="12" step="1" bind:value={params.bays}
            oninput={(e) => updateParam('bays', +e.target.value)} />
        </label>
        <label class="field">
          <span>设备间距（m）</span>
          <input type="number" min="0.4" max="4" step="0.1" bind:value={params.gap}
            oninput={(e) => updateParam('gap', +e.target.value)} />
        </label>
      </div>
      <div class="grid2">
        <label class="field">
          <span>管径（m）</span>
          <input type="number" min="0.2" max="2" step="0.1" bind:value={params.pipeDiameter}
            oninput={(e) => updateParam('pipeDiameter', +e.target.value)} />
        </label>
        <label class="field">
          <span>随机种子</span>
          <div class="row">
            <input bind:value={params.seed} oninput={(e) => updateParam('seed', e.target.value)} />
            <button class="ghost" title="换种子" onclick={newSeed}>⟳</button>
          </div>
        </label>
      </div>

      <button class="primary full" onclick={regen}>生成 / 重新分格排布</button>
      {#if regenerated}
        <div class="okline">✓ 已按新参数重生成{#if lockN > 0}，{lockN} 处锁定局部保持原样{/if}</div>
      {/if}

      <h3>图层</h3>
      <div class="row wrap">
        {#each Object.entries(layers) as [key, on] (key)}
          <button class="toggle" class:off={!on} onclick={() => (layers[key] = !layers[key])}>
            {({ grid: '网格', devices: '设备', pipes: '管线', labels: '标注' })[key]}
          </button>
        {/each}
      </div>

      <h3>确定性校验</h3>
      <div class="box small muted">
        同一组参数与种子每次生成结果完全一致；种子不同则抖动布局不同。
        当前：设备 {facade?.meta.deviceCount} 件，管线 {facade?.meta.pipeCount} 段。
      </div>

      <h3>入库</h3>
      {#if !targetProject}
        <label class="field">
          <span>项目名称（可留空自动命名）</span>
          <input bind:value={projectName} placeholder="例：一号厂区烟气监测立面" />
        </label>
        <button class="primary full" onclick={saveAsProject}>生成并进入编辑页 →</button>
      {:else}
        <label class="field">
          <span>新版本说明</span>
          <input bind:value={note} placeholder="例：开间扩到 6 间，管径加大" />
        </label>
        <button class="primary full" onclick={saveAsNewVersion}>保存为 V{targetProject.versions.length + 1} 并进入编辑 →</button>
      {/if}
      <button class="full" style="margin-top:8px" onclick={() => exportSvg(facade, 'facade-preview.svg', { layers, title: '立面预览' })}>
        导出当前 SVG
      </button>
    </aside>

    <section class="main-col">
      <div class="panel toolbar">
        <b>{targetProject ? targetProject.name : '未入库预览'}</b>
        <span class="tag blue">种子 {params.seed}</span>
        <span class="tag gray">{params.bays} 开间 × {params.span}m</span>
        <span class="tag gray">层高 {params.floorHeight}m</span>
        <span class="tag gray">DN{Math.round(params.pipeDiameter * 1000)}</span>
        <span class="grow"></span>
        <span class="small muted">生成页为只读预览，微调请进入编辑页</span>
      </div>
      <FacadeCanvas {facade} {layers} bind:selectedIds readonly />
    </section>
  </div>
</div>

<style>
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .full { width: 100%; }
  .box { background: #f8fafc; border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .target { margin-bottom: 14px; display: flex; flex-direction: column; gap: 4px; }
  .small-btn { padding: 2px 6px; font-size: 12px; align-self: flex-start; margin-top: 4px; }
  .okline { margin-top: 8px; font-size: 12px; color: var(--ok); font-weight: 600; }
</style>
