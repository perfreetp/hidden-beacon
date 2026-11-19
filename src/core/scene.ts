/**
 * Scene assembly.
 *
 * Two layers of caching:
 *
 *  1. Geometry cache — every glyph or shape is contoured once at unit size
 *     (1 em for a glyph, 1 mm for a shape) and stored as rings. Because the
 *     field is analytic, the contour at any other size is the same rings scaled,
 *     so resizing never re-runs marching squares.
 *  2. Field cache — the same rings wrapped as a PolygonField, used by the
 *     distance-field layout solver and clearance checks.
 *
 * Effects (stroke, glow, shadow) are rendered by SVG from one path per element:
 * paint-order puts the stroke under the fill so only its outer half shows, a
 * Gaussian blur of the filled path makes the glow, and a blurred offset copy
 * makes the shadow. None of that rebuilds geometry.
 */

import {
  PolygonField, circleField, roundedBoxField, unionField, ringField, starField, heartField,
  squircleField, polygonFieldFromPoints, type Field, type Gradient,
} from './field';
import { extractRings, projectRings, simplifyRing, ringToPath, dedupeRing, type Ring } from './vectorize';
import { glyphRings } from './fonts';
import { mulberry32 } from './math';
import { transformRings, ringsBounds } from './flatten';
import type { Card, Element, ShapeId, Blob } from '../model/types';

/**
 * Working grid resolution for a unit-sized element. 220 cells across a 1 em box
 * gives ~0.0045 em per cell: fine enough that marching squares finds every
 * feature of a complex glyph, while the Newton projection afterwards removes
 * the residual grid error entirely.
 */
const WORK_RES = 220;

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const unitOutlines = new Map<string, Ring[]>();
const fields = new Map<string, PolygonField>();

/** Contour rings for a glyph at 1 em, centred on the em box. */
export async function glyphUnitRings(fontId: string, char: string): Promise<Ring[]> {
  const key = `g:${fontId}:${char}`;
  const hit = unitOutlines.get(key);
  if (hit) return hit;
  const base = await glyphRings(fontId, char);
  if (base.length === 0) {
    unitOutlines.set(key, []);
    return [];
  }
  const rings = contourRings(new PolygonField(base), 1);
  unitOutlines.set(key, rings);
  return rings;
}

/** Contour rings for a shape at 1 mm. */
export function shapeUnitRings(shape: ShapeId): Ring[] {
  const key = `s:${shape}`;
  const hit = unitOutlines.get(key);
  if (hit) return hit;
  const f = shapeUnitField(shape);
  const rings = contourRings(f, 1);
  unitOutlines.set(key, rings);
  return rings;
}

/** Unit-size field for a shape kind (size = 1). */
export function shapeUnitField(shape: ShapeId): Field {
  switch (shape) {
    case 'circle': return circleField(0, 0, 0.5);
    case 'ring': return ringField(0, 0, 0.5, 0.2);
    case 'star': return starField(0, 0, 0.5, 0.23, 5);
    case 'heart': return heartField(0, 0, 0.34);
    case 'triangle': {
      const pts: Array<[number, number]> = [0, 1, 2].map((i) => {
        const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
        return [Math.cos(a) * 0.58, Math.sin(a) * 0.58] as [number, number];
      });
      return polygonFieldFromPoints(pts);
    }
    case 'capsule': return roundedBoxField(0, 0, 0.5, 0.22, 0.22);
    case 'squircle': return squircleField(0, 0, 0.5, 4);
    case 'cloud':
      return unionField([
        circleField(-0.2, 0.06, 0.22),
        circleField(0.02, -0.06, 0.28),
        circleField(0.24, 0.04, 0.2),
        roundedBoxField(0, 0.14, 0.36, 0.12, 0.1),
      ], 0.08);
    case 'flower': {
      const parts: Field[] = [circleField(0, 0, 0.16)];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push(circleField(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.19));
      }
      return unionField(parts, 0.05);
    }
    default:
      return circleField(0, 0, 0.5);
  }
}

/** Field for an element in world (card) coordinates. */
export function elementField(el: Element): Field {
  if (el.type === 'shape') {
    const unit = shapeUnitField(el.shape);
    const s = el.size;
    const a = (el.rotation * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const cx = el.x, cy = el.y;
    return {
      bbox: {
        x0: cx - s * 0.6, y0: cy - s * 0.6, x1: cx + s * 0.6, y1: cy + s * 0.6,
      },
      value: (x, y) => {
        const dx = x - cx, dy = y - cy;
        return unit.value((dx * ca + dy * sa) / s, (-dx * sa + dy * ca) / s) * s;
      },
      gradient: (x, y, out) => {
        const dx = x - cx, dy = y - cy;
        const g = { x: 0, y: 0 } as Gradient;
        unit.gradient((dx * ca + dy * sa) / s, (-dx * sa + dy * ca) / s, g);
        out.x = (g.x * ca - g.y * sa);
        out.y = (g.x * sa + g.y * ca);
      },
    };
  }
  const key = `gf:${el.fontId}:${el.char}`;
  let poly = fields.get(key);
  if (!poly) {
    const rings = unitOutlines.get(`g:${el.fontId}:${el.char}`);
    poly = new PolygonField(rings && rings.length ? rings : []);
    fields.set(key, poly);
  }
  const s = el.size;
  const a = (el.tilt * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cx = el.x, cy = el.y;
  const p = poly;
  return {
    bbox: { x0: cx - s, y0: cy - s, x1: cx + s, y1: cy + s },
    value: (x, y) => {
      const dx = x - cx, dy = y - cy;
      return p.value((dx * ca + dy * sa) / s, (-dx * sa + dy * ca) / s) * s;
    },
    gradient: (x, y, out) => {
      const dx = x - cx, dy = y - cy;
      const g = { x: 0, y: 0 } as Gradient;
      p.gradient((dx * ca + dy * sa) / s, (-dx * sa + dy * ca) / s, g);
      out.x = g.x * ca - g.y * sa;
      out.y = g.x * sa + g.y * ca;
    },
  };
}

/** Synchronous world-space path for an element (geometry must already be cached). */
export function elementPath(el: Element): string {
  if (el.type === 'shape') {
    const rings = unitOutlines.get(`s:${el.shape}`);
    if (!rings || rings.length === 0) return '';
    return pathFor(rings, el.x, el.y, el.size, el.size, el.rotation);
  }
  const rings = unitOutlines.get(`g:${el.fontId}:${el.char}`);
  if (!rings || rings.length === 0) return '';
  return pathFor(rings, el.x, el.y, el.size, el.size, el.tilt);
}

function pathFor(rings: readonly Ring[], cx: number, cy: number, sx: number, sy: number, rotDeg: number): string {
  const a = (rotDeg * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const world = rings.map((r) => {
    const out = new Float64Array(r.length);
    for (let i = 0; i < r.length; i += 2) {
      const x = r[i] * sx, y = r[i + 1] * sy;
      out[i] = cx + x * ca - y * sa;
      out[i + 1] = cy + x * sa + y * ca;
    }
    return out;
  });
  const chunks: string[] = [];
  for (const r of world) {
    const d = ringToPath(dedupeRing(r, 1e-4), { cornerAngle: 62 });
    if (d) chunks.push(d);
  }
  return chunks.join('');
}

/** World-space outline rings for an element. */
export function elementRings(el: Element): Ring[] {
  const base = el.type === 'shape'
    ? unitOutlines.get(`s:${el.shape}`)
    : unitOutlines.get(`g:${el.fontId}:${el.char}`);
  if (!base || base.length === 0) return [];
  const scale = el.size;
  const rot = el.type === 'shape' ? el.rotation : el.tilt;
  const a = (rot * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const t = transformRings(base, { sx: scale, sy: scale, tx: 0, ty: 0 });
  return t.map((r) => {
    const out = new Float64Array(r.length);
    for (let i = 0; i < r.length; i += 2) {
      out[i] = el.x + r[i] * ca - r[i + 1] * sa;
      out[i + 1] = el.y + r[i] * sa + r[i + 1] * ca;
    }
    return out;
  });
}

export function elementBounds(el: Element): Bounds {
  const rings = elementRings(el);
  if (rings.length === 0) return { x0: el.x, y0: el.y, x1: el.x, y1: el.y };
  return ringsBounds(rings);
}

/** The paper blobs, fused, in card coordinates. */
export function backgroundField(bg: Card['bg'], w: number, h: number): Field {
  if (bg.pattern === 'plain' || bg.blobs.length === 0) {
    return roundedBoxField(w / 2, h / 2, w / 2, h / 2, Math.min(w, h) * 0.08);
  }
  const parts = bg.blobs.map((b: Blob) => roundedBoxField(b.x, b.y, b.w / 2, b.h / 2, b.r));
  return unionField(parts, bg.fusion);
}

const bgCache = new Map<string, { d: string; key: string }>();

/** Vector path for the fused background, cached on the parameters that affect it. */
export function backgroundPath(bg: Card['bg'], w: number, h: number): string {
  const key = JSON.stringify([bg.pattern, bg.fusion, bg.blobs.map((b) => [b.x, b.y, b.w, b.h, b.r])]);
  const hit = bgCache.get(`${w}x${h}`);
  if (hit && hit.key === key) return hit.d;
  const f = backgroundField(bg, w, h);
  const rings = contourRings(f, Math.max(w, h), 0.006);
  const chunks: string[] = [];
  for (const r of rings) {
    const d = ringToPath(r, { cornerAngle: 70 });
    if (d) chunks.push(d);
  }
  const d = chunks.join('');
  bgCache.set(`${w}x${h}`, { d, key });
  return d;
}

/**
 * Full contour pipeline: coarse exact sampling for topology, then Newton
 * projection of every vertex onto the exact iso-line, then RDP simplification.
 */
export function contourRings(field: Field, unit: number, simplifyFactor = 0.004): Ring[] {
  const pad = Math.max(unit * 0.06, 1e-3);
  const x0 = field.bbox.x0 - pad;
  const y0 = field.bbox.y0 - pad;
  const bw = Math.max(1e-6, field.bbox.x1 - field.bbox.x0 + pad * 2);
  const bh = Math.max(1e-6, field.bbox.y1 - field.bbox.y0 + pad * 2);
  const step = Math.max(bw, bh) / WORK_RES;
  const w = Math.ceil(bw / step) + 1;
  const h = Math.ceil(bh / step) + 1;
  const values = new Float32Array(w * h);
  if (field instanceof PolygonField) {
    field.sampleGrid(x0, y0, w, h, step, values);
  } else {
    for (let j = 0; j < h; j++) {
      const y = y0 + j * step;
      for (let i = 0; i < w; i++) values[j * w + i] = -field.value(x0 + i * step, y);
    }
  }
  const raw = extractRings({ values, w, h, x0, y0, step }, 0);
  const g: Gradient = { x: 1, y: 0 };
  // The grid stores -sdf, so the probe works on the negated field.
  const probe = (x: number, y: number) => {
    field.gradient(x, y, g);
    return { value: -field.value(x, y), gx: -g.x, gy: -g.y };
  };
  const projected = projectRings(raw, probe, 0, step * 0.6, 3);
  // Simplify well below the visible error threshold: at 220 cells an em is
  // ~0.0014 em of tolerance, i.e. 0.15 mm on a 100 mm glyph.
  const tol = Math.max(1e-5, step * simplifyFactor * 2);
  return projected.map((r) => dedupeRing(simplifyRing(r, tol), tol * 0.5));
}

/** Deterministic decorative dots for the paper. */
export function paperDots(w: number, h: number, seed: number, count: number): Array<{ x: number; y: number; r: number }> {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const out: Array<{ x: number; y: number; r: number }> = [];
  const margin = 7;
  for (let i = 0; i < count; i++) {
    out.push({ x: margin + rnd() * (w - margin * 2), y: margin + rnd() * (h - margin * 2), r: 0.4 + rnd() * 1.0 });
  }
  return out;
}

/**
 * Seeds the unit-outline cache directly. The browser fills it through
 * glyphUnitRings(); tests and workers can fill it from a parsed font.
 */
export function seedGlyphRings(fontId: string, char: string, rings: Ring[]): void {
  unitOutlines.set(`g:${fontId}:${char}`, rings);
}

export function seedShapeRings(shape: ShapeId, rings: Ring[]): void {
  unitOutlines.set(`s:${shape}`, rings);
}

export function clearSceneCaches(): void {
  unitOutlines.clear();
  fields.clear();
  bgCache.clear();
}
