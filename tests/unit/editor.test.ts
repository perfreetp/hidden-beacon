import { describe, expect, it } from 'vitest';
import {
  FOV_MAX,
  FOV_MIN,
  cameraFromLonLat,
  lonLatToVec,
  projectDir,
  screenToLonLat,
  vecToLonLat,
  cameraBasis,
  wrapLon,
} from '../../src/lib/geo';
import { validateTour, serializeTour, normalizeHotspot, createTour, type Tour } from '../../src/lib/tour';
import { hotspotView, nearViewport } from '../../src/lib/visibility';

const W = 1280;
const H = 720;

/** 模拟“把热点拖到视口边缘”：指针被夹到画面内，每次都要得到确定且可复现的经纬度 */
function dragTo(x: number, y: number, cam = cameraFromLonLat(0, 0, 70)) {
  // 与 Viewport 中完全一致的夹紧逻辑
  const cx = Math.min(W - 0.5, Math.max(0.5, x));
  const cy = Math.min(H - 0.5, Math.max(0.5, y));
  return screenToLonLat(cx, cy, W, H, cam);
}

describe('热点拖到视口边缘', () => {
  it('夹紧到边界后能稳定回读出同一经纬度', () => {
    const cases: [number, number][] = [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
      [-40, H / 2],
      [W + 60, H / 2],
      [W / 2, -80],
      [W / 2, H + 80],
    ];
    for (const [x, y] of cases) {
      const a = dragTo(x, y);
      const b = dragTo(x, y);
      expect(a.lon).toBeCloseTo(b.lon, 9);
      expect(a.lat).toBeCloseTo(b.lat, 9);
      // 回代投影应回到边界上的夹紧位置
      const p = projectDir(lonLatToVec(a.lon, a.lat), cameraFromLonLat(0, 0, 70), W, H);
      const cxp = Math.min(W - 0.5, Math.max(0.5, x));
      const cyp = Math.min(H - 0.5, Math.max(0.5, y));
      expect(p.x).toBeCloseTo(cxp, 4);
      expect(p.y).toBeCloseTo(cyp, 4);
    }
  });

  it('沿四条边滑动时屏幕位置连续，不会跳变', () => {
    const cam = cameraFromLonLat(0, 0, 70);
    // 每条边：采样序列；相邻两个采样点在屏幕上必须连续（没有绕圈或跳到背面）
    const walks: [number, number][][] = [
      Array.from({ length: 40 }, (_, i) => [0.5, 0.5 + (i * (H - 1)) / 39] as [number, number]),
      Array.from({ length: 40 }, (_, i) => [W - 0.5, 0.5 + (i * (H - 1)) / 39] as [number, number]),
      Array.from({ length: 40 }, (_, i) => [0.5 + (i * (W - 1)) / 39, 0.5] as [number, number]),
      Array.from({ length: 40 }, (_, i) => [0.5 + (i * (W - 1)) / 39, H - 0.5] as [number, number]),
    ];
    for (const walk of walks) {
      let prev = dragTo(walk[0][0], walk[0][1], cam);
      let prevP = projectDir(lonLatToVec(prev.lon, prev.lat), cam, W, H);
      for (const [x, y] of walk.slice(1)) {
        const ll = dragTo(x, y, cam);
        const p = projectDir(lonLatToVec(ll.lon, ll.lat), cam, W, H);
        expect(Number.isFinite(ll.lon) && Number.isFinite(ll.lat)).toBe(true);
        // 采样间距约 20–33px，允许球心投影在边角的适度放大
        expect(Math.hypot(p.x - prevP.x, p.y - prevP.y)).toBeLessThan(60);
        prev = ll;
        prevP = p;
      }
    }
  });

  it('把指针移出画面外侧，等价于停在边界上（经纬度不飘）', () => {
    const cam = cameraFromLonLat(0, 0, 70);
    const outside = dragTo(W + 400, H - 1, cam);
    const boundary = dragTo(W - 0.5, H - 1, cam);
    expect(outside.lon).toBeCloseTo(boundary.lon, 9);
    expect(outside.lat).toBeCloseTo(boundary.lat, 9);
    const outside2 = dragTo(-400, -300, cam);
    const corner = dragTo(0.5, 0.5, cam);
    expect(outside2.lon).toBeCloseTo(corner.lon, 9);
    expect(outside2.lat).toBeCloseTo(corner.lat, 9);
  });

  it('指向画面外的鼠标位置得到的是视口边界的球面点，而不是发散值', () => {
    const inside = dragTo(W + 5000, H / 2);
    expect(Number.isFinite(inside.lon)).toBe(true);
    expect(Math.abs(inside.lat)).toBeLessThan(90);
    // 与直接取右边界点一致（夹紧后相同）
    const clamped = dragTo(W - 0.5, H / 2);
    expect(inside.lon).toBeCloseTo(clamped.lon, 9);
    expect(inside.lat).toBeCloseTo(clamped.lat, 9);
  });

  it('跨 ±180° 拖动不会突然绕一圈', () => {
    const cam = cameraFromLonLat(179, 0, 70);
    let prev = screenToLonLat(W / 2, H / 2, W, H, cam);
    for (let x = W / 2; x > -60; x -= 6) {
      const cur = dragTo(x, H / 2, cam);
      const d = Math.abs(((cur.lon - prev.lon + 540) % 360) - 180);
      expect(d).toBeLessThan(2);
      prev = cur;
    }
    expect(wrapLon(prev.lon)).toBeGreaterThanOrEqual(-180);
    expect(wrapLon(prev.lon)).toBeLessThan(180);
  });

  it('极区附近拖动仍然给出有效经纬度', () => {
    const cam = cameraFromLonLat(0, 88, 55);
    const ll = dragTo(W / 2, 0, cam);
    expect(Number.isFinite(ll.lon)).toBe(true);
    expect(Math.abs(ll.lat)).toBeLessThanOrEqual(90);
    // 投影回屏幕仍在边界附近
    const p = projectDir(lonLatToVec(ll.lon, ll.lat), cam, W, H);
    expect(p.visible).toBe(true);
  });
});

describe('热点屏幕可见性', () => {
  it('视口中心可见，背面不可见', () => {
    const cam = cameraFromLonLat(0, 0, 70);
    expect(hotspotView(0, 0, cam, W, H).visible).toBe(true);
    expect(hotspotView(180, 0, cam, W, H).visible).toBe(false);
    expect(hotspotView(180, 0, cam, W, H).behind).toBe(true);
  });

  it('画面边缘处图标横向压扁', () => {
    const cam = cameraFromLonLat(0, 0, 95);
    const center = hotspotView(0, 0, cam, W, H);
    const edge = hotspotView(40, 0, cam, W, H);
    expect(center.squash).toBeCloseTo(1, 1);
    expect(edge.squash).toBeLessThan(center.squash);
    expect(edge.squash).toBeGreaterThan(0.3);
  });

  it('近界判定带余量', () => {
    const cam = cameraFromLonLat(0, 0, 70);
    const v = hotspotView(60, 0, cam, W, H);
    if (v.visible) {
      expect(nearViewport(v, W, H, 5000)).toBe(true);
    }
    expect(nearViewport({ x: -30, y: 100, visible: true }, W, H, 40)).toBe(true);
    expect(nearViewport({ x: -300, y: 100, visible: true }, W, H, 40)).toBe(false);
    expect(nearViewport({ x: 10, y: 10, visible: false }, W, H, 9999)).toBe(false);
  });
});

describe('视场角范围', () => {
  it('UI 滑杆的两端与 clampFov 边界一致', () => {
    expect(FOV_MIN).toBe(30);
    expect(FOV_MAX).toBe(110);
    const cam = cameraFromLonLat(0, 0, FOV_MIN);
    // 30° 视场时，画面上边缘纬度应为 15°
    expect(screenToLonLat(W / 2, 0, W, H, cam).lat).toBeCloseTo(15, 6);
    const wide = cameraFromLonLat(0, 0, FOV_MAX);
    expect(screenToLonLat(W / 2, 0, W, H, wide).lat).toBeCloseTo(55, 6);
  });
});

describe('tour.json 序列化与校验', () => {
  function sampleTour(): Tour {
    const t = createTour('测试漫游');
    t.panoramas = [
      {
        id: 'a',
        name: '大厅',
        src: 'a.png',
        fileName: 'a.png',
        width: 2048,
        height: 1024,
        initialView: { lon: 10, lat: 0, fov: 70 },
        hotspots: [
          normalizeHotspot({
            id: 'h1',
            type: 'nav',
            groupId: t.groups[0].id,
            lon: 12.3456,
            lat: 3.21,
            label: '去温室',
            target: { panorama: 'b', lon: 0, lat: 0, fov: 80, fadeMs: 650 },
          }),
          normalizeHotspot({
            id: 'h2',
            type: 'arrow',
            groupId: t.groups[3].id,
            lon: -179.99,
            lat: -12,
            label: '动线',
            heading: -30,
          }),
        ],
      },
      {
        id: 'b',
        name: '温室',
        src: 'b.png',
        fileName: 'b.png',
        width: 4096,
        height: 2048,
        initialView: { lon: 0, lat: 0, fov: 70 },
        hotspots: [],
      },
    ];
    t.startId = 'a';
    return t;
  }

  it('导出包含热点坐标、分组与跳转目标', () => {
    const json = JSON.parse(serializeTour(sampleTour()));
    expect(json.format).toBe('pano-tour/v1');
    expect(json.panoramas).toHaveLength(2);
    const h1 = json.panoramas[0].hotspots[0];
    expect(h1.lon).toBe(12.35);
    expect(h1.lat).toBe(3.21);
    expect(h1.groupId).toBe(json.groups[0].id);
    expect(h1.target).toEqual({ panorama: 'b', lon: 0, lat: 0, fov: 80, fadeMs: 650 });
    // 箭头朝向归一到 [0,360)
    expect(json.panoramas[0].hotspots[1].heading).toBe(330);
    // 统计索引
    expect(json.index.hotspots).toBe(2);
    expect(json.index.byType.arrow).toBe(1);
  });

  it('导出的 JSON 能被原样读回', () => {
    const json = serializeTour(sampleTour());
    const { tour, issues } = validateTour(JSON.parse(json));
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(0);
    expect(tour!.panoramas[0].hotspots[0].target!.panorama).toBe('b');
    expect(tour!.panoramas[0].hotspots[0].lon).toBeCloseTo(12.35, 6);
    expect(tour!.groups).toHaveLength(4);
  });

  it('非法数据给出可读的错误', () => {
    const r1 = validateTour({ panoramas: 'nope' });
    expect(r1.tour).toBeNull();
    expect(r1.issues[0].level).toBe('error');
    const r2 = validateTour({
      panoramas: [
        {
          id: 'a',
          width: 2048,
          height: 1024,
          hotspots: [{ type: 'nav', lon: 0, lat: 0, target: { panorama: 'missing' } }],
        },
      ],
    });
    expect(r2.tour).toBeNull();
    expect(r2.issues.some((i) => i.message.includes('不存在'))).toBe(true);
  });

  it('非 2:1 图片给出警告但不阻断导入', () => {
    const r = validateTour({
      panoramas: [{ id: 'a', width: 2000, height: 800, hotspots: [] }],
    });
    expect(r.tour).not.toBeNull();
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('2:1'))).toBe(true);
  });

  it('未知分组的热点被并入默认分组并提示', () => {
    const r = validateTour({
      panoramas: [
        { id: 'a', width: 2048, height: 1024, hotspots: [{ type: 'info', lon: 1, lat: 2, groupId: 'ghost' }] },
      ],
    });
    expect(r.tour!.panoramas[0].hotspots[0].groupId).toBe(r.tour!.groups[0].id);
    expect(r.issues.some((i) => i.level === 'warning')).toBe(true);
  });
});

describe('相机在极区的行为', () => {
  it('yaw 在相机接近天顶时仍能正确反投影', () => {
    const cam = cameraFromLonLat(45, 85, 60);
    const ll = screenToLonLat(W / 2, H / 2, W, H, cam);
    expect(ll.lat).toBeCloseTo(85, 4);
    const f = cameraBasis(cam).forward;
    const back = vecToLonLat(f);
    expect(back.lon).toBeCloseTo(45, 6);
    expect(back.lat).toBeCloseTo(85, 6);
  });
});
