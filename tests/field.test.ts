import { PolygonField, circleField, roundedBoxField, unionField } from '../src/core/field';
import { flattenCommands, type RawCommand } from '../src/core/flatten';
import opentype from 'opentype.js';
import fs from 'node:fs';

let fail = 0;
function ok(name: string, cond: boolean, extra = '') {
  if (!cond) { fail++; console.log('FAIL', name, extra); } else console.log('ok  ', name, extra);
}
const close = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t;

const c = circleField(0, 0, 10);
ok('circle inside', close(c.value(0, 0), -10));
ok('circle edge', close(c.value(10, 0), 0));
ok('circle outside', close(c.value(20, 0), 10));
const g = { x: 0, y: 0 };
c.gradient(5, 0, g);
ok('circle grad', close(g.x, 1) && close(g.y, 0));

const rb = roundedBoxField(0, 0, 10, 6, 3);
ok('rbox edge', close(rb.value(10, 0), 0, 1e-4));
ok('rbox corner', close(rb.value(10, 6), Math.hypot(3, 3) - 3, 1e-4), String(rb.value(10, 6)));

// A square donut: outer 20x20, hole radius 4 (reverse winding, as fonts do).
const outer = new Float64Array([-10,-10, 10,-10, 10,10, -10,10]);
const hole: number[] = [];
for (let i = 0; i < 64; i++) { const a = -(i / 64) * Math.PI * 2; hole.push(Math.cos(a) * 4, Math.sin(a) * 4); }
const pf = new PolygonField([outer, Float64Array.from(hole)]);
ok('poly inside ring band', pf.value(7, 0) < 0, String(pf.value(7, 0)));
ok('poly inside hole', pf.value(0, 0) > 0, String(pf.value(0, 0)));
ok('poly outside', pf.value(12, 0) > 0);
ok('poly edge', Math.abs(pf.value(10, 0)) < 1e-6, String(pf.value(10, 0)));
// 64-gon inradius is 4·cos(π/64), not 4.
ok('poly hole dist', close(pf.value(0, 0), 4 * Math.cos(Math.PI / 64), 1e-3), String(pf.value(0, 0)));

// Font glyph ring should produce a plausible field.
const buf = fs.readFileSync('public/fonts/zcool-kuaile.ttf');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const font = opentype.parse(ab);
for (const ch of ['日', '口', '月', '永']) {
  const gp = font.charToGlyph(ch).getPath(0, 0, 1000);
  const rings = flattenCommands(gp.commands as RawCommand[]);
  const f = new PolygonField(rings);
  const bb = f.bbox;
  const my = (bb.y0 + bb.y1) / 2;
  // Find a point that really is ink: scan the middle row for the first inside cell.
  let inkX = NaN;
  for (let x = bb.x0; x < bb.x1; x += 0.5) { if (f.value(x, my) < -0.5) { inkX = x; break; } }
  ok(`glyph ${ch} ink found on mid row`, Number.isFinite(inkX), `at x=${inkX}`);
  ok(`glyph ${ch} ink distance sane`, f.value(inkX, my) > -40, String(f.value(inkX, my).toFixed(2)));
  ok(`glyph ${ch} far outside`, f.value(bb.x0 - 100, bb.y0 - 100) > 0);
  // Sample the field on a grid and count sign changes along the centre row.
  let changes = 0; let prev = f.value(bb.x0 - 20, my);
  for (let x = bb.x0 - 19; x < bb.x1 + 20; x++) { const v = f.value(x, my); if ((v < 0) !== (prev < 0)) changes++; prev = v; }
  ok(`glyph ${ch} centre row crossings`, changes >= 2, `changes=${changes}`);
}

// Union fusion: two circles 22 apart, r=10 → gap 2 → fused when k large.
const a = circleField(-11, 0, 10);
const b = circleField(11, 0, 10);
const hard = unionField([a, b], 0);
const soft = unionField([a, b], 6);
ok('hard union midpoint outside', hard.value(0, 0) > 0, String(hard.value(0, 0)));
ok('soft union midpoint filled', soft.value(0, 0) < 0, String(soft.value(0, 0)));
// Far from one blob the pair is no longer within the blend radius: identical.
ok('soft union far unchanged', Math.abs(soft.value(-100, 0) - hard.value(-100, 0)) < 1e-6, `${soft.value(-100,0)} vs ${hard.value(-100,0)}`);

console.log(fail === 0 ? '\nall field tests passed' : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
