/**
 * 三个示例场景（各自渲染为 2:1 等距柱状全景）
 */
import {
  TAU,
  add3,
  clamp01,
  cylinder,
  fbm3,
  fract,
  hash2,
  lerp,
  mix3,
  mul3,
  noise3,
  renderEquirect,
  roomBox,
  smoothstep,
  solidBox,
  sphere,
} from './raycast.mjs';

const V = (x, y, z) => ({ x, y, z });

/* ============ 通用材质片段 ============ */

function woodPlanks({ x, z }, light = [0.3, 0.19, 0.11], dark = [0.13, 0.08, 0.045]) {
  // 地板木纹：沿 X 方向的板条
  const plank = Math.floor((z + 40) / 0.55);
  const shade = 0.78 + 0.22 * hash2(plank, 3, 17);
  const grain = fbm3(x * 2.2, 0.5, plank * 1.7, 3, 5);
  const seam = Math.abs(fract((z + 40) / 0.55) - 0.5) > 0.46 ? 0.55 : 1;
  const t = clamp01(grain * 0.8 + 0.1);
  return mul3(mix3(dark, light, t), shade * seam);
}

function stoneWall(y, light = [0.36, 0.31, 0.24], dark = [0.17, 0.145, 0.115]) {
  const courses = Math.floor((y + 2) / 0.7);
  const off = (courses % 2) * 0.5;
  const brick = fbm3(1.3, (y + 2) * 1.6, 0.7, 2, 9);
  const mortar =
    Math.abs(fract((y + 2) / 0.7) - 0.5) > 0.44 ? 0.72 : 1;
  return mul3(mix3(dark, light, brick), mortar * (0.9 + 0.1 * off));
}

const plaster = (base) => () => base;

/* ============ 场景一：入口大厅 ============ */

export function entranceScene() {
  const FLOOR = -1.55;
  const CEIL = 4.4;
  const HALF = 8;
  const objects = [];

  // 房间
  objects.push(
    roomBox([-HALF, FLOOR, -HALF], [HALF, CEIL, HALF], (kind, x, y, z) => {
      if (kind === 'floor') {
        return {
          color: (h) => {
            // 中庭罗盘：以 (0, 4.2) 为心的浅色石环 + 八芒星
            const rr = Math.hypot(h.x, h.z - 4.2);
            if (rr < 3.4) {
              const ang = Math.atan2(h.x, h.z - 4.2);
              const rings = Math.abs(fract(rr * 1.6) - 0.5);
              const star = Math.pow(Math.abs(Math.cos(ang * 4)), 6) + Math.pow(Math.abs(Math.cos(ang * 4 + Math.PI / 4)), 6);
              let c = mix3([0.2, 0.19, 0.17], [0.36, 0.33, 0.27], clamp01(rings * 1.8));
              if (star > 0.55 && rr > 1.1) c = mix3(c, [0.44, 0.36, 0.2], 0.5);
              if (rr < 0.9) {
                const inner = mix3([0.46, 0.39, 0.25], [0.17, 0.15, 0.12], smoothstep(0.1, 0.9, rr));
                c = inner;
              }
              // 北向指针
              if (Math.abs(((ang + Math.PI) % TAU) - Math.PI) < 0.05 && rr < 2.6) {
                c = mix3(c, [0.7, 0.5, 0.2], 0.65);
              }
              return mul3(c, 0.95 + 0.05 * noise3(h.x * 9, 0.2, h.z * 9, 2));
            }
            return woodPlanks(h);
          },
          spec: { strength: 0.06, shininess: 18 },
        };
      }
      if (kind === 'ceiling') {
        return {
          color: (h) => {
            const beam = Math.abs(fract((h.z + 40) / 2.2) - 0.5);
            const beamShade = beam > 0.42 ? 0.6 : 1;
            const panel = mix3([0.2, 0.16, 0.12], [0.28, 0.22, 0.16], fbm3(h.x, h.z, 1, 2, 4));
            return mul3(panel, beamShade);
          },
        };
      }
      // 墙面：下部木护墙板，上部灰泥 + 拱窗
      return {
        color: (h) => {
          if (y < FLOOR + 1.1) return mul3(woodPlanks({ x: h.x + h.z, z: h.z }, [0.3, 0.2, 0.12], [0.16, 0.1, 0.06]), 0.9);
          const base = stoneWall(h.y);
          // 拱窗：按方位角每 45° 一扇
          const ang = Math.atan2(h.x, h.z);
          const cell = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
          let dl = ang - cell;
          while (dl > Math.PI) dl -= TAU;
          while (dl < -Math.PI) dl += TAU;
          const winHalf = 0.09;
          const wy0 = FLOOR + 1.5;
          const wy1 = FLOOR + 3.4;
          if (Math.abs(dl) < winHalf && h.y > wy0 && h.y < wy1) {
            // 窗洞 → 亮色（低处更暖，高处偏天光）
            const t = smoothstep(wy0, wy1, h.y);
            const lead = Math.abs(fract((h.y - wy0) * 3.2) - 0.5) > 0.44 || Math.abs(dl / winHalf) > 0.9;
            const glass = mix3([0.72, 0.58, 0.34], [0.62, 0.72, 0.86], t * t);
            return mul3(glass, lead ? 0.45 : 1);
          }
          // 窗框装饰
          if (Math.abs(dl) < winHalf + 0.016 && h.y > wy0 - 0.12 && h.y < wy1 + 0.12) {
            return [0.2, 0.16, 0.12];
          }
          // 腰线与踢脚线
          if (Math.abs(h.y - (FLOOR + 1.12)) < 0.035) return [0.3, 0.22, 0.14];
          if (Math.abs(h.y - (FLOOR + 0.2)) < 0.03) return [0.16, 0.12, 0.09];
          // 竖向壁柱，每 45° 一根
          const pillarCell = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4) + Math.PI / 8;
          let pdl = ang - pillarCell;
          while (pdl > Math.PI) pdl -= TAU;
          while (pdl < -Math.PI) pdl += TAU;
          if (Math.abs(pdl) < 0.022) return mul3(base, 0.75);
          return mul3(base, 0.94 + 0.06 * noise3(h.x * 4, h.y * 4, h.z * 4, 7));
        },
      };
    }),
  );

  // 中央展台：圆形基座 + 年轮切片（放在相机后方数米，避免包住视点）
  const PZ = 4.2;
  const pedestalMat = {
    color: (h) => mix3([0.17, 0.14, 0.11], [0.33, 0.29, 0.24], clamp01(0.4 + 0.3 * noise3(h.x * 6, h.y * 6, h.z * 6, 11))),
    spec: { strength: 0.12, shininess: 30 },
  };
  objects.push(cylinder(0, PZ, 1.15, FLOOR, FLOOR + 0.75, pedestalMat));

  // 年轮切片（水平圆盘）
  objects.push(cylinder(0, PZ, 1.35, FLOOR + 0.75, FLOOR + 0.86, {
    color: (h) => {
      const rr = Math.hypot(h.x, h.z - PZ);
      const ang = Math.atan2(h.x, h.z - PZ);
      const ring = Math.abs(fract(rr * 9 + 0.4 * Math.sin(ang * 3)) - 0.5);
      const base = mix3([0.5, 0.33, 0.18], [0.76, 0.6, 0.36], clamp01(ring * 1.6 + 0.15));
      return h.ny > 0 ? base : mul3(base, 0.6);
    },
    spec: { strength: 0.16, shininess: 26 },
  }));
  // 切片上的小树苗
  objects.push(cylinder(0, PZ, 0.06, FLOOR + 0.86, FLOOR + 1.5, { color: () => [0.28, 0.2, 0.11] }));
  objects.push(sphere(0, FLOOR + 1.62, PZ, 0.42, {
    color: (h) => mix3([0.14, 0.34, 0.13], [0.36, 0.62, 0.24], clamp01(0.45 + 0.5 * noise3(h.x * 8, h.y * 8, h.z * 8, 21))),
    spec: { strength: 0.2, shininess: 22 },
  }));

  // 展柜：沿四个对角方向的玻璃柜
  const cabinetMat = {
    color: (h) => {
      const edge = Math.min(0.1, Math.abs(h.x - 0) + 0.1);
      return mix3([0.44, 0.4, 0.34], [0.26, 0.23, 0.19], clamp01(noise3(h.x * 7, h.y * 7, h.z * 7, 13) * 0.5));
    },
    spec: { strength: 0.35, shininess: 70 },
  };
  for (const [cx, cz] of [
    [4.4, 4.4],
    [-4.4, 4.4],
    [4.4, -4.4],
    [-4.4, -4.4],
  ]) {
    objects.push(solidBox([cx - 0.9, FLOOR, cz - 0.9], [cx + 0.9, FLOOR + 0.7, cz + 0.9], cabinetMat));
    objects.push(
      solidBox([cx - 0.85, FLOOR + 0.7, cz - 0.85], [cx + 0.85, FLOOR + 1.9, cz + 0.85], {
        color: (h) => mix3([0.42, 0.55, 0.57], [0.6, 0.72, 0.75], clamp01(0.5 + 0.3 * noise3(h.x, h.y * 2, h.z, 33))),
        spec: { strength: 0.5, shininess: 120 },
        emissive: (h) => {
          // 柜内暖光
          const inside = h.y > FLOOR + 0.8 && h.y < FLOOR + 1.6 ? 0.1 : 0.02;
          return [inside * 1.0, inside * 0.75, inside * 0.4];
        },
      }),
    );
  }

  // 吊灯：灯罩 + 发光面
  for (const [lx, lz] of [
    [-3.2, 0.4],
    [3.2, -0.4],
  ]) {
    objects.push(
      cylinder(lx, lz, 0.32, CEIL - 0.9, CEIL - 0.55, {
        color: () => [0.86, 0.78, 0.6],
        emissive: () => [1.5, 1.15, 0.55],
      }),
    );
    objects.push(cylinder(lx, lz, 0.03, CEIL - 0.55, CEIL, { color: () => [0.18, 0.16, 0.14] }));
  }

  // 盆栽
  for (const [px, pz, s] of [
    [-6.0, -5.4, 1.0],
    [6.0, 5.6, 1.15],
    [5.6, -6.2, 0.9],
    [-5.8, 6.4, 1.05],
  ]) {
    objects.push(
      cylinder(px, pz, 0.42 * s, FLOOR, FLOOR + 0.62 * s, {
        color: (h) => mix3([0.3, 0.17, 0.1], [0.48, 0.28, 0.16], clamp01(noise3(h.x * 9, h.y * 9, h.z * 9, 3))),
      }),
    );
    for (const [ox, oy, oz, rad] of [
      [0, 1.25, 0, 0.62],
      [0.35, 1.05, 0.18, 0.42],
      [-0.3, 1.1, -0.22, 0.4],
      [0.05, 1.6, -0.1, 0.38],
    ]) {
      objects.push(
        sphere(px + ox * s, FLOOR + oy * s, pz + oz * s, rad * s, {
          color: (h) =>
            mix3([0.1, 0.27, 0.1], [0.33, 0.56, 0.2], clamp01(0.35 + 0.6 * noise3(h.x * 6, h.y * 6, h.z * 6, 27))),
          spec: { strength: 0.18, shininess: 20 },
        }),
      );
    }
  }

  // 长椅
  for (const [bx, bz, rot] of [
    [-2.6, -3.6, 0.4],
    [2.8, 3.4, -0.5],
  ]) {
    const bench = (dx, dy, dz, sx, sy, sz, mat) => {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const wx = bx + dx * c - dz * s;
      const wz = bz + dx * s + dz * c;
      objects.push(
        solidBox([wx - sx, FLOOR + dy, wz - sz], [wx + sx, FLOOR + dy + sy, wz + sz], mat),
      );
    };
    const benchMat = {
      color: (h) => mix3([0.32, 0.19, 0.1], [0.56, 0.36, 0.18], clamp01(0.5 + 0.4 * noise3(h.x * 5, h.y * 5, h.z * 5, 19))),
      spec: { strength: 0.14, shininess: 24 },
    };
    bench(0, 0.42, 0, 0.95, 0.09, 0.32, benchMat);
    bench(0, 0.1, 0, 0.06, 0.32, 0.28, { color: () => [0.16, 0.13, 0.1] });
    bench(0.85, 0.1, 0, 0.06, 0.32, 0.28, { color: () => [0.16, 0.13, 0.1] });
    bench(-0.85, 0.1, 0, 0.06, 0.32, 0.28, { color: () => [0.16, 0.13, 0.1] });
  }

  return {
    objects,
    ambient: [0.03, 0.033, 0.04],
    hemiSky: [0.14, 0.155, 0.185],
    hemiGround: [0.055, 0.045, 0.034],
    lights: [
      { x: -3.2, y: CEIL - 0.75, z: 0.4, color: [1.0, 0.78, 0.46], power: 3.4, radius: 4.5 },
      { x: 3.2, y: CEIL - 0.75, z: -0.4, color: [1.0, 0.78, 0.46], power: 3.4, radius: 4.5 },
      { x: 0, y: CEIL - 0.3, z: 0, color: [0.62, 0.72, 0.92], power: 0.7, radius: 10 },
      { x: 0, y: 2.6, z: 6.6, color: [0.95, 0.78, 0.55], power: 1.3, radius: 5 },
      { x: 0, y: 2.6, z: -6.6, color: [0.95, 0.78, 0.55], power: 1.3, radius: 5 },
      { x: 6.6, y: 2.6, z: 0, color: [0.95, 0.78, 0.55], power: 1.1, radius: 5 },
      { x: -6.6, y: 2.6, z: 0, color: [0.95, 0.78, 0.55], power: 1.1, radius: 5 },
    ],
    fog: { color: [0.04, 0.036, 0.032], density: 0.009 },
    exposure: 0.85,
    saturation: 1.2,
    sky: () => [0.02, 0.02, 0.025],
  };
}

/* ============ 场景二：雨林温室 ============ */

export function canopyScene() {
  const GROUND = -1.9;
  const DOME = 13;
  const objects = [];

  // 半球形玻璃穹顶（球体内部渲染：法向翻到内侧）
  objects.push(
    sphere(0, 0, 0, DOME, {
      color: (h) => {
        if (h.y < GROUND + 1e-3) return [0.09, 0.08, 0.06];
        const lat = Math.asin(clamp01(h.y / DOME));
        const rib = Math.min(
          Math.abs(fract((Math.atan2(h.x, h.z) / TAU) * 30) - 0.5),
          Math.abs(fract(lat * 7) - 0.5),
        );
        const frame = rib < 0.026;
        if (frame) return [0.1, 0.11, 0.095];
        // 玻璃外的天空：地平线暖白 → 天顶冷蓝
        const sky = mix3([0.5, 0.6, 0.42], [0.26, 0.5, 0.88], smoothstep(0.02, 1.0, lat));
        // 玻璃上的水汽与反光
        const smear = fbm3(h.x * 0.5, h.y * 0.7, h.z * 0.5, 3, 3);
        return mix3(sky, [0.86, 0.9, 0.82], smear * 0.28);
      },
      emissive: (h) => {
        if (h.y < GROUND) return [0, 0, 0];
        const lat = Math.asin(clamp01(h.y / DOME));
        const k = Math.pow(clamp01(lat * 1.15), 1.6);
        const smear = fbm3(h.x * 0.5, h.y * 0.7, h.z * 0.5, 3, 3);
        return [0.16 * k + smear * 0.07, 0.22 * k + smear * 0.08, 0.3 * k + smear * 0.06];
      },
    }),
  );

  // 地面：泥土 + 苔藓 + 石板路
  const pathMat = {
    color: (h) => {
      const rr = Math.hypot(h.x, h.z);
      // 环形石板路
      const ringR = 5.2 + 0.35 * Math.sin(Math.atan2(h.x, h.z) * 6);
      const onPath = Math.abs(rr - ringR) < 0.75;
      if (onPath) {
        const stone = clamp01(0.5 + 0.4 * noise3(h.x * 3, 0.1, h.z * 3, 12));
        const grout = Math.abs(fract(rr * 5.5) - 0.5) > 0.45 ? 0.6 : 1;
        return mul3(mix3([0.24, 0.225, 0.2], [0.4, 0.38, 0.33], stone), grout);
      }
      const moss = clamp01(fbm3(h.x * 1.5, 0.4, h.z * 1.5, 4, 8) * 1.4 - 0.2);
      return mix3([0.11, 0.085, 0.055], [0.12, 0.21, 0.075], moss);
    },
  };
  objects.push(cylinder(0, 0, DOME * 0.98, GROUND - 0.5, GROUND, pathMat));

  // 树干与树冠
  const trees = [
    [3.6, 3.0, 1.0],
    [-3.2, 4.2, 1.15],
    [4.6, -2.8, 0.9],
    [-4.4, -3.4, 1.05],
    [0.2, -6.0, 0.85],
    [-6.4, 1.2, 0.95],
    [7.0, 4.8, 1.2],
    [-7.4, -2.0, 1.1],
    [2.0, 7.4, 1.05],
  ];
  const barkMat = {
    color: (h) => {
      const ring = Math.abs(fract((h.y + 4) * 7 + 0.6 * noise3(h.x * 3, h.y, h.z * 3, 5)) - 0.5);
      return mix3([0.15, 0.1, 0.06], [0.36, 0.27, 0.18], clamp01(ring * 1.2 + 0.2));
    },
  };
  const leafMat = (seed) => {
    // 每个实例一点色相偏移：偏橄榄 / 偏黄绿 / 偏深绿
    const hue = hash2(seed, 17, 5);
    const deep = mix3([0.035, 0.11, 0.035], [0.05, 0.14, 0.04], hue);
    const mid = mix3([0.11, 0.3, 0.07], [0.19, 0.36, 0.06], hue);
    const tip = mix3([0.3, 0.55, 0.14], [0.44, 0.6, 0.12], hue);
    return {
      color: (h) => {
        const n = clamp01(0.28 + 0.78 * noise3(h.x * 5, h.y * 5, h.z * 5, seed));
        const n2 = clamp01(0.15 + 0.95 * noise3(h.x * 15, h.y * 15, h.z * 15, seed + 1));
        const vein = Math.abs(fract((h.x + h.y * 0.35 + h.z) * 5) - 0.5);
        const base = mix3(mix3(deep, mid, n), tip, n2 * n2 * 0.5);
        // 朝下的叶面明显更暗
        const down = clamp01(-h.ny);
        return mul3(base, (0.7 + 0.42 * vein) * (1 - down * 0.5));
      },
      spec: { strength: 0.18, shininess: 18 },
    };
  };
  for (const [tx, tz, s] of trees) {
    const h = 5.2 * s;
    objects.push(cylinder(tx, tz, 0.34 * s, GROUND, GROUND + h, barkMat));
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * TAU + tx;
      const rr = (0.5 + 1.15 * hash2(i, tx * 10, 3)) * s;
      objects.push(
        sphere(
          tx + Math.cos(ang) * rr,
          GROUND + h * (0.42 + 0.52 * hash2(i, tz * 10, 5)),
          tz + Math.sin(ang) * rr,
          (0.5 + 0.62 * hash2(i, 7, tx)) * s,
          leafMat(31 + i * 7 + Math.round(tx)),
          0.78,
        ),
      );
    }
    // 低处的枝叶与藤蔓
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * TAU + tz;
      objects.push(
        sphere(
          tx + Math.cos(ang) * 0.8 * s,
          GROUND + h * (0.16 + 0.12 * i),
          tz + Math.sin(ang) * 0.8 * s,
          0.32 * s,
          leafMat(211 + i + Math.round(tz)),
        ),
      );
    }
  }

  // 近景蕨类丛（视野下方 2–5 米处）
  for (let i = 0; i < 46; i++) {
    const ang = (i / 46) * TAU + hash2(i, 9, 2) * 0.5;
    const rr = 2.6 + hash2(i, 10, 2) * 5.4;
    const bx = Math.cos(ang) * rr;
    const bz = Math.sin(ang) * rr;
    const s = 0.28 + hash2(i, 11, 2) * 0.62;
    objects.push(sphere(bx, GROUND + s * 0.7, bz, s, leafMat(301 + i), 0.72));
    if (i % 2 === 0) {
      objects.push(sphere(bx + s * 0.75, GROUND + s * 0.4, bz + s * 0.3, s * 0.72, leafMat(341 + i), 0.7));
      objects.push(sphere(bx - s * 0.6, GROUND + s * 0.5, bz - s * 0.55, s * 0.6, leafMat(381 + i), 0.7));
    }
  }

  // 木栈道与栏杆
  for (let i = 0; i < 14; i++) {
    const a0 = (i / 14) * TAU;
    const x = Math.cos(a0) * 2.6;
    const z = Math.sin(a0) * 2.6;
    objects.push(
      solidBox([x - 0.55, GROUND - 0.02, z - 0.55], [x + 0.55, GROUND + 0.1, z + 0.55], {
        color: (h) => mix3([0.24, 0.17, 0.1], [0.42, 0.3, 0.18], clamp01(noise3(h.x * 6, 0.2, h.z * 6, 6))),
      }),
    );
  }

  // 石凳
  for (const [sx, sz] of [
    [-2.0, 1.4],
    [1.8, -1.6],
  ]) {
    objects.push(cylinder(sx, sz, 0.62, GROUND, GROUND + 0.42, {
      color: (h) => mix3([0.3, 0.29, 0.26], [0.54, 0.52, 0.47], clamp01(0.4 + 0.4 * noise3(h.x * 4, h.y * 4, h.z * 4, 44))),
    }));
  }

  // 悬挂的灯笼藤
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * TAU + 0.4;
    objects.push(
      sphere(Math.cos(ang) * 4.2, GROUND + 3.4 + 0.5 * Math.sin(i), Math.sin(ang) * 4.2, 0.16, {
        color: () => [0.9, 0.85, 0.6],
        emissive: () => [0.9, 0.75, 0.35],
      }),
    );
  }

  return {
    objects,
    ambient: [0.05, 0.06, 0.05],
    hemiSky: [0.35, 0.42, 0.34],
    hemiGround: [0.1, 0.09, 0.06],
    lights: [
      { x: 0, y: 9, z: 0, color: [1.0, 0.95, 0.8], power: 2.1, radius: 9 },
      { x: -4, y: 6.5, z: 3, color: [0.9, 1.0, 0.8], power: 1.1, radius: 6 },
      { x: 5, y: 5.5, z: -4, color: [0.85, 0.95, 0.75], power: 1.1, radius: 6 },
    ],
    fog: { color: [0.34, 0.42, 0.32], density: 0.008 },
    exposure: 0.82,
    saturation: 1.28,
    sky: () => [0.6, 0.7, 0.6],
  };
}

/* ============ 场景三：夜行馆 ============ */

export function nightScene() {
  const FLOOR = -1.7;
  const HALF = 9;
  const CEIL = 5.2;
  const objects = [];

  objects.push(
    roomBox([-HALF, FLOOR, -HALF], [HALF, CEIL, HALF], (kind, x, y, z) => {
      if (kind === 'floor') {
        return {
          color: (h) => {
            const n = fbm3(h.x * 1.2, 0.3, h.z * 1.2, 3, 17);
            const path = Math.abs(Math.hypot(h.x, h.z) - 4.0) < 1.1;
            const c = mix3([0.05, 0.07, 0.06], [0.1, 0.13, 0.1], n);
            return path ? mix3(c, [0.13, 0.14, 0.13], 0.6) : c;
          },
        };
      }
      if (kind === 'ceiling') {
        // 天顶：星空（发光）
        return {
          color: (h) => {
            const dir = { x: h.x, y: h.y - 2.2, z: h.z };
            const lat = Math.asin(clamp01(dir.y / Math.hypot(dir.x, dir.y, dir.z)));
            const stars = fbm3(h.x * 3, h.y * 3, h.z * 3, 3, 51);
            return mix3([0.02, 0.03, 0.06], [0.06, 0.07, 0.12], stars);
          },
          emissive: (h) => {
            // 星点
            const s = noise3(h.x * 60, h.y * 60, h.z * 60, 7);
            const star = s > 0.9 ? (s - 0.9) * 18 : 0;
            const milky = Math.pow(clamp01(fbm3(h.x * 0.6, h.y, h.z * 0.6, 4, 3)), 3) * 0.25;
            return [star * 0.85 + milky * 0.5, star * 0.9 + milky * 0.55, star * 1.0 + milky * 0.9 + 0.03];
          },
        };
      }
      // 墙面：深色岩壁
      return {
        color: (h) => {
          const n = fbm3(h.x * 1.8, h.y * 1.8, h.z * 1.8, 4, 23);
          const n2 = fbm3(h.x * 6, h.y * 6, h.z * 6, 3, 29);
          return mix3(mix3([0.03, 0.045, 0.05], [0.09, 0.12, 0.13], n), [0.12, 0.16, 0.16], n2 * 0.35);
        },
      };
    }),
  );

  // 发光菌：蘑菇伞 + 光晕
  const fungi = [
    [-3.4, -3.0, 0.55],
    [2.6, -3.8, 0.42],
    [4.2, 2.4, 0.5],
    [-2.4, 3.6, 0.38],
    [0.6, 4.6, 0.32],
    [-5.0, 0.8, 0.45],
  ];
  const glowMat = {
    color: (h) => mix3([0.2, 0.6, 0.5], [0.45, 0.95, 0.8], clamp01(noise3(h.x * 8, h.y * 8, h.z * 8, 13))),
    emissive: () => [0.25, 1.1, 0.85],
  };
  for (const [fx, fz, s] of fungi) {
    objects.push(cylinder(fx, fz, 0.09 * s * 2, FLOOR, FLOOR + 0.55 * s * 2, {
      color: () => [0.55, 0.6, 0.5],
      emissive: () => [0.02, 0.1, 0.07],
    }));
    objects.push(sphere(fx, FLOOR + 0.6 * s * 2, fz, 0.34 * s * 2, glowMat));
  }

  // 萤火虫（小发光球）
  for (let i = 0; i < 40; i++) {
    const ang = hash2(i, 5, 3) * TAU;
    const rr = 1.5 + hash2(i, 6, 3) * 6.5;
    objects.push(
      sphere(
        Math.cos(ang) * rr,
        FLOOR + 0.4 + hash2(i, 7, 3) * 2.6,
        Math.sin(ang) * rr,
        0.025,
        { color: () => [0.8, 1.0, 0.5], emissive: () => [0.9, 1.6, 0.5] },
      ),
    );
  }

  // 岩柱
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * TAU + 0.25;
    const rr = 6.2 + 0.6 * Math.sin(i * 2.1);
    objects.push(
      cylinder(Math.cos(ang) * rr, Math.sin(ang) * rr, 0.32 + 0.12 * Math.sin(i), FLOOR, FLOOR + 2.4 + 1.4 * Math.abs(Math.sin(i * 1.7)), {
        color: (h) => mix3([0.05, 0.06, 0.06], [0.13, 0.15, 0.15], clamp01(noise3(h.x * 3, h.y * 2, h.z * 3, 31))),
      }),
    );
  }

  // 月亮：天顶偏北的一轮满月（发光盘）
  objects.push(
    sphere(0, 6.9, 3.2, 0.55, {
      color: () => [0.92, 0.9, 0.8],
      emissive: () => [1.4, 1.35, 1.1],
    }),
  );

  // 展厅标牌（发光竖条）
  for (const [sx, sz, srot] of [
    [-6.6, 4.4, 0.3],
    [6.4, -4.6, -0.4],
  ]) {
    objects.push(
      cylinder(sx, sz, 0.04, FLOOR, FLOOR + 2.2, { color: () => [0.2, 0.2, 0.2] }),
    );
    objects.push(
      solidBox([sx - 0.5, FLOOR + 1.6, sz - 0.02], [sx + 0.5, FLOOR + 2.0, sz + 0.02], {
        color: () => [0.4, 0.45, 0.4],
        emissive: () => [0.12, 0.22, 0.2],
      }),
    );
  }

  return {
    objects,
    ambient: [0.055, 0.07, 0.085],
    hemiSky: [0.12, 0.16, 0.22],
    hemiGround: [0.04, 0.05, 0.045],
    lights: [
      { x: 0, y: 5.4, z: 2.6, color: [0.55, 0.65, 0.95], power: 1.1, radius: 8 },
      { x: -3.4, y: FLOOR + 1.0, z: -3.0, color: [0.5, 1.0, 0.85], power: 0.6, radius: 4 },
      { x: 3.6, y: FLOOR + 1.1, z: 2.4, color: [0.5, 1.0, 0.85], power: 0.55, radius: 4 },
      { x: -2.4, y: FLOOR + 1.0, z: 3.6, color: [0.5, 1.0, 0.8], power: 0.4, radius: 4 },
    ],
    fog: { color: [0.02, 0.035, 0.045], density: 0.035 },
    exposure: 1.05,
    saturation: 1.18,
    sky: () => [0.01, 0.015, 0.03],
  };
}
