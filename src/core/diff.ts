/**
 * Version diffing.
 *
 * Two snapshots are compared through their ink coverage. Each card's glyph and
 * shape outlines are rasterised into a coverage mask, the masks are blurred a
 * touch to give smooth iso-lines, and the three regions are contoured back into
 * vector paths:
 *
 *   kept   — ink in both versions
 *   added  — ink only in the new version   (red)
 *   removed— ink only in the old version   (green)
 *
 * Because the comparison happens on coverage rather than on element ids, moving
 * a glyph by 2 mm shows up as a green crescent next to a red crescent — which is
 * exactly what a designer needs to see.
 */

import { elementRings } from './scene';
import { extractRings, ringToPath } from './vectorize';
import type { Card, Element } from '../model/types';

export interface DiffPaths {
  added: string;
  removed: string;
  kept: string;
  /** Coverage statistics, in percent of the card area. */
  stats: { added: number; removed: number; overlap: number };
}

/** Coverage samples per mm. Fine enough that a 1 mm stroke is ~6 px wide. */
const RES = 6;

function coverage(card: Card, w: number, h: number): Float32Array {
  const gw = Math.max(16, Math.round(w * RES));
  const gh = Math.max(16, Math.round(h * RES));
  const stepX = w / gw;
  const stepY = h / gh;
  const mask = new Float32Array(gw * gh);
  const ink: Element[] = card.elements.filter((e) => e.type === 'glyph' || !e.behind);
  for (const el of ink) {
    const rings = elementRings(el);
    if (rings.length === 0) continue;
    // Scanline fill into the coverage buffer, accumulating a union.
    const xs: number[] = [];
    for (let j = 0; j < gh; j++) {
      const y = (j + 0.5) * stepY;
      xs.length = 0;
      for (const r of rings) {
        const m = r.length / 2;
        for (let i = 0; i < m; i++) {
          const k = (i + 1) % m;
          const ay = r[i * 2 + 1], by = r[k * 2 + 1];
          if (ay <= y === by <= y) continue;
          const ax = r[i * 2], bx = r[k * 2];
          xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = xs[i], x1 = xs[i + 1];
        let c0 = Math.ceil(x0 / stepX - 0.5);
        let c1 = Math.floor(x1 / stepX - 0.5);
        if (c1 < 0 || c0 >= gw) continue;
        c0 = Math.max(0, c0);
        c1 = Math.min(gw - 1, c1);
        const row = j * gw;
        for (let c = c0; c <= c1; c++) mask[row + c] = 1;
      }
    }
  }
  // Blur radius in cells: about 1 mm of smoothing, independent of resolution.
  // ~1 mm of smoothing, resolution independent.
  return blur(mask, gw, gh, Math.max(1.5, RES * 0.5));
}

/**
 * Separable Gaussian blur. Blurs the coverage field so marching squares walks a
 * smooth iso-line instead of the jagged pixel boundary — the false-contour
 * "staircase" that a raw binary mask would produce.
 */
function blur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const sigma = radius / 2;
  const r = Math.max(1, Math.ceil(radius));
  const k = new Float64Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;

  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
        acc += src[row + xx] * k[i + r];
      }
      tmp[row + x] = acc;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
        acc += tmp[yy * w + x] * k[i + r];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

function pathsFrom(values: Float32Array, gw: number, gh: number, w: number, h: number): string {
  const stepX = w / gw;
  const stepY = h / gh;
  // Sample grid is anisotropic when the card is not square; feed d3 a square
  // grid by scaling y first, then scale back on output.
  const aspect = stepY / stepX;
  const scaled = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) scaled[j * gw + i] = values[j * gw + i];
  }
  const rings = extractRings({ values: scaled, w: gw, h: gh, x0: 0, y0: 0, step: stepX }, 0.5);
  const chunks: string[] = [];
  for (const r of rings) {
    const adj = new Float64Array(r.length);
    for (let i = 0; i < r.length; i += 2) {
      adj[i] = r[i];
      adj[i + 1] = r[i + 1] * aspect;
    }
    const d = ringToPath(adj, { cornerAngle: 85 });
    if (d) chunks.push(d);
  }
  return chunks.join('');
}

export function diffCards(oldCard: Card, newCard: Card, w: number, h: number): DiffPaths {
  const gw = Math.max(16, Math.round(w * RES));
  const gh = Math.max(16, Math.round(h * RES));
  const a = coverage(oldCard, w, h);
  const b = coverage(newCard, w, h);
  const kept = new Float32Array(gw * gh);
  const added = new Float32Array(gw * gh);
  const removed = new Float32Array(gw * gh);
  let onlyNew = 0, onlyOld = 0, both = 0;
  for (let i = 0; i < kept.length; i++) {
    const va = a[i] > 0.5;
    const vb = b[i] > 0.5;
    kept[i] = va && vb ? 1 : 0;
    added[i] = vb && !va ? 1 : 0;
    removed[i] = va && !vb ? 1 : 0;
    if (vb && !va) onlyNew++;
    if (va && !vb) onlyOld++;
    if (va && vb) both++;
  }
  const total = gw * gh;
  return {
    added: pathsFrom(added, gw, gh, w, h),
    removed: pathsFrom(removed, gw, gh, w, h),
    kept: pathsFrom(kept, gw, gh, w, h),
    stats: {
      added: (onlyNew / total) * 100,
      removed: (onlyOld / total) * 100,
      overlap: (both / total) * 100,
    },
  };
}
