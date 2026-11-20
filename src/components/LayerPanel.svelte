<script>
  import { layers, api } from '../lib/stores.js';

  const ICONS = { brush: '🖌️', star: '⭐', fish: '🐟', house: '🏠' };

  function toggle(id, visible) {
    api.engine.setLayerVisible(id, !visible);
  }
  function remove(id) {
    api.engine.removeLayer(id);
  }
</script>

<section class="layers">
  <h2>图层（{$layers.length}）</h2>
  {#if $layers.length === 0}
    <p class="empty">还没有图层，快画一笔吧！<br />每一笔都会变成一个新图层。</p>
  {:else}
    <ul>
      {#each [...$layers].reverse() as l (l.id)}
        <li class:hidden={!l.visible}>
          <span class="dot" style="background: {l.color}"></span>
          <span class="ic">{ICONS[l.kind] || '🎨'}</span>
          <span class="name">{l.name}</span>
          <button class="mini" on:click={() => toggle(l.id, l.visible)} title="显示/隐藏">
            {l.visible ? '👁' : '🚫'}
          </button>
          <button class="mini" on:click={() => remove(l.id)} title="删除">🗑</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .layers { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  h2 { margin: 0.35rem 0; font-size: 0.85rem; color: #8f95c8; font-weight: 600; letter-spacing: 0.1em; }
  .empty { font-size: 0.8rem; color: #6f74a5; line-height: 1.5; }
  ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.3rem; }
  li {
    display: flex; align-items: center; gap: 0.35rem;
    background: #181b3d; border: 1px solid #2c3060; border-radius: 10px;
    padding: 0.3rem 0.45rem; font-size: 0.82rem;
  }
  li.hidden .name, li.hidden .ic { opacity: 0.35; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini {
    border: none; background: none; cursor: pointer; font-size: 0.85rem;
    padding: 0.1rem; border-radius: 6px;
  }
  .mini:hover { background: #2c3060; }
</style>
