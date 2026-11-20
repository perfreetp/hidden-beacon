import {
  Color3,
  Color4,
  MeshBuilder,
  RenderTargetTexture,
  Scene,
  ShaderMaterial,
  UniversalCamera,
  Vector3,
  Viewport,
} from '@babylonjs/core';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import type { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';

/**
 * 调试用：把三级 CSM 深度图（WebGL2 的 sampler2DArray）
 * 逐张可视化到三张 RenderTargetTexture 上，再异步回读给页面 <canvas>。
 * 仅在调试视图开启时创建，关闭即销毁。
 *
 * 注意：CSM 用 PCF 时关闭了颜色写入，深度数据在 RTT 的独立 depthStencil
 * 附件里；普通 setTexture 只会绑到空的颜色附件（采样恒为 0），
 * 必须通过 engine.setDepthStencilTexture 通道绑定。
 */

const SHADER_NAME = 'csm-depth-monitor';
const LAYER_MASK = 0x10000000;

const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(void) {
  gl_Position = worldViewProjection * vec4(position, 1.0);
  vUV = uv;
}
`;

const FRAGMENT = `
precision highp float;
varying vec2 vUV;
// CSM 深度附件处于 COMPARE_REF_TO_TEXTURE 模式，必须用 shadow 采样器
uniform highp sampler2DArrayShadow depthAtlas;
uniform float layerIndex;
uniform vec3 tint;

// 用阈值扫描还原单个纹素的近似深度：
// shadow 采样语义为 ref <= storedDepth 时返回 1，否则 0。
// 在 [0,1] 上做 N 次等距探测，统计通过率，翻转边界即深度值。
float sampleDepth(vec2 uv, float layer) {
  const int N = 32;
  float pass = 0.0;
  for (int i = 0; i < N; i++) {
    float ref = (float(i) + 0.5) / float(N);
    pass += texture(depthAtlas, vec4(uv, layer, ref));
  }
  return pass / float(N);
}

void main(void) {
  float d = sampleDepth(vUV, layerIndex);
  // 幂曲线增强：CSM 开了 depthClamp，近级空白纹素深度都接近 1，
  // 普通线性映射看不出物体；pow 把接近 1 的细微差异拉开，
  // 物体（深度略小）会显现为暗部，空白处保持亮。
  float mapped = pow(clamp(d, 0.0, 1.0), 6.0);
  vec3 col = mix(vec3(0.05), vec3(0.95), mapped) * tint;
  gl_FragColor = vec4(col, 1.0);
}
`;

const TINTS = [
  new Color3(1.5, 0.55, 0.55),
  new Color3(0.55, 1.4, 0.65),
  new Color3(0.6, 0.85, 1.7),
];

export class DebugDepthMonitor {
  private rtts: RenderTargetTexture[] = [];
  private materials: ShaderMaterial[] = [];
  private quad;
  private dummyCam: UniversalCamera;
  private scene: Scene;
  private size: number;
  private layerCount: number;

  constructor(scene: Scene, csm: CascadedShadowGenerator, size = 220) {
    this.scene = scene;
    this.size = size;
    this.layerCount = csm.numCascades;

    ShaderStore.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX;
    ShaderStore.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT;

    // 正交虚拟相机，让平面铺满整张渲染目标；只渲染调试层，主相机看不到
    this.dummyCam = new UniversalCamera(`${SHADER_NAME}-cam`, new Vector3(0, 0, -2), scene);
    this.dummyCam.mode = UniversalCamera.ORTHOGRAPHIC_CAMERA;
    this.dummyCam.orthoLeft = -1;
    this.dummyCam.orthoRight = 1;
    this.dummyCam.orthoTop = 1;
    this.dummyCam.orthoBottom = -1;
    this.dummyCam.minZ = 0.1;
    this.dummyCam.maxZ = 10;
    this.dummyCam.viewport = new Viewport(0, 0, 1, 1);
    this.dummyCam.layerMask = LAYER_MASK;

    this.quad = MeshBuilder.CreatePlane(`${SHADER_NAME}-quad`, { width: 2, height: 2 }, scene);
    this.quad.isPickable = false;
    this.quad.layerMask = LAYER_MASK;

    this.buildRtts(csm);
  }

  private buildRtts(csm: CascadedShadowGenerator): void {
    const scene = this.scene;
    const shadowMap = csm.getShadowMap();
    const engine = scene.getEngine();

    for (let i = 0; i < this.layerCount; i++) {
      const rtt = new RenderTargetTexture(
        `${SHADER_NAME}-rtt-${i}`,
        { width: this.size, height: this.size },
        scene,
        false,
      );
      rtt.clearColor = new Color4(0.05, 0.05, 0.07, 1);
      rtt.activeCamera = this.dummyCam;
      rtt.renderList = [this.quad];

      const mat = new ShaderMaterial(
        `${SHADER_NAME}-mat-${i}`,
        scene,
        { vertex: SHADER_NAME, fragment: SHADER_NAME },
        {
          attributes: ['position', 'uv'],
          uniforms: ['worldViewProjection', 'layerIndex', 'tint'],
          samplers: ['depthAtlas'],
          needAlphaBlending: false,
        },
      );
      mat.setFloat('layerIndex', i);
      mat.setVector3('tint', new Vector3(TINTS[i].r, TINTS[i].g, TINTS[i].b));
      if (shadowMap) {
        // 材质级绑定：每次绘制该平面时 effect 已就绪，此时重定向到深度附件
        mat.onBindObservable.add(() => {
          const eff = mat.getEffect();
          if (!eff) return;
          const slot = eff.getUniformIndex('depthAtlas');
          const loc = eff.getUniform('depthAtlas');
          if (slot >= 0 && loc) {
            engine.setDepthStencilTexture(slot, loc, shadowMap, 'depthAtlas');
          }
        });
      }
      rtt.setMaterialForRendering(this.quad, mat);

      this.materials.push(mat);
      this.rtts.push(rtt);
      scene.customRenderTargets.push(rtt);
    }
  }

  private disposeRtts(): void {
    for (const rtt of this.rtts) {
      const idx = this.scene.customRenderTargets.indexOf(rtt);
      if (idx >= 0) this.scene.customRenderTargets.splice(idx, 1);
      rtt.dispose();
    }
    for (const mat of this.materials) mat.dispose();
    this.rtts = [];
    this.materials = [];
  }

  /** 重建生成器（改贴图分辨率）后重新绑定新的深度纹理数组 */
  rebind(csm: CascadedShadowGenerator): void {
    this.disposeRtts();
    this.layerCount = csm.numCascades;
    this.buildRtts(csm);
  }

  /** 把某一级的画面异步绘制到页面 canvas 上（含 Y 翻转） */
  async drawTo(canvas: HTMLCanvasElement, layer: number): Promise<void> {
    const rtt = this.rtts[layer];
    if (!rtt) return;
    const buffer = await rtt.readPixels();
    if (!buffer) return;
    const src = buffer as Uint8Array;
    canvas.width = this.size;
    canvas.height = this.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.createImageData(this.size, this.size);
    const rowBytes = this.size * 4;
    // WebGL 回读原点在左下，2D canvas 在左上，逐行翻转
    for (let y = 0; y < this.size; y++) {
      const srcStart = (this.size - 1 - y) * rowBytes;
      imageData.data.set(src.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  dispose(): void {
    this.disposeRtts();
    this.quad.dispose();
    this.dummyCam.dispose();
    delete ShaderStore.ShadersStore[`${SHADER_NAME}VertexShader`];
    delete ShaderStore.ShadersStore[`${SHADER_NAME}FragmentShader`];
  }
}
