/**
 * Flatten glyph outlines (from opentype.js path commands) into polygons.
 * Everything downstream works on straight segments, which keeps the signed
 * distance evaluation exact and cheap.
 */

export interface RawCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export type Ring = Float64Array; // [x0,y0,x1,y1,...]

const FLATNESS = 0.35; // font units

function quadTo(out: number[], x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, depth: number): void {
  // Flatness test: distance of control point from chord.
  const dx = x0 - 2 * cx + x1;
  const dy = y0 - 2 * cy + y1;
  if (depth > 16 || Math.hypot(dx, dy) * 0.25 < FLATNESS) {
    out.push(x1, y1);
    return;
  }
  const mx0 = (x0 + cx) * 0.5;
  const my0 = (y0 + cy) * 0.5;
  const mx1 = (cx + x1) * 0.5;
  const my1 = (cy + y1) * 0.5;
  const mx = (mx0 + mx1) * 0.5;
  const my = (my0 + my1) * 0.5;
  quadTo(out, x0, y0, mx0, my0, mx, my, depth + 1);
  quadTo(out, mx, my, mx1, my1, x1, y1, depth + 1);
}

function cubicTo(
  out: number[],
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  depth: number,
): void {
  const d1 = Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2);
  const d2 = Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3);
  if (depth > 16 || Math.max(d1, d2) * 0.75 < FLATNESS) {
    out.push(x3, y3);
    return;
  }
  const m01x = (x0 + x1) * 0.5, m01y = (y0 + y1) * 0.5;
  const m12x = (x1 + x2) * 0.5, m12y = (y1 + y2) * 0.5;
  const m23x = (x2 + x3) * 0.5, m23y = (y2 + y3) * 0.5;
  const a1x = (m01x + m12x) * 0.5, a1y = (m01y + m12y) * 0.5;
  const a2x = (m12x + m23x) * 0.5, a2y = (m12y + m23y) * 0.5;
  const bx = (a1x + a2x) * 0.5, by = (a1y + a2y) * 0.5;
  cubicTo(out, x0, y0, m01x, m01y, a1x, a1y, bx, by, depth + 1);
  cubicTo(out, bx, by, a2x, a2y, m23x, m23y, x3, y3, depth + 1);
}

export function flattenCommands(cmds: readonly RawCommand[]): Ring[] {
  const rings: Ring[] = [];
  let cur: number[] = [];
  let cx = 0, cy = 0;
  let sx = 0, sy = 0;

  const close = () => {
    if (cur.length >= 6) {
      // Drop duplicated closing point.
      const n = cur.length;
      if (Math.abs(cur[n - 2] - cur[0]) < 1e-9 && Math.abs(cur[n - 1] - cur[1]) < 1e-9) {
        cur.length = n - 2;
      }
      if (cur.length >= 6) rings.push(Float64Array.from(cur));
    }
    cur = [];
  };

  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        close();
        cx = c.x ?? 0; cy = c.y ?? 0;
        sx = cx; sy = cy;
        cur.push(cx, cy);
        break;
      case 'L':
        cx = c.x ?? cx; cy = c.y ?? cy;
        cur.push(cx, cy);
        break;
      case 'Q':
        quadTo(cur, cx, cy, c.x1 ?? cx, c.y1 ?? cy, c.x ?? cx, c.y ?? cy, 0);
        cx = c.x ?? cx; cy = c.y ?? cy;
        break;
      case 'C':
        cubicTo(cur, cx, cy, c.x1 ?? cx, c.y1 ?? cy, c.x2 ?? cx, c.y2 ?? cy, c.x ?? cx, c.y ?? cy, 0);
        cx = c.x ?? cx; cy = c.y ?? cy;
        break;
      case 'Z':
        if (cur.length >= 2) cur.push(sx, sy);
        close();
        cx = sx; cy = sy;
        break;
    }
  }
  close();
  return rings;
}

/** Oriented area (positive = counter-clockwise in y-down screen space means negative). */
export function ringArea(ring: Ring): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    a += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  }
  return a * 0.5;
}

export function ringBounds(ring: Ring): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    const x = ring[i], y = ring[i + 1];
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

export interface Transform { sx: number; sy: number; tx: number; ty: number }

export function transformRings(rings: readonly Ring[], t: Transform): Ring[] {
  return rings.map((r) => {
    const out = new Float64Array(r.length);
    for (let i = 0; i < r.length; i += 2) {
      out[i] = r[i] * t.sx + t.tx;
      out[i + 1] = r[i + 1] * t.sy + t.ty;
    }
    return out;
  });
}

export function ringsBounds(rings: readonly Ring[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) {
    const b = ringBounds(r);
    if (b.x0 < x0) x0 = b.x0;
    if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y1 > y1) y1 = b.y1;
  }
  return { x0, y0, x1, y1 };
}
