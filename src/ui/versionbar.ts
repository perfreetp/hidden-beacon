/**
 * Thin version bar under the stage: save, quick restore, and a live read-out of
 * the clearance the current layout achieves. Kept separate from the timeline so
 * the edit view stays uncluttered, while the timeline lives on the diff page.
 */

import { ZElement } from './base';
import {
  activeCard, getState, setView, subscribe, minGapOf, activeVersionLabel,
  snapshotIfChanged,
} from '../store/state';

export class VersionBar extends ZElement {
  private unsub: (() => void) | null = null;

  protected override css(): string {
    return /* css */ `
    :host { display:flex; align-items:center; gap:8px; height:100%; min-width:0; }
    button { font-size:12px; padding:4px 10px; }
    .meta { font-size:11.5px; color:var(--ink-3); display:flex; gap:10px; align-items:center;
      overflow:hidden; white-space:nowrap; }
    .meta b { font-family:var(--mono); font-weight:500; color:var(--ink-2); }
    .gap-ok { color:#2f9e6e; }
    .gap-warn { color:#cc5a4b; }
    `;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.unsub = subscribe(() => this.render());
  }

  disconnectedCallback(): void {
    this.unsub?.();
  }

  protected override render(): void {
    const card = activeCard();
    if (!card) return;
    const state = getState();
    const count = (state.versions[card.id] ?? []).length;
    const gap = minGapOf(card);
    const need = card.style.clearance;
    const ok = !Number.isFinite(gap) || gap >= need - 0.05;
    this.h(`
      <div class="meta">
        <span>版本 <b>${count}</b></span>
        <span>最近 <b>${activeVersionLabel(card.id)}</b></span>
        <span class="${ok ? 'gap-ok' : 'gap-warn'}">字距 <b>${Number.isFinite(gap) ? gap.toFixed(1) : '—'}</b> / ${need}mm</span>
      </div>
      <span style="flex:1"></span>
      <button data-act="save" title="立即保存当前状态为一个版本 (Ctrl+S)">存为版本</button>
      <button data-act="diff" title="对比两个版本的差异">对比</button>
    `);
    this.q('[data-act="save"]')?.addEventListener('click', () => void snapshotIfChanged());
    this.q('[data-act="diff"]')?.addEventListener('click', () => setView('diff'));
  }
}

export function defineVersionBar(): void {
  if (!customElements.get('version-bar')) customElements.define('version-bar', VersionBar);
}
