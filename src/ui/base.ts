/**
 * Design tokens and shared component CSS.
 *
 * A warm, high-contrast palette built for a table-side studio: cream paper,
 * ink-brown text, and a small set of accent hues that match the glow presets.
 * Both a light and a dark theme are defined; the editor follows the system
 * preference, since the canvas itself carries the card's own colours.
 */

export const TOKENS = /* css */ `
:host {
  --paper: #fbf7ef;
  --paper-2: #ffffff;
  --paper-3: #f3ece0;
  --ink: #2f2620;
  --ink-2: #6d5f53;
  --ink-3: #9a8b7d;
  --line: #e3d9c9;
  --line-strong: #cfc0ab;
  --accent: #e3673b;
  --accent-soft: #fdece4;
  --accent-2: #3f8f7f;
  --accent-2-soft: #e7f4f0;
  --danger: #c8483a;
  --gold: #d9a441;
  --radius: 10px;
  --radius-sm: 7px;
  --shadow: 0 1px 2px rgba(70, 50, 30, .08), 0 8px 24px -12px rgba(70, 50, 30, .3);
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  --sans: ui-sans-serif, system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  --display: "ZCOOL KuaiLe", var(--sans);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :host {
    --paper: #1d1a17;
    --paper-2: #262220;
    --paper-3: #2f2a26;
    --ink: #f0e9df;
    --ink-2: #b6aa9c;
    --ink-3: #857a6e;
    --line: #3a342e;
    --line-strong: #4d453c;
    --accent: #f0805a;
    --accent-soft: #3a2822;
    --accent-2: #63b7a4;
    --accent-2-soft: #21322e;
    --danger: #e27568;
    --gold: #e0b45c;
    --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 10px 30px -14px rgba(0, 0, 0, .7);
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
`;

export const BASE_CSS = /* css */ `
${TOKENS}
:host { font-family: var(--sans); color: var(--ink); -webkit-font-smoothing: antialiased; }
button, input, select { font: inherit; color: inherit; }
button {
  border: 1px solid var(--line-strong);
  background: var(--paper-2);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  cursor: pointer;
  transition: background .12s, border-color .12s, transform .06s;
  white-space: nowrap;
}
button:hover { background: var(--paper-3); }
button:active { transform: translateY(1px); }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.primary:hover { filter: brightness(1.06); }
button.ghost { background: transparent; border-color: transparent; }
button.ghost:hover { background: var(--paper-3); }
button.danger { color: var(--danger); }
button[disabled] { opacity: .45; cursor: not-allowed; }
button.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.label { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-3); }
.hint { font-size: 12px; color: var(--ink-2); line-height: 1.5; }
.mono { font-family: var(--mono); }
.scroll { overflow: auto; scrollbar-width: thin; }
`;

let sheet: CSSStyleSheet | null = null;
function baseSheet(): CSSStyleSheet {
  if (sheet) return sheet;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(BASE_CSS);
  return sheet;
}

/**
 * Minimal Web Component base: shadow DOM, adopted stylesheets, and a
 * coalesced render on the next animation frame.
 */
export class ZElement extends HTMLElement {
  protected root: ShadowRoot;
  private frame = 0;
  private readonly ownSheet: CSSStyleSheet;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.ownSheet = new CSSStyleSheet();
    this.root.adoptedStyleSheets = [baseSheet(), this.ownSheet];
  }

  /** Subclasses override to supply their CSS. */
  protected css(): string {
    return '';
  }

  protected setCss(text: string): void {
    if (this.ownSheet.cssRules.length === 0 || this.ownSheetText !== text) {
      this.ownSheetText = text;
      this.ownSheet.replaceSync(text);
    }
  }
  private ownSheetText = '';

  protected h(html: string): void {
    this.root.innerHTML = html;
  }

  protected q<T extends Element = Element>(sel: string): T | null {
    return this.root.querySelector<T>(sel);
  }

  protected qa<T extends Element = Element>(sel: string): T[] {
    return Array.from(this.root.querySelectorAll<T>(sel));
  }

  /** Schedule a render on the next frame (coalesces repeated requests). */
  protected invalidate(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const cssText = this.css();
      if (cssText) this.setCss(cssText);
      this.render();
    });
  }

  protected render(): void {}

  connectedCallback(): void {
    const cssText = this.css();
    if (cssText) this.setCss(cssText);
    this.render();
  }
}

/** Registers a component once, tolerating hot reload. */
export function define(name: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, ctor);
}

export function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(digits).replace(/\.?0+$/, '') || '0';
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
