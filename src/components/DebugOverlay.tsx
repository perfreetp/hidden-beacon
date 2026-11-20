import { For, onCleanup, onMount, type JSX } from 'solid-js';

interface Props {
  registerCanvases: (canvases: HTMLCanvasElement[]) => void;
  onClose: () => void;
}

const CASCADES = [
  { name: '近级 · 高细节', color: '#ff7a7a' },
  { name: '中级', color: '#7be08e' },
  { name: '远级 · 低细节', color: '#85b3ff' },
];

export function DebugOverlay(props: Props): JSX.Element {
  let refs: HTMLCanvasElement[] = [];

  onMount(() => props.registerCanvases(refs));
  onCleanup(() => props.registerCanvases([]));

  return (
    <div class="debug-overlay">
      <div class="debug-header">
        <span>🔬 级联阴影深度图（每级一张，近亮远暗）</span>
        <button class="btn btn-small" type="button" onClick={() => props.onClose()}>
          收起
        </button>
      </div>
      <div class="debug-grid">
        <For each={CASCADES}>
          {(c, i) => (
            <figure class="debug-card" style={`--card-color: ${c.color}`}>
              <canvas
                ref={(el) => {
                  refs[i()] = el;
                }}
                width="220"
                height="220"
              />
              <figcaption>
                <span class="debug-dot" style={`background: ${c.color}`} />
                {c.name}
              </figcaption>
            </figure>
          )}
        </For>
      </div>
    </div>
  );
}
