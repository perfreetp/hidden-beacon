<script lang="ts">
  import { PALETTE, SHAPE_META, type ShapeId } from '../../lib/types';
  import { project, historyFlags as historyFlagsStore } from '../../lib/state';

  interface Props {
    tool: ShapeId;
    brushColor: string;
    brushSize: number;
    highContrast: boolean;
    onTool: (t: ShapeId) => void;
    onColor: (hex: string) => void;
    onSize: (v: number) => void;
    onExportPng: () => void;
    onExportConfig: () => void;
    onImportConfig: (file: File) => void;
  }
  const props: Props = $props();

  const tools: ShapeId[] = ['brush', 'star', 'fish', 'house', 'eraser'];
  let fileInput: HTMLInputElement;

  function pickFile() {
    fileInput.click();
  }
  function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) props.onImportConfig(file);
    input.value = '';
  }

  const historyFlags = $derived($historyFlagsStore);
</script>

<div class="toolbar panel">
  <p class="panel-title">魔法工具</p>

  <div class="tools">
    {#each tools as t (t)}
      <button
        class="tool-btn"
        class:active={props.tool === t}
        onclick={() => props.onTool(t)}
        title={SHAPE_META[t].name}
      >
        <span class="tool-icon">{SHAPE_META[t].icon}</span>
        <span class="tool-name">{SHAPE_META[t].name}</span>
      </button>
    {/each}
  </div>

  <p class="panel-title" style="margin-top:16px">发光颜色</p>
  <div class="palette">
    {#each PALETTE as c (c.hex)}
      <button
        class="swatch"
        class:selected={props.brushColor === c.hex}
        style={`background:${c.hex}`}
        title={c.name}
        onclick={() => props.onColor(c.hex)}
        aria-label={c.name}
      ></button>
    {/each}
    <label class="swatch custom" title="自己选颜色">
      <input
        type="color"
        value={props.brushColor}
        oninput={(e) => props.onColor(e.currentTarget.value)}
      />
      <span>自定义</span>
    </label>
  </div>

  <p class="panel-title" style="margin-top:16px">
    画笔粗细 <b>{Math.round(props.brushSize * 1000)}</b>
  </p>
  <input
    type="range"
    min="0.02"
    max="0.12"
    step="0.005"
    value={props.brushSize}
    oninput={(e) => props.onSize(parseFloat(e.currentTarget.value))}
  />

  <div class="divider"></div>

  <label class="contrast-row">
    <input
      type="checkbox"
      checked={props.highContrast}
      onchange={(e) => project.setHighContrast(e.currentTarget.checked)}
    />
    <span>高对比模式（色弱友好）</span>
  </label>

  <div class="actions">
    <button onclick={() => project.undo()} disabled={!historyFlags.canUndo}>↩ 撤销</button>
    <button onclick={() => project.redo()} disabled={!historyFlags.canRedo}>↪ 重做</button>
    <button class="primary" onclick={props.onExportPng}>🖼 导出高清图</button>
    <button onclick={props.onExportConfig}>📄 导出效果配置</button>
    <button onclick={pickFile}>📂 导入配置</button>
    <button class="danger" onclick={() => {
      if (confirm('确定清空整张画吗？这个操作可以用撤销找回。')) {
        project.clearAll();
      }
    }}>🗑 清空画布</button>
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept="application/json,.json"
    hidden
    onchange={onFile}
  />
</div>

<style>
  .toolbar {
    width: 218px;
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .tools {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .tool-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px;
    min-height: 64px;
  }
  .tool-icon {
    font-size: 24px;
  }
  .tool-name {
    font-size: 13px;
  }
  .palette {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .swatch {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    padding: 0;
    min-height: 0;
    border: 2.5px solid transparent;
    position: relative;
  }
  .swatch.selected {
    border-color: #fff;
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
  }
  .swatch.custom {
    background: transparent !important;
    border: 1.5px dashed var(--line-strong);
    border-radius: var(--radius-sm);
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .swatch.custom input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  .swatch.custom span {
    font-size: 10px;
    color: var(--fg-dim);
    pointer-events: none;
  }
  .divider {
    height: 1px;
    background: var(--line);
    margin: 14px 0;
  }
  .contrast-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    cursor: pointer;
    margin-bottom: 12px;
  }
  .contrast-row input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .actions button {
    width: 100%;
  }
  .danger {
    border-color: rgba(255, 122, 156, 0.5);
  }
</style>
