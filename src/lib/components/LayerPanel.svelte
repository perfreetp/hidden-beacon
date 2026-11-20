<script lang="ts">
  import { project } from '../../lib/state';
  import type { Layer } from '../../lib/types';

  interface Props {
    activeLayerId: string;
    onPick: (id: string) => void;
  }
  const props: Props = $props();
  const s = $derived($project);

  let editingId = $state<string | null>(null);
  let editingName = $state('');
  let renameInput = $state<HTMLInputElement>();

  $effect(() => {
    if (editingId) renameInput?.focus();
  });

  function startRename(layer: Layer) {
    editingId = layer.id;
    editingName = layer.name;
  }
  function commitRename() {
    if (editingId) {
      project.renameLayer(editingId, editingName.trim() || '未命名图层');
    }
    editingId = null;
  }

  function addLayer() {
    const id = project.addLayer(`图层 ${s.layers.length + 1}`);
    props.onPick(id);
  }
</script>

<div class="layers panel">
  <div class="layers-head">
    <p class="panel-title" style="margin:0">
      独立图层（{s.layers.length}）
    </p>
    <button class="icon-btn" onclick={addLayer} title="新建空白图层">＋</button>
  </div>

  {#if s.layers.length === 0}
    <p class="empty">还没有图层，在画布上点一下就会自动创建 ✨</p>
  {:else}
    <div class="layer-list">
      {#each s.layers as layer, index (layer.id)}
        <div
          class="layer-row"
          role="button"
          tabindex="0"
          aria-label={`图层 ${layer.name}`}
          class:active={layer.id === props.activeLayerId}
          onclick={() => props.onPick(layer.id)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              props.onPick(layer.id);
            }
          }}
        >
          <button
            class="icon-btn eye"
            onclick={(e) => {
              e.stopPropagation();
              project.toggleLayer(layer.id);
            }}
            title={layer.visible ? '点一下隐藏' : '点一下显示'}
          >
            {layer.visible ? '👁' : '🚫'}
          </button>

          {#if editingId === layer.id}
            <input
              class="name-input"
              bind:this={renameInput}
              bind:value={editingName}
              onblur={commitRename}
              onkeydown={(e) => e.key === 'Enter' && commitRename()}
              onclick={(e) => e.stopPropagation()}
            />
          {:else}
            <span
              class="layer-name"
              role="button"
              tabindex="0"
              title="双击改名"
              ondblclick={() => startRename(layer)}
              onkeydown={(e) => e.key === 'Enter' && startRename(layer)}
            >
              {layer.name}
              <small>{layer.dabs.length} 笔</small>
            </span>
          {/if}

          <span class="row-actions">
            <button
              class="icon-btn tiny"
              disabled={index === 0}
              onclick={(e) => {
                e.stopPropagation();
                project.moveLayer(layer.id, -1);
              }}
              title="上移"
            >↑</button>
            <button
              class="icon-btn tiny"
              disabled={index === s.layers.length - 1}
              onclick={(e) => {
                e.stopPropagation();
                project.moveLayer(layer.id, 1);
              }}
              title="下移"
            >↓</button>
            <button
              class="icon-btn tiny del"
              onclick={(e) => {
                e.stopPropagation();
                project.removeLayer(layer.id);
              }}
              title="删除图层"
            >✕</button>
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .layers {
    width: 280px;
    max-height: 240px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
  }
  .layers-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .empty {
    font-size: 12.5px;
    color: var(--fg-dim);
    margin: 8px 0 2px;
  }
  .layer-list {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
  .layer-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    border: 1.5px solid transparent;
    background: var(--bg-card);
    cursor: pointer;
  }
  .layer-row.active {
    border-color: var(--accent);
  }
  .eye {
    min-width: 34px;
    width: 34px;
    height: 34px;
    padding: 0;
  }
  .layer-name {
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
    display: flex;
    flex-direction: column;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .layer-name small {
    color: var(--fg-dim);
    font-size: 11px;
  }
  .name-input {
    flex: 1;
    min-width: 0;
    font-family: inherit;
    font-size: 13.5px;
    color: var(--fg);
    background: var(--bg-panel-solid);
    border: 1.5px solid var(--accent);
    border-radius: 8px;
    padding: 6px 8px;
  }
  .row-actions {
    display: flex;
    gap: 3px;
    flex: none;
  }
  .tiny {
    min-width: 26px;
    width: 26px;
    min-height: 26px;
    height: 26px;
    padding: 0;
    font-size: 12px;
  }
  .del:hover {
    border-color: var(--accent-3);
  }
</style>
