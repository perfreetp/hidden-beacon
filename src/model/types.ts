/** Domain model. Everything here is plain JSON so it can be persisted as-is. */

export type ShapeId =
  | 'circle'
  | 'ring'
  | 'star'
  | 'heart'
  | 'triangle'
  | 'capsule'
  | 'squircle'
  | 'cloud'
  | 'flower';

export interface BaseElement {
  id: string;
  x: number; // centre, mm
  y: number;
  color: string;
  /** Draw order hint; decorative shapes usually sit behind the ink. */
  behind: boolean;
}

export interface GlyphElement extends BaseElement {
  type: 'glyph';
  char: string;
  fontId: string;
  size: number; // mm per em
  tilt: number; // degrees
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeId;
  size: number;
  rotation: number;
}

export type Element = GlyphElement | ShapeElement;

export interface Blob {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

export type BgPattern = 'fused' | 'dots' | 'plain';

export interface CardBackground {
  pattern: BgPattern;
  paper: string;
  ink: string; // blob colour
  fusion: number; // smooth-min radius, mm
  radius: number; // corner radius of the blobs
  blobs: Blob[];
  seed: number;
  frame: boolean;
  frameColor: string;
  dots: boolean;
}

export interface CardStyle {
  /** Outline thickness measured outside the ink contour, mm. */
  strokeWidth: number;
  strokeColor: string;
  glowRadius: number;
  glowColor: string;
  glowPresetId: string;
  glowStrength: number;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  shadowOpacity: number;
  shadowColor: string;
  clearance: number; // mm of empty halo kept between glyphs by auto layout
  autoLayout: boolean;
  opticalCenter: boolean;
}

export interface Card {
  id: string;
  title: string;
  w: number; // mm
  h: number;
  bg: CardBackground;
  style: CardStyle;
  elements: Element[];
  updatedAt: number;
}

export interface Version {
  id: string;
  cardId: string;
  ts: number;
  label: string;
  starred: boolean;
  snapshot: Card;
}

export interface Project {
  cards: Card[];
  versions: Record<string, Version[]>;
  activeCardId: string;
}

export const uid = (prefix = 'x'): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

export const isGlyph = (e: Element): e is GlyphElement => e.type === 'glyph';
export const isShape = (e: Element): e is ShapeElement => e.type === 'shape';

export function cloneCard(c: Card): Card {
  return JSON.parse(JSON.stringify(c)) as Card;
}
