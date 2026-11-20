/**
 * 魔法光影画板 —— 全部数据模型。
 * 坐标一律用世界归一化坐标：x/y ∈ [0,1]，y 轴向下；
 * 半径 r 是相对世界宽度的比例，保证任意导出分辨率下画面一致。
 */

export type ShapeId = 'brush' | 'star' | 'fish' | 'house' | 'eraser';
export type EffectId = 'bloom' | 'dof' | 'tonemap' | 'outline';
export type TonemapMode = 'soft' | 'vivid' | 'night';

export interface Dab {
  x: number;
  y: number;
  /** 半径，相对世界宽度 */
  r: number;
  /** 弧度，0 表示正放 */
  rot: number;
  /** sRGB 0..1 */
  color: [number, number, number];
  shape: ShapeId;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  dabs: Dab[];
}

export interface BloomParams {
  enabled: boolean;
  /** 泛光强度 0..2 */
  intensity: number;
  /** 扩散半径（模糊迭代次数，1..12） */
  radius: number;
  /** 亮度阈值 0..1 */
  threshold: number;
}

export interface DofParams {
  enabled: boolean;
  /** 对焦点，世界归一化坐标 */
  focusX: number;
  focusY: number;
  /** 清晰范围（到焦点的世界距离），小于它完全清晰 */
  range: number;
  /** 最大模糊半径，像素（按场景基准分辨率） */
  blur: number;
}

export interface TonemapParams {
  enabled: boolean;
  mode: TonemapMode;
}

export interface OutlineParams {
  enabled: boolean;
  /** 描边粗细，像素（按场景基准分辨率） */
  thickness: number;
  /** 描边颜色，#rrggbb */
  color: string;
}

export interface ViewState {
  zoom: number;
  /** 世界中心相对视口中心的偏移，世界比例 */
  panX: number;
  panY: number;
}

export interface ProjectState {
  version: 1;
  layers: Layer[];
  effectOrder: EffectId[];
  bloom: BloomParams;
  dof: DofParams;
  tonemap: TonemapParams;
  outline: OutlineParams;
  view: ViewState;
  highContrast: boolean;
}

export const EFFECT_META: Record<
  EffectId,
  { name: string; icon: string; desc: string }
> = {
  bloom: { name: '泛光', icon: '✦', desc: '让亮处晕出柔柔的光' },
  dof: { name: '景深', icon: '◉', desc: '对焦的地方清楚，别的地方虚掉' },
  tonemap: { name: '色调映射', icon: '◑', desc: '柔和 / 鲜艳 / 夜色 三种光调' },
  outline: { name: '描边', icon: '▱', desc: '给图形勾一圈亮边' }
};

export const SHAPE_META: Record<
  Exclude<ShapeId, 'eraser'>,
  { name: string; icon: string }
> & { eraser: { name: string; icon: string } } = {
  brush: { name: '光笔', icon: '🌊' },
  star: { name: '星星', icon: '⭐' },
  fish: { name: '小鱼', icon: '🐟' },
  house: { name: '房子', icon: '🏠' },
  eraser: { name: '橡皮擦', icon: '🧽' }
};

/** 适合暗色画布的发光调色板（给小朋友的大色块） */
export const PALETTE: { name: string; hex: string }[] = [
  { name: '月光黄', hex: '#ffd75e' },
  { name: '珊瑚粉', hex: '#ff7a9c' },
  { name: '湖水青', hex: '#4fd8e8' },
  { name: '薄荷绿', hex: '#7cf2a8' },
  { name: '天空蓝', hex: '#6aa8ff' },
  { name: '紫罗兰', hex: '#b48bff' },
  { name: '橘子橙', hex: '#ff9e4f' },
  { name: '珍珠白', hex: '#f4f1e8' }
];
