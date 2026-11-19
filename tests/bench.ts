/**
 * Node benchmark for the SDF → contour pipeline.
 * Run: node tools/run-ts.mjs tests/bench.ts
 */
import fs from 'node:fs';
import opentype from 'opentype.js';
import { flattenCommands, type RawCommand } from '../src/core/flatten';
import { PolygonField } from '../src/core/field';
import { contourRings } from '../src/core/scene';
import { ringsToPath } from '../src/core/vectorize';

const buf = fs.readFileSync('public/fonts/zcool-kuaile.ttf');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const font = opentype.parse(ab);
const chars = ['日', '月', '明', '学', '卡', '口', '人', '永', '爱', '花', '云', '山', '水', '火', '心'];
let total = 0;
let verts = 0;
let len = 0;
for (const ch of chars) {
  const gp = font.charToGlyph(ch).getPath(0, 0, 1000);
  const rings = flattenCommands(gp.commands as RawCommand[]).map((r) => {
    const out = new Float64Array(r.length);
    for (let i = 0; i < r.length; i += 2) {
      out[i] = (r[i] / 1000 - 0.5) * 60;
      out[i + 1] = (r[i + 1] / 1000 + 0.359) * 60;
    }
    return out;
  });
  const f = new PolygonField(rings);
  const t0 = performance.now();
  const out = contourRings(f, 60);
  const d = ringsToPath(out, { cornerAngle: 62 });
  const dt = performance.now() - t0;
  total += dt;
  const v = out.reduce((a: number, r: Float64Array) => a + r.length / 2, 0);
  verts += v;
  len += d.length;
  console.log(ch, dt.toFixed(1) + 'ms', out.length + ' rings', v + ' verts');
}
console.log(`\n${chars.length} glyphs: ${total.toFixed(0)}ms total, ${(total / chars.length).toFixed(1)}ms each, ${verts} verts, ${len} path chars`);
