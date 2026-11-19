import fs from 'node:fs';
import opentype from 'opentype.js';
import { flattenCommands, type RawCommand } from '../src/core/flatten';
import { PolygonField } from '../src/core/field';
import { contourRings } from '../src/core/scene';
import { diffCards } from '../src/core/diff';

const buf = fs.readFileSync('public/fonts/zcool-kuaile.ttf');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const font = opentype.parse(ab);
const cache = new Map<string, Float64Array[]>();
function unitRings(ch: string) {
  if (cache.has(ch)) return cache.get(ch)!;
  const gp = font.charToGlyph(ch).getPath(0, 0, 1000);
  const rings = flattenCommands(gp.commands as RawCommand[]).map((r) => {
    const out = new Float64Array(r.length);
    for (let i = 0; i < r.length; i += 2) { out[i] = r[i]/1000 - 0.5; out[i+1] = r[i+1]/1000 + 0.359; }
    return out;
  });
  const out = contourRings(new PolygonField(rings), 1);
  cache.set(ch, out);
  return out;
}
// Seed the scene's unit-outline cache so the diff module finds geometry.
const scene = await import('../src/core/scene');
for (const ch of ['日', '一']) scene.seedGlyphRings('z', ch, unitRings(ch));

const mk = (x: number, size: number, ch = '日') => ({
  id: 'e1', type: 'glyph' as const, char: ch, fontId: 'z', size, tilt: 0,
  x, y: 70, color: '#000', behind: false,
});
const cardA = { id: 'a', title: 'a', w: 100, h: 140, bg: {} as any, style: {} as any, elements: [mk(45, 50)], updatedAt: 0 };
const cardB = { id: 'b', title: 'b', w: 100, h: 140, bg: {} as any, style: {} as any, elements: [mk(60, 50)], updatedAt: 0 };

let fail = 0;
const ok = (n: string, c: boolean, e = '') => { if (!c) { fail++; console.log('FAIL', n, e); } else console.log('ok  ', n, e); };

const same = diffCards(cardA, cardA, 100, 140);
ok('identical: no added', same.added === '', String(same.added.length));
ok('identical: no removed', same.removed === '', String(same.removed.length));
ok('identical: all kept', same.kept.length > 10, `${same.kept.length} chars`);
ok('identical: overlap = coverage, no diff', same.stats.overlap > 1 && same.stats.added === 0 && same.stats.removed === 0, JSON.stringify(same.stats));

const moved = diffCards(cardA, cardB, 100, 140);
ok('moved: has added', moved.added.length > 10, `${moved.added.length} chars`);
ok('moved: has removed', moved.removed.length > 10, `${moved.removed.length} chars`);
ok('moved: partial overlap', moved.stats.overlap > 0.1 && moved.stats.added > 0.5 && moved.stats.removed > 0.5, JSON.stringify(moved.stats));
ok('moved: kept covers overlap', moved.kept.length > 10);

const big = diffCards({ ...cardA, elements: [mk(45, 50, '一')] }, { ...cardA, elements: [mk(45, 90, '一')] }, 100, 140);
ok('resized: grew -> added only', big.stats.added > big.stats.removed, JSON.stringify(big.stats));

console.log(fail === 0 ? '\ndiff tests passed' : `\n${fail} FAILURES`);
process.exit(fail ? 1 : 0);
