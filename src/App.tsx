import { createSignal, type JSX } from 'solid-js';
import { TheaterBar } from './components/TheaterBar';
import { SettingsPanel } from './components/SettingsPanel';
import { SceneCanvas } from './components/SceneCanvas';

export default function App(): JSX.Element {
  const [debug, setDebug] = createSignal(false);

  return (
    <div class="app">
      <header class="app-header">
        <h1>
          <span class="logo">🎭</span> 影子小剧场
        </h1>
        <p class="subtitle">拖一拖台灯，看看玩具的影子怎么变长变短～</p>
      </header>

      <TheaterBar />

      <main class="app-main">
        <SceneCanvas debug={debug()} onDebugChange={setDebug} />
        <aside class="app-side">
          <SettingsPanel debug={debug()} onToggleDebug={setDebug} />
        </aside>
      </main>

      <footer class="app-footer">
        所有布置都会自动保存在这个浏览器里，下次打开还在哦 · 方向光=窗口日光 · 点光源=台灯
      </footer>
    </div>
  );
}
