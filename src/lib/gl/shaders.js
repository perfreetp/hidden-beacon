// ---------- 全屏三角形 ----------
export const quadVS = `#version 300 es
precision highp float;
out vec2 vUV;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const copyFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
out vec4 o;
void main(){ o = texture(uTex, vUV); }`;

// ---------- 笔刷（发光圆点，场景坐标 y 向下） ----------
export const brushVS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform vec2 uScene;
uniform float uSize;
void main(){
  gl_Position = vec4(aPos.x / uScene.x * 2.0 - 1.0, 1.0 - aPos.y / uScene.y * 2.0, 0.0, 1.0);
  gl_PointSize = uSize;
}`;

export const brushFS = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 o;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.4, 0.0, d);
  float halo = smoothstep(1.0, 0.1, d) * 0.45;
  float a = clamp(core + halo, 0.0, 1.0);
  vec3 col = uColor * (core * 1.3 + halo);
  o = vec4(col * a, a);
}`;

// ---------- 形状（星星/小鱼/房子，三角形填充） ----------
export const shapeVS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform vec2 uScene;
void main(){
  gl_Position = vec4(aPos.x / uScene.x * 2.0 - 1.0, 1.0 - aPos.y / uScene.y * 2.0, 0.0, 1.0);
}`;

export const shapeFS = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 o;
void main(){ o = vec4(uColor, uAlpha); }`;

// ---------- 泛光 ----------
export const brightFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 o;
void main(){
  vec4 c = texture(uTex, vUV);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float f = smoothstep(uThreshold, uThreshold + 0.25, l);
  o = vec4(c.rgb * f, c.a * f);
}`;

export const blurFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 o;
void main(){
  vec4 acc = texture(uTex, vUV) * 0.2270270270;
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  acc += (texture(uTex, vUV + o1) + texture(uTex, vUV - o1)) * 0.3162162162;
  acc += (texture(uTex, vUV + o2) + texture(uTex, vUV - o2)) * 0.0702702703;
  o = acc;
}`;

export const combineFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uMain;
uniform sampler2D uBloom;
uniform float uIntensity;
out vec4 o;
void main(){
  vec4 m = texture(uMain, vUV);
  vec3 b = texture(uBloom, vUV).rgb;
  o = vec4(min(m.rgb + b * uIntensity, vec3(1.0)), m.a);
}`;

// ---------- 景深 ----------
export const dofMixFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSharp;
uniform sampler2D uBlur;
uniform vec2 uFocus;
uniform float uNear;
uniform float uFar;
uniform float uAspect;
out vec4 o;
void main(){
  float d = length(vec2((vUV.x - uFocus.x) * uAspect, vUV.y - uFocus.y));
  float t = smoothstep(uNear, uFar, d);
  o = mix(texture(uSharp, vUV), texture(uBlur, vUV), t);
}`;

// ---------- 色调映射：0 柔和 / 1 鲜艳 / 2 夜色 ----------
export const tonemapFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform int uMode;
out vec4 o;
void main(){
  vec4 c = texture(uTex, vUV);
  vec3 col = c.rgb;
  if (uMode == 0) {
    col = col / (1.0 + col);
    col = pow(col, vec3(0.9));
  } else if (uMode == 1) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, 1.45);
    col = clamp((col - 0.5) * 1.18 + 0.52, 0.0, 1.0);
  } else {
    col *= vec3(0.5, 0.62, 1.05);
    col = pow(col, vec3(1.25));
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col += vec3(0.02, 0.03, 0.09) * (1.0 - l);
  }
  o = vec4(clamp(col, 0.0, 1.0), c.a);
}`;

// ---------- 描边 ----------
export const outlineFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uWidth;
uniform vec3 uColor;
out vec4 o;
void main(){
  float a0 = texture(uTex, vUV).a;
  float m = 0.0;
  for (int i = 0; i < 8; i++) {
    float ang = float(i) * 0.78539816339;
    vec2 off = vec2(cos(ang), sin(ang)) * uTexel * uWidth;
    m = max(m, texture(uTex, vUV + off).a);
  }
  float edge = smoothstep(0.35, 0.6, m) * (1.0 - smoothstep(0.35, 0.6, a0));
  vec4 c = texture(uTex, vUV);
  o = vec4(mix(c.rgb, uColor, edge), max(c.a, edge));
}`;

// ---------- 最终合成（视图变换 + 分屏对比 + 高对比） ----------
export const blitFS = `#version 300 es
precision highp float;
uniform sampler2D uBefore;
uniform sampler2D uAfter;
uniform vec2 uScene;
uniform vec2 uCanvas;
uniform float uScale;
uniform vec2 uOffset;
uniform float uSplit;
uniform float uDpr;
uniform int uHC;
uniform vec3 uBg;
out vec4 o;
void main(){
  vec2 s = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 p = (s - uOffset) / uScale;
  vec2 uv = vec2(p.x / uScene.x, 1.0 - p.y / uScene.y);
  vec3 col;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    col = uBg * 0.55;
  } else {
    vec4 c = (uSplit >= 0.0 && s.x < uSplit) ? texture(uBefore, uv) : texture(uAfter, uv);
    col = uBg * (1.0 - c.a) + c.rgb;
  }
  if (uHC == 1) {
    col = clamp((col - 0.5) * 1.45 + 0.5, 0.0, 1.0);
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = clamp(mix(vec3(l), col, 1.6), 0.0, 1.0);
  }
  if (uSplit >= 0.0 && abs(s.x - uSplit) < 1.0 * uDpr) col = vec3(1.0);
  o = vec4(col, 1.0);
}`;
