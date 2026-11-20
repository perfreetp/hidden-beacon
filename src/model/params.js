// 全局建模参数与几何常量,单位 mm

export const CHORD_SPECS = [
  { id: 'CH48', label: 'CH48 × 4', outerDiameter: 48.3, wall: 4.0 },
  { id: 'CH60', label: 'CH60 × 5', outerDiameter: 60.3, wall: 5.0 },
  { id: 'CH76', label: 'CH76 × 6', outerDiameter: 76.1, wall: 6.0 },
  { id: 'CH89', label: 'CH89 × 6', outerDiameter: 88.9, wall: 6.0 },
  { id: 'CH114', label: 'CH114 × 8', outerDiameter: 114.3, wall: 8.0 },
];

export const PANEL_LENGTHS = [500, 1000];

export const DEFAULT_PARAMS = {
  // 横梁参数
  span: 8000,                 // 跨度 4000..24000 mm
  panelLength: 1000,          // 节间距 500 | 1000
  chordSpecId: 'CH60',        // 弦杆规格
  braceAngle: 45,             // 腹杆斜撑角度 30..60,步长 5
  height: null,               // 自动计算时为 null,也可覆盖
  // 阵列
  cols: 4,                    // 横向(沿梁长方向)复制 1..12
  rows: 2,                    // 竖向(堆叠)复制 1..4
  rowGap: 600,                // 行间距(相邻横梁轴线间距 = 梁高 + gap)
  // 塔架
  towerEnabled: true,
  towerWidth: 900,            // 塔架横截面边长(方塔)
  towerHeight: 4000,          // 塔架高度
  towerPanelLength: 1000,     // 塔架节间距
  // 螺栓孔(梁-塔连接处,4 个)
  holeDiameter: 22,           // 18..26 mm
  holeDepth: null,            // null => 取弦杆外径
  // 网格精度
  circularSegments: 16,       // 圆柱/球的圆周分段
};

export const LIMITS = {
  span: { min: 4000, max: 24000, step: 500 },
  braceAngle: { min: 30, max: 60, step: 5 },
  holeDiameter: { min: 18, max: 26, step: 1 },
  cols: { min: 1, max: 12 },
  rows: { min: 1, max: 4 },
};

export function getChordSpec(id) {
  return CHORD_SPECS.find((s) => s.id === id) ?? CHORD_SPECS[1];
}

// 梁高由斜撑角度与节间距决定:H = tan(theta) * panelLength
export function beamHeight(params) {
  if (params.height != null) return params.height;
  return Math.round(Math.tan((params.braceAngle * Math.PI) / 180) * params.panelLength);
}

export function panelCount(params) {
  return Math.round(params.span / params.panelLength);
}

// 节点球半径:取弦杆半径的 1.15 倍,保证弦杆/腹杆端部被球面包住
export function sphereRadius(chordOuterDiameter, webOuterDiameter) {
  return Math.max(chordOuterDiameter, webOuterDiameter) * 0.62;
}

// 腹杆直径取弦杆的 0.62 倍,壁厚随弦杆
export function webSpec(chord) {
  return {
    outerDiameter: Math.round(chord.outerDiameter * 0.62 * 10) / 10,
    wall: Math.max(3, Math.round(chord.wall * 0.8)),
  };
}

export function holeDepthOf(params, chord) {
  return params.holeDepth ?? chord.outerDiameter;
}

// 世界坐标量化哈希:重合基元判定(同一类、同尺寸、同量化坐标)
const Q = 0.01; // 10mm 量化网格(布尔容差远小于此)
export function quantize(v) {
  return Math.round(v / Q);
}

export function primitiveHash(rec) {
  const p = rec.center;
  return [
    rec.kind,
    rec.radius != null ? rec.radius.toFixed(2) : '',
    rec.radius2 != null ? rec.radius2.toFixed(2) : '',
    rec.length != null ? rec.length.toFixed(2) : '',
    rec.axis != null ? rec.axis : '',
    quantize(p[0]),
    quantize(p[1]),
    quantize(p[2]),
  ].join('|');
}
