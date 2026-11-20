<script>
  import { stats, seed } from '../lib/store.js';
  import { SEASONS, SEASON_NAMES, LAYER_NAMES, bloomText } from '../lib/species.js';
  import { exportConfigTable, exportAreaStats } from '../lib/stats.js';
  import { params } from '../lib/store.js';

  $: s = $stats;
</script>

<div class="panel">
  <h3>面积统计</h3>
  <table>
    <tr><td>地块面积</td><td>{s.plotArea.toFixed(1)} m²</td></tr>
    <tr><td>植被投影面积</td><td>{s.vegArea.toFixed(1)} m²</td></tr>
    <tr><td>乔木层</td><td>{s.layerArea.tree.toFixed(1)} m² / {s.layerCount.tree} 株</td></tr>
    <tr><td>灌木层</td><td>{s.layerArea.shrub.toFixed(1)} m² / {s.layerCount.shrub} 株</td></tr>
    <tr><td>花草层</td><td>{s.layerArea.herb.toFixed(1)} m² / {s.layerCount.herb} 株</td></tr>
    <tr><td>裸石面积</td><td>{s.rockArea.toFixed(1)} m²</td></tr>
    <tr><td>水面面积</td><td>{s.waterArea.toFixed(1)} m²</td></tr>
    <tr><td>总株数</td><td>{s.totalPlants} 株(锁定 {s.lockedCount})</td></tr>
  </table>

  <h3>开花覆盖率</h3>
  {#each SEASONS as sn}
    <div class="cov">
      <span>{SEASON_NAMES[sn]}</span>
      <div class="bar"><div class="fill" style="width:{(s.coverage[sn] * 100).toFixed(1)}%"></div></div>
      <b>{(s.coverage[sn] * 100).toFixed(1)}%</b>
    </div>
  {/each}

  <h3>植物配置表</h3>
  <div class="scroll">
    <table>
      <thead>
        <tr><th>品种</th><th>层次</th><th>数量</th><th>面积m²</th><th>花期</th></tr>
      </thead>
      <tbody>
        {#each s.perSpecies as r}
          <tr>
            <td>{r.sp.name}</td>
            <td>{LAYER_NAMES[r.sp.layer]}</td>
            <td>{r.count}</td>
            <td>{r.area.toFixed(1)}</td>
            <td>{bloomText(r.sp)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="row">
    <button on:click={() => exportConfigTable(s, $params, $seed)}>导出配置表 CSV</button>
    <button on:click={() => exportAreaStats(s, $params, $seed)}>导出面积统计 CSV</button>
  </div>
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 8px 0 2px; font-size: 13px; color: #9fc48f; border-bottom: 1px solid #33402e; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; color: #d8e4cf; }
  td, th { padding: 3px 6px; border-bottom: 1px solid #2a3325; text-align: left; }
  th { color: #8ba07e; font-weight: normal; }
  td:first-child { color: #8ba07e; }
  .cov { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #c9d6c0; }
  .cov span { width: 34px; }
  .cov b { width: 52px; text-align: right; }
  .bar { flex: 1; height: 10px; background: #232a20; border-radius: 5px; overflow: hidden; }
  .fill { height: 100%; background: linear-gradient(90deg, #7ab648, #c9d64f); }
  .scroll { max-height: 220px; overflow-y: auto; border: 1px solid #2a3325; border-radius: 4px; }
  .row { display: flex; gap: 6px; }
  button { flex: 1; background: #33502c; color: #e6efe0; border: 1px solid #4a6b40; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 12px; }
</style>
