/**
 * Side-by-side and overlay diff view.
 *
 * Two versions of the same card are compared. The overlay mode shows the
 * coverage diff as red/green vector regions on top of a faded card; the
 * side-by-side mode shows both cards with their own diffs highlighted, so it is
 * obvious which change belongs to which version.
 */

import { ZElement, fmt } from './base';
import { activeCard, getState, setDiff, setView, subscribe } from '../store/state';
import { renderCardSvg } from '../render/svg';
import { diffCards, type DiffPaths } from '../core/diff';
import type { Card, Version } from '../model/types';
import { elementRings } from '../core/scene';

/** Structural comparison that ignores timestamps. */
function signature(card: Card): string {
  const { updatedAt, ...rest } = card;
  void updatedAt;
  return JSON.stringify(rest);
}

/** Sentinel version id meaning "the card as it is being edited right now". */
export const CURRENT = '__current__';

let currentSnapshot: { ts: number; snapshot: Card } | null = null;

function currentPseudoVersion(card: Card): Version {
  // Rebuild on every render so the live side always mirrors the canvas.
  currentSnapshot = { ts: Date.now(), snapshot: JSON.parse(JSON.stringify(card)) as Card };
  return {
    id: CURRENT,
    cardId: card.id,
    ts: currentSnapshot.ts,
    label: '当前编辑',
    starred: false,
    snapshot: currentSnapshot.snapshot,
  };
}

export class DiffView extends ZElement {
  private unsub: (() => void) | null = null;
  private mode: 'overlay' | 'side' = 'overlay';
  private cacheKey = '';
  private paths: DiffPaths | null = null;

  protected override css(): string {
    return /* css */ `
    :host { display:flex; flex-direction:column; height:100%; background: var(--paper); min-width:0; }
    .bar { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid var(--line);
      background: var(--paper-2); flex-wrap:wrap; }
    .bar .spacer { flex:1; }
    .bar h2 { margin:0; font-size:13px; font-weight:600; }
    .legend { display:flex; gap:12px; font-size:11.5px; color:var(--ink-2); }
    .legend span { display:flex; align-items:center; gap:5px; }
    .dot { width:9px; height:9px; border-radius:3px; }
    .stage { flex:1; position:relative; min-height:0; display:grid; place-items:center; padding:16px; overflow:hidden; }
    .single { width:100%; height:100%; display:grid; place-items:center; }
    svg.composite { display:block; max-width:min(100%, 62vh); max-height:100%; width:auto; height:auto;
      box-shadow: var(--shadow); border-radius:4px; }
    .pair svg { max-width:100%; max-height:100%; width:auto; height:auto; box-shadow: var(--shadow); border-radius:4px; }
    .pair { display:grid; grid-template-columns:1fr 1fr; gap:16px; width:100%; height:100%; align-items:center; }
    .pair figure { margin:0; display:flex; flex-direction:column; gap:6px; height:100%; min-height:0; }
    .pair .frame { flex:1; display:grid; place-items:center; min-height:0; width:100%; }
    .pair svg.composite { max-width:100%; max-height:100%; height:auto; width:auto; }
    .pair figcaption { font-size:11.5px; color:var(--ink-2); display:flex; align-items:center; gap:6px; justify-content:center; }
    .tag { border-radius:4px; color:#fff; padding:1px 6px; font-size:10.5px; }
    .tag.a { background:#2f9e6e; }
    .tag.b { background:#cc5a4b; }
    .stats { display:flex; gap:14px; font:11px var(--mono); color:var(--ink-2); }
    .stats b { color: var(--ink); }
    .empty { color:var(--ink-3); font-size:13px; text-align:center; line-height:1.8; }
    button { font-size:12px; padding:4px 10px; }
    .seg { display:flex; background:var(--paper-3); border-radius:7px; padding:2px; }
    .seg button { border:none; background:transparent; border-radius:5px; color:var(--ink-2); }
    .seg button[aria-pressed=true] { background:var(--paper-2); color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.1); }
    .overlayWrap { position:relative; display:inline-block; max-width:100%; max-height:100%; }
    .overlayWrap svg { position:static; }
    .diffLayer { position:absolute; inset:0; pointer-events:none; border-radius:4px; overflow:hidden; }
    .diffLayer svg { width:100%; height:100%; box-shadow:none; display:block; }
    @media (max-width: 860px) { .pair { grid-template-columns:1fr; overflow:auto; } }
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
    const state = getState();
    if (!card) return;
    const list = state.versions[card.id] ?? [];
    // Default: compare the last snapshot with the live canvas (what did I change
    // since the save?), falling back to the newest two snapshots if the canvas
    // matches the newest one — otherwise the very first visit would show an
    // all-grey overlay and look broken.
    if (!state.diff.a && !state.diff.b && list.length >= 1) {
      const newest = list[list.length - 1];
      const liveDiffers = signature(newest.snapshot) !== signature(card);
      if (liveDiffers) setDiff(newest.id, CURRENT);
      else if (list.length >= 2) setDiff(list[list.length - 2].id, newest.id);
      else setDiff(newest.id, CURRENT);
    }
    const a = state.diff.a === CURRENT ? currentPseudoVersion(card) : list.find((v) => v.id === state.diff.a);
    const b = state.diff.b === CURRENT ? currentPseudoVersion(card) : list.find((v) => v.id === state.diff.b);

    const key = JSON.stringify([
      a?.id, b?.id,
      a?.id === CURRENT ? JSON.stringify(a?.snapshot) : a?.ts,
      b?.id === CURRENT ? JSON.stringify(b?.snapshot) : b?.ts,
      this.mode, card.w, card.h,
    ]);
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.paths = a && b && a.id !== b.id ? diffCards(a.snapshot, b.snapshot, card.w, card.h) : null;
    }

    const body = !a || !b || a.id === b.id
      ? `<div class="empty">从左侧选择两个版本进行对比。<br>点第一下设为「旧」，点第二下设为「新」。</div>`
      : this.mode === 'overlay'
        ? this.renderOverlay(a.snapshot, b.snapshot)
        : this.renderSide(a.snapshot, b.snapshot);

    this.h(`
      <div class="bar">
        <button data-act="back">← 返回编辑</button>
        <h2>版本差异</h2>
        <div class="seg">
          <button data-mode="overlay" aria-pressed="${this.mode === 'overlay'}">叠加</button>
          <button data-mode="side" aria-pressed="${this.mode === 'side'}">并排</button>
        </div>
        <div class="spacer"></div>
        <div class="legend">
          <span><span class="dot" style="background:#2f9e6e"></span>只在旧版</span>
          <span><span class="dot" style="background:#cc5a4b"></span>只在新版</span>
          <span><span class="dot" style="background:#8d8378"></span>两版相同</span>
        </div>
      </div>
      <div class="stage">${body}</div>
    `);

    this.q('[data-act="back"]')?.addEventListener('click', () => setView('edit'));
    this.qa<HTMLElement>('[data-mode]').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.mode = btn.getAttribute('data-mode') as 'overlay' | 'side';
        this.render();
      }));
  }

  /**
   * One SVG, layered: the new card at low opacity as context, then the three
   * coverage regions on top. Keeping it in a single document means the diff
   * paths share the base's viewBox and align exactly.
   */
  private renderOverlay(oldCard: ReturnType<typeof activeCard>, newCard: ReturnType<typeof activeCard>): string {
    const p = this.paths;
    if (!p) return '';
    const base = renderCardSvg(newCard, { idPrefix: 'ov', background: true, decoration: true });
    // Strip the outer <svg> so the card body can be nested in the composer.
    const inner = base.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    const stats = `<div class="stats">
      <span>仅旧版 <b>${fmt(p.stats.removed, 1)}%</b></span>
      <span>仅新版 <b>${fmt(p.stats.added, 1)}%</b></span>
      <span>重合 <b>${fmt(p.stats.overlap, 1)}%</b></span>
    </div>`;
    void oldCard;
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;height:100%;min-height:0;width:100%">
        <div class="single">
          <svg class="composite" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${newCard.w} ${newCard.h}"
               style="background:${newCard.bg.paper}">
            <clipPath id="ovclip"><rect x="0" y="0" width="${newCard.w}" height="${newCard.h}" rx="${Math.min(newCard.w,newCard.h)*0.06}"/></clipPath>
            <g opacity="0.28" style="filter:saturate(.55)" clip-path="url(#ovclip)">${inner}</g>
            <g clip-path="url(#ovclip)">
              <path d="${p.kept}" fill="#8d8378" fill-opacity="0.10" fill-rule="evenodd"/>
              <path d="${p.removed}" fill="#2f9e6e" fill-opacity="0.62" fill-rule="evenodd"/>
              <path d="${p.added}" fill="#cc5a4b" fill-opacity="0.62" fill-rule="evenodd"/>
            </g>
          </svg>
        </div>
        ${stats}
      </div>`;
  }

  /**
   * Side-by-side: each card is one composed SVG with its own diff layer inside,
   * so the highlight shares the card's exact viewBox and never drifts.
   */
  private renderSide(oldCard: ReturnType<typeof activeCard>, newCard: ReturnType<typeof activeCard>): string {
    const p = this.paths;
    const compose = (card: ReturnType<typeof activeCard>, pre: string, d: string | null, color: string) => {
      const svg = renderCardSvg(card, { idPrefix: pre });
      const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
      return (
        `<svg class="composite" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${card.w} ${card.h}" ` +
        `style="background:${card.bg.paper}">${inner}` +
        (d ? `<path d="${d}" fill="${color}" fill-opacity="0.55" fill-rule="evenodd"/>` : '') +
        '</svg>'
      );
    };
    return `
      <div class="pair">
        <figure>
          <div class="frame">${compose(oldCard, 'sideA', p?.removed ?? null, '#2f9e6e')}</div>
          <figcaption><span class="tag a">旧</span>只在旧版的笔画标绿</figcaption>
        </figure>
        <figure>
          <div class="frame">${compose(newCard, 'sideB', p?.added ?? null, '#cc5a4b')}</div>
          <figcaption><span class="tag b">新</span>只在新版的笔画标红</figcaption>
        </figure>
      </div>`;
  }

}

/** Forces the diff cache to drop (used after a version restore). */
export function invalidateDiff(): void {
  void elementRings;
}

export function defineDiffView(): void {
  if (!customElements.get('diff-view')) customElements.define('diff-view', DiffView);
}
