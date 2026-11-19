import { describe, expect, it } from 'vitest';
import {
  Camera,
  FOV_MAX,
  FOV_MIN,
  angularDistance,
  cameraFromLonLat,
  clampFov,
  clampLat,
  formatLonLat,
  lerpCamera,
  lonDelta,
  lonLatToVec,
  projectLonLat,
  rotateCamera,
  rotationFromTo,
  screenHeadingOfTangent,
  screenRay,
  screenToLonLat,
  viewPolygon,
  vecToLonLat,
  wrapLon,
  projectDir,
  equirectAspectInfo,
} from '../../src/lib/geo';

const W = 1200;
const H = 675;
const cam: Camera = { yaw: 0, pitch: 0, fov: 70 };

describe('经度归一化', () => {
  it('把任意经度收敛到 [-180, 180)', () => {
    expect(wrapLon(0)).toBe(0);
    expect(wrapLon(180)).toBe(-180);
    expect(wrapLon(-180)).toBe(-180);
    expect(wrapLon(181)).toBe(-179);
    expect(wrapLon(-181)).toBe(179);
    expect(wrapLon(540)).toBe(-180);
    expect(wrapLon(720.5)).toBeCloseTo(0.5, 9);
    expect(wrapLon(Number.NaN)).toBe(0);
  });

  it('最短经度差跨日界线', () => {
    expect(lonDelta(170, -170)).toBe(20);
    expect(lonDelta(-170, 170)).toBe(-20);
    expect(lonDelta(10, 10)).toBe(0);
  });
});

describe('经纬度 ↔ 三维方向', () => {
  it('往返转换稳定', () => {
    for (const [lon, lat] of [
      [0, 0],
      [45, 30],
      [-120, -50],
      [179.9, 80],
      [-179.9, -80],
    ]) {
      const back = vecToLonLat(lonLatToVec(lon, lat));
      expect(back.lon).toBeCloseTo(lon, 6);
      expect(back.lat).toBeCloseTo(lat, 6);
    }
  });

  it('世界方向符合右手约定', () => {
    const east = lonLatToVec(90, 0);
    expect(east.x).toBeCloseTo(1, 9);
    const north = lonLatToVec(0, 90);
    expect(north.y).toBeCloseTo(1, 9);
    const front = lonLatToVec(0, 0);
    expect(front.z).toBeCloseTo(1, 9);
  });
});

describe('球心投影', () => {
  it('相机中心投影到画面中心', () => {
    const p = projectLonLat(0, 0, cam, W, H);
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(W / 2, 6);
    expect(p.y).toBeCloseTo(H / 2, 6);
  });

  it('东侧在右、北侧在上（无滚转）', () => {
    expect(projectLonLat(10, 0, cam, W, H).x).toBeGreaterThan(W / 2);
    expect(projectLonLat(-10, 0, cam, W, H).x).toBeLessThan(W / 2);
    expect(projectLonLat(0, 10, cam, W, H).y).toBeLessThan(H / 2);
    expect(projectLonLat(0, -10, cam, W, H).y).toBeGreaterThan(H / 2);
  });

  it('背面不可见', () => {
    expect(projectLonLat(180, 0, cam, W, H).visible).toBe(false);
    expect(projectLonLat(90, 0, cam, W, H).visible).toBe(false);
    expect(projectLonLat(70, 0, cam, W, H).visible).toBe(true);
  });

  it('屏幕反投影与投影互逆', () => {
    for (const [x, y] of [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
      [W * 0.3, H * 0.7],
      [W / 2, H / 2],
    ]) {
      const ll = screenToLonLat(x, y, W, H, cam);
      const p = projectLonLat(ll.lon, ll.lat, cam, W, H);
      expect(p.visible).toBe(true);
      expect(p.x).toBeCloseTo(x, 5);
      expect(p.y).toBeCloseTo(y, 5);
    }
  });

  it('视口四角恰好落在边界', () => {
    const a = screenRay(0, 0, W, H, cam);
    const b = screenRay(W, 0, W, H, cam);
    expect(a.y).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThan(a.x);
  });

  it('垂直视场角 30/110 边界处的投影正确', () => {
    const top = screenToLonLat(W / 2, 0, W, H, { ...cam, fov: 110 });
    expect(top.lat).toBeCloseTo(55, 6);
    const top30 = screenToLonLat(W / 2, 0, W, H, { ...cam, fov: 30 });
    expect(top30.lat).toBeCloseTo(15, 6);
  });
});

describe('视角旋转（拖动）', () => {
  it('抓住世界向右拖，相机向左转', () => {
    const prev = screenRay(W / 2, H / 2, W, H, cam);
    const cur = screenRay(W / 2 + 100, H / 2, W, H, cam);
    // 抓取世界：相机朝拖动反方向旋转
    const next = rotateCamera(cam, rotationFromTo(cur, prev));
    expect(next.yaw).toBeLessThan(0);
    expect(next.pitch).toBeCloseTo(0, 6);
    expect(next.fov).toBe(cam.fov);
  });

  it('垂直拖动不产生滚转，纬度被夹紧', () => {
    let c = cam;
    for (let i = 0; i < 40; i++) {
      const prev = screenRay(W / 2, H / 2, W, H, c);
      const cur = screenRay(W / 2, H / 2 - 30, W, H, c);
      c = rotateCamera(c, rotationFromTo(cur, prev));
    }
    expect(c.pitch).toBeLessThanOrEqual(89.5);
    expect(Number.isFinite(c.yaw)).toBe(true);
  });

  it('日界线附近连续拖动不跳变', () => {
    let c: Camera = { yaw: -175, pitch: 0, fov: 70 };
    for (let i = 0; i < 12; i++) {
      const prev = screenRay(W / 2, H / 2, W, H, c);
      const cur = screenRay(W / 2 + 40, H / 2, W, H, c);
      const next = rotateCamera(c, rotationFromTo(cur, prev));
      expect(Math.abs(lonDelta(c.yaw, next.yaw))).toBeLessThan(10);
      c = next;
    }
    // 从 -175 向西转过日界线后应落在正侧
    expect(c.yaw).toBeGreaterThan(0);
    expect(c.yaw).toBeLessThan(180);
  });
});

describe('视角插值与视场角', () => {
  it('跨日界线走短弧', () => {
    const mid = lerpCamera({ yaw: 170, pitch: 0, fov: 70 }, { yaw: -170, pitch: 20, fov: 50 }, 0.5);
    expect(Math.abs(mid.yaw)).toBeCloseTo(180, 6);
    expect(mid.pitch).toBe(10);
    expect(mid.fov).toBe(60);
  });

  it('视场角夹在 30–110', () => {
    expect(clampFov(5)).toBe(FOV_MIN);
    expect(clampFov(200)).toBe(FOV_MAX);
    expect(clampFov(60)).toBe(60);
    expect(clampFov(Number.NaN)).toBe(70);
  });

  it('pitch 越界被夹紧', () => {
    expect(clampLat(50)).toBe(50);
    expect(clampLat(120)).toBe(89.5);
    expect(clampLat(-120)).toBe(-89.5);
    expect(clampLat(Number.NaN)).toBe(0);
    expect(cameraFromLonLat(0, 100, 70).pitch).toBe(89.5);
  });
});

describe('视口球面轮廓', () => {
  it('四角封闭且所有顶点在可见半球', () => {
    const poly = viewPolygon(cam, W, H, 4);
    expect(poly.length).toBe(16);
    for (const p of poly) {
      expect(angularDistance(p, { lon: 0, lat: 0 })).toBeLessThan(90);
    }
  });
});

describe('切向朝向投影', () => {
  it('朝向正北的箭头在画面中朝上（0°）', () => {
    const a = screenHeadingOfTangent(0, 0, 0, cam, W, H);
    expect(Math.abs(a)).toBeLessThan(1e-6);
  });

  it('朝向正东的箭头在画面中朝右（90°）', () => {
    const a = screenHeadingOfTangent(0, 0, 90, cam, W, H);
    expect(a).toBeCloseTo(90, 6);
  });

  it('相机正对高纬某点时，北仍朝上、东仍朝右', () => {
    const c = cameraFromLonLat(30, 55, 70);
    expect(Math.abs(screenHeadingOfTangent(30, 55, 0, c, W, H))).toBeLessThan(1e-6);
    expect(screenHeadingOfTangent(30, 55, 90, c, W, H)).toBeCloseTo(90, 6);
  });

  it('目标点偏到画面左侧时，北向箭头向极点方向倾斜', () => {
    const c = cameraFromLonLat(20, 50, 70);
    const a = screenHeadingOfTangent(0, 50, 0, c, W, H);
    // 目标在画面左侧，北极在画面中线，因此“北”向右上倾斜
    expect(a).toBeGreaterThan(5);
    expect(a).toBeLessThan(90);
  });
});

describe('辅助格式化', () => {
  it('中文经纬度', () => {
    expect(formatLonLat({ lon: 118.3, lat: 31.2 }, 1)).toBe('东经 118.3° · 北纬 31.2°');
    expect(formatLonLat({ lon: -0.5, lat: -12 }, 1)).toBe('西经 0.5° · 南纬 12.0°');
  });

  it('等距柱状图比例检查', () => {
    expect(equirectAspectInfo(4096, 2048).ok).toBe(true);
    expect(equirectAspectInfo(4000, 1000).ok).toBe(false);
  });
});
