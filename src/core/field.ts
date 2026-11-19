/**
 * Analytic signed distance fields.
 *
 * Sign convention: negative inside, positive outside, in card units (mm).
 * Every field can be evaluated at any point (as many times as needed) and
 * exposes a gradient so contour vertices can be projected onto the exact
 * iso-line instead of being limited by the sampling grid.
 */

import { smin } from './math';
import type { Ring } from './flatten';

export interface Gradient {
  x: number;
  y: number;
}

export interface Field {
  value(x: number, y: number): number;
  gradient(x: number, y: number, out: Gradient): void;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Central differences for fields without a closed-form gradient. */
export function numericGradient(f: (x: number, y: number) => number, eps: number) {
  return (x: number, y: number, out: Gradient): void => {
    const gx = (f(x + eps, y) - f(x - eps, y)) / (2 * eps);
    const gy = (f(x, y + eps) - f(x, y - eps)) / (2 * eps);
    const l = Math.hypot(gx, gy);
    if (l < 1e-9) {
      out.x = 1;
      out.y = 0;
    } else {
      out.x = gx / l;
      out.y = gy / l;
    }
  };
}

export function circleField(cx: number, cy: number, r: number): Field {
  return {
    bbox: { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r },
    value: (x, y) => Math.hypot(x - cx, y - cy) - r,
    gradient: (x, y, out) => {
      const dx = x - cx;
      const dy = y - cy;
      const l = Math.hypot(dx, dy) || 1;
      out.x = dx / l;
      out.y = dy / l;
    },
  };
}

/** Rounded box centred at (cx,cy) with half extents (hw,hh). */
export function roundedBoxField(cx: number, cy: number, hw: number, hh: number, r0: number): Field {
  const r = Math.max(0, Math.min(r0, Math.min(hw, hh)));
  const ix = hw - r;
  const iy = hh - r;
  const value = (x: number, y: number): number => {
    const qx = Math.abs(x - cx) - ix;
    const qy = Math.abs(y - cy) - iy;
    const ox = qx > 0 ? qx : 0;
    const oy = qy > 0 ? qy : 0;
    const inside = Math.min(Math.max(qx, qy), 0);
    return Math.hypot(ox, oy) + inside - r;
  };
  return {
    bbox: { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh },
    value,
    gradient: (x, y, out) => {
      // Numerically stable: the SDF is piecewise smooth and locally Lipschitz.
      const e = Math.max(1e-4, Math.max(hw, hh) * 1e-4);
      const gx = value(x + e, y) - value(x - e, y);
      const gy = value(x, y + e) - value(x, y - e);
      const l = Math.hypot(gx, gy);
      if (l < 1e-12) {
        out.x = 0;
        out.y = 0;
      } else {
        out.x = gx / l;
        out.y = gy / l;
      }
    },
  };
}

export function ringField(cx: number, cy: number, rOuter: number, thickness: number): Field {
  const rInner = Math.max(0, rOuter - thickness);
  return {
    bbox: { x0: cx - rOuter, y0: cy - rOuter, x1: cx + rOuter, y1: cy + rOuter },
    value: (x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      // Distance to the annulus: negative inside the ring band.
      return Math.max(rInner - d, d - rOuter);
    },
    gradient: (x, y, out) => {
      const dx = x - cx;
      const dy = y - cy;
      const l = Math.hypot(dx, dy) || 1;
      const d = l;
      out.x = d < (rInner + rOuter) / 2 ? -dx / l : dx / l;
      out.y = d < (rInner + rOuter) / 2 ? -dy / l : dy / l;
    },
  };
}

/** Polygon field with a bucketed nearest-edge search and a scanline winding count. */
export class PolygonField implements Field {
  readonly bbox: { x0: number; y0: number; x1: number; y1: number };
  private readonly edges: Float64Array;
  private readonly cell: number;
  private readonly nx: number;
  private readonly ny: number;
  private readonly heads: Int32Array;
  private readonly next: Int32Array;
  private readonly nodeEdge: Int32Array;
  private readonly near = { d: 0, ux: 1, uy: 0 };

  constructor(rings: readonly Ring[]) {
    let n = 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) {
      n += r.length / 2;
      for (let i = 0; i < r.length; i += 2) {
        const x = r[i], y = r[i + 1];
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
    if (!(n > 0)) {
      x0 = y0 = 0;
      x1 = y1 = 1;
      n = 0;
    }
    this.bbox = { x0, y0, x1, y1 };
    const edges = new Float64Array(n * 4);
    let k = 0;
    for (const r of rings) {
      const m = r.length / 2;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        edges[k++] = r[i * 2];
        edges[k++] = r[i * 2 + 1];
        edges[k++] = r[j * 2];
        edges[k++] = r[j * 2 + 1];
      }
    }
    this.edges = edges;

    const w = Math.max(1e-9, x1 - x0);
    const h = Math.max(1e-9, y1 - y0);
    this.cell = Math.max(1e-6, Math.max(w, h) / 48);
    this.nx = Math.max(1, Math.min(1024, Math.ceil(w / this.cell) + 1));
    this.ny = Math.max(1, Math.min(1024, Math.ceil(h / this.cell) + 1));
    this.heads = new Int32Array(this.nx * this.ny).fill(-1);
    // An edge that spans several cells is inserted once per cell, so the link
    // nodes are allocated per insertion rather than per edge.
    let insertions = 0;
    for (let e = 0; e < n; e++) {
      const cx0 = this.cellX(Math.min(edges[e * 4], edges[e * 4 + 2]));
      const cx1 = this.cellX(Math.max(edges[e * 4], edges[e * 4 + 2]));
      const cy0 = this.cellY(Math.min(edges[e * 4 + 1], edges[e * 4 + 3]));
      const cy1 = this.cellY(Math.max(edges[e * 4 + 1], edges[e * 4 + 3]));
      insertions += (cx1 - cx0 + 1) * (cy1 - cy0 + 1);
    }
    this.nodeEdge = new Int32Array(insertions);
    this.next = new Int32Array(insertions);
    let node = 0;
    for (let e = 0; e < n; e++) {
      const cx0 = this.cellX(Math.min(edges[e * 4], edges[e * 4 + 2]));
      const cx1 = this.cellX(Math.max(edges[e * 4], edges[e * 4 + 2]));
      const cy0 = this.cellY(Math.min(edges[e * 4 + 1], edges[e * 4 + 3]));
      const cy1 = this.cellY(Math.max(edges[e * 4 + 1], edges[e * 4 + 3]));
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cxi = cx0; cxi <= cx1; cxi++) {
          const c = cy * this.nx + cxi;
          this.nodeEdge[node] = e;
          this.next[node] = this.heads[c];
          this.heads[c] = node;
          node++;
        }
      }
    }
  }

  private cellX(x: number): number {
    const i = Math.floor((x - this.bbox.x0) / this.cell);
    return i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i;
  }

  private cellY(y: number): number {
    const i = Math.floor((y - this.bbox.y0) / this.cell);
    return i < 0 ? 0 : i >= this.ny ? this.ny - 1 : i;
  }

  private nearest(x: number, y: number): void {
    const e = this.edges;
    // For a handful of edges a linear scan beats walking the bucket rings.
    const edgeTotal = e.length / 4;
    if (edgeTotal <= 48) {
      let best = Infinity;
      let bux = 1, buy = 0;
      for (let i = 0; i < edgeTotal; i++) {
        const o = i * 4;
        const px = e[o], py = e[o + 1], qx = e[o + 2], qy = e[o + 3];
        const dx = qx - px, dy = qy - py;
        const ll = dx * dx + dy * dy;
        let t = ll > 0 ? ((x - px) * dx + (y - py) * dy) / ll : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const vx = px + t * dx - x;
        const vy = py + t * dy - y;
        const d2 = vx * vx + vy * vy;
        if (d2 < best) {
          best = d2;
          const d = Math.sqrt(d2);
          if (d > 1e-12) {
            bux = vx / d;
            buy = vy / d;
          }
        }
      }
      this.near.d = Math.sqrt(best);
      this.near.ux = bux;
      this.near.uy = buy;
      return;
    }
    const cx = this.cellX(x);
    const cy = this.cellY(y);
    let best = Infinity;
    let bux = 1, buy = 0;
    const maxRing = Math.max(this.nx, this.ny);
    for (let ring = 0; ring < maxRing; ring++) {
      const ax = cx - ring, bx = cx + ring;
      const ay = cy - ring, by = cy + ring;
      for (let gy = ay; gy <= by; gy++) {
        if (gy < 0 || gy >= this.ny) continue;
        const edgeRow = gy !== ay && gy !== by;
        const gx0 = edgeRow ? 0 : 0;
        void gx0;
        for (let gx = ax; gx <= bx; gx++) {
          if (gx < 0 || gx >= this.nx) continue;
          if (ring > 0 && edgeRow && gx !== ax && gx !== bx) continue;
          let node = this.heads[gy * this.nx + gx];
          while (node !== -1) {
            const o = this.nodeEdge[node] * 4;
            const px = e[o], py = e[o + 1], qx = e[o + 2], qy = e[o + 3];
            const dx = qx - px, dy = qy - py;
            const ll = dx * dx + dy * dy;
            let t = ll > 0 ? ((x - px) * dx + (y - py) * dy) / ll : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const vx = px + t * dx - x;
            const vy = py + t * dy - y;
            const d2 = vx * vx + vy * vy;
            if (d2 < best) {
              best = d2;
              const d = Math.sqrt(d2);
              if (d > 1e-12) {
                bux = vx / d;
                buy = vy / d;
              }
            }
            node = this.next[node];
          }
        }
      }
      // Any cell outside the searched square lies at least `ring * cell` away,
      // so once the best hit is closer than that nothing further can win.
      if (ring > 0 && best <= this.cell * this.cell * ring * ring) break;
    }
    this.near.d = Math.sqrt(best);
    this.near.ux = bux;
    this.near.uy = buy;
  }

  /** Scanline winding (nonzero rule) at a point. */
  winding(x: number, y: number): number {
    const e = this.edges;
    let w = 0;
    for (let i = 0, n = e.length / 4; i < n; i++) {
      const o = i * 4;
      const y0 = e[o + 1], y1 = e[o + 3];
      if (y0 <= y === y1 <= y) continue;
      const x0 = e[o], x1 = e[o + 2];
      const xint = x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
      if (xint > x) w += y1 > y0 ? 1 : -1;
    }
    return w;
  }

  value(x: number, y: number): number {
    this.nearest(x, y);
    const d = this.near.d;
    if (d < 1e-9) return 0;
    return this.winding(x, y) !== 0 ? -d : d;
  }

  gradient(x: number, y: number, out: Gradient): void {
    this.nearest(x, y);
    // `near` points from the query point towards the nearest surface point.
    // Outside, the SDF increases away from the surface; inside it increases
    // towards the surface. Hence the flip outside and the passthrough inside.
    const inside = this.winding(x, y) !== 0;
    out.x = inside ? this.near.ux : -this.near.ux;
    out.y = inside ? this.near.uy : -this.near.uy;
  }

  /**
   * Exact row sampling on a grid: values[j*w+i] = -sdf(world x0+i*step, ...).
   * Uses one crossing scan per row instead of a winding query per cell.
   */
  sampleGrid(x0: number, y0: number, w: number, h: number, step: number, values: Float32Array): void {
    const e = this.edges;
    const edgeCount = e.length / 4;
    const xs: number[] = [];
    for (let j = 0; j < h; j++) {
      const y = y0 + j * step;
      xs.length = 0;
      for (let i = 0; i < edgeCount; i++) {
        const o = i * 4;
        const ay = e[o + 1], by = e[o + 3];
        if (ay <= y === by <= y) continue;
        const ax = e[o], bx = e[o + 2];
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      let ptr = 0;
      const row = j * w;
      for (let i = 0; i < w; i++) {
        const x = x0 + i * step;
        while (ptr < xs.length && xs[ptr] <= x) ptr++;
        this.nearest(x, y);
        values[row + i] = (xs.length - ptr) % 2 === 1 ? this.near.d : -this.near.d;
      }
    }
  }
}

/** Smooth union: closes the gap between nearby shapes. `k` is the blend radius. */
export function unionField(fields: readonly Field[], k: number): Field {
  if (fields.length === 1) return fields[0];
  const value = (x: number, y: number): number => {
    let d = fields[0].value(x, y);
    for (let i = 1; i < fields.length; i++) d = smin(d, fields[i].value(x, y), k);
    return d;
  };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of fields) {
    x0 = Math.min(x0, f.bbox.x0);
    y0 = Math.min(y0, f.bbox.y0);
    x1 = Math.max(x1, f.bbox.x1);
    y1 = Math.max(y1, f.bbox.y1);
  }
  const pad = Math.max(k, 1) * 0.5;
  return {
    bbox: { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad },
    value,
    gradient: numericGradient(value, Math.max(0.01, k * 0.02)),
  };
}

/** Star polygon (unit-size aware: rOuter drives the extent). */
export function starField(cx: number, cy: number, rOuter: number, rInner: number, points: number, rot = 0): Field {
  const n = Math.max(3, Math.round(points)) * 2;
  const ring: Ring = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    ring[i * 2] = cx + Math.cos(a) * r;
    ring[i * 2 + 1] = cy + Math.sin(a) * r;
  }
  return new PolygonField([ring]);
}

export function heartField(cx: number, cy: number, size: number): Field {
  const n = 180;
  const ring: Ring = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    ring[i * 2] = cx + (hx / 17) * size;
    ring[i * 2 + 1] = cy - (hy / 17) * size;
  }
  return new PolygonField([ring]);
}

export function polygonFieldFromPoints(pts: ReadonlyArray<readonly [number, number]>): Field {
  const ring = new Float64Array(pts.length * 2);
  pts.forEach((p, i) => {
    ring[i * 2] = p[0];
    ring[i * 2 + 1] = p[1];
  });
  return new PolygonField([ring]);
}

/** Superellipse (squircle) polygon. */
export function squircleField(cx: number, cy: number, half: number, exponent = 4): Field {
  const n = 160;
  const ring: Ring = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const p = 2 / exponent;
    ring[i * 2] = cx + Math.sign(c) * Math.pow(Math.abs(c), p) * half;
    ring[i * 2 + 1] = cy + Math.sign(s) * Math.pow(Math.abs(s), p) * half;
  }
  return new PolygonField([ring]);
}

