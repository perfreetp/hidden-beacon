// 2D 多边形几何工具:吸附、闭合、倒角/圆角、缩放、包围盒

export const GRID_STEP = 0.5;

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function snapGrid(p, step = GRID_STEP) {
  return {
    x: Math.round(p.x / step) * step,
    y: Math.round(p.y / step) * step,
  };
}

// 删除近共线的点(闭合多边形,环绕处理)
export function simplifyCollinear(points, eps = 0.02) {
  const pts = points.map((p) => ({ ...p }));
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < eps) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

export function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function ensureCCW(pts) {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts.slice();
}

// 对尖角应用倒角(chamfer)或圆角(fillet),radius 为网格单位
export function applyCorners(points, mode, radius) {
  const copy = points.map((p) => ({ ...p }));
  if ((mode !== 'chamfer' && mode !== 'fillet') || radius <= 0.02 || copy.length < 3) {
    return copy;
  }
  const n = copy.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = copy[(i - 1 + n) % n];
    const p1 = copy[i];
    const p2 = copy[(i + 1) % n];
    const e1 = Math.hypot(p0.x - p1.x, p0.y - p1.y);
    const e2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (e1 < 1e-6 || e2 < 1e-6) continue;
    const v1 = { x: (p0.x - p1.x) / e1, y: (p0.y - p1.y) / e1 };
    const v2 = { x: (p2.x - p1.x) / e2, y: (p2.y - p1.y) / e2 };
    const dot = Math.min(1, Math.max(-1, v1.x * v2.x + v1.y * v2.y));
    const A = Math.acos(dot); // π 表示接近直线
    if (Math.PI - A < 0.12) {
      out.push({ ...p1 });
      continue;
    }
    const halfA = A / 2;
    if (mode === 'chamfer') {
      const d = Math.min(radius, e1 * 0.45, e2 * 0.45);
      out.push({ x: p1.x + v1.x * d, y: p1.y + v1.y * d });
      out.push({ x: p1.x + v2.x * d, y: p1.y + v2.y * d });
    } else {
      const tanH = Math.tan(halfA);
      const t = Math.min(radius / tanH, e1 * 0.45, e2 * 0.45);
      const r = t * tanH;
      const q1 = { x: p1.x + v1.x * t, y: p1.y + v1.y * t };
      const q2 = { x: p1.x + v2.x * t, y: p1.y + v2.y * t };
      const sinH = Math.sin(halfA);
      let bx = v1.x + v2.x;
      let by = v1.y + v2.y;
      const bl = Math.hypot(bx, by);
      if (bl < 1e-6 || sinH < 1e-3) {
        out.push(q1, q2);
        continue;
      }
      bx /= bl;
      by /= bl;
      const c = { x: p1.x + bx * (r / sinH), y: p1.y + by * (r / sinH) };
      const a1 = Math.atan2(q1.y - c.y, q1.x - c.x);
      const a2 = Math.atan2(q2.y - c.y, q2.x - c.x);
      const am = Math.atan2(-by, -bx); // 圆弧中点方向(朝顶点一侧鼓出)
      let sweep = a2 - a1;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      let m = am - a1;
      while (m > Math.PI) m -= 2 * Math.PI;
      while (m < -Math.PI) m += 2 * Math.PI;
      if (m < 0 !== sweep < 0 || Math.abs(m) > Math.abs(sweep)) {
        sweep += sweep > 0 ? -2 * Math.PI : 2 * Math.PI;
      }
      const SEG = 6;
      for (let k = 0; k <= SEG; k++) {
        const a = a1 + (sweep * k) / SEG;
        out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
      }
    }
  }
  return out.length >= 3 ? out : copy;
}

export function bbox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// 按标注尺寸缩放多边形(以包围盒最小角为基准)
export function scalePointsTo(points, dim, value) {
  const b = bbox(points);
  const pts = points.map((p) => ({ ...p }));
  if (dim === 'w' && b.w > 1e-6) {
    const s = value / b.w;
    for (const p of pts) p.x = b.minX + (p.x - b.minX) * s;
  } else if (dim === 'h' && b.h > 1e-6) {
    const s = value / b.h;
    for (const p of pts) p.y = b.minY + (p.y - b.minY) * s;
  }
  return pts;
}
