/**
 * Iso-contour extraction from a scalar field.
 *
 * The scalar field is sampled on a regular grid (values[i] = -sdf, so inside is
 * positive, matching d3-contour's "area above threshold" convention). Marching
 * squares gives the topology; every vertex is then projected onto the exact
 * analytic iso-line so the final vector is not limited by the grid resolution.
 */

import { contours as d3contours } from 'd3-contour';

/** Ring in card units, closed implicitly. */
export type Ring = Float64Array;

export interface Grid {
  values: Float32Array;
  w: number;
  h: number;
  x0: number;
  y0: number;
  step: number;
}

export function makeGrid(w: number, h: number, x0: number, y0: number, step: number): Grid {
  return { values: new Float32Array(w * h), w, h, x0, y0, step };
}

/**
 * Extract every ring of the region `field >= level`.
 * The returned rings are all in card coordinates and are meant to be filled
 * with the even-odd rule (outer rings and holes alike).
 */
export function extractRings(grid: Grid, level: number): Ring[] {
  const { values, w, h, x0, y0, step } = grid;
  const result = d3contours()
    .size([w, h])
    .smooth(false)
    .thresholds([level])(values as unknown as number[]);
  if (result.length === 0) return [];

  const rings: Ring[] = [];
  for (const multi of result) {
    for (const polygon of multi.coordinates) {
      for (const ring of polygon) {
        const n = ring.length;
        if (n < 4) continue;
        // d3-contour repeats the first point at the end.
        const closed = ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1];
        const count = closed ? n - 1 : n;
        if (count < 3) continue;
        const out = new Float64Array(count * 2);
        let area = 0;
        for (let i = 0; i < count; i++) {
          const x = x0 + ring[i][0] * step;
          const y = y0 + ring[i][1] * step;
          out[i * 2] = x;
          out[i * 2 + 1] = y;
          const j = (i + 1) % count;
          const nx = x0 + ring[j][0] * step;
          const ny = y0 + ring[j][1] * step;
          area += x * ny - nx * y;
        }
        // Drop slivers smaller than a fifth of a cell.
        if (Math.abs(area) * 0.5 < step * step * 0.2) continue;
        rings.push(out);
      }
    }
  }
  return rings;
}

export interface FieldProbe {
  /** Value of the field (same sign convention as the sampled grid). */
  value: number;
  /** Unit gradient of the *signed distance* (points from inside to outside). */
  gx: number;
  gy: number;
}

/**
 * Projects each vertex onto the exact `value === level` iso-line with damped
 * Newton steps along the field gradient.
 */
export function projectRings(
  rings: readonly Ring[],
  probe: (x: number, y: number) => FieldProbe,
  level: number,
  epsilon: number,
  iterations = 2,
): Ring[] {
  const out: Ring[] = [];
  for (const ring of rings) {
    const r = new Float64Array(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      let x = ring[i];
      let y = ring[i + 1];
      for (let it = 0; it < iterations; it++) {
        const p = probe(x, y);
        const diff = level - p.value;
        if (Math.abs(diff) < 1e-4) break;
        const step = Math.max(-epsilon * 2, Math.min(epsilon * 2, diff));
        x += p.gx * step;
        y += p.gy * step;
      }
      r[i] = x;
      r[i + 1] = y;
    }
    out.push(r);
  }
  return out;
}

/** Ramer–Douglas–Peucker on an open polyline, appended into `out`. */
function rdp(pts: number[], first: number, last: number, tol: number, keep: Uint8Array): void {
  const stack: number[] = [first, last];
  while (stack.length) {
    const b = stack.pop() as number;
    const a = stack.pop() as number;
    if (b - a < 2) continue;
    const ax = pts[a * 2], ay = pts[a * 2 + 1];
    const bx = pts[b * 2], by = pts[b * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const ll = dx * dx + dy * dy;
    let maxD = -1;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2], py = pts[i * 2 + 1];
      let t = ll > 0 ? ((px - ax) * dx + (py - ay) * dy) / ll : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxI > 0 && maxD > tol * tol) {
      keep[maxI] = 1;
      stack.push(a, maxI, maxI, b);
    }
  }
}

/** Simplifies a closed ring, preserving its shape within `tol`. */
export function simplifyRing(ring: Ring, tol: number): Ring {
  const n = ring.length / 2;
  if (n < 8) return ring;
  const pts = Array.from(ring);
  // Split the loop at the vertex farthest from vertex 0.
  let far = 0;
  let best = -1;
  const ax = pts[0], ay = pts[1];
  for (let i = 1; i < n; i++) {
    const d = (pts[i * 2] - ax) ** 2 + (pts[i * 2 + 1] - ay) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  rdp(pts, 0, far, tol, keep);
  // Second half: rotate so the segment far→0 is contiguous.
  const rot = pts.slice(far * 2).concat(pts.slice(0, far * 2));
  const n2 = n - far;
  const keep2 = new Uint8Array(n);
  rdp(rot, 0, n2, tol, keep2);
  for (let i = 0; i < n2; i++) if (keep2[i]) keep[(far + i) % n] = 1;

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  }
  return out.length >= 6 ? Float64Array.from(out) : ring;
}

export interface SmoothOptions {
  /** Turning angle (degrees) above which a vertex is treated as a sharp corner. */
  cornerAngle?: number;
  /** 0 = polyline, 1 = full Catmull-Rom smoothing. */
  tension?: number;
}

/** Drops vertices that are closer together than `minLen`. */
export function dedupeRing(ring: Ring, minLen: number): Ring {
  const n = ring.length / 2;
  if (n < 3) return ring;
  const out: number[] = [ring[0], ring[1]];
  for (let i = 1; i < n; i++) {
    const x = ring[i * 2], y = ring[i * 2 + 1];
    const lx = out[out.length - 2], ly = out[out.length - 1];
    if (Math.hypot(x - lx, y - ly) >= minLen) out.push(x, y);
  }
  while (out.length > 4) {
    const x = out[out.length - 2], y = out[out.length - 1];
    if (Math.hypot(x - out[0], y - out[1]) < minLen) out.length -= 2;
    else break;
  }
  return out.length >= 6 ? Float64Array.from(out) : ring;
}

/**
 * Builds a closed smooth path.
 *
 * Tangents are Catmull-Rom (direction from the previous vertex to the next),
 * with half-length capped at a third of the shorter incident segment, and each
 * Bézier segment independently bounded by its own length. A segment therefore
 * cannot leave the quad formed by its endpoints and their neighbours' tangent
 * boxes, so a long straight edge can never bulge outwards. Sharp turns (above
 * `cornerAngle`) get zero-length handles on that side, keeping glyph corners
 * crisp.
 */
export function ringToPath(ring: Ring, opts: SmoothOptions = {}): string {
  const n = ring.length / 2;
  if (n < 3) return '';
  const cornerCos = Math.cos(((opts.cornerAngle ?? 58) * Math.PI) / 180);
  const tension = opts.tension ?? 1;
  const f = (v: number) => Math.round(v * 1000) / 1000;

  const segLen = new Float64Array(n); // segment i → i+1
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    segLen[i] = Math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1]);
  }

  const corner = new Uint8Array(n);
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  const tl = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = ((i - 1 + n) % n) * 2;
    const c = i * 2;
    const q = ((i + 1) % n) * 2;
    let ax = ring[c] - ring[p], ay = ring[c + 1] - ring[p + 1];
    let bx = ring[q] - ring[c], by = ring[q + 1] - ring[c + 1];
    const la = Math.hypot(ax, ay) || 1;
    const lb = Math.hypot(bx, by) || 1;
    ax /= la; ay /= la; bx /= lb; by /= lb;
    if (ax * bx + ay * by < cornerCos) corner[i] = 1;
    // Catmull-Rom direction.
    const mx = ring[q] - ring[p];
    const my = ring[q + 1] - ring[p + 1];
    const ml = Math.hypot(mx, my);
    if (ml > 1e-12) {
      tx[i] = mx / ml;
      ty[i] = my / ml;
    }
    // Half-length: never more than a third of either incident segment, so the
    // handle cannot reach past the neighbouring vertex.
    tl[i] = Math.min(segLen[p / 2], segLen[i]) / 3;
    if (corner[i]) tl[i] = 0;
  }

  const parts: string[] = [`M${f(ring[0])} ${f(ring[1])}`];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const px = ring[i * 2], py = ring[i * 2 + 1];
    const qx = ring[j * 2], qy = ring[j * 2 + 1];
    const seg = segLen[i];
    if (seg < 1e-9) continue;
    if (corner[i] && corner[j]) {
      parts.push(`L${f(qx)} ${f(qy)}`);
      continue;
    }
    // Bound each handle by its own segment too, and keep both handles short.
    const hi = Math.min(tl[i], seg / 3) * tension;
    const hj = Math.min(tl[j], seg / 3) * tension;
    const c1x = px + tx[i] * hi;
    const c1y = py + ty[i] * hi;
    const c2x = qx - tx[j] * hj;
    const c2y = qy - ty[j] * hj;
    if (hi < 1e-6 && hj < 1e-6) {
      parts.push(`L${f(qx)} ${f(qy)}`);
      continue;
    }
    parts.push(`C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(qx)} ${f(qy)}`);
  }
  parts.push('Z');
  return parts.join('');
}

/** Path for a set of rings, filled with the even-odd rule. */
export function ringsToPath(rings: readonly Ring[], opts: SmoothOptions = {}, simplifyTol = 0): string {
  const chunks: string[] = [];
  for (const ring of rings) {
    const r = simplifyTol > 0 ? dedupeRing(simplifyRing(ring, simplifyTol), 1e-6) : ring;
    const d = ringToPath(r, opts);
    if (d) chunks.push(d);
  }
  return chunks.join('');
}
