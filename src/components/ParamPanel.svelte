<script>
  import { params, seed, scene } from '../lib/store.js';
  import { doGenerate, doGenerateFresh } from '../lib/actions.js';
  import { ASPECTS, WATERS } from '../lib/generate.js';

  $: lockedCount = $scene.plants.filter((p) => p.locked).length;

  function randomSeed() {
    $seed = 'seed-' + Math.random().toString(36).slice(2, 8);
  }
</script>

<div class="panel">
  <h3>地块参数</h3>
  <label>地块长 (m)<input type="number" min="10" max="500" bind:value={$params.length} /></label>
  <label>地块宽 (m)<input type="number" min="10" max="500" bind:value={$params.width} /></label>
  <label>坡向
    <select bind:value={$params.aspect}>
      {#each ASPECTS as a}<option value={a}>{a}坡</option>{/each}
    </select>
  </label>
  <label>水系位置
    <select bind:value={$params.water}>
      {#each WATERS as w}<option value={w}>{w}</option>{/each}
    </select>
  </label>
  {#if $params.water !== '无'}
    <label>水系带宽 (m)<input type="number" min="1" max="20" step="0.5" bind:value={$params.waterWidth} /></label>
  {/if}

  <h3>群落与花期</h3>
  <label>群落密度 <b>{Math.round($params.density * 100)}%</b>
    <input type="range" min="0.1" max="1" step="0.05" bind:value={$params.density} />
  </label>
  <label>春季花期权重 <b>{Math.round($params.bloomSpring * 100)}%</b>
    <input type="range" min="0" max="1" step="0.05" bind:value={$params.bloomSpring} />
  </label>
  <label>夏季花期权重 <b>{Math.round($params.bloomSummer * 100)}%</b>
    <input type="range" min="0" max="1" step="0.05" bind:value={$params.bloomSummer} />
  </label>
  <label>秋季花期权重 <b>{Math.round($params.bloomAutumn * 100)}%</b>
    <input type="range" min="0" max="1" step="0.05" bind:value={$params.bloomAutumn} />
  </label>
  <label>裸石比例 <b>{Math.round($params.rockRatio * 100)}%</b>
    <input type="range" min="0" max="0.2" step="0.01" bind:value={$params.rockRatio} />
  </label>

  <h3>种子</h3>
  <div class="seedrow">
    <input type="text" bind:value={$seed} />
    <button on:click={randomSeed} title="随机种子">🎲</button>
  </div>
  <p class="hint">同一组参数 + 同一种子,生成结果完全一致。</p>

  <button class="primary" on:click={doGenerate}>
    生成群落{#if lockedCount}(保留 {lockedCount} 株锁定){/if}
  </button>
  {#if lockedCount}
    <button class="ghost" on:click={doGenerateFresh}>全部重排(忽略锁定)</button>
  {/if}
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 8px 0 2px; font-size: 13px; color: #9fc48f; border-bottom: 1px solid #33402e; padding-bottom: 4px; }
  label { display: flex; flex-direction: column; font-size: 12px; color: #c9d6c0; gap: 3px; }
  input, select { background: #1c211a; color: #e6efe0; border: 1px solid #3a4a35; border-radius: 4px; padding: 5px 7px; font-size: 13px; }
  input[type='range'] { padding: 0; }
  .seedrow { display: flex; gap: 6px; }
  .seedrow input { flex: 1; }
  .hint { font-size: 11px; color: #7d8f76; margin: 0; }
  .primary { background: #3f7a35; color: #fff; border: none; border-radius: 5px; padding: 9px; font-size: 14px; cursor: pointer; margin-top: 6px; }
  .primary:hover { background: #4a8c3e; }
  .ghost { background: none; color: #c9a13b; border: 1px solid #6b5a2a; border-radius: 5px; padding: 6px; font-size: 12px; cursor: pointer; }
</style>
