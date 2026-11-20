// 应力锥回转体：轮廓曲线、车削网格、边界环与对称轴偏移检测
// 坐标约定：Y 轴为电缆轴向（对称轴），根部在 y=0，单位 mm

// 应力锥母线控制点 [y, r]（根部小径 -> 应力锥鼓包 -> 端部收束）
export const CONE_CTRL = [
  [0, 30], [6, 31], [12, 36], [20, 46], [30, 54],
  [42, 57], [55, 55], [70, 48], [85, 40], [100, 34], [112, 31], [120, 30]
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// 采样母线，返回 [{y, r}]，rows 个点
export function buildProfile(rows = 90, ctrl = CONE_CTRL) {
  const n = ctrl.length;
  const out = [];
  for (let i = 0; i < rows; i++) {
    const s = (i / (rows - 1)) * (n - 1);
    const k = Math.min(n - 2, Math.floor(s));
    const t = s - k;
    const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k];
    const p2 = ctrl[k + 1], p3 = ctrl[Math.min(n - 1, k + 2)];
    out.push({
      y: catmull(p0[0], p1[0], p2[0], p3[0], t),
      r: catmull(p0[1], p1[1], p2[1], p3[1], t)
    });
  }
  return out;
}

// 由母线采样生成回转体（开口圆筒式，两端不封口 -> 天然形成封口边缘环）
export function makeLathe(profile, segments = 96) {
  const rows = profile.length;
  const vertCount = rows * segments;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  for (let i = 0; i < rows; i++) {
    const { y, r } = profile[i];
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const idx = i * segments + j;
      positions[idx * 3] = r * Math.cos(a);
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = r * Math.sin(a);
      uvs[idx * 2] = j / segments;
      uvs[idx * 2 + 1] = i / (rows - 1);
    }
  }
  const indices = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      const a = i * segments + j, b = i * segments + j1;
      const c = (i + 1) * segments + j1, d = (i + 1) * segments + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  return { positions, indices, rows, segments, vertCount };
}

// 只被一个三角形引用的边 = 边界边；其顶点构成封口边缘环
export function boundaryVertices(indices, vertCount) {
  const count = new Map();
  for (let k = 0; k < indices.length; k += 3) {
    const tri = [indices[k], indices[k + 1], indices[k + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const key = a < b ? a * vertCount + b : b * vertCount + a;
      count.set(key, (count.get(key) || 0) + 1);
    }
  }
  const set = new Set();
  for (const [key, c] of count) {
    if (c === 1) {
      const a = Math.floor(key / vertCount), b = key % vertCount;
      set.add(a); set.add(b);
    }
  }
  return set;
}

// 对称轴偏移：逐环求截面质心，取各环质心到平均轴线距离的最大值（mm）
export function axisOffset(positions, rows, segments) {
  let ax = 0, az = 0;
  const centroids = [];
  for (let i = 0; i < rows; i++) {
    let cx = 0, cz = 0;
    for (let j = 0; j < segments; j++) {
      const idx = (i * segments + j) * 3;
      cx += positions[idx];
      cz += positions[idx + 2];
    }
    centroids.push([cx / segments, cz / segments]);
    ax += cx / segments; az += cz / segments;
  }
  ax /= rows; az /= rows;
  let max = 0;
  for (const [cx, cz] of centroids) {
    const d = Math.hypot(cx - ax, cz - az);
    if (d > max) max = d;
  }
  return max;
}

// 包围盒
export function boundingBox(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}
