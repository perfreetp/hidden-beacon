<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import CanvasStage from './lib/components/CanvasStage.svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import EffectPanel from './lib/components/EffectPanel.svelte';
  import LayerPanel from './lib/components/LayerPanel.svelte';
  import SplitBar from './lib/components/SplitBar.svelte';
  import { project } from './lib/state';
  import { downloadText, downloadDataUrl, timestampName } from './lib/download';
  import type { ShapeId } from './lib/types';

  const s = $derived($project);

  // 绘画会话设置
  let tool = $state<ShapeId>('star');
  let brushColor = $state('#ffd75e');
  let brushSize = $state(0.055);
  let activeLayerId = $state('');
  let splitValue = $state(1);
  let toast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  let stage = $state<{
    rerender: () => void;
    setSplit: (v: number) => void;
    getSplit: () => number;
    getRenderer: () => import('./lib/renderer').Renderer | null;
  }>();

  function showToast(msg: string) {
    toast = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 2600);
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) project.redo();
      else project.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      project.redo();
      return;
    }
    const keyMap: Record<string, ShapeId> = {
      b: 'brush',
      s: 'star',
      f: 'fish',
      h: 'house',
      e: 'eraser'
    };
    if (keyMap[e.key.toLowerCase()]) tool = keyMap[e.key.toLowerCase()];
  }

  onMount(() => window.addEventListener('keydown', onKey));
  onDestroy(() => window.removeEventListener('keydown', onKey));

  // 高对比模式挂到根元素，驱动 CSS 变量
  $effect(() => {
    document.documentElement.classList.toggle('high-contrast', s.highContrast);
  });

  function setSplitFromBar(v: number) {
    splitValue = v;
    stage?.setSplit(v);
  }

  function resetView() {
    project.setView({ zoom: 1, panX: 0, panY: 0 });
  }
  function nudgeZoom(factor: number) {
    project.setView({ zoom: Math.min(4, Math.max(0.5, s.view.zoom * factor)) });
  }

  function exportPng() {
    const renderer = stage?.getRenderer();
    if (!renderer) return;
    try {
      const dataUrl = renderer.exportPng(s, 2);
      downloadDataUrl(timestampName('magic-light', 'png'), dataUrl);
      showToast('高清图已导出 🖼');
    } catch (e) {
      showToast('导出失败：' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function exportConfig() {
    downloadText(
      timestampName('magic-light-effects', 'json'),
      project.exportConfig()
    );
    showToast('效果配置已导出 📄');
  }

  function importConfig(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        project.importConfig(String(reader.result));
        showToast('配置已导入，画面还原啦 ✨');
      } catch {
        showToast('这个配置文件读不懂，请检查后再试');
      }
    };
    reader.readAsText(file);
  }
</script>

<main class="app" class:high-contrast={s.highContrast}>
  <Toolbar
    {tool}
    brushColor={brushColor}
    brushSize={brushSize}
    highContrast={s.highContrast}
    onTool={(t) => (tool = t)}
    onColor={(hex) => (brushColor = hex)}
    onSize={(v) => (brushSize = v)}
    onExportPng={exportPng}
    onExportConfig={exportConfig}
    onImportConfig={importConfig}
  />

  <section class="center">
    <header class="topbar">
      <h1>🌌 魔法光影画板</h1>
      <div class="view-controls">
        <button class="icon-btn" onclick={() => nudgeZoom(1 / 1.2)} title="缩小">－</button>
        <span class="zoom-label">{Math.round(s.view.zoom * 100)}%</span>
        <button class="icon-btn" onclick={() => nudgeZoom(1.2)} title="放大">＋</button>
        <button onclick={resetView}>复位视图</button>
      </div>
    </header>

    <div class="canvas-wrap">
      <CanvasStage
        bind:this={stage}
        {tool}
        {brushColor}
        {brushSize}
        activeLayerId={activeLayerId}
        onLayerPicked={(id) => (activeLayerId = id)}
      />
      <div class="layer-anchor">
        <LayerPanel
          activeLayerId={activeLayerId}
          onPick={(id) => (activeLayerId = id)}
        />
      </div>
    </div>

    <footer class="bottombar">
      <SplitBar value={splitValue} onInput={setSplitFromBar} />
    </footer>
  </section>

  <EffectPanel />

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</main>

<style>
  .app {
    display: grid;
    grid-template-columns: auto 1fr auto;
    height: 100%;
    gap: 12px;
    padding: 12px;
  }
  .center {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    min-height: 0;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex: none;
  }
  h1 {
    margin: 0;
    font-size: 20px;
    letter-spacing: 0.06em;
  }
  .view-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .zoom-label {
    min-width: 52px;
    text-align: center;
    font-size: 13px;
    color: var(--fg-dim);
  }
  .canvas-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1.5px solid var(--line);
  }
  .layer-anchor {
    position: absolute;
    left: 14px;
    bottom: 14px;
    z-index: 5;
  }
  .bottombar {
    display: flex;
    justify-content: center;
    flex: none;
  }
  .toast {
    position: fixed;
    top: 18px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-panel-solid);
    border: 1.5px solid var(--accent);
    color: var(--fg);
    padding: 10px 22px;
    border-radius: 999px;
    font-size: 14px;
    z-index: 50;
    box-shadow: var(--shadow-glow);
    animation: toast-in 0.2s ease;
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, -8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @media (max-width: 1100px) {
    .app {
      grid-template-columns: auto 1fr;
    }
    :global(.effects) {
      position: fixed;
      right: 12px;
      top: 12px;
      bottom: 12px;
      z-index: 40;
      max-height: calc(100vh - 24px);
    }
  }
</style>
