/**
 * 程序化山地高程场。所有坐标单位:米。
 * 纯函数 —— 任意 (x, z) 的高程只由坐标决定,因此瓦片边界天然对齐,
 * 也可用于遮挡测试、坡度计算等任意位置的采样。
 */

function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 值噪声,返回 0..1 */
export function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = fade(fx), v = fade(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, z: number, octaves: number): number {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function ridged(x: number, z: number, octaves: number): number {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise(x * freq, z * freq);
    const r = 1 - Math.abs(2 * n - 1);
    sum += amp * r * r;
    norm += amp;
    amp *= 0.5;
    freq *= 2.11;
  }
  return sum / norm;
}

/** 山谷中线(沿 x 方向蜿蜒) */
export function valleyCenter(x: number): number {
  return 900 * (fbm(x * 0.00028, 3.7, 3) - 0.5);
}

/**
 * 地形高程(米)。
 * 谷底约 620~700m,两侧山脊最高约 3000m。
 */
export function terrainHeight(x: number, z: number): number {
  const d = Math.abs(z - valleyCenter(x));
  const mask = smoothstep(140, 1050, d);          // 0 = 谷底, 1 = 山体
  const m = ridged(x * 0.00052, z * 0.00052, 5);  // 山脊
  const hills = fbm(x * 0.0038 + 11.3, z * 0.0038 - 7.9, 4);
  let h = 640 + x * 0.025;                        // 谷底沿下游缓降
  h += mask * (m * m * 2100 + 260);
  h += hills * (36 + 150 * mask);
  return h;
}

/** 数值梯度(中心差分) */
export function terrainGradient(x: number, z: number, eps = 2): { dx: number; dz: number } {
  return {
    dx: (terrainHeight(x + eps, z) - terrainHeight(x - eps, z)) / (2 * eps),
    dz: (terrainHeight(x, z + eps) - terrainHeight(x, z - eps)) / (2 * eps),
  };
}
