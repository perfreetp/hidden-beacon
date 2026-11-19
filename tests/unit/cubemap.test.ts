import { describe, expect, it } from 'vitest';
import {
  CUBE_FACES,
  EDGE_LABEL,
  FACE_BY_KEY,
  checkSeams,
  cubeEdges,
  dirToFacePixel,
  equirectSeamDiff,
  faceDir,
  facePixelDir,
  lonLatToCubeFace,
  neighborOf,
  splitAndCheck,
  splitEquirect,
  type EquirectSource,
  type PixelBuffer,
  type Rgb,
} from '../../src/lib/cubemap';
import { lonLatToEquirectUV, vecToLonLat } from '../../src/lib/geo';

/** 生成一张解析式“世界”：颜色只由经纬度决定，接缝必然连续 */
function analyticSource(width = 512, height = 256): EquirectSource {
  return {
    width,
    height,
    sample(u, v) {
      // 用连续的球面函数，保证左右边界与所有经线处都无缝
      const lon = (u - 0.5) * 360 * (Math.PI / 180);
      const lat = (0.5 - v) * Math.PI;
      const c = Math.cos(lat);
      const x = c * Math.sin(lon);
      const y = Math.sin(lat);
      const z = c * Math.cos(lon);
      return [
        128 + 110 * x,
        128 + 110 * y * z,
        128 + 90 * (x * x - z * z),
      ] as Rgb;
    },
  };
}

describe('立方体面基向量', () => {
  it('每个面的中心方向与法向一致', () => {
    for (const f of CUBE_FACES) {
      const d = faceDir(f, 0, 0);
      expect(d.x).toBeCloseTo(f.normal.x, 9);
      expect(d.y).toBeCloseTo(f.normal.y, 9);
      expect(d.z).toBeCloseTo(f.normal.z, 9);
    }
  });

  it('u 向右、v 向上（面自身坐标系）', () => {
    for (const f of CUBE_FACES) {
      // right × up = ±normal，构成正交基
      const rx = f.right;
      const ux = f.up;
      const cx = rx.y * ux.z - rx.z * ux.y;
      const cy = rx.z * ux.x - rx.x * ux.z;
      const cz = rx.x * ux.y - rx.y * ux.x;
      const s = cx * f.normal.x + cy * f.normal.y + cz * f.normal.z;
      expect(Math.abs(s)).toBeCloseTo(1, 9);
      // 侧面竖直面的“上”朝天顶；顶/底面则沿南北
      if (f.key === 'pz' || f.key === 'px' || f.key === 'nz' || f.key === 'nx') {
        const up = faceDir(f, 0, 0.5);
        expect(up.y).toBeGreaterThan(0);
      }
      if (f.key === 'py') expect(faceDir(f, 0, 0.5).z).toBeLessThan(0);
      if (f.key === 'ny') expect(faceDir(f, 0, 0.5).z).toBeGreaterThan(0);
    }
  });

  it('像素坐标 → 世界 → 像素坐标往返', () => {
    for (const f of CUBE_FACES) {
      for (const [x, y] of [
        [0, 0],
        [63.5, 12.25],
        [128, 200],
        [255, 255],
      ]) {
        const d = facePixelDir(f, x, y, 256);
        const back = dirToFacePixel(f, d, 256);
        expect(back.x).toBeCloseTo(x, 6);
        expect(back.y).toBeCloseTo(y, 6);
      }
    }
  });

  it('面中心经纬度符合方位描述', () => {
    expect(vecToLonLat(faceDir(FACE_BY_KEY.pz, 0, 0)).lon).toBeCloseTo(0, 6);
    expect(vecToLonLat(faceDir(FACE_BY_KEY.px, 0, 0)).lon).toBeCloseTo(90, 6);
    expect(vecToLonLat(faceDir(FACE_BY_KEY.nz, 0, 0)).lon).toBeCloseTo(180, 6);
    expect(vecToLonLat(faceDir(FACE_BY_KEY.nx, 0, 0)).lon).toBeCloseTo(-90, 6);
    expect(vecToLonLat(faceDir(FACE_BY_KEY.py, 0, 0)).lat).toBeCloseTo(90, 6);
    expect(vecToLonLat(faceDir(FACE_BY_KEY.ny, 0, 0)).lat).toBeCloseTo(-90, 6);
  });
});

describe('立方体邻接关系', () => {
  it('恰好 12 条接缝', () => {
    expect(cubeEdges(256).length).toBe(12);
  });

  it('邻接是对称的', () => {
    for (const f of CUBE_FACES) {
      for (const e of ['top', 'right', 'bottom', 'left'] as const) {
        const nb = neighborOf(f, e, 256);
        expect(nb.face.key).not.toBe(f.key);
        const back = neighborOf(nb.face, nb.edge, 256);
        expect(back.face.key).toBe(f.key);
      }
    }
  });

  it('每条边上的点在两侧面上给出同一个世界方向', () => {
    // 沿边参数 t 的边界方向（与 edgePixel 的走向一致：右边/左边随 t 向下）
    const boundaryDir = (f: (typeof CUBE_FACES)[number], e: string, t: number) =>
      e === 'top'
        ? faceDir(f, 2 * t - 1, 1)
        : e === 'bottom'
          ? faceDir(f, 2 * t - 1, -1)
          : e === 'right'
            ? faceDir(f, 1, 1 - 2 * t)
            : faceDir(f, -1, 1 - 2 * t);
    for (const f of CUBE_FACES) {
      for (const e of ['top', 'right', 'bottom', 'left'] as const) {
        const nb = neighborOf(f, e, 256);
        for (const t of [0.1, 0.35, 0.5, 0.75, 0.95]) {
          const d = boundaryDir(f, e, t);
          const q = dirToFacePixel(nb.face, d, 256);
          const tPrime =
            nb.edge === 'top' || nb.edge === 'bottom' ? (q.x + 0.5) / 256 : (q.y + 0.5) / 256;
          const expected = nb.reversed ? 1 - t : t;
          expect(tPrime).toBeCloseTo(expected, 5);
          if (nb.edge === 'top') expect(q.y).toBeCloseTo(-0.5, 5);
          if (nb.edge === 'bottom') expect(q.y).toBeCloseTo(255.5, 5);
          if (nb.edge === 'left') expect(q.x).toBeCloseTo(-0.5, 5);
          if (nb.edge === 'right') expect(q.x).toBeCloseTo(255.5, 5);
        }
      }
    }
  });
});

describe('等距柱状切分', () => {
  const src = analyticSource();

  it('生成六张面，尺寸与像素齐全', () => {
    const faces = splitEquirect(src, 64);
    expect(Object.keys(faces).sort()).toEqual(['nx', 'ny', 'nz', 'px', 'py', 'pz']);
    for (const f of CUBE_FACES) {
      expect(faces[f.key].size).toBe(64);
      expect(faces[f.key].data.width).toBe(64);
      expect(faces[f.key].data.data.length).toBe(64 * 64 * 4);
    }
  });

  it('面中心像素颜色等于该方向在源图上的颜色', () => {
    const faces = splitEquirect(src, 32);
    const ll = vecToLonLat({ x: 0, y: 0, z: 1 });
    const uv = lonLatToEquirectUV(ll.lon, ll.lat);
    const expectRgb = src.sample(uv.u, uv.v);
    const face = faces.pz;
    const i = (16 * 32 + 16) * 4;
    expect(Math.abs(face.data.data[i] - expectRgb[0])).toBeLessThan(6);
    expect(Math.abs(face.data.data[i + 1] - expectRgb[1])).toBeLessThan(6);
  });

  it('解析式无缝源图 → 12 条接缝都接近 0', () => {
    const result = splitAndCheck(src, 128);
    expect(result.report.length).toBe(12);
    // 平滑解析源图在 128px 面上仍有 1–2 级量化误差
    expect(result.worstMean).toBeLessThan(2);
    expect(result.score).toBeGreaterThanOrEqual(90);
    for (const r of result.report) {
      expect(Number.isFinite(r.meanDiff)).toBe(true);
      expect(r.samples.length).toBe(64);
    }
  });

  it('人为错位的水平条纹 → 检出接缝颜色突变', () => {
    // 竖直方向条纹：纬度每 10° 一条，切面时相邻面若错位就会产生明显色差
    const striped: EquirectSource = {
      width: 512,
      height: 256,
      sample(_u, v) {
        const lat = (0.5 - v) * 180;
        const k = Math.abs(lat + 90) / 10;
        const on = Math.floor(k) % 2 === 0;
        const c = on ? 240 : 15;
        return [c, c, c] as Rgb;
      },
    };
    const result = splitAndCheck(striped, 128);
    // 条纹在立方体上仍是连续的，所以接缝本身不应该“因为条纹”而爆表
    for (const r of result.report) {
      expect(Number.isFinite(r.excessRatio)).toBe(true);
    }
    // 真正错位：把某面右移半张图
    const faces = splitEquirect(src, 64);
    const shifted = {
      ...faces,
      px: { ...faces.px, size: faces.px.size, data: shiftPixels(faces.px.data, 9) },
    };
    const report = checkSeams(shifted);
    const touched = report.filter((r) => r.a === 'px' || r.b === 'px');
    expect(touched.length).toBeGreaterThan(0);
    const worst = Math.max(...touched.map((r) => r.meanDiff));
    expect(worst).toBeGreaterThan(2);
  });

  it('源图左右边界色差用于提示 ±180° 接缝', () => {
    const seamless = equirectSeamDiff(analyticSource());
    expect(seamless).toBeLessThan(2);
    const broken: EquirectSource = {
      width: 256,
      height: 128,
      sample(u) {
        return u < 0.5 ? [0, 0, 0] : [255, 255, 255];
      },
    };
    expect(equirectSeamDiff(broken)).toBeGreaterThan(200);
  });
});

describe('经纬度 → 立方体面', () => {
  it('六个轴向的归属正确', () => {
    expect(lonLatToCubeFace(0, 0).key).toBe('pz');
    expect(lonLatToCubeFace(90, 0).key).toBe('px');
    expect(lonLatToCubeFace(180, 0).key).toBe('nz');
    expect(lonLatToCubeFace(-90, 0).key).toBe('nx');
    expect(lonLatToCubeFace(0, 89).key).toBe('py');
    expect(lonLatToCubeFace(0, -89).key).toBe('ny');
  });

  it('面中心的 uv 接近 0', () => {
    const r = lonLatToCubeFace(90, 0);
    expect(r.u).toBeCloseTo(0, 6);
    expect(r.v).toBeCloseTo(0, 6);
  });

  it('面标签齐全', () => {
    for (const e of ['top', 'right', 'bottom', 'left'] as const) {
      expect(EDGE_LABEL[e].length).toBeGreaterThan(0);
    }
  });
});

function shiftPixels(img: PixelBuffer, dx: number): PixelBuffer {
  const out: PixelBuffer = {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.width * img.height * 4),
  };
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const sx = (((x - dx) % img.width) + img.width) % img.width;
      const si = (y * img.width + sx) * 4;
      const di = (y * img.width + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}
