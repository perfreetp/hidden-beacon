/**
 * Distance-field layout.
 *
 * Glyphs are placed using their real contours rather than bounding boxes, so a
 * wide character like 一 hugs its neighbour while 國 reserves the space it
 * needs. The requested `clearance` is a contour-to-contour gap in mm.
 *
 * Modes:
 *   row      — one row, equal gaps
 *   stack    — one column, equal gaps
 *   triangle — two glyphs above, one centred below (the "three glyphs" case)
 *   grid     — balanced grid for four or more, or a square card
 *   auto     — picks one of the above from the glyph count and card aspect
 *
 * The solver returns positions plus a uniform size scale, which the caller
 * applies to the elements. A final relaxation pass then nudges glyphs along the
 * distance-field gradient until the measured contour gap meets the request.
 */

import { elementField, elementRings, elementBounds, type Bounds } from './scene';
import { ringsBounds } from './flatten';
import type { Card, Element, GlyphElement } from '../model/types';

export type LayoutMode = 'auto' | 'row' | 'stack' | 'triangle' | 'grid';

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  sizeScale: number;
  /** Smallest contour gap measured after relaxation, in mm. */
  minGap: number;
  mode: Exclude<LayoutMode, 'auto'>;
}

const MARGIN_RATIO = 0.09;

export function glyphBoundsAt(el: GlyphElement, scale = 1): Bounds {
  const rings = elementRings({ ...el, size: el.size * scale });
  if (rings.length === 0) {
    const r = el.size * 0.5;
    return { x0: -r, y0: -r, x1: r, y1: r };
  }
  const b = ringsBounds(rings);
  return { x0: b.x0 - el.x, y0: b.y0 - el.y, x1: b.x1 - el.x, y1: b.y1 - el.y };
}

/** Smallest contour gap between two elements, both directions sampled. */
export function contourGap(a: Element, b: Element): number {
  const fa = elementField(a);
  const fb = elementField(b);
  let best = Infinity;
  for (const [owner, other] of [[fa, b], [fb, a]] as const) {
    const rings = elementRings(other);
    for (const r of rings) {
      const count = r.length / 2;
      const stride = Math.max(1, Math.round(count / 96));
      for (let i = 0; i < count; i += stride) {
        const d = owner.value(r[i * 2], r[i * 2 + 1]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

function pickMode(count: number, card: Card, requested: LayoutMode): Exclude<LayoutMode, 'auto'> {
  if (requested !== 'auto') return requested;
  if (count <= 1) return 'stack';
  if (count === 2) return card.h >= card.w * 1.05 ? 'stack' : 'row';
  if (count === 3) return card.h >= card.w ? 'stack' : 'triangle';
  return 'grid';
}

export function layoutCard(card: Card, requested: LayoutMode = 'auto'): LayoutResult {
  const glyphs = card.elements.filter((e): e is GlyphElement => e.type === 'glyph');
  const positions = new Map<string, { x: number; y: number }>();
  if (glyphs.length === 0) {
    return { positions, sizeScale: 1, minGap: Infinity, mode: 'row' };
  }

  const mode = pickMode(glyphs.length, card, requested);
  const clearance = Math.max(0, card.style.clearance);
  const margin = Math.min(card.w, card.h) * MARGIN_RATIO;
  const usableW = Math.max(10, card.w - margin * 2);
  const usableH = Math.max(10, card.h - margin * 2);
  const n = glyphs.length;

  // Ink extents of each glyph at its current em size, relative to its centre.
  const local = glyphs.map((g) => glyphBoundsAt(g));
  const ws = local.map((b) => Math.max(1e-3, b.x1 - b.x0));
  const hs = local.map((b) => Math.max(1e-3, b.y1 - b.y0));

  const scaleFor = (cols: number, rows: number): number => {
    let sumW = 0;
    let maxH = 0;
    for (let i = 0; i < n; i++) {
      sumW += ws[i];
      maxH = Math.max(maxH, hs[i]);
    }
    const perRow = Math.max(1, Math.min(n, cols));
    const widthFit = (usableW - clearance * (perRow - 1)) / (sumW * (perRow / n));
    const heightFit = (usableH - clearance * (rows - 1)) / (maxH * rows);
    return Math.max(0.2, Math.min(1, widthFit, heightFit));
  };

  let scale = 1;
  switch (mode) {
    case 'row':
    case 'stack': {
      // Grow the glyphs to fill the usable area, then use exactly the requested
      // clearance between them and centre the whole run. Spreading the leftover
      // space as extra gaps would silently violate the clearance setting the
      // user asked for, so the slack goes into a slightly larger scale instead
      // (capped so the cross axis still fits).
      const primary = mode === 'row' ? ws : hs;
      const total = primary.reduce((a, b) => a + b, 0);
      const primaryAvail = mode === 'row' ? usableW : usableH;
      const crossAvail = mode === 'row' ? usableH : usableW;
      const crossMax = mode === 'row' ? Math.max(...hs) : Math.max(...ws);
      const fitPrimary = (primaryAvail - clearance * (n - 1)) / total;
      const fitCross = crossAvail / Math.max(1e-3, crossMax);
      scale = Math.max(0.2, Math.min(1.6, fitPrimary, fitCross));
      const gap = clearance;
      const runLen = total * scale + gap * (n - 1);
      const startPrimary = (mode === 'row' ? card.w : card.h) / 2 - runLen / 2;
      let cursor = startPrimary;
      for (let i = 0; i < n; i++) {
        const extent = primary[i] * scale;
        const centre = cursor + extent / 2;
        if (mode === 'row') {
          positions.set(glyphs[i].id, {
            x: centre,
            y: card.h / 2 - ((local[i].y0 + local[i].y1) / 2) * scale,
          });
        } else {
          positions.set(glyphs[i].id, {
            x: card.w / 2 - ((local[i].x0 + local[i].x1) / 2) * scale,
            y: centre,
          });
        }
        cursor += extent + gap;
      }
      break;
    }
    case 'triangle': {
      scale = scaleFor(2, 2);
      const gap = Math.max(clearance, usableW * 0.06);
      const rowW = (ws[0] + ws[1]) * scale + gap;
      const topY = card.h / 2 - ((hs[0] * scale) / 2 + gap / 2 + (hs[2] * scale) / 2) * (card.h / usableH);
      const y1 = card.h / 2 + (card.h / usableH) * ((hs[0] * scale) / 2 + gap / 2 + (hs[2] * scale) / 2) / 2;
      void topY;
      const yTop = card.h / 2 - Math.min(card.h * 0.16, usableH * 0.17);
      const yBottom = card.h / 2 + Math.min(card.h * 0.18, usableH * 0.19);
      let x = card.w / 2 - rowW / 2;
      for (let i = 0; i < 2; i++) {
        positions.set(glyphs[i].id, {
          x: x + (ws[i] * scale) / 2,
          y: yTop - ((local[i].y0 + local[i].y1) / 2) * scale,
        });
        x += ws[i] * scale + gap;
      }
      positions.set(glyphs[2].id, {
        x: card.w / 2,
        y: yBottom - ((local[2].y0 + local[2].y1) / 2) * scale,
      });
      void y1;
      break;
    }
    default: {
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      scale = scaleFor(cols, rows);
      const cellW = usableW / cols;
      const cellH = usableH / rows;
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols);
        const inRow = Math.min(cols, n - r * cols);
        const c = i - r * cols;
        const offset = (cols - inRow) / 2;
        positions.set(glyphs[i].id, {
          x: margin + (c + offset + 0.5) * cellW,
          y: margin + (r + 0.5) * cellH - ((local[i].y0 + local[i].y1) / 2) * scale,
        });
      }
      break;
    }
  }

  // Relaxation: satisfy the requested clearance using the real contour fields.
  const placed = glyphs.map((g) => {
    const p = positions.get(g.id)!;
    return { ...g, x: p.x, y: p.y, size: g.size * scale };
  });
  // Fit the whole run inside the card first: the coarse pass sizes glyphs by
  // their local ink height, which ignores the per-glyph vertical asymmetry and
  // can leave the last one hanging off the edge.
  {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of placed) {
      const b = elementBounds(g);
      if (!Number.isFinite(b.x0)) continue;
      x0 = Math.min(x0, b.x0);
      y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1);
      y1 = Math.max(y1, b.y1);
    }
    if (Number.isFinite(x0)) {
      const pad = Math.min(card.w, card.h) * 0.07;
      const availW = card.w - pad * 2;
      const availH = card.h - pad * 2;
      const runW = x1 - x0;
      const runH = y1 - y0;
      const fit = Math.min(1, availW / Math.max(1e-3, runW), availH / Math.max(1e-3, runH));
      if (fit < 0.999) {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        for (const g of placed) {
          g.x = cx + (g.x - cx) * fit;
          g.y = cy + (g.y - cy) * fit;
          g.size *= fit;
        }
      }
    }
    for (const g of placed) positions.set(g.id, { x: g.x, y: g.y });
  }

  if (n > 1 && clearance > 0) {
    for (let iter = 0; iter < 6; iter++) {
      let worst = Infinity;
      let moved = false;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const gap = contourGap(placed[i], placed[j]);
          worst = Math.min(worst, gap);
          const deficit = clearance - gap;
          if (deficit <= 0.01) continue;
          let dx = placed[j].x - placed[i].x;
          let dy = placed[j].y - placed[i].y;
          const l = Math.hypot(dx, dy) || 1;
          dx /= l;
          dy /= l;
          const push = Math.min(deficit * 0.5 + 0.005, 3);
          placed[i].x -= dx * push;
          placed[i].y -= dy * push;
          placed[j].x += dx * push;
          placed[j].y += dy * push;
          moved = true;
        }
      }
      // Keep everything inside the card margin.
      for (const g of placed) {
        const b = elementBounds(g);
        if (!Number.isFinite(b.x0)) continue;
        const pad = Math.min(card.w, card.h) * 0.045;
        if (b.x0 < pad) g.x += pad - b.x0;
        if (b.x1 > card.w - pad) g.x -= b.x1 - (card.w - pad);
        if (b.y0 < pad) g.y += pad - b.y0;
        if (b.y1 > card.h - pad) g.y -= b.y1 - (card.h - pad);
      }
      if (!moved) break;
    }
    for (const g of placed) positions.set(g.id, { x: g.x, y: g.y });
  }

  let minGap = Infinity;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      minGap = Math.min(minGap, contourGap(placed[i], placed[j]));
    }
  }

  if (card.style.opticalCenter) recenter(glyphs, positions, card, scale);
  // Effective uniform scale: the base scale times any fit shrink applied above.
  let effectiveScale = scale;
  if (placed.length > 0 && glyphs.length > 0) {
    const firstGlyph = glyphs[0];
    const firstPlaced = placed.find((p) => p.id === firstGlyph.id);
    if (firstPlaced && firstGlyph.size > 1e-6) effectiveScale = firstPlaced.size / firstGlyph.size;
  }
  return { positions, sizeScale: effectiveScale, minGap, mode };
}

/** Shifts the group so the ink bounding box is centred on the card. */
function recenter(
  glyphs: GlyphElement[],
  positions: Map<string, { x: number; y: number }>,
  card: Card,
  scale: number,
): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of glyphs) {
    const p = positions.get(g.id);
    if (!p) continue;
    const b = elementBounds({ ...g, x: p.x, y: p.y, size: g.size * scale });
    if (!Number.isFinite(b.x0)) continue;
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  if (!Number.isFinite(x0)) return;
  const dx = card.w / 2 - (x0 + x1) / 2;
  const dy = card.h / 2 - (y0 + y1) / 2;
  for (const g of glyphs) {
    const p = positions.get(g.id);
    if (p) positions.set(g.id, { x: p.x + dx, y: p.y + dy });
  }
}

/** Clears overlaps between arbitrary ink elements by pushing them apart. */
export function resolveOverlaps(els: Element[], clearance: number, iterations = 10): number {
  const ink = els.filter((e) => e.type === 'glyph' || !e.behind);
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < ink.length; i++) {
      for (let j = i + 1; j < ink.length; j++) {
        const a = ink[i], b = ink[j];
        const gap = contourGap(a, b);
        if (gap >= clearance) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        const push = Math.min((clearance - gap) / 2 + 0.01, 4);
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  let best = Infinity;
  for (let i = 0; i < ink.length; i++) {
    for (let j = i + 1; j < ink.length; j++) best = Math.min(best, contourGap(ink[i], ink[j]));
  }
  return best;
}
