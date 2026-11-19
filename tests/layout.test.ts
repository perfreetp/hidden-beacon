import fs from 'node:fs';
import opentype from 'opentype.js';
import { flattenCommands, type RawCommand } from '../src/core/flatten';
import { PolygonField } from '../src/core/field';
import { contourRings } from '../src/core/scene';
import { ringsBounds } from '../src/core/flatten';

// Build unit rings for a handful of glyphs so layout can be exercised in Node.
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
let fail = 0;
const ok = (n: string, c: boolean, e = '') => { if (!c) { fail++; console.log('FAIL', n, e); } else console.log('ok  ', n, e); };

for (const ch of ['日','月','口','爱','一','永']) {
  const r = unitRings(ch);
  const b = ringsBounds(r);
  void r;
  console.log(ch, 'unit rings', r.length, 'bbox', b.x0.toFixed(3), b.y0.toFixed(3), b.x1.toFixed(3), b.y1.toFixed(3));
  ok(`${ch} unit em box plausible`, b.x1 - b.x0 > 0.4 && b.x1 - b.x0 < 1.2 && b.y1 - b.y0 > 0.1, `${(b.x1-b.x0).toFixed(2)}x${(b.y1-b.y0).toFixed(2)}`);

  // Scale invariance: contours at 60mm equal unit contours * 60 (within 1e-6).
  const scaled = r.map((ring) => { const o = new Float64Array(ring.length); for (let i = 0; i < ring.length; i++) o[i] = ring[i] * 60 + 100; return o; });
  const bs = ringsBounds(scaled);
  ok(`${ch} scale invariance`, Math.abs((bs.x1 - bs.x0) - (b.x1 - b.x0) * 60) < 1e-6);
}
console.log(fail === 0 ? '\nunit ring tests passed' : `\n${fail} FAILURES`);
process.exit(fail ? 1 : 0);
