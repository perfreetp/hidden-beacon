<script>
  import { onMount } from 'svelte';
  import Toolbar from './components/Toolbar.svelte';
  import LayerPanel from './components/LayerPanel.svelte';
  import Board from './components/Board.svelte';
  import EffectPanel from './components/EffectPanel.svelte';
  import { highContrast } from './lib/stores.js';

  let webglError = '';

  $: if (typeof document !== 'undefined') {
    document.body.classList.toggle('hc', $highContrast);
  }

  onMount(() => {
    const test = document.createElement('canvas').getContext('webgl2');
    if (!test) webglError = '当前浏览器不支持 WebGL2，请使用最新版 Chrome / Edge / Firefox 打开。';
  });
</script>

{#if webglError}
  <div class="fatal">{webglError}</div>
{:else}
  <div class="app">
    <header>
      <span class="logo">✨ 魔法光影画板</span>
      <span class="tip">和爸爸妈妈一起，用光画画吧！</span>
    </header>
    <main>
      <aside class="left">
        <Toolbar />
        <LayerPanel />
      </aside>
      <Board />
      <aside class="right">
        <EffectPanel />
      </aside>
    </main>
  </div>
{/if}

<style>
  :global(*) { box-sizing: border-box; }
  :global(html, body, #app) { height: 100%; margin: 0; }
  :global(body) {
    font-family: 'PingFang SC', 'Microsoft YaHei', 'Comic Sans MS', system-ui, sans-serif;
    background: #0b0d1a;
    color: #e8e9f5;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  }
  :global(body.hc) {
    background: #000;
    color: #fff;
  }
  .fatal { padding: 3rem; font-size: 1.3rem; text-align: center; }
  .app { display: flex; flex-direction: column; height: 100%; }
  header {
    display: flex; align-items: baseline; gap: 1rem;
    padding: 0.55rem 1rem;
    background: linear-gradient(90deg, #1a1d38, #101226);
    border-bottom: 1px solid #2a2e55;
  }
  .logo { font-size: 1.25rem; font-weight: 700; letter-spacing: 0.05em; }
  .tip { font-size: 0.85rem; color: #9aa0d0; }
  main { flex: 1; display: flex; min-height: 0; }
  .left {
    width: 216px; flex-shrink: 0;
    display: flex; flex-direction: column; gap: 0.6rem;
    padding: 0.6rem; overflow-y: auto;
    background: #10122a;
    border-right: 1px solid #23264a;
  }
  .right {
    width: 264px; flex-shrink: 0;
    padding: 0.6rem; overflow-y: auto;
    background: #10122a;
    border-left: 1px solid #23264a;
  }
  @media (max-width: 900px) {
    .left { width: 168px; }
    .right { width: 220px; }
  }
</style>
