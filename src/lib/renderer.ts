/**
 * WebGL2 渲染器。
 * 职责：场景 SDF 实例化绘制、HDR 浮点帧缓冲、可重排的后处理效果链、
 * 分屏显示、高清 PNG 导出。不碰任何 DOM/状态管理逻辑。
 */
import type {
  Layer,
  EffectId,
  ProjectState,
  BloomParams,
  DofParams,
  TonemapParams,
  OutlineParams
} from './types';
import * as GLSL from './shaders';

const SHAPE_ID: Record<string, number> = {
  brush: 0,
  star: 1,
  fish: 2,
  house: 3,
  eraser: 4
};

const TONEMAP_MODE: Record<string, number> = { soft: 0, vivid: 1, night: 2 };

const COPY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 outColor;
void main() { outColor = texture(uTex, vUv); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('着色器编译失败:\n' + log + '\n' + src);
  }
  return sh;
}

class Program {
  private gl: WebGL2RenderingContext;
  readonly prog: WebGLProgram;
  private uloc = new Map<string, WebGLUniformLocation | null>();

  constructor(gl: WebGL2RenderingContext, vs: string, fs: string, tag = 'program') {
    this.gl = gl;
    const v = compile(gl, gl.VERTEX_SHADER, vs);
    const f = compile(gl, gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(p) || '(无链接日志)';
      const vsLog = gl.getShaderInfoLog(v) ?? '';
      const fsLog = gl.getShaderInfoLog(f) ?? '';
      gl.deleteProgram(p);
      throw new Error(
        `着色器链接失败 [${tag}]: ${info}\n顶点日志: ${vsLog || '无'}\n片元日志: ${fsLog || '无'}`
      );
    }
    this.prog = p;
  }

  use() {
    this.gl.useProgram(this.prog);
  }

  private loc(name: string) {
    if (!this.uloc.has(name)) {
      this.uloc.set(name, this.gl.getUniformLocation(this.prog, name));
    }
    return this.uloc.get(name)!;
  }

  f1(name: string, v: number) {
    this.gl.uniform1f(this.loc(name), v);
  }
  f2(name: string, x: number, y: number) {
    this.gl.uniform2f(this.loc(name), x, y);
  }
  f3(name: string, x: number, y: number, z: number) {
    this.gl.uniform3f(this.loc(name), x, y, z);
  }
  i1(name: string, v: number) {
    this.gl.uniform1i(this.loc(name), v);
  }
  tex(name: string, unit: number) {
    this.gl.uniform1i(this.loc(name), unit);
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
  }
}

class FBO {
  readonly tex: WebGLTexture;
  readonly fbo: WebGLFramebuffer;
  constructor(
    private gl: WebGL2RenderingContext,
    readonly w: number,
    readonly h: number,
    readonly isFloat: boolean
  ) {
    const gl2 = gl;
    this.tex = gl2.createTexture()!;
    gl2.bindTexture(gl2.TEXTURE_2D, this.tex);
    const internal = isFloat ? gl2.RGBA16F : gl2.RGBA8;
    gl2.texImage2D(gl2.TEXTURE_2D, 0, internal, w, h, 0, gl2.RGBA,
      isFloat ? gl2.HALF_FLOAT : gl2.UNSIGNED_BYTE, null);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
    this.fbo = gl2.createFramebuffer()!;
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, this.fbo);
    gl2.framebufferTexture2D(gl2.FRAMEBUFFER, gl2.COLOR_ATTACHMENT0,
      gl2.TEXTURE_2D, this.tex, 0);
    if (gl2.checkFramebufferStatus(gl2.FRAMEBUFFER) !== gl2.FRAMEBUFFER_COMPLETE) {
      throw new Error('帧缓冲创建失败 (w=' + w + ' h=' + h + ' float=' + isFloat + ')');
    }
  }

  bind() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fbo);
    this.gl.viewport(0, 0, this.w, this.h);
  }

  dispose() {
    this.gl.deleteTexture(this.tex);
    this.gl.deleteFramebuffer(this.fbo);
  }
}

export interface ViewRect { minX: number; minY: number; maxX: number; maxY: number }

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private programs!: Record<string, Program>;
  private sceneVao!: WebGLVertexArrayObject;
  private quadVao!: WebGLVertexArrayObject;
  private inst0!: WebGLBuffer;
  private inst1!: WebGLBuffer;
  private fbos: FBO[] = [];
  private fbW = 0;
  private fbH = 0;
  private useFloat = true;
  private cssW = 0;
  private cssH = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: false
    });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2，请换用新版 Chrome / Edge / Safari。');
    this.gl = gl;
    const floatExt = gl.getExtension('EXT_color_buffer_float');
    if (!floatExt) {
      this.useFloat = !!gl.getExtension('EXT_color_buffer_half_float');
    }
    this.initPrograms();
    this.initGeometry();
  }

  get floatSupported() {
    return this.useFloat;
  }

  private initPrograms() {
    const gl = this.gl;
    this.programs = {
      scene: new Program(gl, GLSL.SCENE_VERT, GLSL.SCENE_FRAG, 'scene'),
      extract: new Program(gl, GLSL.FULLSCREEN_VERT, GLSL.BLOOM_EXTRACT_FRAG, 'extract'),
      gauss: new Program(gl, GLSL.FULLSCREEN_VERT, GLSL.GAUSS_FRAG, 'gauss'),
      bloomComposite: new Program(gl, GLSL.FULLSCREEN_VERT, GLSL.BLOOM_COMPOSITE_FRAG, 'bloom'),
      dofCombine: new Program(gl, GLSL.FULLSCREEN_VERT, GLSL.DOF_COMBINE_FRAG, 'dof'),
      tonemap: new Program(gl, GLSL.FULLSCREEN_VERT, GLSL.TONEMAP_FRAG, 'tonemap'),
      outline: new Program(gl, GLSL.FULLSCREEN_VERT, GLSL.OUTLINE_FRAG, 'outline'),
      display: new Program(gl, GLSL.FULLSCREEN_VERT, GLSL.DISPLAY_FRAG, 'display'),
      copy: new Program(gl, GLSL.FULLSCREEN_VERT, COPY_FRAG, 'copy')
    };
  }

  private initGeometry() {
    const gl = this.gl;
    // 场景实例化四边形（triangle strip）
    this.sceneVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.sceneVao);
    const corner = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, 1, 1
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.inst0 = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    this.inst1 = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    // 全屏三角形（gl_VertexID 驱动，无需缓冲）
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(null);
  }

  /** 依据画布 CSS 尺寸调整绘图缓冲；返回是否发生了重建 */
  resize(cssW: number, cssH: number, dpr: number): boolean {
    this.cssW = cssW;
    this.cssH = cssH;
    const w = Math.max(2, Math.round(cssW * dpr));
    const h = Math.max(2, Math.round(cssH * dpr));
    if (w === this.fbW && h === this.fbH && this.fbos.length) return false;
    this.fbos.forEach((f) => f.dispose());
    this.fbos = [];
    // 0 = 场景原图（分屏用，整条链不覆写）；1/2 = 效果 ping-pong；3/4 = 临时
    for (let i = 0; i < 5; i++) {
      this.fbos.push(new FBO(this.gl, w, h, this.useFloat));
    }
    this.fbW = w;
    this.fbH = h;
    this.canvas.width = w;
    this.canvas.height = h;
    return true;
  }

  /** 由视图状态算出当前可视的世界矩形（世界宽恒为 1） */
  viewRect(zoom: number, panX: number, panY: number): ViewRect {
    const aspect = this.cssW / Math.max(1, this.cssH);
    const worldH = 1 / aspect;
    const halfW = 0.5 / zoom;
    const halfH = worldH * 0.5 / zoom;
    const cx = 0.5 + panX;
    const cy = 0.5 + panY;
    return { minX: cx - halfW, minY: cy - halfH, maxX: cx + halfW, maxY: cy + halfH };
  }

  screenToWorld(clientX: number, clientY: number, rect: DOMRect, view: ViewRect) {
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    return {
      x: view.minX + u * (view.maxX - view.minX),
      y: view.minY + v * (view.maxY - view.minY)
    };
  }

  worldToScreen(x: number, y: number, rect: DOMRect, view: ViewRect) {
    const u = (x - view.minX) / (view.maxX - view.minX);
    const v = (y - view.minY) / (view.maxY - view.minY);
    return { left: u * rect.width, top: v * rect.height };
  }

  private drawFullscreen(prog: Program) {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVao);
    gl.useProgram(prog.prog);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private buildInstances(layers: Layer[]): {
    data0: Float32Array;
    data1: Float32Array;
    runs: { erase: boolean; start: number; count: number }[];
  } {
    const visible = layers.filter((l) => l.visible);
    const count = visible.reduce((n, l) => n + l.dabs.length, 0);
    const data0 = new Float32Array(count * 4);
    const data1 = new Float32Array(count * 4);    const runs: { erase: boolean; start: number; count: number }[] = [];
    let i = 0;
    for (const layer of visible) {
      for (const dab of layer.dabs) {
        const o = i * 4;
        data0[o] = dab.x;
        data0[o + 1] = dab.y;
        data0[o + 2] = dab.r;
        data0[o + 3] = dab.rot;
        data1[o] = dab.color[0];
        data1[o + 1] = dab.color[1];
        data1[o + 2] = dab.color[2];
        data1[o + 3] = SHAPE_ID[dab.shape] ?? 0;
        const erase = dab.shape === 'eraser';
        const last = runs[runs.length - 1];
        if (last && last.erase === erase) {
          last.count++;
        } else {
          runs.push({ erase, start: i, count: 1 });
        }
        i++;
      }
    }
    return { data0, data1, runs };
  }

  private renderScene(
    target: FBO,
    layers: Layer[],
    view: ViewRect,
    highContrast: boolean
  ) {
    const gl = this.gl;
    target.bind();
    // 暗色夜空底色（线性值）。高对比模式用纯黑让发光色更跳。
    if (highContrast) {
      gl.clearColor(0, 0, 0, 1);
    } else {
      gl.clearColor(0.0022, 0.0036, 0.0103, 1);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!layers.some((l) => l.visible && l.dabs.length)) return;

    const { data0, data1, runs } = this.buildInstances(layers);
    gl.bindVertexArray(this.sceneVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst0);
    gl.bufferData(gl.ARRAY_BUFFER, data0, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst1);
    gl.bufferData(gl.ARRAY_BUFFER, data1, gl.DYNAMIC_DRAW);

    const p = this.programs.scene;
    p.use();
    p.f2('uViewMin', view.minX, view.minY);
    p.f2('uViewMax', view.maxX, view.maxY);
    p.f1('uHighContrast', highContrast ? 1 : 0);

    gl.enable(gl.BLEND);
    for (const run of runs) {
      if (run.erase) {
        // 目标色与已有 alpha 同时按形状覆盖率擦除
        p.f1('uErase', 1);
        gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA,
          gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        p.f1('uErase', 0);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
          gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.count);
    }
    gl.disable(gl.BLEND);
  }

  private runBloom(src: number, dst: number, scratch: number[], b: BloomParams) {
    const gl = this.gl;
    const fbos = this.activeFbos;
    const p = this.programs;
    // 亮度提取
    fbos[scratch[0]].bind();
    p.extract.use();
    p.extract.tex('uTex', 0);
    gl.bindTexture(gl.TEXTURE_2D, fbos[src].tex);
    p.extract.f1('uThreshold', b.threshold);
    this.drawFullscreen(p.extract);

    // 双向高斯，迭代次数即扩散半径
    let a = scratch[0];
    let c = scratch[1];
    for (let i = 0; i < b.radius; i++) {
      const w = fbos[a].w;
      const h = fbos[a].h;
      fbos[c].bind();
      p.gauss.use();
      p.gauss.tex('uTex', 0);
      gl.bindTexture(gl.TEXTURE_2D, fbos[a].tex);
      p.gauss.f2('uDir', 1 / w, 0);
      p.gauss.f1('uSpread', 1);
      this.drawFullscreen(p.gauss);
      const t = a; a = c; c = t;

      fbos[c].bind();
      p.gauss.use();
      p.gauss.tex('uTex', 0);
      gl.bindTexture(gl.TEXTURE_2D, fbos[a].tex);
      p.gauss.f2('uDir', 0, 1 / h);
      p.gauss.f1('uSpread', 1);
      this.drawFullscreen(p.gauss);
      const t2 = a; a = c; c = t2;
    }

    fbos[dst].bind();
    p.bloomComposite.use();
    p.bloomComposite.tex('uScene', 0);
    gl.bindTexture(gl.TEXTURE_2D, fbos[src].tex);
    p.bloomComposite.tex('uBloom', 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fbos[a].tex);
    p.bloomComposite.f1('uIntensity', b.intensity);
    this.drawFullscreen(p.bloomComposite);
  }

  private runDof(src: number, dst: number, scratch: number[], d: DofParams, view: ViewRect) {
    const gl = this.gl;
    const fbos = this.activeFbos;
    const p = this.programs;
    const w = fbos[src].w;
    const h = fbos[src].h;
    // 两趟高斯得到全幅模糊
    fbos[scratch[0]].bind();
    p.gauss.use();
    p.gauss.tex('uTex', 0);
    gl.bindTexture(gl.TEXTURE_2D, fbos[src].tex);
    p.gauss.f2('uDir', 1 / w, 0);
    p.gauss.f1('uSpread', d.blur);
    this.drawFullscreen(p.gauss);

    fbos[scratch[1]].bind();
    p.gauss.use();
    p.gauss.tex('uTex', 0);
    gl.bindTexture(gl.TEXTURE_2D, fbos[scratch[0]].tex);
    p.gauss.f2('uDir', 0, 1 / h);
    p.gauss.f1('uSpread', d.blur);
    this.drawFullscreen(p.gauss);

    fbos[dst].bind();
    p.dofCombine.use();
    p.dofCombine.tex('uScene', 0);
    gl.bindTexture(gl.TEXTURE_2D, fbos[src].tex);
    p.dofCombine.tex('uBlur', 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fbos[scratch[1]].tex);
    p.dofCombine.f2('uViewMin', view.minX, view.minY);
    p.dofCombine.f2('uViewMax', view.maxX, view.maxY);
    p.dofCombine.f2('uFocus', d.focusX, d.focusY);
    p.dofCombine.f1('uRange', d.range);
    this.drawFullscreen(p.dofCombine);
  }

  private runTonemap(src: number, dst: number, t: TonemapParams, highContrast: boolean) {
    const gl = this.gl;
    const fbos = this.activeFbos;
    fbos[dst].bind();
    const p = this.programs.tonemap;
    p.use();
    p.tex('uTex', 0);
    gl.bindTexture(gl.TEXTURE_2D, fbos[src].tex);
    p.i1('uMode', TONEMAP_MODE[t.mode] ?? 0);
    p.f1('uHighContrast', highContrast ? 1 : 0);
    this.drawFullscreen(p);
  }

  private runOutline(src: number, dst: number, o: OutlineParams) {
    const gl = this.gl;
    const fbos = this.activeFbos;
    fbos[dst].bind();
    const p = this.programs.outline;
    p.use();
    p.tex('uTex', 0);
    gl.bindTexture(gl.TEXTURE_2D, fbos[src].tex);
    p.f2('uTexel', 1 / fbos[src].w, 1 / fbos[src].h);
    p.f1('uThickness', o.thickness);
    const rgb = hexToRgb(o.color);
    p.f3('uEdgeColor', rgb[0], rgb[1], rgb[2]);
    this.drawFullscreen(p);
  }

  private activeFbos: FBO[] = [];

  /**
   * 按 effectOrder 跑完整效果链。
   * 约定：ping[0] 是原始场景，整条链不会再覆写它（分屏的“效果前”要用）。
   */
  private runChain(
    fbos: FBO[],
    layers: Layer[],
    order: EffectId[],
    params: {
      bloom: BloomParams;
      dof: DofParams;
      tonemap: TonemapParams;
      outline: OutlineParams;
    },
    view: ViewRect,
    highContrast: boolean
  ): number {
    this.activeFbos = fbos;
    this.renderScene(fbos[0], layers, view, highContrast);
    // 0 永远是场景原图；1/2 做链上的 ping-pong；3/4 是各效果的临时缓冲
    let src = 0;
    let dst = 1;
    const scratch = [3, 4];
    for (const id of order) {
      if (id === 'bloom' && params.bloom.enabled) {
        this.runBloom(src, dst, scratch, params.bloom);
      } else if (id === 'dof' && params.dof.enabled) {
        this.runDof(src, dst, scratch, params.dof, view);
      } else if (id === 'tonemap' && params.tonemap.enabled) {
        this.runTonemap(src, dst, params.tonemap, highContrast);
      } else if (id === 'outline' && params.outline.enabled) {
        this.runOutline(src, dst, params.outline);
      } else {
        continue;
      }
      // 首个效果 0→1，之后只在 1/2 间交换，保证 fbos[0] 不被覆写
      if (src === 0) {
        src = 1;
        dst = 2;
      } else {
        const t = src; src = dst; dst = t;
      }
    }
    return src;
  }

  render(state: ProjectState, split: number) {
    const view = this.viewRect(state.view.zoom, state.view.panX, state.view.panY);
    const finalIdx = this.runChain(this.fbos, state.layers, state.effectOrder, {
      bloom: state.bloom,
      dof: state.dof,
      tonemap: state.tonemap,
      outline: state.outline
    }, view, state.highContrast);

    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.fbW, this.fbH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const p = this.programs.display;
    p.use();
    p.tex('uBefore', 0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[0].tex);
    p.tex('uAfter', 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[finalIdx].tex);
    const tonemapActive =
      state.tonemap.enabled && state.effectOrder.includes('tonemap');
    p.f1('uNeedGamma', tonemapActive ? 0 : 1);
    p.f1('uSplit', split);
    this.drawFullscreen(p);
  }

  /**
   * 调试/测试用：把当前显示结果重绘到 RGBA8 回读缓冲并统计亮像素。
   * 不依赖 preserveDrawingBuffer，合成之后也能读到完整画面。
   */
  readDisplayStats(state: ProjectState, split: number): {
    lit: number;
    total: number;
    avg: number;
    sceneLit: number;
    finalLit: number;
  } {
    const gl = this.gl;
    const view = this.viewRect(state.view.zoom, state.view.panX, state.view.panY);
    const finalIdx = this.runChain(this.fbos, state.layers, state.effectOrder, {
      bloom: state.bloom,
      dof: state.dof,
      tonemap: state.tonemap,
      outline: state.outline
    }, view, state.highContrast);

    const sampleFbo = (fbo: FBO) => {
      const w = fbo.w;
      const h = fbo.h;
      // 浮点 FBO 不能直接按 UNSIGNED_BYTE 读，先转一道
      const out = new FBO(gl, w, h, false);
      try {
        out.bind();
        const p = this.programs.copy;
        p.use();
        p.tex('uTex', 0);
        gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
        this.drawFullscreen(p);
        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let lit = 0;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const v = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
          if (v > 24) lit++;
          sum += v;
        }
        return { lit, avg: Math.round((sum / (w * h)) * 100) / 100 };
      } finally {
        out.dispose();
      }
    };

    const scene = sampleFbo(this.fbos[0]);
    const final = sampleFbo(this.fbos[finalIdx]);
    try {
      this.render(state, split);
    } catch {
      /* 恢复显示失败不影响诊断 */
    }
    return {
      lit: final.lit,
      total: this.fbW * this.fbH,
      avg: final.avg,
      sceneLit: scene.lit,
      finalLit: final.lit
    };
  }

  /**
   * 导出高清 PNG。以当前画布缓冲的 exportScale 倍重算整条链，
   * 再经过一个 RGBA8 目标转成 UNSIGNED_BYTE 读回。
   */
  exportPng(state: ProjectState, exportScale = 2): string {
    const w = Math.round(this.fbW * exportScale);
    const h = Math.round(this.fbH * exportScale);
    const gl = this.gl;
    const chain: FBO[] = [];
    for (let i = 0; i < 5; i++) chain.push(new FBO(gl, w, h, this.useFloat));
    const out = new FBO(gl, w, h, false);
    try {
      const view = this.viewRect(state.view.zoom, state.view.panX, state.view.panY);
      const finalIdx = this.runChain(chain, state.layers, state.effectOrder, {
        bloom: state.bloom,
        dof: state.dof,
        tonemap: state.tonemap,
        outline: state.outline
      }, view, state.highContrast);

      out.bind();
      const p = this.programs.copy;
      p.use();
      p.tex('uTex', 0);
      gl.bindTexture(gl.TEXTURE_2D, chain[finalIdx].tex);
      this.drawFullscreen(p);

      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const cvs = document.createElement('canvas');
      cvs.width = w;
      cvs.height = h;
      const ctx = cvs.getContext('2d')!;
      const img = ctx.createImageData(w, h);
      // GL 原点在左下，翻行
      for (let y = 0; y < h; y++) {
        const srcOff = (h - 1 - y) * w * 4;
        img.data.set(pixels.subarray(srcOff, srcOff + w * 4), y * w * 4);
      }
      ctx.putImageData(img, 0, 0);
      return cvs.toDataURL('image/png');
    } finally {
      chain.forEach((f) => f.dispose());
      out.dispose();
      this.activeFbos = this.fbos;
    }
  }

  dispose() {
    this.fbos.forEach((f) => f.dispose());
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(c: [number, number, number]): string {
  const q = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16).padStart(2, '0');
  return '#' + q(c[0]) + q(c[1]) + q(c[2]);
}
