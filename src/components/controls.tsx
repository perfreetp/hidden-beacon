import type { JSX } from 'solid-js';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  accent?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

/** 大触控区的儿童友好滑块 */
export function Slider(props: SliderProps): JSX.Element {
  return (
    <label class="slider-row">
      <span class="slider-label">
        {props.label}
        {props.hint && <span class="slider-hint">{props.hint}</span>}
      </span>
      <input
        class="slider-input"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        style={props.accent ? `--thumb: ${props.accent}` : undefined}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
      />
      <span class="slider-value">
        {props.format ? props.format(props.value) : `${props.value}${props.unit ?? ''}`}
      </span>
    </label>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function Toggle(props: ToggleProps): JSX.Element {
  return (
    <button
      class="toggle"
      classList={{ 'toggle-on': props.checked }}
      type="button"
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="toggle-dot" />
      <span class="toggle-text">{props.label}</span>
    </button>
  );
}
