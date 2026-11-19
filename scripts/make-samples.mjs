/**
 * 生成三张 2:1 等距柱状全景示例图（纯 Node，无第三方依赖）
 * 用法：node scripts/make-samples.mjs [--size 2048] [--only entrance]
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEquirect } from './render/raycast.mjs';
import { canopyScene, entranceScene, nightScene } from './render/scenes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'public', 'samples');

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const W = Number(getArg('size', 2048));
const H = W / 2;
const ONLY = getArg('only', null);

/* ---------- PNG 写入 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgb, w, h) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const scenes = [
  ['entrance', entranceScene, '入口大厅'],
  ['canopy', canopyScene, '雨林温室'],
  ['night', nightScene, '夜行馆'],
];

for (const [name, fn, label] of scenes) {
  if (ONLY && ONLY !== name) continue;
  const start = Date.now();
  const scene = fn();
  const rgb = renderEquirect(scene, W, H, { superSample: 1, blur: 1 });
  const ms = Date.now() - start;
  const png = encodePng(rgb, W, H);
  writeFileSync(resolve(OUT, `${name}.png`), png);
  const pf = 3;
  const pimg = downsample(rgb, W, H, pf);
  const preview = encodePng(pimg, Math.floor(W / pf), Math.floor(H / pf));
  writeFileSync(resolve(OUT, `${name}-preview.png`), preview);
  console.log(
    `${label} → public/samples/${name}.png  ${(png.length / 1024 / 1024).toFixed(2)} MB · 渲染 ${ms}ms`,
  );
}

function downsample(rgb, w, h, factor) {
  const nw = Math.floor(w / factor);
  const nh = Math.floor(h / factor);
  const out = new Uint8Array(nw * nh * 3);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * w + (x * factor + dx)) * 3;
          r += rgb[i];
          g += rgb[i + 1];
          b += rgb[i + 2];
        }
      }
      const n = factor * factor;
      const o = (y * nw + x) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}
