<script>
  import { tool, brushColor, brushSize, splitX, highContrast, api } from '../lib/stores.js';

  const tools = [
    { id: 'brush', icon: '🖌️', name: '笔刷' },
    { id: 'star', icon: '⭐', name: '星星' },
    { id: 'fish', icon: '🐟', name: '小鱼' },
    { id: 'house', icon: '🏠', name: '房子' },
    { id: 'pan', icon: '✋', name: '拖动' }
  ];

  const colors = ['#ffd76a', '#ff8fb2', '#7ef0ff', '#9dff8a', '#c9a8ff', '#ff9d5c', '#ffffff', '#5c8cff'];

  function toggleSplit() {
    splitX.update((v) => (v == null ? 300 : null));
  }

  function onClear() {
    if (confirm('要把画布全部清空吗？')) api.clearAll();
  }
</script>

<section class="panel">
  <h2>画笔</h2>
  <div class="tools">
    {#each tools as t}
      <button
        class:active={$tool === t.id}
        on:click={() => tool.set(t.id)}
        title={t.name}
      >
        <span class="ic">{t.icon}</span><span>{t.name}</span>
      </button>
    {/each}
  </div>

  <h2>颜色</h2>
  <div class="colors">
    {#each colors as c}
      <button
        class="swatch"
        class:active={$brushColor === c}
        style="background: {c}"
        on:click={() => brushColor.set(c)}
        aria-label={c}
      ></button>
    {/each}
    <input type="color" bind:value={$brushColor} title="自选颜色" />
  </div>

  <label class="row">
    <span>粗细</span>
    <input type="range" min="14" max="120" bind:value={$brushSize} />
  </label>

  <h2>魔法</h2>
  <div class="actions">
    <button on:click={() => api.undo()}>↩️ 撤销</button>
    <button on:click={onClear}>🧹 清空</button>
    <button class:active={$splitX != null} on:click={toggleSplit}>⚖️ 对比</button>
    <button class:active={$highContrast} on:click={() => highContrast.update((v) => !v)}>👁 高对比</button>
    <button on:click={() => api.fitView()}>🔭 复位视图</button>
  </div>

  <h2>保存作品</h2>
  <div class="actions">
    <button class="primary" on:click={() => api.exportPNG()}>🖼️ 导出高清图</button>
    <button class="primary" on:click={() => api.exportConfig()}>📦 导出效果配置</button>
  </div>
  <p class="hint">画布会自动保存在浏览器里，下次打开接着画。</p>
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: 0.45rem; }
  h2 {
    margin: 0.35rem 0 0; font-size: 0.85rem; color: #8f95c8;
    font-weight: 600; letter-spacing: 0.1em;
  }
  .tools { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
  .tools button, .actions button {
    display: flex; align-items: center; gap: 0.3rem; justify-content: center;
    padding: 0.5rem 0.3rem; border-radius: 12px;
    border: 2px solid #2c3060; background: #181b3d; color: #e8e9f5;
    font-size: 0.9rem; cursor: pointer; font-family: inherit;
    transition: transform 0.08s, border-color 0.15s, background 0.15s;
  }
  .tools button:hover, .actions button:hover { transform: scale(1.04); }
  .tools button.active, .actions button.active {
    border-color: #ffd76a; background: #2a2450;
    box-shadow: 0 0 10px rgba(255, 215, 106, 0.35);
  }
  .ic { font-size: 1.1rem; }
  .colors { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.4rem; align-items: center; }
  .swatch {
    aspect-ratio: 1; border-radius: 50%; border: 2px solid transparent; cursor: pointer;
  }
  .swatch.active { border-color: #fff; box-shadow: 0 0 8px rgba(255,255,255,0.7); }
  input[type='color'] {
    width: 100%; aspect-ratio: 1; border: none; border-radius: 50%;
    background: none; padding: 0; cursor: pointer;
  }
  .row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
  .row input { flex: 1; accent-color: #ffd76a; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
  .actions .primary { border-color: #3f6fd8; background: #1a2c5e; }
  .hint { margin: 0.2rem 0 0; font-size: 0.72rem; color: #6f74a5; line-height: 1.4; }
  :global(body.hc) .tools button, :global(body.hc) .actions button {
    border-color: #aaa; background: #000; color: #fff;
  }
  :global(body.hc) .tools button.active, :global(body.hc) .actions button.active {
    border-color: #ffff00; box-shadow: 0 0 10px #ffff00;
  }
</style>
