import type { BgPattern, Blob, Card, CardBackground, CardStyle, Element, ShapeId, ShapeElement } from './types';
import { uid } from './types';
import { mulberry32 } from '../core/math';

export const GLOW_PRESETS = [
  { id: 'sun', name: '朝阳', color: '#ff8a3d' },
  { id: 'mint', name: '薄荷', color: '#2fd6a3' },
  { id: 'berry', name: '莓果', color: '#ff5d8f' },
  { id: 'sky', name: '晴空', color: '#3fa9ff' },
  { id: 'gold', name: '蜜糖', color: '#ffc23d' },
  { id: 'lilac', name: '丁香', color: '#a970ff' },
] as const;

export const PAPER_PRESETS = [
  { id: 'cream', name: '米白', color: '#fffaf0' },
  { id: 'mint', name: '薄荷绿', color: '#f0fbf4' },
  { id: 'sky', name: '天青', color: '#f0f8ff' },
  { id: 'blush', name: '藕粉', color: '#fff4f6' },
  { id: 'sand', name: '麦穗', color: '#fdf6e8' },
] as const;

export const SHAPE_LABELS: Record<ShapeId, string> = {
  circle: '圆形',
  ring: '圆环',
  star: '星星',
  heart: '爱心',
  triangle: '三角',
  capsule: '胶囊',
  squircle: '方圆',
  cloud: '云朵',
  flower: '花朵',
};

export const CARD_SIZES = [
  { id: 'portrait', name: '竖卡 100×140', w: 100, h: 140 },
  { id: 'square', name: '方卡 120×120', w: 120, h: 120 },
  { id: 'landscape', name: '横卡 140×100', w: 140, h: 100 },
  { id: 'a6', name: 'A6 105×148', w: 105, h: 148 },
] as const;

export function defaultStyle(): CardStyle {
  return {
    strokeWidth: 1.1,
    strokeColor: '#ffffff',
    glowRadius: 2.4,
    glowColor: GLOW_PRESETS[0].color,
    glowPresetId: GLOW_PRESETS[0].id,
    glowStrength: 0.75,
    shadowX: 0.9,
    shadowY: 1.6,
    shadowBlur: 1.4,
    shadowOpacity: 0.28,
    shadowColor: '#5a3a2a',
    clearance: 2,
    autoLayout: true,
    opticalCenter: true,
  };
}

/** Rounded blobs arranged in a loose grid; the fusion radius merges neighbours. */
export function generateBlobs(w: number, h: number, seed: number, pattern: BgPattern): Blob[] {
  const rnd = mulberry32(seed);
  const blobs: Blob[] = [];
  if (pattern === 'plain') return blobs;
  const cell = Math.min(w, h) * 0.34;
  const cols = Math.max(2, Math.round(w / cell));
  const rows = Math.max(2, Math.round(h / cell));
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (pattern === 'dots' && rnd() < 0.45) continue;
      const sizeJitter = 0.62 + rnd() * 0.3;
      const bw = cw * sizeJitter;
      const bh = ch * (0.62 + rnd() * 0.3);
      const x = cw * (c + 0.5) + (rnd() - 0.5) * cw * 0.28;
      const y = ch * (r + 0.5) + (rnd() - 0.5) * ch * 0.28;
      blobs.push({
        x: Math.max(bw / 2 - cw * 0.15, Math.min(w - bw / 2 + cw * 0.15, x)),
        y: Math.max(bh / 2 - ch * 0.15, Math.min(h - bh / 2 + ch * 0.15, y)),
        w: bw,
        h: bh,
        r: Math.min(bw, bh) * (0.32 + rnd() * 0.2),
      });
    }
  }
  return blobs;
}

export function defaultBackground(w: number, h: number): CardBackground {
  const seed = Math.floor(Math.random() * 1e9);
  return {
    pattern: 'fused',
    paper: PAPER_PRESETS[0].color,
    ink: '#d8ecff',
    fusion: 6,
    radius: 9,
    blobs: generateBlobs(w, h, seed, 'fused'),
    seed,
    frame: true,
    frameColor: '#ffffff',
    dots: false,
  };
}

export function shapeElement(shape: ShapeId, x: number, y: number, size: number, id = uid('el')): ShapeElement {
  return {
    id,
    type: 'shape',
    shape,
    x,
    y,
    size,
    rotation: 0,
    color: '#ffd166',
    behind: true,
  };
}

export function newCard(w = 100, h = 140, title = '新卡片'): Card {
  const style = defaultStyle();
  return {
    id: uid('card'),
    title,
    w,
    h,
    bg: defaultBackground(w, h),
    style,
    elements: [],
    updatedAt: Date.now(),
  };
}

export const STARTER_WORDS = [
  { char: '日', shape: 'circle' as ShapeId, label: '日' },
  { char: '月', shape: 'ring' as ShapeId, label: '月' },
  { char: '山', shape: 'triangle' as ShapeId, label: '山' },
  { char: '水', shape: 'capsule' as ShapeId, label: '水' },
  { char: '火', shape: 'star' as ShapeId, label: '火' },
  { char: '花', shape: 'flower' as ShapeId, label: '花' },
  { char: '心', shape: 'heart' as ShapeId, label: '心' },
  { char: '云', shape: 'cloud' as ShapeId, label: '云' },
] as const;

export function decodeElements(els: Element[]): void {
  // Kept for schema migrations; currently a no-op validated by shape checks.
  for (const e of els) {
    if (e.type === 'glyph' && typeof e.char !== 'string') e.char = '日';
  }
}
