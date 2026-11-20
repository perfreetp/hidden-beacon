<script>
  import { scene, pickedPlant, boxSelected, plantSpeciesId } from '../lib/store.js';
  import { SPECIES, SPECIES_BY_ID, bloomText, LAYER_NAMES } from '../lib/species.js';
  import { toggleLock, removePlant, replaceSpecies } from '../lib/actions.js';

  $: plant = $scene.plants.find((p) => p.id === $pickedPlant);
  $: sp = plant ? SPECIES_BY_ID[plant.sp] : null;
  $: sameCount = plant ? $scene.plants.filter((p) => p.sp === plant.sp).length : 0;
  $: boxCount = $boxSelected.length;

  let replaceId = 'zuiyucao';
</script>

<div class="panel">
  <h3>植株信息</h3>
  {#if plant && sp}
    <table>
      <tr><td>品种</td><td><b>{sp.name}</b>({LAYER_NAMES[sp.layer]})</td></tr>
      <tr><td>株高</td><td>{plant.h} m</td></tr>
      <tr><td>冠幅半径</td><td>{plant.r} m</td></tr>
      <tr><td>花期</td><td>{bloomText(sp)}</td></tr>
      <tr><td>同种数量</td><td>{sameCount} 株</td></tr>
      <tr><td>坐标</td><td>({plant.x}, {plant.y})</td></tr>
      <tr><td>标记</td><td>{plant.locked ? '🔒 已锁定(重排时保持原位)' : '未锁定'}</td></tr>
    </table>
    <div class="row">
      <button on:click={() => toggleLock(plant.id)}>{plant.locked ? '解除锁定' : '锁定'}</button>
      <button class="danger" on:click={() => removePlant(plant.id)}>移除</button>
    </div>
  {:else}
    <p class="hint">在「查看」模式下点击植株查看详情。</p>
  {/if}

  <h3>框选批量替换</h3>
  {#if boxCount}
    <p>已框选 <b>{boxCount}</b> 株,替换为:</p>
    <div class="row">
      <select bind:value={replaceId}>
        {#each SPECIES as s}<option value={s.id}>{s.name}({LAYER_NAMES[s.layer]})</option>{/each}
      </select>
      <button on:click={() => replaceSpecies($boxSelected, replaceId)}>替换</button>
    </div>
    <p class="hint">替换后的植株会打上锁定标记。</p>
  {:else}
    <p class="hint">在「框选」模式下拖出方框选择一批植株。</p>
  {/if}

  <h3>补种品种</h3>
  <select bind:value={$plantSpeciesId}>
    {#each SPECIES as s}<option value={s.id}>{s.name}({LAYER_NAMES[s.layer]})</option>{/each}
  </select>
  <p class="hint">「补种」模式下点击地块空白处种下所选品种,自动锁定。</p>
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 8px 0 2px; font-size: 13px; color: #9fc48f; border-bottom: 1px solid #33402e; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; color: #d8e4cf; }
  td { padding: 4px 6px; border-bottom: 1px solid #2a3325; }
  td:first-child { color: #8ba07e; width: 70px; }
  .row { display: flex; gap: 6px; }
  .row select { flex: 1; }
  button { background: #33502c; color: #e6efe0; border: 1px solid #4a6b40; border-radius: 4px; padding: 5px 10px; cursor: pointer; font-size: 12px; }
  button.danger { background: #5a2c2c; border-color: #7a4040; }
  select { background: #1c211a; color: #e6efe0; border: 1px solid #3a4a35; border-radius: 4px; padding: 5px 7px; font-size: 12px; }
  .hint { font-size: 11px; color: #7d8f76; margin: 0; }
</style>
