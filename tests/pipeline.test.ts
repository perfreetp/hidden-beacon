import fs from 'node:fs';
import opentype from 'opentype.js';
import { flattenCommands, type RawCommand } from '../src/core/flatten';
import { PolygonField, circleField, unionField, roundedBoxField } from '../src/core/field';
import { contourRings } from '../src/core/scene';
import { ringToPath, ringsToPath } from '../src/core/vectorize';

let fail = 0;
const ok = (n: string, c: boolean, e = '') => { if (!c) { fail++; console.log('FAIL', n, e); } else console.log('ok  ', n, e); };

const buf = fs.readFileSync('public/fonts/zcool-kuaile.ttf');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const font = opentype.parse(ab);

/** Parses path coordinates (M/L take 2 numbers, C takes 6) and checks the box. */
function pathWithin(d: string, b: { x0: number; y0: number; x1: number; y1: number }, slack: number): boolean {
  const re = /([MLCZ])([^MLCZ]*)/g;
  let m: RegExpExecArray | null;
  const pts: Array<[number, number]> = [];
  while ((m = re.exec(d))) {
    const nums = (m[2].match(/-?\d+\.?\d*/g) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  }
  return pts.every(([x, y]) => x >= b.x0 - slack && x <= b.x1 + slack && y >= b.y0 - slack && y <= b.y1 + slack);
}

function glyphFieldAt(ch: string, size: number) {
  const gp = font.charToGlyph(ch).getPath(0, 0, 1000);
  const rings = flattenCommands(gp.commands as RawCommand[]).map((r) => {
    const out = new Float64Array(r.length);
    for (let i = 0; i < r.length; i += 2) { out[i] = (r[i] / 1000 - 0.5) * size; out[i + 1] = (r[i + 1] / 1000 + 0.359) * size; }
    return out;
  });
  return new PolygonField(rings);
}

for (const ch of ['日', '口', '永', '爱']) {
  const f = glyphFieldAt(ch, 60);
  const rings = contourRings(f, 60);
  ok(`${ch} rings produced`, rings.length >= 1, `rings=${rings.length}`);
  let maxErr = 0;
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      const v = f.value(r[i], r[i + 1]);
      maxErr = Math.max(maxErr, Math.abs(v));
    }
  }
  ok(`${ch} contour lies on iso-line`, maxErr < 0.02, `maxErr=${maxErr.toFixed(5)}mm`);
  const d = ringsToPath(rings, { cornerAngle: 62 });
  ok(`${ch} path is finite`, /^[MLCZ0-9.\- ]+$/.test(d) && !/NaN/.test(d), `${d.length} chars`);
  ok(`${ch} path stays in bounds`, pathWithin(d, f.bbox, 2), d.slice(0, 40));
}

// Fusion of two blobs: with k=0 there are two separate loops, with k large one.
const a = roundedBoxField(30, 40, 18, 12, 8);
const b = roundedBoxField(74, 42, 18, 12, 8);
const gap = b.bbox.x0 - a.bbox.x1;
console.log('gap between blobs', gap);
const hard = contourRings(unionField([a, b], 0.001), 80);
const soft = contourRings(unionField([a, b], 22), 80);
ok('hard union keeps two blobs', hard.length === 2, `rings=${hard.length}`);
ok('soft union fuses into one', soft.length === 1, `rings=${soft.length}`);
const mid = unionField([a, b], 22).value(52, 41);
ok('fusion point is inside', mid < 0, String(mid));

// Smoothness: the smoothed path of a circle should approximate the circle well.
const circ = circleField(50, 50, 25);
const crings = contourRings(circ, 50);
const path = ringToPath(crings[0], { cornerAngle: 62 });
ok('circle -> one ring', crings.length === 1);
ok('circle path has curves', path.includes('C'), path.slice(0, 60));
let rmin = Infinity, rmax = -Infinity;
for (let i = 0; i < crings[0].length; i += 2) {
  const r = Math.hypot(crings[0][i] - 50, crings[0][i + 1] - 50);
  rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
}
ok('circle radius accurate', Math.abs(rmin - 25) < 0.05 && Math.abs(rmax - 25) < 0.05, `r=${rmin.toFixed(4)}..${rmax.toFixed(4)}`);

console.log(fail === 0 ? '\nall pipeline tests passed' : `\n${fail} FAILURES`);
process.exit(fail ? 1 : 0);
