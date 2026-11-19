/**
 * 全景球面渲染器
 *
 * 等距柱状图按经纬度映射到球面，相机以 (yaw, pitch, fov) 描述，
 * 使用球心投影（与 SVG 叠层的 geo.ts 完全一致）把球面投射到画面。
 * 优先使用 WebGL2 片元着色器；不可用时退化为低分辨率 CPU 软渲染（canvas 2D）。
 *
 * 淡入淡出由外层组件用黑色遮罩完成，这里只负责“换图 + 重绘”。
 */
import { Camera, DEG2RAD, cameraBasis, projectDir, screenRay } from '../lib/geo';

export type PanoSource = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

const VERT = `#version 300 es
precision highp float;
out vec2 vNdc;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
  vNdc = p;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vNdc;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uTanHalf;
const float PI = 3.141592653589793;

void main() {
  vec3 dir = normalize(uForward + vNdc.x * uTanHalf.x * uRight + vNdc.y * uTanHalf.y * uUp);
  float lon = atan(dir.x, dir.z);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  // 跨 ±180° 经线时折回导数，避免 mipmap 误选最粗一级并在接缝处发虚
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  // 纹理本身已是 sRGB 编码，直接输出，不要再做一次 gamma
  vec3 c = textureGrad(uTex, uv, dx, dy).rgb;
  outColor = vec4(c, 1.0);
}`;

interface GLState {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
  vao: WebGLVertexArrayObject | null;
  tex: WebGLTexture | null;
}

export class SphereView {
  readonly canvas: HTMLCanvasElement;
  readonly mode: 'webgl' | 'cpu';
  /** 退化原因或运行告警 */
  error: string | null = null;

  private glState: GLState | null = null;
  private camera: Camera = { yaw: 0, pitch: 0, fov: 70 };
  private cssWidth = 1;
  private cssHeight = 1;
  private raf = 0;
  private pending = false;
  private disposed = false;
  private hasSource = false;
  private sourceData: ImageData | null = null;
  private maxTextureWidth: number;

  constructor(canvas: HTMLCanvasElement, opts: { maxTextureWidth?: number } = {}) {
    this.canvas = canvas;
    this.maxTextureWidth = opts.maxTextureWidth ?? 4096;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (gl) {
      try {
        this.glState = this.initGL(gl);
        this.mode = 'webgl';
      } catch (e) {
        this.error = `GPU 渲染初始化失败，已切换到软件渲染：${(e as Error).message}`;
        this.mode = 'cpu';
      }
    } else {
      this.mode = 'cpu';
      this.error = '当前环境不支持 WebGL2，已切换到软件渲染（分辨率受限）';
    }
  }

  private initGL(gl: WebGL2RenderingContext): GLState {
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) ?? '着色器编译失败');
      }
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) ?? '着色器链接失败');
    }
    gl.useProgram(prog);
    const loc = (n: string) => gl.getUniformLocation(prog, n);
    const u = {
      uTex: loc('uTex'),
      uForward: loc('uForward'),
      uRight: loc('uRight'),
      uUp: loc('uUp'),
      uTanHalf: loc('uTanHalf'),
    };
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    return { gl, prog, u, vao, tex: null };
  }

  setSize(width: number, height: number, dpr: number) {
    this.cssWidth = Math.max(1, width);
    this.cssHeight = Math.max(1, height);
    // 全景不需要超过 2 倍像素密度，省一点填充率
    const effDpr = Math.min(Math.max(1, dpr), 2);
    const pw = Math.max(1, Math.round(this.cssWidth * effDpr));
    const ph = Math.max(1, Math.round(this.cssHeight * effDpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    if (this.glState) this.glState.gl.viewport(0, 0, pw, ph);
    this.invalidate();
  }

  setCamera(cam: Camera) {
    this.camera = { ...cam };
    this.invalidate();
  }

  getCamera(): Camera {
    return { ...this.camera };
  }

  setSource(src: PanoSource | null) {
    this.hasSource = !!src;
    if (!src) {
      this.sourceData = null;
      this.invalidate();
      return;
    }
    const w = 'naturalWidth' in src ? src.naturalWidth : src.width;
    const h = 'naturalHeight' in src ? src.naturalHeight : src.height;
    if (this.glState) {
      const gl = this.glState.gl;
      const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      const prepared = prepareTextureSource(src, w, h, Math.min(this.maxTextureWidth, maxTex));
      if (this.glState.tex) gl.deleteTexture(this.glState.tex);
      this.glState.tex = this.uploadTexture(prepared);
    } else {
      const prepared = prepareTextureSource(src, w, h, 1024);
      const ctx = prepared.getContext('2d', { willReadFrequently: true });
      this.sourceData = ctx ? ctx.getImageData(0, 0, prepared.width, prepared.height) : null;
    }
    this.invalidate();
  }

  private uploadTexture(canvas: HTMLCanvasElement): WebGLTexture {
    const gl = this.glState!.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  }

  invalidate() {
    if (this.pending || this.disposed) return;
    this.pending = true;
    this.raf = requestAnimationFrame(() => {
      this.pending = false;
      this.renderNow();
    });
  }

  render() {
    this.renderNow();
  }

  private renderNow() {
    if (this.disposed) return;
    if (this.glState) this.renderGL(this.glState);
    else this.renderCPU();
  }

  private renderGL(g: GLState) {
    const { gl } = g;
    if (!this.hasSource || !g.tex) {
      gl.clearColor(0.055, 0.07, 0.08, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    const { forward, right, up } = cameraBasis(this.camera);
    const aspect = this.cssWidth / Math.max(1, this.cssHeight);
    const ty = Math.tan((this.camera.fov * DEG2RAD) / 2);
    const tx = ty * aspect;
    gl.useProgram(g.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.tex);
    gl.uniform1i(g.u.uTex, 0);
    gl.uniform3f(g.u.uForward, forward.x, forward.y, forward.z);
    gl.uniform3f(g.u.uRight, right.x, right.y, right.z);
    gl.uniform3f(g.u.uUp, up.x, up.y, up.z);
    gl.uniform2f(g.u.uTanHalf, tx, ty);
    gl.bindVertexArray(g.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private renderCPU() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (!this.sourceData) {
      ctx.fillStyle = '#0e1113';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const scale = Math.min(1, 680 / Math.max(W, H));
    const rw = Math.max(2, Math.round(W * scale));
    const rh = Math.max(2, Math.round(H * scale));
    const img = ctx.createImageData(rw, rh);
    const src = this.sourceData;
    const sw = src.width;
    const sh = src.height;
    const sd = src.data;
    const { forward, right, up } = cameraBasis(this.camera);
    const aspect = this.cssWidth / Math.max(1, this.cssHeight);
    const ty = Math.tan((this.camera.fov * DEG2RAD) / 2);
    const tx = ty * aspect;
    for (let y = 0; y < rh; y++) {
      const ndcY = 1 - (2 * (y + 0.5)) / rh;
      for (let x = 0; x < rw; x++) {
        const ndcX = (2 * (x + 0.5)) / rw - 1;
        let dx = forward.x + ndcX * tx * right.x + ndcY * ty * up.x;
        let dy = forward.y + ndcX * tx * right.y + ndcY * ty * up.y;
        let dz = forward.z + ndcX * tx * right.z + ndcY * ty * up.z;
        const inv = 1 / Math.hypot(dx, dy, dz);
        dx *= inv;
        dy *= inv;
        dz *= inv;
        const lon = Math.atan2(dx, dz);
        const lat = Math.asin(dy);
        let u = lon / (2 * Math.PI) + 0.5;
        u = ((u % 1) + 1) % 1;
        const v = 0.5 - lat / Math.PI;
        const si = (Math.min(sh - 1, Math.max(0, Math.round(v * (sh - 1)))) * sw + Math.round(u * (sw - 1))) * 4;
        const o = (y * rw + x) * 4;
        img.data[o] = sd[si];
        img.data[o + 1] = sd[si + 1];
        img.data[o + 2] = sd[si + 2];
        img.data[o + 3] = 255;
      }
    }
    const off = document.createElement('canvas');
    off.width = rw;
    off.height = rh;
    off.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, W, H);
  }

  /** 给定屏幕点返回对应的世界方向（与 SVG 叠层一致的拾取） */
  pickDirection(x: number, y: number) {
    return screenRay(x, y, this.cssWidth, this.cssHeight, this.camera);
  }

  /** 把经纬度投影到 CSS 像素坐标（调试叠层一致性用） */
  projectLonLat(lon: number, lat: number) {
    const lo = (lon * Math.PI) / 180;
    const la = (lat * Math.PI) / 180;
    const cl = Math.cos(la);
    return projectDir(
      { x: cl * Math.sin(lo), y: Math.sin(la), z: cl * Math.cos(lo) },
      this.camera,
      this.cssWidth,
      this.cssHeight,
    );
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const g = this.glState;
    if (g) {
      if (g.tex) g.gl.deleteTexture(g.tex);
      g.gl.deleteProgram(g.prog);
    }
    this.glState = null;
  }
}

/** 把任意尺寸的图缩到纹理上限以内，返回可上传的 canvas */
function prepareTextureSource(src: PanoSource, w: number, h: number, cap: number): HTMLCanvasElement {
  const scale = Math.min(1, cap / Math.max(w, h));
  const tw = Math.max(2, Math.round(w * scale));
  const th = Math.max(2, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src as CanvasImageSource, 0, 0, tw, th);
  return canvas;
}
