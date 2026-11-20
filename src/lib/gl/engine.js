import * as S from './shaders.js';

export const SCENE_W = 1600;
export const SCENE_H = 1200;

export const KIND_NAME = { brush: '笔刷', star: '星星', fish: '小鱼', house: '房子' };

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

class Prog {
  constructor(gl, vs, fs) {
    this.gl = gl;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('Shader error: ' + gl.getShaderInfoLog(sh) + '\n' + src);
      }
      return sh;
    };
    this.prog = gl.createProgram();
    gl.attachShader(this.prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(this.prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      throw new Error('Link error: ' + gl.getProgramInfoLog(this.prog));
    }
    this._loc = {};
  }
  use() { this.gl.useProgram(this.prog); }
  u(name) {
    if (!(name in this._loc)) this._loc[name] = this.gl.getUniformLocation(this.prog, name);
    return this._loc[name];
  }
}

// ---------- 形状顶点生成（场景坐标，y 向下） ----------
function starTris(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  const tris = [];
  for (let i = 0; i < 10; i++) {
    const a = pts[i], b = pts[(i + 1) % 10];
    tris.push(cx, cy, a[0], a[1], b[0], b[1]);
  }
  return tris;
}

function ellipseFan(cx, cy, rx, ry, seg = 24) {
  const tris = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    tris.push(
      cx, cy,
      cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry,
      cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry
    );
  }
  return tris;
}

function rectTris(x0, y0, x1, y1) {
  return [x0, y0, x1, y0, x0, y1, x1, y0, x1, y1, x0, y1];
}

function fishParts(cx, cy, r) {
  return [
    { tris: ellipseFan(cx, cy, r * 0.95, r * 0.55), tint: 1.0, alpha: 0.95 },
    { tris: [cx - r * 0.8, cy, cx - r * 1.5, cy - r * 0.5, cx - r * 1.5, cy + r * 0.5], tint: 0.85, alpha: 0.95 },
    { tris: ellipseFan(cx + r * 0.45, cy - r * 0.15, r * 0.11, r * 0.11, 12), white: true, alpha: 1.0 }
  ];
}

function houseParts(cx, cy, r) {
  return [
    { tris: [cx - r * 0.95, cy - r * 0.1, cx + r * 0.95, cy - r * 0.1, cx, cy - r * 1.0], tint: 1.05, alpha: 0.95 },
    { tris: rectTris(cx - r * 0.7, cy - r * 0.1, cx + r * 0.7, cy + r * 0.85), tint: 0.9, alpha: 0.95 },
    { tris: rectTris(cx - r * 0.16, cy + r * 0.35, cx + r * 0.16, cy + r * 0.85), tint: 0.4, alpha: 1.0 },
    { tris: rectTris(cx + r * 0.25, cy + r * 0.05, cx + r * 0.5, cy + r * 0.3), white: true, alpha: 0.9 }
  ];
}

function shapeParts(kind, cx, cy, r) {
  if (kind === 'star') return [{ tris: starTris(cx, cy, r), tint: 1.0, alpha: 0.95 }];
  if (kind === 'fish') return fishParts(cx, cy, r);
  return houseParts(cx, cy, r);
}

// 外发光轮廓：把每个部件绕中心放大
function scaleTris(tris, cx, cy, k) {
  const out = [];
  for (let i = 0; i < tris.length; i += 2) {
    out.push(cx + (tris[i] - cx) * k, cy + (tris[i + 1] - cy) * k);
  }
  return out;
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    }));
    if (!gl) throw new Error('此浏览器不支持 WebGL2');

    this.pCopy = new Prog(gl, S.quadVS, S.copyFS);
    this.pBrush = new Prog(gl, S.brushVS, S.brushFS);
    this.pShape = new Prog(gl, S.shapeVS, S.shapeFS);
    this.pBright = new Prog(gl, S.quadVS, S.brightFS);
    this.pBlur = new Prog(gl, S.quadVS, S.blurFS);
    this.pCombine = new Prog(gl, S.quadVS, S.combineFS);
    this.pDof = new Prog(gl, S.quadVS, S.dofMixFS);
    this.pTone = new Prog(gl, S.quadVS, S.tonemapFS);
    this.pOutline = new Prog(gl, S.quadVS, S.outlineFS);
    this.pBlit = new Prog(gl, S.quadVS, S.blitFS);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.scene = this.makeTarget(SCENE_W, SCENE_H);
    this.ping = [this.makeTarget(SCENE_W, SCENE_H), this.makeTarget(SCENE_W, SCENE_H)];
    this.bloomA = this.makeTarget(SCENE_W / 2, SCENE_H / 2);
    this.bloomB = this.makeTarget(SCENE_W / 2, SCENE_H / 2);
    this.dofA = this.makeTarget(SCENE_W, SCENE_H);
    this.dofB = this.makeTarget(SCENE_W, SCENE_H);

    this.layers = [];   // {id, kind, color, size, visible, target}
    this.strokes = [];  // {id, kind, color, size, points}
    this.active = null;
    this.layerSeq = 0;
    this.autoRender = true;
    this.onChange = null;

    this.view = { scale: 1, x: 0, y: 0 };
    this.effects = null;
    this.splitX = -1; // css px，-1 关闭
    this.hc = false;
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;
    this.afterTex = this.scene.tex;
  }

  makeTarget(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('帧缓冲创建失败');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  }

  freeTarget(t) {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  target(t) {
    const gl = this.gl;
    if (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, t.w, t.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  clear(t, r = 0, g = 0, b = 0, a = 0) {
    const gl = this.gl;
    this.target(t);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  blend(mode) {
    const gl = this.gl;
    if (mode === 'none') gl.disable(gl.BLEND);
    else {
      gl.enable(gl.BLEND);
      if (mode === 'add') gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  quad() {
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  bindTex(unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  resize(cssW, cssH, dpr) {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  setView(v) { this.view = { ...v }; }
  setEffects(fx) { this.effects = JSON.parse(JSON.stringify(fx)); }
  setSplit(x) { this.splitX = x == null ? -1 : x; }
  setHighContrast(b) { this.hc = b; }

  screenToScene(sx, sy) {
    return { x: (sx - this.view.x) / this.view.scale, y: (sy - this.view.y) / this.view.scale };
  }

  // ---------- 图层 / 笔画 ----------
  beginStroke(kind, color, size) {
    const id = ++this.layerSeq;
    const target = this.makeTarget(SCENE_W, SCENE_H);
    this.clear(target);
    const layer = { id, kind, color, size, visible: true, target };
    this.layers.push(layer);
    this.active = { layer, points: [], last: null };
    return id;
  }

  strokeTo(x, y) {
    const a = this.active;
    if (!a) return;
    const { layer } = a;
    if (layer.kind === 'brush') {
      const pts = [];
      const step = Math.max(2, layer.size * 0.18);
      if (a.last) {
        const dx = x - a.last[0], dy = y - a.last[1];
        const dist = Math.hypot(dx, dy);
        const n = Math.max(1, Math.floor(dist / step));
        for (let i = 1; i <= n; i++) pts.push([a.last[0] + (dx * i) / n, a.last[1] + (dy * i) / n]);
      } else {
        pts.push([x, y]);
      }
      if (pts.length) {
        a.points.push(...pts);
        a.last = [x, y];
        this.drawBrush(layer.target, pts, layer.color, layer.size);
      }
    } else {
      // 图章：跟随手指位置重画
      a.points = [[x, y]];
      this.clear(layer.target);
      this.drawShape(layer.target, layer.kind, x, y, layer.size * 1.6, layer.color);
    }
    if (this.autoRender) this.render();
  }

  endStroke() {
    const a = this.active;
    if (!a) return null;
    this.active = null;
    if (!a.points.length) {
      this.removeLayer(a.layer.id);
      return null;
    }
    this.strokes.push({
      id: a.layer.id,
      kind: a.layer.kind,
      color: a.layer.color,
      size: a.layer.size,
      points: a.points
    });
    this.notify();
    return a.layer.id;
  }

  cancelStroke() {
    if (!this.active) return;
    const id = this.active.layer.id;
    this.active = null;
    this.removeLayer(id);
  }

  drawBrush(target, pts, color, size) {
    const gl = this.gl;
    this.target(target);
    const flat = new Float32Array(pts.length * 2);
    pts.forEach((p, i) => { flat[i * 2] = p[0]; flat[i * 2 + 1] = p[1]; });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, flat, gl.DYNAMIC_DRAW);
    const p = this.pBrush;
    p.use();
    gl.uniform2f(p.u('uScene'), SCENE_W, SCENE_H);
    gl.uniform1f(p.u('uSize'), size);
    const [r, g, b] = hexToRgb(color);
    gl.uniform3f(p.u('uColor'), r, g, b);
    this.blend('add');
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, pts.length);
    this.blend('none');
  }

  drawShape(target, kind, cx, cy, r, color) {
    const gl = this.gl;
    this.target(target);
    const p = this.pShape;
    p.use();
    gl.uniform2f(p.u('uScene'), SCENE_W, SCENE_H);
    const [cr, cg, cb] = hexToRgb(color);
    const parts = shapeParts(kind, cx, cy, r);
    const draw = (tris, red, grn, blu, alpha, blendMode) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.DYNAMIC_DRAW);
      gl.uniform3f(p.u('uColor'), red, grn, blu);
      gl.uniform1f(p.u('uAlpha'), alpha);
      this.blend(blendMode);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, tris.length / 2);
    };
    // 外发光
    for (const part of parts) {
      const halo = scaleTris(part.tris, cx, cy, 1.18);
      draw(halo, cr, cg, cb, 0.22, 'add');
    }
    // 实体
    for (const part of parts) {
      if (part.white) draw(part.tris, 1, 1, 0.92, part.alpha, 'alpha');
      else {
        const t = part.tint || 1;
        draw(part.tris, Math.min(1, cr * t), Math.min(1, cg * t), Math.min(1, cb * t), part.alpha, 'alpha');
      }
    }
    this.blend('none');
  }

  removeLayer(id) {
    const i = this.layers.findIndex((l) => l.id === id);
    if (i >= 0) {
      this.freeTarget(this.layers[i].target);
      this.layers.splice(i, 1);
    }
    const j = this.strokes.findIndex((s) => s.id === id);
    if (j >= 0) this.strokes.splice(j, 1);
    if (this.autoRender) this.render();
    this.notify();
  }

  setLayerVisible(id, v) {
    const l = this.layers.find((x) => x.id === id);
    if (l) {
      l.visible = v;
      if (this.autoRender) this.render();
      this.notify();
    }
  }

  undoLast() {
    if (!this.layers.length) return;
    this.removeLayer(this.layers[this.layers.length - 1].id);
  }

  clearAll() {
    for (const l of this.layers) this.freeTarget(l.target);
    this.layers = [];
    this.strokes = [];
    if (this.autoRender) this.render();
    this.notify();
  }

  layerMeta() {
    const counts = {};
    return this.layers.map((l) => {
      counts[l.kind] = (counts[l.kind] || 0) + 1;
      return {
        id: l.id,
        kind: l.kind,
        color: l.color,
        visible: l.visible,
        name: (KIND_NAME[l.kind] || '图层') + ' ' + counts[l.kind]
      };
    });
  }

  serialize() {
    return this.strokes.map((s) => ({ ...s, points: s.points.map((p) => [p[0], p[1]]) }));
  }

  replay(strokes) {
    this.autoRender = false;
    this.clearAll();
    for (const s of strokes || []) {
      this.beginStroke(s.kind, s.color, s.size);
      for (const p of s.points) this.strokeTo(p[0], p[1]);
      this.endStroke();
    }
    this.autoRender = true;
    this.render();
    this.notify();
    return this.layerMeta();
  }

  notify() {
    if (this.onChange) this.onChange();
  }

  // ---------- 渲染管线 ----------
  composite() {
    const gl = this.gl;
    this.clear(this.scene);
    const p = this.pCopy;
    p.use();
    gl.uniform1i(p.u('uTex'), 0);
    this.blend('alpha');
    for (const l of this.layers) {
      if (!l.visible) continue;
      this.bindTex(0, l.target.tex);
      this.quad();
    }
    this.blend('none');
  }

  blurPass(src, dst, dirX, dirY) {
    const gl = this.gl;
    this.target(dst);
    const p = this.pBlur;
    p.use();
    gl.uniform1i(p.u('uTex'), 0);
    gl.uniform2f(p.u('uDir'), dirX, dirY);
    this.bindTex(0, src);
    this.quad();
  }

  passBloom(srcTex, params, outT) {
    const gl = this.gl;
    // 亮部提取 → 半分辨率
    this.target(this.bloomA);
    let p = this.pBright;
    p.use();
    gl.uniform1i(p.u('uTex'), 0);
    gl.uniform1f(p.u('uThreshold'), 0.35);
    this.bindTex(0, srcTex);
    this.quad();
    // 两轮分离高斯，半径由参数控制
    const r = params.radius * 1.5;
    for (let i = 0; i < 2; i++) {
      this.blurPass(this.bloomA.tex, this.bloomB, r / this.bloomA.w, 0);
      this.blurPass(this.bloomB.tex, this.bloomA, 0, r / this.bloomA.h);
    }
    // 叠加
    this.target(outT);
    p = this.pCombine;
    p.use();
    gl.uniform1i(p.u('uMain'), 0);
    gl.uniform1i(p.u('uBloom'), 1);
    gl.uniform1f(p.u('uIntensity'), params.intensity);
    this.bindTex(0, srcTex);
    this.bindTex(1, this.bloomA.tex);
    this.quad();
  }

  passDof(srcTex, params, outT) {
    const gl = this.gl;
    const px = 1.5 + params.strength * 2.5;
    this.blurPass(srcTex, this.dofA, px / SCENE_W, 0);
    this.blurPass(this.dofA.tex, this.dofB, 0, px / SCENE_H);
    this.target(outT);
    const p = this.pDof;
    p.use();
    gl.uniform1i(p.u('uSharp'), 0);
    gl.uniform1i(p.u('uBlur'), 1);
    gl.uniform2f(p.u('uFocus'), params.focusX, 1 - params.focusY);
    const near = params.range * 0.6;
    gl.uniform1f(p.u('uNear'), near);
    gl.uniform1f(p.u('uFar'), near + 0.35);
    gl.uniform1f(p.u('uAspect'), SCENE_W / SCENE_H);
    this.bindTex(0, srcTex);
    this.bindTex(1, this.dofB.tex);
    this.quad();
  }

  passTonemap(srcTex, params, outT) {
    const gl = this.gl;
    this.target(outT);
    const p = this.pTone;
    p.use();
    gl.uniform1i(p.u('uTex'), 0);
    gl.uniform1i(p.u('uMode'), { soft: 0, vivid: 1, night: 2 }[params.mode] ?? 0);
    this.bindTex(0, srcTex);
    this.quad();
  }

  passOutline(srcTex, params, outT) {
    const gl = this.gl;
    this.target(outT);
    const p = this.pOutline;
    p.use();
    gl.uniform1i(p.u('uTex'), 0);
    gl.uniform2f(p.u('uTexel'), 1 / SCENE_W, 1 / SCENE_H);
    gl.uniform1f(p.u('uWidth'), params.width);
    const [r, g, b] = hexToRgb(params.color);
    gl.uniform3f(p.u('uColor'), r, g, b);
    this.bindTex(0, srcTex);
    this.quad();
  }

  runPipeline() {
    const fx = this.effects;
    if (!fx) { this.afterTex = this.scene.tex; return; }
    let src = this.scene.tex;
    let cur = 0;
    for (const id of fx.order) {
      const params = fx.params[id];
      if (!params || !params.enabled) continue;
      const out = this.ping[cur];
      if (id === 'bloom') this.passBloom(src, params, out);
      else if (id === 'dof') this.passDof(src, params, out);
      else if (id === 'tonemap') this.passTonemap(src, params, out);
      else if (id === 'outline') this.passOutline(src, params, out);
      src = out.tex;
      cur ^= 1;
    }
    this.afterTex = src;
  }

  blit(target, view, split, hc) {
    const gl = this.gl;
    this.target(target);
    const p = this.pBlit;
    p.use();
    const w = target ? target.w : this.canvas.width;
    const h = target ? target.h : this.canvas.height;
    const dpr = target ? 1 : this.dpr;
    gl.uniform1i(p.u('uBefore'), 0);
    gl.uniform1i(p.u('uAfter'), 1);
    gl.uniform2f(p.u('uScene'), SCENE_W, SCENE_H);
    gl.uniform2f(p.u('uCanvas'), w, h);
    gl.uniform1f(p.u('uScale'), view.scale * dpr);
    gl.uniform2f(p.u('uOffset'), view.x * dpr, view.y * dpr);
    gl.uniform1f(p.u('uSplit'), split == null || split < 0 ? -1 : split * dpr);
    gl.uniform1f(p.u('uDpr'), dpr);
    gl.uniform1i(p.u('uHC'), hc ? 1 : 0);
    gl.uniform3f(p.u('uBg'), 0.055, 0.06, 0.12);
    this.bindTex(0, this.scene.tex);
    this.bindTex(1, this.afterTex);
    this.quad();
  }

  render() {
    this.composite();
    this.runPipeline();
    this.blit(null, this.view, this.splitX, this.hc);
  }

  // ---------- 导出 ----------
  exportPNG(scale = 2) {
    const gl = this.gl;
    const w = SCENE_W * scale, h = SCENE_H * scale;
    const t = this.makeTarget(w, h);
    // 完整场景视图（忽略当前缩放与分屏）
    this.blit(t, { scale, x: 0, y: 0 }, -1, this.hc);
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    this.freeTarget(t);
    // 翻转行（GL 自下而上）
    const row = w * 4;
    const flipped = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      flipped.set(pixels.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    }
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    cv.getContext('2d').putImageData(new ImageData(flipped, w, h), 0, 0);
    return cv;
  }
}
