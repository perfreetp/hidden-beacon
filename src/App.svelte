<script>
  import { onMount } from 'svelte';
  import { mode, season, panelTab, stats, boxSelected } from './lib/store.js';
  import { doGenerate } from './lib/actions.js';
  import { SEASONS, SEASON_NAMES } from './lib/species.js';
  import Viewport from './components/Viewport.svelte';
  import ParamPanel from './components/ParamPanel.svelte';
  import InfoPanel from './components/InfoPanel.svelte';
  import StatsPanel from './components/StatsPanel.svelte';
  import ArchivePanel from './components/ArchivePanel.svelte';
  import TeacherPanel from './components/TeacherPanel.svelte';

  const MODES = [
    ['view', '查看'],
    ['move', '移动'],
    ['plant', '补种'],
    ['select', '框选']
  ];
  const TABS = [
    ['params', '参数'],
    ['info', '植株'],
    ['stats', '统计'],
    ['archive', '存档'],
    ['class', '教学']
  ];

  onMount(() => {
    doGenerate(); // 启动即按默认参数+种子生成
  });
</script>

<div class="app">
  <header>
    <h1>蜜源植物群落过程式生成 · 蝴蝶园生境设计</h1>
    <div class="modes">
      {#each MODES as [m, label]}
        <button class:on={$mode === m} on:click={() => mode.set(m)}>{label}</button>
      {/each}
    </div>
    <div class="seasons">
      {#each SEASONS as s}
        <button class:on={$season === s} on:click={() => season.set(s)}>
          {SEASON_NAMES[s]} {($stats.coverage[s] * 100).toFixed(0)}%
        </button>
      {/each}
    </div>
  </header>

  <div class="body">
    <aside>
      <nav>
        {#each TABS as [t, label]}
          <button class:on={$panelTab === t} on:click={() => panelTab.set(t)}>{label}</button>
        {/each}
      </nav>
      <div class="side">
        {#if $panelTab === 'params'}<ParamPanel />
        {:else if $panelTab === 'info'}<InfoPanel />
        {:else if $panelTab === 'stats'}<StatsPanel />
        {:else if $panelTab === 'archive'}<ArchivePanel />
        {:else}<TeacherPanel />{/if}
      </div>
    </aside>
    <Viewport />
  </div>

  {#if $mode === 'select' && $boxSelected.length}
    <div class="toast">已框选 {$boxSelected.length} 株,到「植株」页批量替换品种</div>
  {/if}
</div>

<style>
  :global(body) { margin: 0; font-family: 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif; background: #171b15; }
  .app { display: flex; flex-direction: column; height: 100vh; color: #e6efe0; }
  header { display: flex; align-items: center; gap: 16px; padding: 8px 14px; background: #1f261c; border-bottom: 1px solid #33402e; flex-wrap: wrap; }
  h1 { font-size: 15px; margin: 0; color: #b8d9a8; font-weight: 600; }
  .modes, .seasons { display: flex; gap: 4px; }
  header button { background: #26301f; color: #c9d6c0; border: 1px solid #3a4a35; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 12px; }
  header button.on { background: #3f7a35; color: #fff; border-color: #55a047; }
  .seasons { margin-left: auto; }
  .body { flex: 1; display: flex; min-height: 0; }
  aside { width: 300px; min-width: 300px; display: flex; flex-direction: column; background: #1f261c; border-right: 1px solid #33402e; }
  nav { display: flex; }
  nav button { flex: 1; background: #1a2018; color: #9db392; border: none; border-bottom: 2px solid transparent; padding: 8px 0; cursor: pointer; font-size: 13px; }
  nav button.on { color: #fff; border-bottom-color: #55a047; background: #232b1f; }
  .side { flex: 1; overflow-y: auto; padding: 10px 12px; }
  .toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); background: rgba(30, 50, 30, 0.92); border: 1px solid #55a047; color: #dff0d8; padding: 8px 16px; border-radius: 6px; font-size: 13px; }
</style>
