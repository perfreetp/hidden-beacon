import { createEffect, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { TheaterEngine } from '../babylon/TheaterEngine';
import {
  commitPlacement,
  currentTheater,
  state,
  updateLight,
} from '../store/theaterStore';
import { DarkHint } from './DarkHint';
import { DebugOverlay } from './DebugOverlay';

interface Props {
  debug: boolean;
  onDebugChange: (v: boolean) => void;
}

export function SceneCanvas(props: Props): JSX.Element {
  let canvasRef: HTMLCanvasElement | undefined;
  let engine: TheaterEngine | null = null;
  let lastTheaterId = '';
  const [dark, setDark] = createSignal(false);
  const [dismissed, setDismissed] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);

  onMount(() => {
    if (!canvasRef) return;
    engine = new TheaterEngine(canvasRef, {
      onPlacementCommitted: (p) => commitPlacement(p),
      onSelectionChange: (id) => setSelectedId(id),
      onDarkScene: (isDark) => {
        setDark(isDark);
        if (isDark) setDismissed(false);
      },
    });
    lastTheaterId = state().currentId;
    engine.applyTheater(currentTheater());
  });

  // 切换剧场 id -> 整体重建场景
  createEffect(() => {
    const id = state().currentId;
    if (!engine || id === lastTheaterId) return;
    lastTheaterId = id;
    engine.applyTheater(currentTheater());
  });

  // 摆放数据变化（注意：引擎自身拖拽产生的回写是幂等的，不会打断拖拽）
  createEffect(() => {
    const theater = currentTheater();
    if (!engine || theater.id !== lastTheaterId) return;
    for (const p of theater.placements) {
      engine.updatePlacement(p);
    }
  });

  // 灯光参数
  createEffect(() => {
    const theater = currentTheater();
    if (!engine) return;
    engine.applyLight('sun', theater.sun);
  });
  createEffect(() => {
    const theater = currentTheater();
    if (!engine) return;
    engine.applyLight('lamp', theater.lamp);
  });

  // 太阳方位
  createEffect(() => {
    const theater = currentTheater();
    engine?.applySunDirection(theater.sunAzimuth, theater.sunElevation);
  });

  // 阴影参数（分辨率变化时引擎内部自行重建生成器）
  createEffect(() => {
    const theater = currentTheater();
    engine?.applyShadow(theater.shadow);
  });

  // 调试开关
  createEffect(() => {
    engine?.setDebug(props.debug);
  });

  onCleanup(() => engine?.dispose());

  const brighten = () => {
    const t = currentTheater();
    if (!t.lamp.enabled || t.lamp.intensity < 2) {
      updateLight('lamp', { enabled: true, intensity: Math.max(2.4, t.lamp.intensity) });
    } else {
      updateLight('sun', { enabled: true, intensity: Math.max(2, t.sun.intensity) });
    }
  };

  return (
    <div class="scene-wrap">
      <canvas ref={canvasRef} class="scene-canvas" touch-action="none" />

      <div class="scene-toolbar">
        <button
          class="btn btn-circle"
          type="button"
          title="左转"
          onClick={() => engine?.rotateSelected(-Math.PI / 8)}
        >
          ⟲
        </button>
        <button
          class="btn btn-circle"
          type="button"
          title="右转"
          onClick={() => engine?.rotateSelected(Math.PI / 8)}
        >
          ⟳
        </button>
        <span class="selection-hint">
          {selectedId() ? '已选中：拖一拖试试' : '点一下玩具或台灯，再拖动它'}
        </span>
      </div>

      <DarkHint
        visible={dark() && !dismissed()}
        onDismiss={() => setDismissed(true)}
        onBrighten={() => {
          brighten();
          setDismissed(true);
        }}
      />

      {props.debug && (
        <DebugOverlay
          registerCanvases={(canvases) => engine?.attachDebugCanvases(canvases)}
          onClose={() => props.onDebugChange(false)}
        />
      )}
    </div>
  );
}
