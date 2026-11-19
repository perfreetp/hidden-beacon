/**
 * The editing stage: a card rendered as vector SVG, with D3 zoom/pan on the
 * canvas and D3 drag on the selected element.
 *
 * Coordinates: the card group is transformed by `translate(tx,ty) scale(k*fit)`,
 * so a screen delta of `d` is `d / (k*fit)` card units. The fit factor is what
 * makes the whole card visible at zoom 1; the D3 transform stacks on top of it.
 */

import { select } from 'd3-selection';
import { zoom, zoomIdentity, ZoomTransform, type ZoomBehavior } from 'd3-zoom';
import 'd3-transition';
import { drag } from 'd3-drag';
import { cardBody } from '../render/svg';
import {
  activeCard, getState, mutateCard, notify, toggleSelect, flushPendingSave, subscribe,
} from '../store/state';
import { ZElement, clamp, fmt } from './base';
import type { Card, Element as CardElement } from '../model/types';
import { elementBounds, elementField, elementRings } from '../core/scene';
import { layoutCard, type LayoutMode } from '../core/layout';

interface View {
  k: number;
  x: number;
  y: number;
  fit: number;
  cardW: number;
  cardH: number;
}

export class CardStage extends ZElement {
  private view: View = { k: 1, x: 0, y: 0, fit: 4, cardW: 100, cardH: 140 };
  private svg: SVGSVGElement | null = null;
  private cardG: SVGGElement | null = null;
  private overlayG: SVGGElement | null = null;
  private zb: ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private ro: ResizeObserver | null = null;
  private unsub: (() => void) | null = null;
  private contentKey = '';
  private dragId: string | null = null;

  protected override css(): string {
    return /* css */ `
    :host { display:block; position:relative; width:100%; height:100%; overflow:hidden;
      background-color: var(--paper-3);
      background-image: radial-gradient(circle at 1px 1px, var(--line) 1px, transparent 0);
      background-size: 18px 18px; border-radius: var(--radius); }
    svg { display:block; width:100%; height:100%; touch-action:none; cursor:grab; }
    svg.panning { cursor:grabbing; }
    svg.on-card { cursor:move; }
    .paper-shadow { filter: drop-shadow(0 20px 34px rgba(45,30,15,.22)); }
    .bbox { fill:none; stroke: var(--accent); stroke-dasharray: 5 4; vector-effect: non-scaling-stroke;
      stroke-width: 1.25; opacity:.9; }
    .grab-line { stroke: var(--accent); stroke-width:1; vector-effect:non-scaling-stroke; opacity:.55; }
    .gap-pill { fill: var(--ink); opacity:.85; }
    .gap-text { fill:#fff; font: 600 11px var(--sans); text-anchor:middle; dominant-baseline:middle; }
    .chip { position:absolute; right:10px; bottom:10px; display:flex; align-items:center; gap:2px;
      padding:3px; border-radius:999px; background: color-mix(in srgb, var(--paper-2) 90%, transparent);
      border:1px solid var(--line); box-shadow: var(--shadow); z-index:3; }
    .chip button { border:none; background:transparent; border-radius:999px; padding:3px 8px; font-size:12px; }
    .chip button:hover { background: var(--paper-3); }
    .chip .pct { font: 11px var(--mono); color: var(--ink-2); padding:0 6px; min-width:44px; text-align:center; }
    .badge { position:absolute; left:10px; bottom:10px; font: 11px var(--mono); color: var(--ink-2);
      background: color-mix(in srgb, var(--paper-2) 90%, transparent); border:1px solid var(--line);
      padding:3px 9px; border-radius:999px; z-index:3; }
    .hintbar { position:absolute; left:10px; top:10px; font-size:11px; color: var(--ink-2);
      background: color-mix(in srgb, var(--paper-2) 86%, transparent); border:1px solid var(--line);
      padding:3px 9px; border-radius:999px; z-index:3; pointer-events:none; }
    @media (max-width: 640px) { .hintbar { display:none; } }
    `;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.unsub = subscribe(() => this.sync());
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this);
    this.layout();
  }

  disconnectedCallback(): void {
    this.unsub?.();
    this.ro?.disconnect();
  }

  protected override render(): void {
    if (!this.svg) {
      this.h(
        '<div class="host" style="position:absolute;inset:0"></div>' +
        '<div class="hintbar">滚轮缩放 · 拖动空白处平移 · 拖动字形移动</div>' +
        '<div class="badge">100%</div>' +
        '<div class="chip">' +
        '<button data-z="out" title="缩小">−</button>' +
        '<button data-z="fit" title="适应窗口">适应</button>' +
        '<button data-z="in" title="放大">+</button>' +
        '</div>',
      );
      this.q('.chip')!.addEventListener('click', (ev) => {
        const act = (ev.target as HTMLElement).closest('button')?.getAttribute('data-z');
        if (act === 'in') this.zoomBy(1.4);
        else if (act === 'out') this.zoomBy(1 / 1.4);
        else if (act === 'fit') this.fit();
      });
      this.layout();
    }
  }

  /* ---------------------------------------------------------------- sizing */

  private layout(): void {
    if (!this.svg) this.buildSvg();
    if (!this.svg) return;
    const rect = this.getBoundingClientRect();
    const w = Math.max(120, Math.round(rect.width));
    const h = Math.max(120, Math.round(rect.height));
    const vb = `0 0 ${w} ${h}`;
    if (this.svg.getAttribute('viewBox') !== vb) this.svg.setAttribute('viewBox', vb);
    if (this.svg.style.width !== `${w}px`) {
      this.svg.style.width = `${w}px`;
      this.svg.style.height = `${h}px`;
    }
    this.recomputeFit(w, h);
    this.applyView();
  }

  private recomputeFit(w: number, h: number): void {
    const card = activeCard();
    if (!card) return;
    this.view.cardW = card.w;
    this.view.cardH = card.h;
    this.view.fit = Math.min(w / card.w, h / card.h) * 0.84;
  }

  private buildSvg(): void {
    const host = this.q('.host');
    if (!host) return;
    host.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<defs class="d"></defs>' +
      '<g class="card-g"></g>' +
      '<g class="overlay-g"></g>' +
      '</svg>';
    const svg = host.querySelector('svg') as SVGSVGElement;
    this.svg = svg;
    this.cardG = svg.querySelector('.card-g') as SVGGElement;
    this.overlayG = svg.querySelector('.overlay-g') as SVGGElement;
    this.cardG.classList.add('paper-shadow');

    const zb = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 60])
      .filter((ev: any) => {
        // Wheel always zooms; primary drag pans only when not started on a glyph.
        if (ev.type === 'wheel') return !ev.ctrlKey || true;
        if (ev.type === 'dblclick') return true;
        if (ev.button !== undefined && ev.button !== 0) return false;
        const t = ev.target as Element | null;
        if (t && t.closest('[data-el]')) return false;
        return true;
      })
      .on('start', () => svg.classList.add('panning'))
      .on('zoom', (ev) => {
        const t = ev.transform as ZoomTransform;
        this.view.k = t.k;
        this.view.x = t.x;
        this.view.y = t.y;
        this.applyView();
      })
      .on('end', () => svg.classList.remove('panning'));
    select(svg).call(zb);
    this.zb = zb;

    // Element drag.
    const db = drag<SVGSVGElement, unknown>()
      .filter((ev: MouseEvent) => {
        if (ev.button !== 0) return false;
        const t = ev.target as Element | null;
        return !!t && !!t.closest('[data-el]');
      })
      .on('start', (ev) => {
        const t = (ev.sourceEvent.target as Element).closest('[data-el]');
        if (!t) return;
        const id = t.getAttribute('data-el')!;
        const additive = !!(ev.sourceEvent as MouseEvent).shiftKey;
        toggleSelect(id, additive);
        this.dragId = id;
        svg.classList.add('on-card');
      })
      .on('drag', (ev) => {
        if (!this.dragId) return;
        const scale = this.view.k * this.view.fit;
        const dx = ev.dx / scale;
        const dy = ev.dy / scale;
        const id = this.dragId;
        mutateCard((c) => {
          const el = c.elements.find((e) => e.id === id);
          if (el) {
            el.x += dx;
            el.y += dy;
          }
        });
        this.syncContent();
      })
      .on('end', () => {
        this.dragId = null;
        svg.classList.remove('on-card');
        void flushPendingSave();
      });
    select(svg).call(db as any);
  }

  /* ------------------------------------------------------------- rendering */

  private applyView(): void {
    if (!this.cardG || !this.overlayG) return;
    const v = this.view;
    const rect = this.svg!.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const scale = v.k * v.fit;
    const tx = w / 2 - (v.cardW * scale) / 2 + v.x;
    const ty = h / 2 - (v.cardH * scale) / 2 + v.y;
    const transform = `translate(${tx} ${ty}) scale(${scale})`;
    this.cardG.setAttribute('transform', transform);
    this.overlayG.setAttribute('transform', transform);
    const badge = this.q('.badge');
    if (badge) badge.textContent = `${Math.round(v.k * 100)}%`;
    this.drawOverlay();
  }

  /** Rebuilds the card content only when something that affects it changed. */
  private syncContent(): void {
    const card = activeCard();
    if (!card || !this.svg || !this.cardG) return;
    const key = JSON.stringify([card.id, card.w, card.h, card.elements, card.style, card.bg]);
    if (key === this.contentKey) {
      this.drawOverlay();
      return;
    }
    this.contentKey = key;
    this.recomputeFit(
      this.svg.getBoundingClientRect().width,
      this.svg.getBoundingClientRect().height,
    );
    const { defs, body } = cardBody(card, 'stage', { decoration: true });
    (this.svg.querySelector('.d') as SVGDefsElement).innerHTML = defs.join('');
    // The stage's viewBox is the viewport in CSS pixels, not the card's mm box:
    // the card group is positioned by the view transform inside it.
    this.cardG.setAttribute('data-card-w', String(card.w));
    this.cardG.setAttribute('data-card-h', String(card.h));
    this.cardG.innerHTML = body.join('');
    // The card-sheet background sits behind everything, inside the group.
    this.applyView();
  }

  private drawOverlay(): void {
    const card = activeCard();
    const ov = this.overlayG;
    if (!card || !ov) return;
    const state = getState();
    const sel = new Set(state.selectedIds);
    const pad = Math.max(card.w, card.h) * 0.008;
    const parts: string[] = [];
    for (const el of card.elements) {
      if (!sel.has(el.id)) continue;
      const b = elementBounds(el);
      if (!Number.isFinite(b.x0)) continue;
      parts.push(
        `<rect class="bbox" rx="${pad}" x="${b.x0 - pad}" y="${b.y0 - pad}" ` +
        `width="${Math.max(0.01, b.x1 - b.x0 + pad * 2)}" height="${Math.max(0.01, b.y1 - b.y0 + pad * 2)}"/>`,
      );
      // Guide lines to the element's anchor.
      parts.push(
        `<line class="grab-line" x1="${b.x0 - pad}" y1="${el.y}" x2="${b.x1 + pad}" y2="${el.y}"/>`,
      );
      parts.push(
        `<line class="grab-line" x1="${el.x}" y1="${b.y0 - pad}" x2="${el.x}" y2="${b.y1 + pad}"/>`,
      );
    }
    // Pairwise clearance read-out for multi-selections.
    if (state.selectedIds.length >= 2) {
      const els = card.elements.filter((e) => sel.has(e.id));
      for (let i = 0; i < els.length; i++) {
        for (let j = i + 1; j < els.length; j++) {
          const gap = measureGap(els[i], els[j]);
          if (!Number.isFinite(gap)) continue;
          const mx = (els[i].x + els[j].x) / 2;
          const my = (els[i].y + els[j].y) / 2;
          const label = `${gap.toFixed(1)}mm`;
          parts.push(
            `<g><rect class="gap-pill" x="${mx - 17}" y="${my - 7}" width="34" height="14" rx="7"/>` +
            `<text class="gap-text" x="${mx}" y="${my + 0.4}">${label}</text></g>`,
          );
        }
      }
    }
    ov.innerHTML = parts.join('');
  }

  private sync(): void {
    if (this.dragId) {
      // During a drag the card content updates continuously; overlays follow it.
      this.drawOverlay();
      return;
    }
    const card = activeCard();
    if (!card) return;
    if (card.w !== this.view.cardW || card.h !== this.view.cardH) this.layout();
    this.syncContent();
  }

  /* ------------------------------------------------------------------- api */

  zoomBy(factor: number): void {
    if (!this.svg || !this.zb) return;
    select(this.svg).transition().duration(150).call(this.zb.scaleBy, factor);
  }

  zoomTo(k: number): void {
    if (!this.svg || !this.zb) return;
    select(this.svg).transition().duration(220).call(this.zb.scaleTo, clamp(k, 0.2, 60));
  }

  fit(): void {
    if (!this.svg || !this.zb) return;
    this.view.x = 0;
    this.view.y = 0;
    select(this.svg)
      .transition()
      .duration(220)
      .call(this.zb.transform, zoomIdentity);
  }

  /** True when the card's ink should be re-outlined (font or size changed). */
  invalidateContent(): void {
    this.contentKey = '';
    this.syncContent();
  }

  /** Runs the distance-field layout and writes it into the active card. */
  autoLayout(mode: LayoutMode = 'auto'): void {
    const card = activeCard();
    if (!card) return;
    // Layout from one common em size so repeated clicks converge instead of
    // shrinking the glyphs a little more each time.
    const glyphs = card.elements.filter((e) => e.type === 'glyph');
    const base = glyphs.length
      ? Math.min(card.w, card.h) * 0.5
      : 0;
    if (base) {
      mutateCard((c) => {
        for (const el of c.elements) if (el.type === 'glyph') el.size = base;
      });
    }
    const res = layoutCard(activeCard(), mode);
    if (res.positions.size === 0) return;
    const uniform = base * res.sizeScale;
    mutateCard((c) => {
      for (const el of c.elements) {
        const p = res.positions.get(el.id);
        if (!p) continue;
        el.x = p.x;
        el.y = p.y;
        if (el.type === 'glyph') el.size = uniform;
      }
    });
    this.invalidateContent();
    notify({
      status: res.minGap === Infinity
        ? '已排布'
        : `已排布 · 最小字距 ${fmt(res.minGap, 1)} mm`,
    });
  }

  /** Centre the ink of the selection, handy after manual dragging. */
  centreSelection(): void {
    const card = activeCard();
    if (!card) return;
    const ids = new Set(getState().selectedIds);
    const els = ids.size ? card.elements.filter((e) => ids.has(e.id)) : card.elements;
    if (els.length === 0) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of els) {
      const b = elementBounds(el);
      if (!Number.isFinite(b.x0)) continue;
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    if (!Number.isFinite(x0)) return;
    const dx = card.w / 2 - (x0 + x1) / 2;
    const dy = card.h / 2 - (y0 + y1) / 2;
    mutateCard((c) => {
      for (const el of c.elements) {
        if (ids.size && !ids.has(el.id)) continue;
        el.x += dx;
        el.y += dy;
      }
    });
    this.invalidateContent();
  }
}

function measureGap(a: CardElement, b: CardElement): number {
  const f = elementField(a);
  let best = Infinity;
  for (const ring of elementRings(b)) {
    const stride = Math.max(1, Math.round(ring.length / 2 / 90));
    for (let i = 0; i < ring.length; i += 2 * stride) {
      const d = f.value(ring[i], ring[i + 1]);
      if (d < best) best = d;
    }
  }
  return best;
}

export function defineStage(): void {
  if (!customElements.get('card-stage')) customElements.define('card-stage', CardStage);
}

export type { Card };
