/**
 * 全部 GLSL ES 3.00 着色器源码。
 * 管线：场景实例化 SDF 绘制 → 泛光/景深/色调映射/描边（顺序可换）→ 分屏显示。
 */

/* ---------------- 场景绘制：实例化四边形 + 片段 SDF ---------------- */

export const SCENE_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aCorner;        // 四边形角点 -1..1
layout(location = 1) in vec4 aInstance0;     // x, y, r(世界宽比例), rot
layout(location = 2) in vec4 aInstance1;     // rgb, shapeId
uniform vec2 uViewMin;
uniform vec2 uViewMax;
out vec2 vLocal;
out vec3 vColor;
flat out int vShape;
void main() {
  float s = sin(aInstance0.w);
  float c = cos(aInstance0.w);
  vec2 local = aCorner * aInstance0.z;
  vec2 rot = vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vec2 world = aInstance0.xy + rot;
  vLocal = local / max(aInstance0.z, 1e-5);
  vColor = aInstance1.rgb;
  vShape = int(aInstance1.w + 0.5);
  vec2 ndc = vec2(
    (world.x - uViewMin.x) / (uViewMax.x - uViewMin.x) * 2.0 - 1.0,
    (world.y - uViewMin.y) / (uViewMax.y - uViewMin.y) * 2.0 - 1.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

export const SCENE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vColor;
flat in int vShape;
uniform float uHighContrast;
uniform float uErase;       // 1 = 橡皮擦（只输出覆盖率）
out vec4 outColor;

const float PI = 3.14159265359;

float sdCircle(vec2 p, float r) { return length(p) - r; }

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Inigo Quilez sdStar，n 个角，m 控制内凹程度（2 最尖，n 接近正多边形）
float sdStar(vec2 p, float r, int n, float m) {
  float an = PI / float(n);
  float en = PI / m;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * mat2(acs.x, -acs.y, acs.y, acs.x)
      * vec2(cos(bn), abs(sin(bn)));
  p -= r * vec2(ecs.x, -ecs.y) / ecs.y;
  p += vec2(clamp(-p.x, 0.0, r * ecs.x / ecs.y), 0.0);
  return length(p) * sign(p.x);
}

float sdEllipse(vec2 p, vec2 ab) {
  p = abs(p);
  if (p.x > ab.x) { return length(p - ab); }
  if (p.y > ab.y) { return length(p - ab); }
  float l = ab.y * ab.y - ab.x * ab.x;
  if (abs(l) < 1e-6) { return length(p) - ab.x; }
  float m = ab.x * p.x / l;
  float n = ab.y * p.y / l;
  float mm = m * m;
  float nn = n * n;
  float k = (mm + nn - 1.0) / 3.0;
  k *= k * k;
  float t2 = mm * nn / 3.0;
  float h = t2 + k;
  if (h >= 0.0) { return length(p - ab); }
  t2 = mm + nn;
  float t = t2 * 0.5;
  vec2 q = ab * vec2(m, n);
  return length(p - q) * sign(t - 1.0);
}

float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(
    vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
    vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
    vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(max(d.x, 0.0)) * sign(d.y);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// 返回有向距离；outDeco > 0 表示落在装饰（眼睛/门窗）区域
float shapeSdf(vec2 p, int shape, out float deco) {
  deco = -1.0;
  if (shape == 0) {
    // 光笔：柔软圆团
    return sdCircle(p, 0.92);
  } else if (shape == 1) {
    // 星星
    return sdStar(p, 0.95, 5, 2.35);
  } else if (shape == 2) {
    // 小鱼：椭圆身体 + 三角尾巴
    float body = sdEllipse(p - vec2(0.14, 0.0), vec2(0.60, 0.42));
    float tail = sdTriangle(p,
      vec2(-0.52, 0.0), vec2(-1.02, 0.44), vec2(-1.02, -0.44));
    float d = smin(body, tail, 0.14);
    // 眼睛
    float eye = sdCircle(p - vec2(0.48, 0.17), 0.085);
    deco = eye;
    return d;
  } else {
    // 房子：圆角方身 + 三角屋顶
    float body = sdRoundBox(p - vec2(0.0, -0.30), vec2(0.56, 0.42), 0.07);
    float roof = sdTriangle(p,
      vec2(-0.74, -0.04), vec2(0.74, -0.04), vec2(0.0, 0.80));
    float d = min(body, roof);
    float door = sdRoundBox(p - vec2(0.0, -0.46), vec2(0.16, 0.26), 0.04);
    float win = sdCircle(p - vec2(-0.30, -0.22), 0.11);
    deco = min(door, win);
    return d;
  }
}

void main() {
  float deco;
  // 橡皮擦永远是柔软的圆团
  float d = uErase > 0.5 ? sdCircle(vLocal, 0.92) : shapeSdf(vLocal, vShape, deco);
  float aa = max(fwidth(d), 1e-4);
  float alpha = 1.0 - smoothstep(-aa, aa, d);
  if (alpha <= 0.003) discard;
  if (uErase > 0.5) {
    // 颜色无关，仅用覆盖率驱动擦除混合
    outColor = vec4(0.0, 0.0, 0.0, alpha);
    return;
  }

  vec3 col = vColor;
  // 内部更亮，制造 HDR 发光核心
  float core = 1.0 + 0.45 * clamp(-d, 0.0, 1.0);
  col *= core;

  if (vShape == 2 && deco < 0.0) {
    // 鱼眼睛：深色小珠子
    col = mix(col, vec3(0.02, 0.03, 0.08), clamp(-deco * 6.0, 0.0, 1.0));
  } else if (vShape == 3 && deco < 0.0) {
    // 房子门窗：门压暗，窗户发光
    float k = clamp(-deco * 6.0, 0.0, 1.0);
    col = mix(col, col * 0.25 + vec3(0.05), k * 0.85);
  }
  // 高对比模式：整体提亮加饱和
  col *= 1.0 + uHighContrast * 0.45;
  outColor = vec4(col * alpha, alpha);
}`;

/* ---------------- 全屏三角形（所有后处理共用） ---------------- */

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  // 超大三角形三个顶点（UV）：(0,0) (2,0) (0,2)，覆盖整个视口
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/* ---------------- 泛光 ---------------- */

export const BLOOM_EXTRACT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 outColor;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.35, l);
  outColor = vec4(c * k, 1.0);
}`;

export const GAUSS_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;       // 单步方向（含像素尺寸）
uniform float uSpread;   // 扩散倍数
out vec4 outColor;
void main() {
  vec2 step1 = uDir * uSpread;
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += texture(uTex, vUv + step1 * 1.0).rgb * 0.1945945946 * 2.0;
  c += texture(uTex, vUv + step1 * 2.0).rgb * 0.1216216216 * 2.0;
  c += texture(uTex, vUv + step1 * 3.0).rgb * 0.0540540541 * 2.0;
  c += texture(uTex, vUv + step1 * 4.0).rgb * 0.0162162162 * 2.0;
  outColor = vec4(c, 1.0);
}`;

export const BLOOM_COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uIntensity;
out vec4 outColor;
void main() {
  vec4 scene = texture(uScene, vUv);
  vec3 bloom = texture(uBloom, vUv).rgb;
  outColor = vec4(scene.rgb + bloom * uIntensity, scene.a);
}`;

/* ---------------- 景深 ---------------- */

export const DOF_COMBINE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBlur;
uniform vec2 uViewMin;
uniform vec2 uViewMax;
uniform vec2 uFocus;
uniform float uRange;
out vec4 outColor;
void main() {
  vec2 world = mix(uViewMin, uViewMax, vUv);
  float dist = distance(world, uFocus);
  float coc = smoothstep(uRange, uRange + 0.35, dist);
  vec4 scene = texture(uScene, vUv);
  vec3 blur = texture(uBlur, vUv).rgb;
  outColor = vec4(mix(scene.rgb, blur, coc * 0.92), scene.a);
}`;

/* ---------------- 色调映射（柔和 / 鲜艳 / 夜色） ---------------- */

export const TONEMAP_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform int uMode;   // 0 柔和 1 鲜艳 2 夜色
uniform float uHighContrast;
out vec4 outColor;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055,
             step(0.0031308, c));
}

void main() {
  vec4 src = texture(uTex, vUv);
  vec3 c = src.rgb;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (uMode == 0) {
    // 柔和：ACES 胶片感
    c = aces(c);
  } else if (uMode == 1) {
    // 鲜艳：Reinhard 后提饱和
    c = c / (1.0 + c);
    c = mix(vec3(luma), c, 1.25);
  } else {
    // 夜色：压暗、偏蓝、去部分饱和
    c = mix(vec3(luma), c, 0.55) * vec3(0.55, 0.72, 1.18) + 0.015;
    c = c / (1.0 + c);
  }
  c = mix(c, mix(vec3(luma), c, 1.3), uHighContrast * 0.6);
  outColor = vec4(toSrgb(c), src.a);
}`;

/* ---------------- 描边（Sobel 边缘） ---------------- */

export const OUTLINE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThickness;
uniform vec3 uEdgeColor;
out vec4 outColor;

float lumaAt(vec2 uv) {
  vec3 c = texture(uTex, uv).rgb;
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 o = uTexel * uThickness;
  float tl = lumaAt(vUv - o);
  float t  = lumaAt(vUv + vec2(0.0, -o.y));
  float tr = lumaAt(vUv + vec2(o.x, -o.y));
  float l  = lumaAt(vUv + vec2(-o.x, 0.0));
  float r  = lumaAt(vUv + vec2(o.x, 0.0));
  float bl = lumaAt(vUv + vec2(-o.x, o.y));
  float b  = lumaAt(vUv + vec2(0.0, o.y));
  float br = lumaAt(vUv + o);
  float gx = -tl + tr - 2.0 * l + 2.0 * r - bl + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = clamp(length(vec2(gx, gy)) * 2.2, 0.0, 1.0);
  vec4 src = texture(uTex, vUv);
  outColor = vec4(mix(src.rgb, uEdgeColor, edge), src.a);
}`;

/* ---------------- 分屏显示 ---------------- */

export const DISPLAY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uBefore;
uniform sampler2D uAfter;
uniform float uSplit;      // 滑块位置 0..1
uniform float uNeedGamma;  // 链中没有色调映射时，显示前补 sRGB
out vec4 outColor;

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055,
             step(0.0031308, c));
}

void main() {
  bool showBefore = vUv.x < uSplit;
  // sampler 是不透明类型，不能用三元运算符，只能分支选择
  vec4 c;
  if (showBefore) {
    c = texture(uBefore, vUv);
  } else {
    c = texture(uAfter, vUv);
  }
  // 效果前永远是线性 HDR；效果后仅在链中没有色调映射时才需要补 gamma
  if (showBefore || uNeedGamma > 0.5) { c.rgb = toSrgb(c.rgb); }
  outColor = vec4(clamp(c.rgb, 0.0, 1.0), 1.0);
}`;
