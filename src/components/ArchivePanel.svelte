<script>
  import { onMount } from 'svelte';
  import { params, seed, scene } from '../lib/store.js';
  import { loadScene } from '../lib/actions.js';
  import { storage, uid } from '../lib/storage.js';

  let archives = [];
  let name = '';

  onMount(() => {
    archives = storage.listArchives();
  });

  function save() {
    const a = {
      id: uid('arch'),
      name: name.trim() || `存档 ${new Date().toLocaleString()}`,
      time: new Date().toLocaleString(),
      seed: $seed,
      params: { ...$params },
      plants: $scene.plants,
      rocks: $scene.rocks
    };
    storage.saveArchive(a);
    archives = storage.listArchives();
    name = '';
  }

  function load(a) {
    loadScene(a);
  }

  function del(id) {
    storage.deleteArchive(id);
    archives = storage.listArchives();
  }
</script>

<div class="panel">
  <h3>保存当前方案</h3>
  <div class="row">
    <input placeholder="存档名称" bind:value={name} />
    <button on:click={save}>保存</button>
  </div>
  <p class="hint">保存种子、全部参数、每株位置与锁定标记,可随时调出。</p>

  <h3>存档列表({archives.length})</h3>
  {#each archives as a}
    <div class="item">
      <div>
        <b>{a.name}</b>
        <small>{a.time} · 种子 {a.seed} · {a.plants.length} 株</small>
      </div>
      <div class="ops">
        <button on:click={() => load(a)}>调出</button>
        <button class="danger" on:click={() => del(a.id)}>删</button>
      </div>
    </div>
  {:else}
    <p class="hint">暂无存档。</p>
  {/each}
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 8px 0 2px; font-size: 13px; color: #9fc48f; border-bottom: 1px solid #33402e; padding-bottom: 4px; }
  .row { display: flex; gap: 6px; }
  input { flex: 1; background: #1c211a; color: #e6efe0; border: 1px solid #3a4a35; border-radius: 4px; padding: 6px 8px; font-size: 13px; }
  button { background: #33502c; color: #e6efe0; border: 1px solid #4a6b40; border-radius: 4px; padding: 5px 10px; cursor: pointer; font-size: 12px; }
  button.danger { background: #5a2c2c; border-color: #7a4040; }
  .hint { font-size: 11px; color: #7d8f76; margin: 0; }
  .item { display: flex; justify-content: space-between; align-items: center; gap: 6px; background: #232a20; border-radius: 5px; padding: 7px 9px; font-size: 12px; color: #d8e4cf; }
  .item small { display: block; color: #7d8f76; }
  .ops { display: flex; gap: 4px; }
</style>
