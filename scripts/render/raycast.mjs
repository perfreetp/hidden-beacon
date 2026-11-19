/**
 * 极简光线投射器：把场景渲染成 2:1 等距柱状全景图
 *
 * 世界约定与应用一致：Y 上、Z 前（经度 0°）、X 东（经度 90°）。
 * 每个像素方向 dir 由经纬度生成，投射到场景几何体求最近交点，再按材质与灯光着色。
 */

export const TAU = Math.PI * 2;

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const fract = (x) => x - Math.floor(x);
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 与经度无关的 3D 值噪声（用于材质细节），基于哈希格点 */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = smoothstep(0, 1, x - xi);
  const ty = smoothstep(0, 1, y - yi);
  const tz = smoothstep(0, 1, z - zi);
  const h = (i, j, k) => hash2(i + k * 7919, j + k * 104729, seed);
  const c00 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), tx);
  const c10 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), tx);
  const c01 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), tx);
  const c11 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), tx);
  return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
}

export function fbm3(x, y, z, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/* ---------------- 几何体 ---------------- */
// 每个几何体：hit(ox,oy,oz, dx,dy,dz) → {t, x,y,z, nx,ny,nz, mat} 或 null

export function roomBox(min, max, matFor) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  return {
    hit(ox, oy, oz, dx, dy, dz) {
      // 相机在屋内，取射线的出射面
      let tExit = Infinity;
      let axis = 0;
      let sign = 0;
      const test = (t, ax, sg) => {
        if (t > 1e-4 && t < tExit) {
          tExit = t;
          axis = ax;
          sign = sg;
        }
      };
      if (dx > 1e-9) test((x1 - ox) / dx, 0, 1);
      else if (dx < -1e-9) test((x0 - ox) / dx, 0, -1);
      if (dy > 1e-9) test((y1 - oy) / dy, 1, 1);
      else if (dy < -1e-9) test((y0 - oy) / dy, 1, -1);
      if (dz > 1e-9) test((z1 - oz) / dz, 2, 1);
      else if (dz < -1e-9) test((z0 - oz) / dz, 2, -1);
      if (!Number.isFinite(tExit)) return null;
      const px = ox + dx * tExit;
      const py = oy + dy * tExit;
      const pz = oz + dz * tExit;
      const n = [0, 0, 0];
      n[axis] = sign;
      const kind =
        axis === 1 ? (sign > 0 ? 'ceiling' : 'floor') : axis === 2 ? (sign > 0 ? 'north' : 'south') : sign > 0 ? 'east' : 'west';
      return {
        t: tExit,
        x: px,
        y: py,
        z: pz,
        nx: -n[0],
        ny: -n[1],
        nz: -n[2],
        mat: matFor(kind, px, py, pz),
      };
    },
  };
}

export function solidBox(min, max, mat) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  return {
    hit(ox, oy, oz, dx, dy, dz) {
      let tmin = -Infinity;
      let tmax = Infinity;
      let axis = 0;
      let sign = 0;
      const slab = (o, d, a, b, ax) => {
        if (Math.abs(d) < 1e-9) {
          if (o < a || o > b) return false;
          return true;
        }
        let t1 = (a - o) / d;
        let t2 = (b - o) / d;
        let s = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          s = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          axis = ax;
          sign = s;
        }
        if (t2 < tmax) tmax = t2;
        return tmin <= tmax;
      };
      if (!slab(ox, dx, x0, x1, 0)) return null;
      if (!slab(oy, dy, y0, y1, 1)) return null;
      if (!slab(oz, dz, z0, z1, 2)) return null;
      if (tmin <= 1e-4) {
        // 相机在盒内：改用出射面
        if (tmax <= 1e-4) return null;
        // 近似：沿射线反向
        return null;
      }
      const n = [0, 0, 0];
      n[axis] = sign;
      return {
        t: tmin,
        x: ox + dx * tmin,
        y: oy + dy * tmin,
        z: oz + dz * tmin,
        nx: n[0],
        ny: n[1],
        nz: n[2],
        mat,
      };
    },
  };
}

export function sphere(cx, cy, cz, r, mat, scaleY = 1) {
  return {
    hit(ox, oy, oz, dx, dy, dz) {
      const lx = ox - cx;
      const ly = oy - cy;
      const lz = oz - cz;
      // 支持纵向压扁的椭球（scaleY），用于树冠
      const sy = 1 / (scaleY * scaleY);
      const b = lx * dx + ly * dy * sy + lz * dz;
      const c = lx * lx + ly * ly * sy + lz * lz - r * r;
      const a = dx * dx + dy * dy * sy + dz * dz;
      const disc = b * b - a * c;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / a;
      if (t <= 1e-4) t = (-b + sq) / a;
      if (t <= 1e-4) return null;
      const px = ox + dx * t;
      const py = oy + dy * t;
      const pz = oz + dz * t;
      const inv = 1 / r;
      let nx = (px - cx) * inv;
      let ny = (py - cy) * sy * inv;
      let nz = (pz - cz) * inv;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      // 内部视图（穹顶）时翻面
      if (nx * dx + ny * dy + nz * dz > 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      return { t, x: px, y: py, z: pz, nx, ny, nz, mat };
    },
  };
}

/** 竖直圆柱（含顶/底盖） */
export function cylinder(cx, cz, r, y0, y1, mat) {
  return {
    hit(ox, oy, oz, dx, dy, dz) {
      let best = Infinity;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      const a = dx * dx + dz * dz;
      if (a > 1e-10) {
        const lx = ox - cx;
        const lz = oz - cz;
        const b = 2 * (lx * dx + lz * dz);
        const c = lx * lx + lz * lz - r * r;
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
            if (t > 1e-4 && t < best) {
              const y = oy + dy * t;
              if (y >= y0 && y <= y1) {
                best = t;
                const px = ox + dx * t - cx;
                const pz = oz + dz * t - cz;
                const il = 1 / Math.hypot(px, pz);
                nx = px * il;
                ny = 0;
                nz = pz * il;
              }
            }
          }
        }
      }
      if (Math.abs(dy) > 1e-9) {
        for (const [yc, s] of [
          [y0, -1],
          [y1, 1],
        ]) {
          const t = (yc - oy) / dy;
          if (t > 1e-4 && t < best) {
            const px = ox + dx * t;
            const pz = oz + dz * t;
            if ((px - cx) ** 2 + (pz - cz) ** 2 <= r * r) {
              best = t;
              nx = 0;
              ny = s;
              nz = 0;
            }
          }
        }
      }
      if (!Number.isFinite(best)) return null;
      return {
        t: best,
        x: ox + dx * best,
        y: oy + dy * best,
        z: oz + dz * best,
        nx,
        ny,
        nz,
        mat,
      };
    },
  };
}

/* ---------------- 着色 ---------------- */
/**
 * scene = {
 *   objects: [...],
 *   ambient: [r,g,b] 0..1 强度,
 *   sky(dir) -> rgb|0..1 背景色,
 *   lights: [{x,y,z,color:[r,g,b],power,radius}],
 *   fog: {color, density},
 *   exposure: 1,
 * }
 */
/** 是否被遮挡（用于接触阴影），maxT 之外的不算 */
export function occluded(scene, hit, lx, ly, lz, dist) {
  const ox = hit.x + hit.nx * 0.02;
  const oy = hit.y + hit.ny * 0.02;
  const oz = hit.z + hit.nz * 0.02;
  for (const o of scene.objects) {
    if (o === hit.obj) continue;
    const h = o.hit(ox, oy, oz, lx, ly, lz);
    if (h && h.t > 0.02 && h.t < dist - 0.05) {
      // 忽略面片自身的极近自遮挡
      return true;
    }
  }
  return false;
}

export function shadeHit(scene, hit, dx, dy, dz) {
  const mat = hit.mat;
  const base = mat.color(hit);
  const up = 0.5 + 0.5 * hit.ny;
  const hemi = mix3(scene.hemiGround ?? scene.ambient, scene.hemiSky ?? scene.ambient, up);
  let r = base[0] * hemi[0];
  let g = base[1] * hemi[1];
  let b = base[2] * hemi[2];
  // 简易环境光遮蔽：贴近墙/地面的位置更暗
  let ao = 1;
  if (scene.ao !== false) {
    const floorY = scene.floorY ?? -1.6;
    const d = Math.max(0, hit.y - floorY);
    ao = 0.78 + 0.22 * Math.min(1, d / 1.6);
    r *= ao;
    g *= ao;
    b *= ao;
  }
  for (const L of scene.lights) {
    let lx = L.x - hit.x;
    let ly = L.y - hit.y;
    let lz = L.z - hit.z;
    const d2 = lx * lx + ly * ly + lz * lz;
    const d = Math.sqrt(d2) || 1e-6;
    lx /= d;
    ly /= d;
    lz /= d;
    const lam = hit.nx * lx + hit.ny * ly + hit.nz * lz;
    if (lam <= 0) continue;
    // 软衰减
    const att = (L.power ?? 1) / (1 + d2 / (L.radius ?? 4));
    const wrap = (lam + 0.22) / 1.22;
    let k = att * wrap;
    if (scene.shadows !== false) {
      if (occluded(scene, hit, lx, ly, lz, d)) k *= 0.1;
    }
    r += base[0] * L.color[0] * k;
    g += base[1] * L.color[1] * k;
    b += base[2] * L.color[2] * k;
  }
  if (mat.emissive) {
    const e = mat.emissive(hit);
    r += e[0];
    g += e[1];
    b += e[2];
  }
  // 高光（粗糙度近似）
  if (mat.spec) {
    for (const L of scene.lights) {
      let lx = L.x - hit.x;
      let ly = L.y - hit.y;
      let lz = L.z - hit.z;
      const d = Math.hypot(lx, ly, lz) || 1e-6;
      lx /= d;
      ly /= d;
      lz /= d;
      const ndl = hit.nx * lx + hit.ny * ly + hit.nz * lz;
      if (ndl <= 0) continue;
      let hx = lx - dx;
      let hy = ly - dy;
      let hz = lz - dz;
      const hl = Math.hypot(hx, hy, hz) || 1e-6;
      hx /= hl;
      hy /= hl;
      hz /= hl;
      const ndh = Math.max(0, hit.nx * hx + hit.ny * hy + hit.nz * hz);
      const s = Math.pow(ndh, mat.spec.shininess ?? 40) * (mat.spec.strength ?? 0.3);
      r += L.color[0] * s;
      g += L.color[1] * s;
      b += L.color[2] * s;
    }
  }
  // 雾
  const fog = scene.fog;
  if (fog && fog.density > 0) {
    const f = 1 - Math.exp(-hit.t * fog.density);
    r = lerp(r, fog.color[0], f);
    g = lerp(g, fog.color[1], f);
    b = lerp(b, fog.color[2], f);
  }
  return [r, g, b];
}

export function renderEquirect(scene, width, height, opts = {}) {
  const rgb = new Uint8Array(width * height * 3);
  const exposure = scene.exposure ?? 1;
  const superSample = opts.superSample ?? 1;
  const samples = superSample * superSample;
  const invW = 1 / width;
  const invH = 1 / height;
  const [ex, ey, ez] = scene.eye ?? [0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let R = 0;
      let G = 0;
      let B = 0;
      for (let sy = 0; sy < superSample; sy++) {
        for (let sx = 0; sx < superSample; sx++) {
          const u = (x + (sx + 0.5) / superSample) * invW;
          const v = (y + (sy + 0.5) / superSample) * invH;
          const lon = (u - 0.5) * TAU;
          const lat = (0.5 - v) * Math.PI;
          const cl = Math.cos(lat);
          const dx = cl * Math.sin(lon);
          const dy = Math.sin(lat);
          const dz = cl * Math.cos(lon);
          const c = trace(scene, ex, ey, ez, dx, dy, dz);
          R += c[0];
          G += c[1];
          B += c[2];
        }
      }
      R /= samples;
      G /= samples;
      B /= samples;
      // 曝光 + ACES 近似色调映射 + 轻微饱和提升
      const aces = (v) => {
        const t = Math.max(0, v * exposure);
        return clamp01((t * (2.51 * t + 0.03)) / (t * (2.43 * t + 0.59) + 0.14));
      };
      let lr = aces(R);
      let lg = aces(G);
      let lb = aces(B);
      const lum = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      const sat = scene.saturation ?? 1.12;
      lr = clamp01(lum + (lr - lum) * sat);
      lg = clamp01(lum + (lg - lum) * sat);
      lb = clamp01(lum + (lb - lum) * sat);
      const tone = (v) => Math.round(255 * Math.pow(v, 1 / 2.2));
      const i = (y * width + x) * 3;
      rgb[i] = tone(lr);
      rgb[i + 1] = tone(lg);
      rgb[i + 2] = tone(lb);
    }
  }
  if (opts.blur) blurRgb(rgb, width, height, opts.blur);
  return rgb;
}

function trace(scene, ox, oy, oz, dx, dy, dz) {
  let best = null;
  for (const o of scene.objects) {
    const h = o.hit(ox, oy, oz, dx, dy, dz);
    if (h && (!best || h.t < best.t)) {
      h.obj = o;
      best = h;
    }
  }
  if (!best) return scene.sky(dx, dy, dz);
  return shadeHit(scene, best, dx, dy, dz);
}

/** 3x3 盒式模糊（处理经度环绕），消除单采样锯齿 */
function blurRgb(rgb, w, h, passes = 1) {
  let src = rgb;
  for (let p = 0; p < passes; p++) {
    const dst = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) {
        const x0 = (x - 1 + w) % w;
        const x1 = (x + 1) % w;
        for (let c = 0; c < 3; c++) {
          const s =
            src[(y0 * w + x0) * 3 + c] +
            src[(y0 * w + x) * 3 + c] +
            src[(y0 * w + x1) * 3 + c] +
            src[(y * w + x0) * 3 + c] +
            src[(y * w + x) * 3 + c] +
            src[(y * w + x1) * 3 + c] +
            src[(y1 * w + x0) * 3 + c] +
            src[(y1 * w + x) * 3 + c] +
            src[(y1 * w + x1) * 3 + c];
          dst[(y * w + x) * 3 + c] = Math.round(s / 9);
        }
      }
    }
    src = dst;
  }
  if (src !== rgb) rgb.set(src);
  return rgb;
}
