/** Minimal typings for the parts of opentype.js this project uses. */
declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Path {
    commands: PathCommand[];
  }
  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  export interface Glyph {
    index: number;
    name: string;
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): Path;
    getBoundingBox(): BoundingBox;
  }
  export class Font {
    unitsPerEm: number;
    charToGlyph(char: string): Glyph;
    stringToGlyphs(text: string): Glyph[];
    getKerningValue(left: Glyph, right: Glyph): number;
  }
  export function parse(buffer: ArrayBuffer, options?: unknown): Font;
  const opentype: { parse: typeof parse; Font: typeof Font };
  export default opentype;
}
