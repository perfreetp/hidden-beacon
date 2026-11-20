import { SPECIES_BY_ID } from './species.js';
import { mulberry32 } from './rng.js';

const ASPECT_DIR = {
  '南': [0, -1], '东南': [0.707, -0.707], '东': [1, 0], '东北': [0.707, 0.707],
  '北': [0, 1], '西北': [-0.707, 0.707], '西': [-1, 0], '西南': [-0.707, -0.707], '平': [0, 0]
};
const WATER_CODE = { '无': 0, '北侧': 1, '南侧': 2, '东侧': 3, '西侧': 4, '中央贯穿': 5 };
const LAYER_RANK = { herb: 0, shrub: 1, tree: 2 };

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function plantColor(plant, season) {
  const sp = SPECIES_BY_ID[plant.sp];
  if (!sp) return [0.5, 0.5, 0.5];
  const idx = { spring: 0, summer: 1, autumn: 2 }[season];
  return hexToRgb(sp.bloom[idx] ? sp.bloomColor : sp.foliage);
}

export function sortedPlants(plants) {
  return [...plants].sort(
    (a, b) => (LAYER_RANK[SPECIES_BY_ID[a.sp]?.layer] ?? 0) - (LAYER_RANK[SPECIES_BY_ID[b.sp]?.layer] ?? 0)
  );
}

// 顶视点选:从最上层(乔木)往下找
export function pickPlantAt(plants, x, y) {
  const sorted = sortedPlants(plants);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    const dx = x - p.x;
    const dy = y - p.y;
    const rr = Math.max(p.r, 0.5);
    if (dx * dx + dy * dy <= rr * rr) return p;
  }
  return null;
}

// 裸石三角扇(确定性噪声边缘)
export function rockTriangles(rocks) {
  const verts = [];
  for (const rk of rocks) {
    const rng = mulberry32(rk.seed >>> 0);
    const N = 14;
    const rim = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const k = 0.75 + rng() * 0.4;
      const lx = Math.cos(a) * rk.rx * k;
      const ly = Math.sin(a) * rk.ry * k;
      const c = Math.cos(rk.rot);
      const s = Math.sin(rk.rot);
      rim.push([rk.x + lx * c - ly * s, rk.y + lx * s + ly * c, 0.55 + rng() * 0.45]);
    }
    for (let i = 0; i < N; i++) {
      const p0 = rim[i];
      const p1 = rim[(i + 1) % N];
      verts.push(rk.x, rk.y, 0.85, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
    }
  }
  return new Float32Array(verts);
}

const BG_WGSL = /* wgsl */ `
struct Uniforms {
  res: vec2f,
  scale: f32,
  waterCode: f32,
  offset: vec2f,
  plot: vec2f,
  waterWidth: f32,
  pad0: f32,
  sunDir: vec2f,
  pad1: vec2f,
};
@group(0) @binding(0) var<uniform> U: Uniforms;

fn worldFromScreen(scr: vec2f) -> vec2f {
  return (scr - U.offset) / U.scale;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  return vec4f(pos[vi], 0.0, 1.0);
}

fn waterDist(w: vec2f) -> f32 {
  let hw = U.waterWidth * 0.5;
  let c = i32(U.waterCode);
  if (c == 1) { return max(0.0, w.y - hw); }
  if (c == 2) { return max(0.0, (U.plot.y - w.y) - hw); }
  if (c == 3) { return max(0.0, (U.plot.x - w.x) - hw); }
  if (c == 4) { return max(0.0, w.x - hw); }
  if (c == 5) { return max(0.0, abs(w.y - U.plot.y * 0.5) - hw); }
  return 1e9;
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let w = worldFromScreen(fc.xy);
  if (w.x < 0.0 || w.y < 0.0 || w.x > U.plot.x || w.y > U.plot.y) {
    return vec4f(0.13, 0.14, 0.13, 1.0);
  }
  let d = waterDist(w);
  if (d <= 0.0) {
    let wave = sin(w.x * 2.1 + w.y * 1.3) * 0.05 + sin(w.y * 3.7) * 0.03;
    return vec4f(0.24 + wave, 0.46 + wave, 0.66 + wave, 1.0);
  }
  let near = max(0.0, 1.0 - d / 18.0);
  let moisture = clamp(0.25 + 0.65 * near, 0.0, 1.0);
  var ground = mix(vec3f(0.47, 0.44, 0.31), vec3f(0.32, 0.42, 0.24), moisture);
  let g = ((w.x / U.plot.x) * 2.0 - 1.0) * U.sunDir.x + ((w.y / U.plot.y) * 2.0 - 1.0) * U.sunDir.y;
  ground *= 0.92 + 0.16 * (0.65 + 0.3 * g);
  return vec4f(ground, 1.0);
}
`;

const ROCK_WGSL = /* wgsl */ `
struct Uniforms {
  res: vec2f, scale: f32, waterCode: f32,
  offset: vec2f, plot: vec2f, waterWidth: f32, pad0: f32,
  sunDir: vec2f, pad1: vec2f,
};
@group(0) @binding(0) var<uniform> U: Uniforms;
struct VOut { @builtin(position) pos: vec4f, @location(0) shade: f32 };
@vertex
fn vs(@location(0) p: vec2f, @location(1) shade: f32) -> VOut {
  let scr = p * U.scale + U.offset;
  var ndc = scr / U.res * 2.0 - vec2f(1.0, 1.0);
  ndc.y = -ndc.y;
  var o: VOut;
  o.pos = vec4f(ndc, 0.0, 1.0);
  o.shade = shade;
  return o;
}
@fragment
fn fs(v: VOut) -> @location(0) vec4f {
  let c = mix(vec3f(0.42, 0.42, 0.40), vec3f(0.66, 0.66, 0.62), v.shade);
  return vec4f(c, 1.0);
}
`;

const PLANT_WGSL = /* wgsl */ `
struct Uniforms {
  res: vec2f, scale: f32, waterCode: f32,
  offset: vec2f, plot: vec2f, waterWidth: f32, pad0: f32,
  sunDir: vec2f, pad1: vec2f,
};
@group(0) @binding(0) var<uniform> U: Uniforms;
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec3f,
  @location(2) flags: f32,
};
@vertex
fn vs(
  @location(0) corner: vec2f,
  @location(1) ipos: vec2f,
  @location(2) ir: f32,
  @location(3) iflags: f32,
  @location(4) icolor: vec3f
) -> VOut {
  let w = ipos + corner * ir;
  let scr = w * U.scale + U.offset;
  var ndc = scr / U.res * 2.0 - vec2f(1.0, 1.0);
  ndc.y = -ndc.y;
  var o: VOut;
  o.pos = vec4f(ndc, 0.0, 1.0);
  o.uv = corner;
  o.color = icolor;
  o.flags = iflags;
  return o;
}
@fragment
fn fs(v: VOut) -> @location(0) vec4f {
  let d = length(v.uv);
  if (d > 1.0) { discard; }
  var col = v.color * (0.8 + 0.35 * (1.0 - d));
  if (d > 0.88) { col *= 0.7; }
  let locked = v.flags - floor(v.flags / 2.0) * 2.0;      // bit0
  let picked = floor(v.flags / 2.0) - floor(v.flags / 4.0) * 2.0; // bit1
  let boxed = floor(v.flags / 4.0);                        // bit2
  if (locked > 0.5 && d > 0.62 && d < 0.72) {
    col = mix(col, vec3f(1.0, 0.78, 0.2), 0.95);
  }
  if (boxed > 0.5 && d > 0.78 && d < 0.86) {
    col = mix(col, vec3f(1.0, 1.0, 1.0), 0.9);
  }
  if (picked > 0.5 && d > 0.9) {
    col = mix(col, vec3f(0.2, 0.9, 1.0), 0.95);
  }
  return vec4f(col, 0.96);
}
`;

export async function createWebGPURenderer(canvas) {
  if (!navigator.gpu) return null;
  let device;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch {
    return null;
  }
  const ctx = canvas.getContext('webgpu');
  if (!ctx) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const uniformBuffer = device.createBuffer({ size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  function makePipeline(code, buffers, blend) {
    const module = device.createShaderModule({ code });
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs', buffers },
      fragment: { module, entryPoint: 'fs', targets: [{ format, blend }] },
      primitive: { topology: 'triangle-list' }
    });
  }

  const blendOn = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
  };

  const bgPipe = makePipeline(BG_WGSL, [], undefined);
  const rockPipe = makePipeline(ROCK_WGSL, [{
    arrayStride: 12,
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x2' },
      { shaderLocation: 1, offset: 8, format: 'float32' }
    ]
  }], undefined);
  const plantPipe = makePipeline(PLANT_WGSL, [
    {
      arrayStride: 8,
      stepMode: 'vertex',
      attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }]
    },
    {
      arrayStride: 28,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: 1, offset: 0, format: 'float32x2' },
        { shaderLocation: 2, offset: 8, format: 'float32' },
        { shaderLocation: 3, offset: 12, format: 'float32' },
        { shaderLocation: 4, offset: 16, format: 'float32x3' }
      ]
    }
  ], blendOn);

  const quad = device.createBuffer({
    size: 6 * 2 * 4,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(quad, 0, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));

  function bindGroupFor(pipe) {
    return device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });
  }
  const bgBind = bindGroupFor(bgPipe);
  const rockBind = bindGroupFor(rockPipe);
  const plantBind = bindGroupFor(plantPipe);

  let rockBuf = null;
  let rockCount = 0;
  let instBuf = null;
  let instCap = 0;

  return {
    kind: 'webgpu',
    render(state) {
      const { plants, rocks, params, season, view, pickedId, boxIds } = state;
      const dpr = view.dpr || 1;
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return;
      const sun = ASPECT_DIR[params.aspect] || [0, 0];
      device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
        w, h, view.scale * dpr, WATER_CODE[params.water] ?? 0,
        view.ox * dpr, view.oy * dpr, params.length, params.width,
        params.waterWidth, 0, sun[0], sun[1],
        0, 0, 0, 0
      ]));

      const rockData = rockTriangles(rocks);
      rockCount = rockData.length / 3;
      if (!rockBuf || rockBuf.size < rockData.byteLength) {
        rockBuf?.destroy();
        rockBuf = device.createBuffer({ size: Math.max(rockData.byteLength, 64), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      }
      if (rockData.length) device.queue.writeBuffer(rockBuf, 0, rockData);

      const sorted = sortedPlants(plants);
      const inst = new Float32Array(sorted.length * 7);
      sorted.forEach((p, i) => {
        const [r, g, b] = plantColor(p, season);
        let flags = 0;
        if (p.locked) flags |= 1;
        if (p.id === pickedId) flags |= 2;
        if (boxIds && boxIds.has(p.id)) flags |= 4;
        inst.set([p.x, p.y, p.r, flags, r, g, b], i * 7);
      });
      if (sorted.length > instCap) {
        instBuf?.destroy();
        instCap = Math.max(64, sorted.length * 2);
        instBuf = device.createBuffer({ size: instCap * 28, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      }
      if (sorted.length) device.queue.writeBuffer(instBuf, 0, inst);

      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: { r: 0.13, g: 0.14, b: 0.13, a: 1 },
          storeOp: 'store'
        }]
      });
      pass.setPipeline(bgPipe);
      pass.setBindGroup(0, bgBind);
      pass.draw(3);
      if (rockCount) {
        pass.setPipeline(rockPipe);
        pass.setBindGroup(0, rockBind);
        pass.setVertexBuffer(0, rockBuf);
        pass.draw(rockCount);
      }
      if (sorted.length) {
        pass.setPipeline(plantPipe);
        pass.setBindGroup(0, plantBind);
        pass.setVertexBuffer(0, quad);
        pass.setVertexBuffer(1, instBuf);
        pass.draw(6, sorted.length);
      }
      pass.end();
      device.queue.submit([enc.finish()]);
    }
  };
}
