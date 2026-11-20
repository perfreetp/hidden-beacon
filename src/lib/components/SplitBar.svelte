<script lang="ts">
  interface Props {
    value: number; // 0..1，1 = 全效果
    onInput: (v: number) => void;
  }
  const props: Props = $props();

  const presets: { label: string; value: number }[] = [
    { label: '只看原图', value: 0 },
    { label: '左右对比', value: 0.5 },
    { label: '全看效果', value: 1 }
  ];
</script>

<div class="split-bar panel">
  <span class="bar-title">前后对比</span>
  <input
    type="range"
    min="0"
    max="1"
    step="0.001"
    value={props.value}
    oninput={(e) => props.onInput(parseFloat(e.currentTarget.value))}
  />
  <div class="presets">
    {#each presets as p (p.label)}
      <button
        class:chosen={Math.abs(props.value - p.value) < 0.002}
        onclick={() => props.onInput(p.value)}
      >
        {p.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .split-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    width: 460px;
    max-width: calc(100vw - 560px);
  }
  .bar-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--fg-dim);
    white-space: nowrap;
  }
  .split-bar input {
    flex: 1;
    min-width: 120px;
  }
  .presets {
    display: flex;
    gap: 6px;
  }
  .presets button {
    padding: 6px 10px;
    min-height: 32px;
    font-size: 12.5px;
  }
  .presets button.chosen {
    border-color: var(--accent);
    color: var(--accent);
  }
  @media (max-width: 1100px) {
    .split-bar {
      max-width: calc(100vw - 480px);
    }
  }
</style>
