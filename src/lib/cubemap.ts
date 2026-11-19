/**
 * 立方体六面切分与接缝检查
 *
 * 坐标约定与 geo.ts 一致：Y 上、Z 前（经度 0°）、X 东（经度 90°）。
 * 每个面有正交基 (normal, right, up)：面内归一化坐标 (u,v) ∈ [-1,1]² 对应方向
 *   dir = normalize(normal + u·right + v·up)，u 向右、v 向上。
 * 因此 pz 面朝前、px 面朝东、py 面朝天顶，“十字展开”无需旋转即连续。
 */
import { LonLat, Vec3, clamp, dot, normalize, vecToLonLat } from './geo';

export type CubeFaceKey = 'pz' | 'px' | 'nz' | 'nx' | 'py' | 'ny';
export type CubeEdge = 'top' | 'right' | 'bottom' | 'left';

export interface CubeFaceDef {
  key: CubeFaceKey;
  label: string;
  bearing: string;
  normal: Vec3;
  right: Vec3;
  up: Vec3;
}

export const CUBE_FACES: CubeFaceDef[] = [
  {
    key: 'pz',
    label: '前 · 北',
    bearing: '中心经度 0°',
    normal: { x: 0, y: 0, z: 1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  },
  {
    key: 'px',
    label: '右 · 东',
    bearing: '中心经度 90°',
    normal: { x: 1, y: 0, z: 0 },
    right: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
  },
  {
    key: 'nz',
    label: '后 · 南',
    bearing: '中心经度 180°',
    normal: { x: 0, y: 0, z: -1 },
    right: { x: -1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  },
  {
    key: 'nx',
    label: '左 · 西',
    bearing: '中心经度 -90°',
    normal: { x: -1, y: 0, z: 0 },
    right: { x: 0, y: 0, z: 1 },
    up: { x: 0, y: 1, z: 0 },
  },
  {
    key: 'py',
    label: '上 · 天顶',
    bearing: '天顶',
    normal: { x: 0, y: 1, z: 0 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 0, z: -1 },
  },
  {
    key: 'ny',
    label: '下 · 天底',
    bearing: '天底',
    normal: { x: 0, y: -1, z: 0 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
  },
];

export const FACE_BY_KEY: Record<CubeFaceKey, CubeFaceDef> = Object.fromEntries(
  CUBE_FACES.map((f) => [f.key, f]),
) as Record<CubeFaceKey, CubeFaceDef>;

const ALL_EDGES: CubeEdge[] = ['top', 'right', 'bottom', 'left'];

export const EDGE_LABEL: Record<CubeEdge, string> = {
  top: '上边',
  right: '右边',
  bottom: '下边',
  left: '左边',
};

/** 指向面外的边法向（面内 u/v 坐标系） */
export const EDGE_OUTWARD: Record<CubeEdge, { u: number; v: number }> = {
  top: { u: 0, v: 1 },
  right: { u: 1, v: 0 },
  bottom: { u: 0, v: -1 },
  left: { u: -1, v: 0 },
};

/** 指向面内的边法向（面内像素坐标系，y 向下） */
const EDGE_INWARD_PX: Record<CubeEdge, { x: number; y: number }> = {
  top: { x: 0, y: 1 },
  right: { x: -1, y: 0 },
  bottom: { x: 0, y: -1 },
  left: { x: 1, y: 0 },
};

/** 面内归一化坐标 → 世界方向 */
export function faceDir(face: CubeFaceDef, u: number, v: number): Vec3 {
  return normalize({
    x: face.normal.x + face.right.x * u + face.up.x * v,
    y: face.normal.y + face.right.y * u + face.up.y * v,
    z: face.normal.z + face.right.z * u + face.up.z * v,
  });
}

/** 面内归一化坐标 → 经纬度 */
export function faceUVToLonLat(face: CubeFaceDef, u: number, v: number): LonLat {
  return vecToLonLat(faceDir(face, u, v));
}

/** 面内像素坐标（py 向下）→ 世界方向 */
export function facePixelDir(face: CubeFaceDef, px: number, py: number, size: number): Vec3 {
  return faceDir(face, ((px + 0.5) * 2) / size - 1, 1 - ((py + 0.5) * 2) / size);
}

/** 世界方向 → 指定面的连续像素坐标（可能落在面外，用于邻面映射） */
export function dirToFacePixel(face: CubeFaceDef, dir: Vec3, size: number): { x: number; y: number } {
  const d = normalize(dir);
  const depth = dot(d, face.normal);
  const safe = Math.abs(depth) < 1e-9 ? (depth < 0 ? -1e-9 : 1e-9) : depth;
  const u = dot(d, face.right) / safe;
  const v = dot(d, face.up) / safe;
  return { x: ((u + 1) / 2) * size - 0.5, y: ((1 - v) / 2) * size - 0.5 };
}

/** 边上参数点（像素坐标）；t 沿图像方向递增 */
export function edgePixel(edge: CubeEdge, t: number, size: number): { x: number; y: number } {
  const s = clamp(t, 0, 1) * size;
  switch (edge) {
    case 'top':
      return { x: s, y: 0 };
    case 'right':
      return { x: size, y: s };
    case 'bottom':
      return { x: s, y: size };
    case 'left':
      return { x: 0, y: s };
  }
}

/** 边内侧 pixel 偏移（depth>0 表示往里） */
export function edgeInset(edge: CubeEdge, depth: number): { x: number; y: number } {
  return { x: EDGE_INWARD_PX[edge].x * depth, y: EDGE_INWARD_PX[edge].y * depth };
}

export interface CubeEdgeInfo {
  id: string;
  a: CubeFaceKey;
  aEdge: CubeEdge;
  b: CubeFaceKey;
  bEdge: CubeEdge;
  /** 沿边参数在两个面上是否反向 */
  reversed: boolean;
}

/**
 * 找出某一面某条边的邻接面与对应边（精确计算，无启发式）。
 */
export function neighborOf(face: CubeFaceDef, edge: CubeEdge, size = 512): {
  face: CubeFaceDef;
  edge: CubeEdge;
  reversed: boolean;
} {
  const sample = (t: number) => {
    const p = edgePixel(edge, t, size);
    const inward = EDGE_INWARD_PX[edge];
    // 向面内收 1.5px 保证深度为正
    return facePixelDir(face, p.x + inward.x * 1.5, p.y + inward.y * 1.5, size);
  };
  const mid = sample(0.5);
  const out = EDGE_OUTWARD[edge];
  const outwardDir = normalize({
    x: face.normal.x + out.u * face.right.x + out.v * face.up.x,
    y: face.normal.y + out.u * face.right.y + out.v * face.up.y,
    z: face.normal.z + out.u * face.right.z + out.v * face.up.z,
  });
  // 邻面法向与“越界方向”最接近
  let best: CubeFaceDef | null = null;
  let bestScore = -Infinity;
  for (const f of CUBE_FACES) {
    if (f.key === face.key) continue;
    const s = dot(f.normal, outwardDir) + 1e-6 * dot(f.normal, mid);
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }
  const nb = best!;
  // 用边中点方向定位邻面上的边
  const p = dirToFacePixel(nb, mid, size);
  const u = ((p.x + 0.5) / size) * 2 - 1;
  const v = 1 - ((p.y + 0.5) / size) * 2;
  const dist = [
    { e: 'top' as CubeEdge, d: Math.abs(v - 1) },
    { e: 'bottom' as CubeEdge, d: Math.abs(v + 1) },
    { e: 'right' as CubeEdge, d: Math.abs(u - 1) },
    { e: 'left' as CubeEdge, d: Math.abs(u + 1) },
  ].sort((x, y) => x.d - y.d);
  const nbEdge = dist[0].e;
  // 方向是否翻转：比较 t=0.2 / 0.8 落在邻面上的位置
  const p1 = dirToFacePixel(nb, sample(0.2), size);
  const p2 = dirToFacePixel(nb, sample(0.8), size);
  const along = nbEdge === 'top' || nbEdge === 'bottom' ? p2.x - p1.x : p2.y - p1.y;
  return { face: nb, edge: nbEdge, reversed: along < 0 };
}

/** 12 条立方体接缝（去重，以 key 字典序的较小面为主） */
export function cubeEdges(size = 512): CubeEdgeInfo[] {
  const out: CubeEdgeInfo[] = [];
  const seen = new Set<string>();
  for (const face of CUBE_FACES) {
    for (const edge of ALL_EDGES) {
      const nb = neighborOf(face, edge, size);
      const pairKey = [face.key, nb.face.key].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      out.push({
        id: `${face.key}:${edge}~${nb.face.key}:${nb.edge}`,
        a: face.key,
        aEdge: edge,
        b: nb.face.key,
        bEdge: nb.edge,
        reversed: nb.reversed,
      });
    }
  }
  return out;
}

/** 十字展开图布局（与上面约定的面方向一致，全部正立） */
export const NET_LAYOUT: { key: CubeFaceKey; col: number; row: number }[] = [
  { key: 'py', col: 1, row: 0 },
  { key: 'nx', col: 0, row: 1 },
  { key: 'pz', col: 1, row: 1 },
  { key: 'px', col: 2, row: 1 },
  { key: 'nz', col: 3, row: 1 },
  { key: 'ny', col: 1, row: 2 },
];

/** 像素缓冲的最小接口：浏览器里就是 ImageData，测试里用普通对象代替 */
export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface FaceImage {
  key: CubeFaceKey;
  size: number;
  data: PixelBuffer;
}

export function createPixels(width: number, height: number): PixelBuffer {
  const g = globalThis as { ImageData?: new (w: number, h: number) => ImageData };
  if (typeof g.ImageData === 'function') {
    return new g.ImageData(width, height);
  }
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** 转成真正的 ImageData（仅在浏览器中调用，用于 putImageData） */
export function toImageData(buf: PixelBuffer): ImageData {
  if (typeof ImageData !== 'undefined' && buf instanceof ImageData) return buf;
  const data = new Uint8ClampedArray(buf.data.length);
  data.set(buf.data);
  return new ImageData(data, buf.width, buf.height);
}

export type Rgb = [number, number, number];

/** 等距柱状源图的采样器接口，便于在测试里用纯数据替代 canvas */
export interface EquirectSource {
  width: number;
  height: number;
  /** 返回 [0,1] 连续像素坐标处的颜色 */
  sample(u: number, v: number): Rgb;
}

export function equirectSourceFromImageData(img: PixelBuffer): EquirectSource {
  return {
    width: img.width,
    height: img.height,
    sample(u, v) {
      const x = clamp(u, 0, 1) * (img.width - 1);
      const y = clamp(v, 0, 1) * (img.height - 1);
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(x0 + 1, img.width - 1);
      const y1 = Math.min(y0 + 1, img.height - 1);
      const tx = x - x0;
      const ty = y - y0;
      const px = (xx: number, yy: number): Rgb => {
        const i = (yy * img.width + xx) * 4;
        return [img.data[i], img.data[i + 1], img.data[i + 2]];
      };
      const c00 = px(x0, y0);
      const c10 = px(x1, y0);
      const c01 = px(x0, y1);
      const c11 = px(x1, y1);
      return [0, 1, 2].map(
        (c) => c00[c] * (1 - tx) * (1 - ty) + c10[c] * tx * (1 - ty) + c01[c] * (1 - tx) * ty + c11[c] * tx * ty,
      ) as Rgb;
    },
  };
}

export function rgbDiff(a: Rgb, b: Rgb): number {
  return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
}

/**
 * 把等距柱状全景切成六张立方体面。
 * 采样时经度方向环绕（跨 ±180° 无缝），纬度方向夹紧。
 */
export function splitEquirect(source: EquirectSource, size: number): Record<CubeFaceKey, FaceImage> {
  const out = {} as Record<CubeFaceKey, FaceImage>;
  for (const face of CUBE_FACES) {
    const img = createPixels(size, size);
    const dst = img.data;
    for (let y = 0; y < size; y++) {
      const vv = 1 - (2 * (y + 0.5)) / size;
      for (let x = 0; x < size; x++) {
        const uu = (2 * (x + 0.5)) / size - 1;
        let dx = face.normal.x + face.right.x * uu + face.up.x * vv;
        let dy = face.normal.y + face.right.y * uu + face.up.y * vv;
        let dz = face.normal.z + face.right.z * uu + face.up.z * vv;
        const inv = 1 / Math.hypot(dx, dy, dz);
        dx *= inv;
        dy *= inv;
        dz *= inv;
        const lon = Math.atan2(dx, dz);
        const lat = Math.asin(clamp(dy, -1, 1));
        // 经度从 [-π,π] 映射到 [0,1]，并环绕
        let u = lon / (2 * Math.PI) + 0.5;
        u = ((u % 1) + 1) % 1;
        const v = 0.5 - lat / Math.PI;
        const c = source.sample(u, v);
        const o = (y * size + x) * 4;
        dst[o] = clamp(Math.round(c[0]), 0, 255);
        dst[o + 1] = clamp(Math.round(c[1]), 0, 255);
        dst[o + 2] = clamp(Math.round(c[2]), 0, 255);
        dst[o + 3] = 255;
      }
    }
    out[face.key] = { key: face.key, size, data: img };
  }
  return out;
}

/** 双线性取样，避免在锐利边缘处把接缝误差估高 */
function facePixelRgb(face: FaceImage, x: number, y: number): Rgb {
  const n = face.size;
  const d = face.data.data;
  const fx = clamp(x, 0, n - 1);
  const fy = clamp(y, 0, n - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, n - 1);
  const y1 = Math.min(y0 + 1, n - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const o00 = (y0 * n + x0) * 4;
  const o10 = (y0 * n + x1) * 4;
  const o01 = (y1 * n + x0) * 4;
  const o11 = (y1 * n + x1) * 4;
  const out: Rgb = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const top = d[o00 + c] * (1 - tx) + d[o10 + c] * tx;
    const bottom = d[o01 + c] * (1 - tx) + d[o11 + c] * tx;
    out[c] = top * (1 - ty) + bottom * ty;
  }
  return out;
}

export interface SeamSample {
  t: number;
  a: Rgb;
  b: Rgb;
  diff: number;
  /** 沿缝方向的自然颜色变化（作为“可接受误差”基线） */
  localContrast: number;
}

export interface SeamReport {
  id: string;
  a: CubeFaceKey;
  aEdge: CubeEdge;
  b: CubeFaceKey;
  bEdge: CubeEdge;
  reversed: boolean;
  meanDiff: number;
  maxDiff: number;
  /** 相对于缝内自然变化的比例；>1 表示接缝比周围纹理更“跳” */
  excessRatio: number;
  samples: SeamSample[];
}

/** 检查全部 12 条接缝 */
export function checkSeams(faces: Record<CubeFaceKey, FaceImage>, samples = 64): SeamReport[] {
  const reports: SeamReport[] = [];
  const sizeA = faces.pz.size;
  for (const e of cubeEdges(sizeA)) {
    const sizeB = faces[e.b].size;
    const rows: SeamSample[] = [];
    let total = 0;
    let max = 0;
    let contrastTotal = 0;
    for (let i = 0; i < samples; i++) {
      const t = (i + 0.5) / samples;
      const pa = edgePixel(e.aEdge, t, sizeA);
      const inA = EDGE_INWARD_PX[e.aEdge];
      const aRgb = facePixelRgb(faces[e.a], pa.x + inA.x * 0.75, pa.y + inA.y * 0.75);
      const dir = facePixelDir(FACE_BY_KEY[e.a], pa.x + inA.x * 1.5, pa.y + inA.y * 1.5, sizeA);
      const pb = dirToFacePixel(FACE_BY_KEY[e.b], dir, sizeB);
      const inB = EDGE_INWARD_PX[e.bEdge];
      const bRgb = facePixelRgb(faces[e.b], pb.x + inB.x * 0.75, pb.y + inB.y * 0.75);
      const diff = rgbDiff(aRgb, bRgb);
      // 基线：沿 a 面边内侧走 4 像素，取相邻像素差
      const p2 = edgePixel(e.aEdge, Math.min(0.999, t + 1 / samples), sizeA);
      const aNext = facePixelRgb(faces[e.a], p2.x + inA.x * 0.75, p2.y + inA.y * 0.75);
      const localContrast = rgbDiff(aRgb, aNext);
      total += diff;
      max = Math.max(max, diff);
      contrastTotal += localContrast;
      rows.push({ t, a: aRgb, b: bRgb, diff, localContrast });
    }
    const meanDiff = total / samples;
    const meanContrast = contrastTotal / samples;
    reports.push({
      ...e,
      meanDiff,
      maxDiff: max,
      excessRatio: meanDiff / Math.max(meanContrast, 0.6),
      samples: rows,
    });
  }
  return reports;
}

export interface CubeResult {
  faces: Record<CubeFaceKey, FaceImage>;
  size: number;
  report: SeamReport[];
  worstMean: number;
  worstMax: number;
  /** 0–100 的接缝评分，越高越好 */
  score: number;
}

/** 由接缝报告换算评分：兼顾“相对自然纹理的跳变”和绝对色差 */
export function scoreFromSeams(report: SeamReport[]): number {
  if (!report.length) return 100;
  let penalty = 0;
  for (const r of report) {
    penalty += clamp((r.excessRatio - 0.8) * 5, 0, 10);
    penalty += clamp((r.meanDiff - 1.5) * 2.5, 0, 15);
  }
  return Math.round(clamp(100 - penalty / report.length, 0, 100));
}

export function seamColor(report: Pick<SeamReport, 'meanDiff' | 'excessRatio'>): string {
  const s = report.meanDiff / 255;
  if (s < 0.02 && report.excessRatio < 1.4) return 'var(--seam-good)';
  if (s < 0.06) return 'var(--seam-warn)';
  return 'var(--seam-bad)';
}

export function splitAndCheck(source: EquirectSource, size: number): CubeResult {
  const faces = splitEquirect(source, size);
  const report = checkSeams(faces);
  const worstMean = report.reduce((m, r) => Math.max(m, r.meanDiff), 0);
  const worstMax = report.reduce((m, r) => Math.max(m, r.maxDiff), 0);
  return { faces, size, report, worstMean, worstMax, score: scoreFromSeams(report) };
}

/**
 * 用两侧边条拼出一张放大检查图（每列像素放大成 H 高的竖条）。
 * 仅供浏览器环境渲染接缝放大镜。
 */
export function seamLoupe(
  faces: Record<CubeFaceKey, FaceImage>,
  report: SeamReport,
  stripPx = 10,
): { width: number; height: number; data: Uint8ClampedArray } {
  const H = 192;
  const half = stripPx * H;
  const W = half * 2;
  const data = new Uint8ClampedArray(W * H * 4);
  const sizeA = faces[report.a].size;
  const sizeB = faces[report.b].size;
  for (let x = 0; x < W; x++) {
    const sideA = x < half;
    const local = sideA ? x : W - 1 - x;
    const col = Math.floor(local / H);
    const edge = sideA ? report.aEdge : report.bEdge;
    const size = sideA ? sizeA : sizeB;
    const key = sideA ? report.a : report.b;
    for (let y = 0; y < H; y++) {
      const t = (y + 0.5) / H;
      const p = edgePixel(edge, t, size);
      const inw = EDGE_INWARD_PX[edge];
      const rgb = facePixelRgb(faces[key], p.x + inw.x * (0.75 + col), p.y + inw.y * (0.75 + col));
      const o = (y * W + x) * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

/** 经纬度 → 所属立方体面及面内归一化坐标（u,v ∈ [-1,1]） */
export function lonLatToCubeFace(lon: number, lat: number): { key: CubeFaceKey; u: number; v: number } {
  const lo = (lon * Math.PI) / 180;
  const la = (lat * Math.PI) / 180;
  const cl = Math.cos(la);
  const d = { x: cl * Math.sin(lo), y: Math.sin(la), z: cl * Math.cos(lo) };
  let best = CUBE_FACES[0];
  let bestDot = -Infinity;
  for (const f of CUBE_FACES) {
    const k = dot(d, f.normal);
    if (k > bestDot) {
      bestDot = k;
      best = f;
    }
  }
  const p = dirToFacePixel(best, d, 2);
  return { key: best.key, u: p.x - 0.5, v: p.y - 0.5 };
}

/** 源全景左右边界（±180° 经线）的连续性：0–255 平均色差 */
export function equirectSeamDiff(source: EquirectSource, samples = 128): number {
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const v = (i + 0.5) / samples;
    total += rgbDiff(source.sample(0.0005, v), source.sample(0.9995, v));
  }
  return total / samples;
}
