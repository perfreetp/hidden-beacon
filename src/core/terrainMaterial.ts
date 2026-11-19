import * as THREE from 'three';
import { valueNoise, fbm } from './heightfield';

/** 程序化生成一张细节纹理(裸岩 / 草甸) */
function makeDetailTexture(kind: 'rock' | 'meadow'): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // 边缘错开采样,让纹理可平铺
      const nx = x / S, ny = y / S;
      const n = fbm(nx * 9 + (kind === 'rock' ? 31.7 : 57.1), ny * 9 + 3.3, 4);
      const m = valueNoise(nx * 33 + 7.7, ny * 33 + 13.1);
      let r: number, g: number, b: number;
      if (kind === 'rock') {
        const v = 0.55 + 0.55 * n + 0.18 * (m - 0.5);
        r = 168 * v; g = 160 * v; b = 150 * v;
        if (m < 0.22) { r *= 0.62; g *= 0.62; b *= 0.62; } // 岩缝
      } else {
        const v = 0.6 + 0.5 * n;
        r = 106 * v + 14 * (m - 0.5);
        g = 148 * v + 20 * (m - 0.5);
        b = 66 * v;
      }
      const i = (y * S + x) * 4;
      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

const VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vElev;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vElev = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uRock;
uniform sampler2D uMeadow;
uniform vec3 uLightDir;
uniform float uNormalShading;
uniform float uContours;
uniform float uContourInterval;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vElev;

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;

  // 坡度 + 高程混合两张细节纹理:陡坡/高处 -> 裸岩,缓坡低处 -> 草甸
  float slope = 1.0 - N.y;
  float rockW = smoothstep(0.18, 0.42, slope);
  rockW = max(rockW, smoothstep(1750.0, 2300.0, vElev));
  vec3 rock = texture2D(uRock, vWorldPos.xz * 0.045).rgb;
  vec3 meadow = texture2D(uMeadow, vWorldPos.xz * 0.045).rgb;
  vec3 albedo = mix(meadow, rock, rockW);

  float diff = max(dot(N, uLightDir), 0.0);
  vec3 col = albedo * (0.32 + 0.85 * diff);

  if (uNormalShading > 0.5) {
    col = N * 0.5 + 0.5;
  }

  if (uContours > 0.5) {
    float t = vElev / uContourInterval;
    float f = abs(fract(t + 0.5) - 0.5) / max(fwidth(t), 1e-4);
    float line = 1.0 - smoothstep(0.0, 1.5, f);
    col = mix(col, vec3(0.12, 0.08, 0.03), line * 0.75);
  }

  float dist = length(vWorldPos - cameraPosition);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`;

export const FOG_COLOR = new THREE.Color(0xa8bedd);

export function createTerrainMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // three 在 WebGL2 下始终以 GLSL ES 3.00 编译 ShaderMaterial 并注入
    // gl_FragColor/texture2D 兼容宏,因此 fwidth 等 ES3 特性可直接使用
    side: THREE.DoubleSide,
    uniforms: {
      uRock: { value: makeDetailTexture('rock') },
      uMeadow: { value: makeDetailTexture('meadow') },
      uLightDir: { value: new THREE.Vector3(0.45, 0.75, 0.35).normalize() },
      uNormalShading: { value: 0 },
      uContours: { value: 0 },
      uContourInterval: { value: 50 },
      uFogColor: { value: FOG_COLOR.clone() },
      uFogDensity: { value: 0.0009 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}
