import { For, type JSX } from 'solid-js';
import { currentTheater, updateLight, updateShadow, updateSunPose, updateLampHeight } from '../store/theaterStore';
import { Slider, Toggle } from './controls';
import { kelvinToCss, temperatureLabel } from '../lib/colorTemperature';

const PCF_OPTIONS = [
  { value: 0, label: '轻柔 · 1 采样（最快）' },
  { value: 1, label: '标准 · 9 采样 PCF' },
  { value: 2, label: '很柔 · 25 采样 PCF（最慢）' },
];
const MAP_OPTIONS = [256, 512, 1024, 2048, 4096];

interface Props {
  debug: boolean;
  onToggleDebug: (v: boolean) => void;
}

export function SettingsPanel(props: Props): JSX.Element {
  const t = () => currentTheater();

  return (
    <div class="panel">
      {/* ---------------- 日光（窗口方向光） ---------------- */}
      <section class="panel-section">
        <h3 class="panel-title sun-title">☀ 窗口日光（方向光）</h3>
        <Toggle
          label={t().sun.enabled ? '日光开着' : '日光关了'}
          checked={t().sun.enabled}
          onChange={(v) => updateLight('sun', { enabled: v })}
        />
        <Slider
          label="光的强度"
          value={t().sun.intensity}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) => updateLight('sun', { intensity: v })}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="色温"
          hint={temperatureLabel(t().sun.temperature)}
          value={t().sun.temperature}
          min={1800}
          max={12000}
          step={50}
          accent={kelvinToCss(t().sun.temperature)}
          onChange={(v) => updateLight('sun', { temperature: v })}
          format={(v) => `${v}K`}
        />
        <Slider
          label="窗户朝向"
          value={t().sunAzimuth}
          min={0}
          max={Math.PI * 2}
          step={0.02}
          onChange={(v) => updateSunPose(v, t().sunElevation)}
          format={(v) => `${Math.round((v * 180) / Math.PI)}°`}
        />
        <Slider
          label="太阳高低"
          hint="越低影子越长"
          value={t().sunElevation}
          min={0.12}
          max={1.45}
          step={0.01}
          onChange={(v) => updateSunPose(t().sunAzimuth, v)}
          format={(v) => `${Math.round((v * 180) / Math.PI)}°`}
        />
      </section>

      {/* ---------------- 台灯（点光源） ---------------- */}
      <section class="panel-section">
        <h3 class="panel-title lamp-title">💡 小台灯（点光源）</h3>
        <Toggle
          label={t().lamp.enabled ? '台灯亮着' : '台灯关了'}
          checked={t().lamp.enabled}
          onChange={(v) => updateLight('lamp', { enabled: v })}
        />
        <Slider
          label="灯光强度"
          value={t().lamp.intensity}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) => updateLight('lamp', { intensity: v })}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="色温"
          hint={temperatureLabel(t().lamp.temperature)}
          value={t().lamp.temperature}
          min={1800}
          max={12000}
          step={50}
          accent={kelvinToCss(t().lamp.temperature)}
          onChange={(v) => updateLight('lamp', { temperature: v })}
          format={(v) => `${v}K`}
        />
        <Slider
          label="台灯高度"
          value={t().placements.find((p) => p.kind === 'lamp')?.y ?? 2.6}
          min={1.4}
          max={5.5}
          step={0.05}
          onChange={(v) => updateLampHeight(v)}
          format={(v) => `${v.toFixed(2)} 米`}
        />
        <p class="tip-text">提示：直接在画面里拖台灯，影子会跟着跑哦。</p>
      </section>

      {/* ---------------- 阴影与级联 ---------------- */}
      <section class="panel-section">
        <h3 class="panel-title shadow-title">🌗 影子（三级级联阴影）</h3>

        <label class="select-row">
          <span class="slider-label">阴影贴图分辨率</span>
          <select
            value={String(t().shadow.mapSize)}
            onChange={(e) => updateShadow({ mapSize: Number(e.currentTarget.value) })}
          >
            <For each={MAP_OPTIONS}>
              {(m) => (
                <option value={m}>
                  {m} × {m}
                </option>
              )}
            </For>
          </select>
        </label>

        <Slider
          label="级联切换距离 λ"
          hint="左均匀 / 右对数"
          value={t().shadow.splitLambda}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateShadow({ splitLambda: v })}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="阴影最远距离"
          value={t().shadow.shadowMaxZ}
          min={8}
          max={60}
          step={1}
          onChange={(v) => updateShadow({ shadowMaxZ: v })}
          format={(v) => `${v} 米`}
        />

        <label class="select-row">
          <span class="slider-label">PCF 边缘软化</span>
          <select
            value={String(t().shadow.pcfKernel)}
            onChange={(e) => updateShadow({ pcfKernel: Number(e.currentTarget.value) })}
          >
            <For each={PCF_OPTIONS}>
              {(o) => <option value={o.value}>{o.label}</option>}
            </For>
          </select>
        </label>

        <button
          class="btn btn-debug"
          classList={{ 'btn-debug-on': props.debug }}
          type="button"
          onClick={() => props.onToggleDebug(!props.debug)}
        >
          {props.debug ? '✕ 关闭调试视图' : '🔍 打开调试视图'}
        </button>
        {props.debug && (
          <p class="tip-text">
            画面中红/绿/蓝三色区域就是近、中、远三级级联的覆盖范围，右侧面板显示每一级的深度贴图。
          </p>
        )}
      </section>
    </div>
  );
}
