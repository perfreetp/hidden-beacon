/**
 * Small form controls used across the panels. Each is a Web Component so the
 * panels can be declarative HTML, and each dispatches a single `change` event
 * with `{ value }` in its detail — so a slider drag produces a stream the store
 * can coalesce into one save.
 */

import { define, fmt, ZElement } from './base';

/* ------------------------------------------------------------------ slider */

export class ZSlider extends ZElement {
  private _value = 0;
  private _min = 0;
  private _max = 1;
  private _step = 0.01;
  private _unit = '';

  static observedAttributes = ['min', 'max', 'step', 'value', 'unit', 'label'];

  protected override css(): string {
    return /* css */ `
    :host { display:block; }
    .row { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:3px; }
    .name { font-size:12px; color: var(--ink-2); }
    .val { font: 11px var(--mono); color: var(--ink); background: var(--paper-3);
      border-radius: 5px; padding:1px 6px; cursor:ew-resize; user-select:none; }
    .val.editing { outline:1px solid var(--accent); }
    input[type=range] { -webkit-appearance:none; appearance:none; width:100%; height:18px; background:transparent;
      margin:0; cursor:pointer; }
    input[type=range]::-webkit-slider-runnable-track { height:4px; border-radius:2px;
      background: linear-gradient(to right, var(--accent) var(--pct,0%), var(--line) var(--pct,0%)); }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:13px; height:13px; border-radius:50%;
      background:#fff; border:1.5px solid var(--accent); margin-top:-4.5px; box-shadow:0 1px 3px rgba(0,0,0,.18); }
    input[type=range]:focus-visible { outline:2px solid var(--accent); outline-offset:3px; border-radius:4px; }
    `;
  }

  override connectedCallback(): void {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
    super.connectedCallback();
    this.readAttrs();
    this.paint();
  }

  attributeChangedCallback(): void {
    this.readAttrs();
    this.paint();
  }

  private readAttrs(): void {
    this._min = Number(this.getAttribute('min') ?? 0);
    this._max = Number(this.getAttribute('max') ?? 1);
    this._step = Number(this.getAttribute('step') ?? 0.01);
    this._unit = this.getAttribute('unit') ?? '';
    const v = this.getAttribute('value');
    if (v !== null) this._value = Number(v);
  }

  get value(): number {
    return this._value;
  }

  set value(v: number) {
    this._value = v;
    this.paint();
  }

  setValue(v: number, silent = true): void {
    this._value = v;
    this.paint();
    if (!silent) this.emit();
  }

  private emit(): void {
    this.dispatchEvent(new CustomEvent('change', { detail: { value: this._value }, bubbles: true }));
  }

  private paint(): void {
    const label = this.getAttribute('label') ?? '';
    if (!this.q('input')) {
      this.h(
        `<div class="row"><span class="name"></span><span class="val" title="双击直接输入"></span></div>` +
        `<input type="range">`,
      );
      const input = this.q<HTMLInputElement>('input')!;
      input.addEventListener('input', () => {
        this._value = Number(input.value);
        this.syncUI();
        this.emit();
      });
      // Double-click the value chip to type an exact number.
      const chip = this.q<HTMLElement>('.val')!;
      chip.addEventListener('dblclick', () => this.promptValue());
    }
    const nameEl = this.q('.name')!;
    if (nameEl.textContent !== label) nameEl.textContent = label;
    const input = this.q<HTMLInputElement>('input')!;
    input.min = String(this._min);
    input.max = String(this._max);
    input.step = String(this._step);
    input.value = String(this._value);
    this.syncUI();
  }

  private syncUI(): void {
    const v = this.clampValue(this._value);
    const pct = ((v - this._min) / (this._max - this._min || 1)) * 100;
    const input = this.q<HTMLInputElement>('input')!;
    input.style.setProperty('--pct', `${pct}%`);
    const chip = this.q<HTMLElement>('.val')!;
    if (!chip.classList.contains('editing')) {
      chip.textContent = `${fmt(v, this.decimals())}${this._unit}`;
    }
  }

  private decimals(): number {
    const s = String(this._step);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }

  private clampValue(v: number): number {
    return Math.min(this._max, Math.max(this._min, v));
  }

  private promptValue(): void {
    const chip = this.q<HTMLElement>('.val')!;
    const input = document.createElement('input');
    input.value = String(this._value);
    input.style.cssText = 'width:64px;font:11px var(--mono);border:1px solid var(--accent);border-radius:4px;padding:1px 4px;background:var(--paper-2)';
    chip.classList.add('editing');
    chip.textContent = '';
    chip.appendChild(input);
    input.focus();
    input.select();
    const commit = (ok: boolean) => {
      if (ok) {
        const n = Number(input.value);
        if (Number.isFinite(n)) {
          this._value = this.clampValue(n);
          const range = this.q<HTMLInputElement>('input')!;
          range.value = String(this._value);
          this.emit();
        }
      }
      chip.classList.remove('editing');
      this.syncUI();
    };
    input.addEventListener('blur', () => commit(true), { once: true });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') commit(true);
      if (ev.key === 'Escape') commit(false);
    });
  }
}

/* ------------------------------------------------------------------ swatch */

export class ZSwatches extends ZElement {
  private _value = '';

  static observedAttributes = ['value', 'label'];

  protected override css(): string {
    return /* css */ `
    :host { display:block; }
    .name { font-size:12px; color: var(--ink-2); margin-bottom:4px; display:block; }
    .wrap { display:flex; flex-wrap:wrap; gap:5px; }
    button { width:22px; height:22px; border-radius:50%; padding:0; border:1.5px solid transparent;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); position:relative; }
    button[aria-pressed=true] { border-color: var(--ink); }
    button[aria-pressed=true]::after { content:""; position:absolute; inset:3px; border-radius:50%;
      border:1.5px solid rgba(255,255,255,.9); }
    `;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.paint();
  }

  attributeChangedCallback(): void {
    this.paint();
  }

  get value(): string {
    return this._value;
  }

  set value(v: string) {
    this._value = v;
    this.paint();
  }

  setColors(colors: ReadonlyArray<{ id: string; name: string; color: string }>): void {
    this._colors = colors;
    this.paint();
  }

  private _colors: ReadonlyArray<{ id: string; name: string; color: string }> = [];

  private paint(): void {
    const label = this.getAttribute('label') ?? '';
    const v = this.getAttribute('value');
    if (v !== null) this._value = v;
    const colors = this._colors;
    this.h(
      (label ? `<span class="name">${label}</span>` : '') +
      '<div class="wrap">' +
      colors.map((c) =>
        `<button role="button" data-id="${c.id}" title="${c.name}" aria-label="${c.name}" ` +
        `aria-pressed="${c.id === this._value}" style="background:${c.color}"></button>`,
      ).join('') +
      '</div>',
    );
    this.qa('button').forEach((b) => {
      b.addEventListener('click', () => {
        this._value = b.getAttribute('data-id')!;
        this.qa('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.dispatchEvent(new CustomEvent('change', { detail: { value: this._value }, bubbles: true }));
      });
    });
  }
}

/* ------------------------------------------------------------------ toggle */

export class ZToggle extends ZElement {
  private _on = false;

  static observedAttributes = ['on', 'label'];

  protected override css(): string {
    return /* css */ `
    :host { display:block; }
    button { display:flex; width:100%; align-items:center; justify-content:space-between; gap:10px;
      border:1px solid var(--line); background:var(--paper-2); border-radius: var(--radius-sm); padding:6px 10px; }
    .t { font-size:12px; }
    .track { width:32px; height:18px; border-radius:999px; background: var(--line-strong); position:relative;
      transition: background .15s; flex:none; }
    .knob { position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:#fff;
      transition: transform .15s; box-shadow:0 1px 2px rgba(0,0,0,.2); }
    button[aria-pressed=true] .track { background: var(--accent); }
    button[aria-pressed=true] .knob { transform: translateX(14px); }
    `;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._on = this.getAttribute('on') === 'true';
    this.paint();
  }

  attributeChangedCallback(): void {
    this._on = this.getAttribute('on') === 'true';
    this.paint();
  }

  get on(): boolean {
    return this._on;
  }

  set on(v: boolean) {
    this._on = v;
    this.paint();
  }

  private paint(): void {
    const label = this.getAttribute('label') ?? '';
    if (!this.q('button')) {
      this.h(`<button type="button"><span class="t"></span><span class="track"><span class="knob"></span></span></button>`);
      this.q('button')!.addEventListener('click', () => {
        this._on = !this._on;
        this.q('button')!.setAttribute('aria-pressed', String(this._on));
        this.dispatchEvent(new CustomEvent('change', { detail: { value: this._on }, bubbles: true }));
      });
    }
    this.q('.t')!.textContent = label;
    this.q('button')!.setAttribute('aria-pressed', String(this._on));
  }
}

/* ------------------------------------------------------------------ colour */

export class ZColor extends ZElement {
  private _value = '#000000';

  static observedAttributes = ['value', 'label'];

  protected override css(): string {
    return /* css */ `
    :host { display:block; }
    .row { display:flex; align-items:center; gap:8px; }
    .name { font-size:12px; color:var(--ink-2); flex:1; }
    input[type=color] { width:30px; height:24px; padding:0; border:1px solid var(--line-strong);
      border-radius:6px; background:none; cursor:pointer; }
    input[type=color]::-webkit-color-swatch-wrapper { padding:2px; }
    input[type=color]::-webkit-color-swatch { border:none; border-radius:4px; }
    code { font: 11px var(--mono); color: var(--ink-2); }
    `;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.paint();
  }

  attributeChangedCallback(): void {
    this.paint();
  }

  get value(): string {
    return this._value;
  }

  set value(v: string) {
    this._value = v;
    this.paint();
  }

  private paint(): void {
    const v = this.getAttribute('value');
    if (v) this._value = v;
    const label = this.getAttribute('label') ?? '';
    if (!this.q('input')) {
      this.h(`<div class="row"><span class="name"></span><code></code><input type="color"></div>`);
      this.q<HTMLInputElement>('input')!.addEventListener('input', (ev) => {
        this._value = (ev.target as HTMLInputElement).value;
        this.q('code')!.textContent = this._value;
        this.dispatchEvent(new CustomEvent('change', { detail: { value: this._value }, bubbles: true }));
      });
    }
    this.q('.name')!.textContent = label;
    this.q('code')!.textContent = this._value;
    this.q<HTMLInputElement>('input')!.value = this._value;
  }
}

/* --------------------------------------------------------------- segmented */

export class ZSegmented extends ZElement {
  private _value = '';
  private _options: Array<{ value: string; label: string; title?: string }> = [];

  static observedAttributes = ['value', 'options'];

  protected override css(): string {
    return /* css */ `
    :host { display:block; }
    .name { font-size:12px; color:var(--ink-2); margin-bottom:4px; display:block; }
    .wrap { display:flex; background: var(--paper-3); border-radius: var(--radius-sm); padding:2px; gap:1px; }
    button { flex:1; border:none; background:transparent; border-radius:5px; padding:4px 6px; font-size:12px;
      color:var(--ink-2); }
    button[aria-pressed=true] { background: var(--paper-2); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,.1); }
    `;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.syncOptions();
  }

  attributeChangedCallback(name: string): void {
    if (name === 'options') this.syncOptions();
    else this.paint();
  }

  private syncOptions(): void {
    const raw = this.getAttribute('options');
    if (raw) {
      try {
        this._options = JSON.parse(raw);
      } catch {
        /* ignore malformed */
      }
    }
    this.paint();
  }

  setOptions(options: Array<{ value: string; label: string; title?: string }>): void {
    this._options = options;
    this.paint();
  }

  get value(): string {
    return this._value;
  }

  set value(v: string) {
    this._value = v;
    this.paint();
  }

  private paint(): void {
    const label = this.getAttribute('label') ?? '';
    const v = this.getAttribute('value');
    if (v !== null) this._value = v;
    if (this._options.length === 0) return;
    this.h(
      (label ? `<span class="name">${label}</span>` : '') +
      '<div class="wrap" role="group">' +
      this._options.map((o) =>
        `<button type="button" data-v="${o.value}" title="${o.title ?? o.label}" ` +
        `aria-pressed="${o.value === this._value}">${o.label}</button>`,
      ).join('') +
      '</div>',
    );
    this.qa('button').forEach((b) => {
      b.addEventListener('click', () => {
        this._value = b.getAttribute('data-v')!;
        this.qa('button').forEach((x) => x.setAttribute('aria-pressed', String(x.getAttribute('data-v') === this._value)));
        this.dispatchEvent(new CustomEvent('change', { detail: { value: this._value }, bubbles: true }));
      });
    });
  }
}

export function defineControls(): void {
  define('z-slider', ZSlider);
  define('z-swatches', ZSwatches);
  define('z-toggle', ZToggle);
  define('z-color', ZColor);
  define('z-segmented', ZSegmented);
}

export type { ZElement };
