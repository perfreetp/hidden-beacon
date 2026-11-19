/**
 * Glyph outlines from the bundled CJK fonts.
 *
 * Fonts are pre-subset to the 3755 GB2312 level-1 characters plus punctuation
 * and symbols (see tools/build-fonts.py), so the whole type system ships in
 * ~1.7 MB. Parsing is deferred and memoised per character.
 */

import opentype, { type Font } from 'opentype.js';
import { flattenCommands, type RawCommand, type Ring, transformRings } from './flatten';
import { ringsBounds } from './flatten';

export interface FontSpec {
  id: string;
  name: string;
  url: string;
  /** Vertical position of the em box centre relative to the baseline, in em. */
  baselineShift: number;
}

export const FONTS: readonly FontSpec[] = [
  {
    id: 'kuaile',
    name: '站酷快乐体',
    url: 'fonts/zcool-kuaile.ttf',
    // Median visual centre of the 3755 level-1 glyphs sits 0.359 em above the
    // baseline; opentype.js already returns y-down paths, so shifting the path
    // up by that amount centres the em box on the origin.
    baselineShift: 0.359,
  },
  {
    id: 'wenkai',
    name: '霞鹜文楷',
    url: 'fonts/lxgw-wenkai.ttf',
    baselineShift: 0.354,
  },
];

interface LoadedFont {
  spec: FontSpec;
  font: Font;
}

const loaded = new Map<string, Promise<LoadedFont>>();
const glyphCache = new Map<string, Ring[]>();

export function loadFont(id: string): Promise<LoadedFont> {
  const existing = loaded.get(id);
  if (existing) return existing;
  const spec = FONTS.find((f) => f.id === id) ?? FONTS[0];
  const p = (async () => {
    const res = await fetch(spec.url);
    if (!res.ok) throw new Error(`font ${id} failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const font = opentype.parse(buf);
    return { spec, font };
  })();
  loaded.set(id, p);
  return p;
}

export async function preloadFonts(): Promise<void> {
  await Promise.all(FONTS.map((f) => loadFont(f.id).catch(() => null)));
}

/**
 * Raw glyph rings in a normalised font box: the em advance box centred on the
 * origin, spanning roughly y ∈ [-0.5, 0.5] (1 em = 1 card unit before the
 * per-element scale is applied).
 */
export async function glyphRings(fontId: string, char: string): Promise<Ring[]> {
  const key = `${fontId}\u0000${char}`;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  const { font, spec } = await loadFont(fontId);
  const glyph = font.charToGlyph(char);
  if (!glyph || glyph.index === 0) return [];
  const units = font.unitsPerEm || 1000;
  const path = glyph.getPath(0, 0, units);
  const cmds = path.commands as RawCommand[];
  const flat = flattenCommands(cmds);
  const scale = 1 / units;
  // opentype.js getPath() already yields y-down coordinates (font y negated),
  // so only the scale and the baseline shift are applied here.
  const rings = transformRings(flat, {
    sx: scale,
    sy: scale,
    // Centre the em advance box on the origin: horizontal offset is half the
    // advance (CJK is monospaced at 1 em), vertical is the visual baseline shift.
    tx: -(glyph.advanceWidth ?? units) / 2 / units,
    ty: spec.baselineShift,
  });
  glyphCache.set(key, rings);
  return rings;
}

export async function glyphBounds(fontId: string, char: string): Promise<{ x0: number; y0: number; x1: number; y1: number }> {
  return ringsBounds(await glyphRings(fontId, char));
}

export function clearGlyphCache(): void {
  glyphCache.clear();
}
