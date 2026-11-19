# 林间漫游 · 自然探索馆全景导览编辑器

面向儿童自然探索馆的全景漫游编辑器。导入 2:1 等距柱状全景图后，按经纬度铺到球面上编排放置热点、标注与箭头，
一键导出带热点坐标与分组信息的 `tour.json`。

技术栈：**SolidJS + SVG + D3（d3-geo）**，WebGL2 负责球面渲染并提供 CPU 回退，Vite 构建，Vitest + Playwright 测试。

```bash
npm install
npm run dev         # http://127.0.0.1:5190
npm run build       # 类型检查 + 生产构建
npm test            # 单元测试（几何 / 立方体接缝 / 序列化）
npm run test:e2e    # Playwright 端到端测试
npm run samples     # 重新生成内置示例全景（纯 Node 光线投射，无需依赖）
```

## 功能对照

| 需求 | 实现 |
| --- | --- |
| 导入等距柱状全景后按经纬度铺在球面上 | `SphereView`（WebGL2 片元着色器按 `atan(dir.x, dir.z)` / `asin(dir.y)` 采样纹理；无 WebGL2 时退化为 canvas 2D 软渲染） |
| 拖动时按球面坐标换算视野偏移 | `rotateCamera` 用罗德里格斯公式把「抓取方向」旋回指针位置，跨 ±180° 经线连续、无滚转 |
| SVG 叠加热点、标注和箭头 | `Viewport` 的 SVG 层与 canvas 共用 `geo.ts` 的球心投影，像素级对齐 |
| 热点可跳到另一张全景并带淡入淡出 | 导航热点 `target`，双击/预览单击触发 `createFader().crossfade` |
| 右下角 d3.geo 球面缩略图，点任意位置视口跟随 | `Minimap`：`d3.geoOrthographic().rotate([-yaw, -pitch])` + `path.invert()` |
| 切成六面立方体并检查接缝 | `cubemap.ts` `splitEquirect` / `checkSeams`，12 条接缝的平均/峰值色差 + 放大镜 + 六面 PNG 导出 |
| 视野角 30°–110° | `clampFov`，滑杆、滚轮（以光标为锚点缩放）、`+/-` 键一致受约束 |
| 热点拖到视口边缘时经纬度不飘 | 指针先夹到视口边界再反投影，边界点唯一确定；拖动节流 + 抬起时补最后一帧 |
| 按分组管理 | 分组可改名、改色、隐藏、锁定；新建热点归入当前选中分组 |
| 一键导出 `tour.json` | `serializeTour` 输出坐标、分组、跳转目标、朝向与统计索引 |

## 坐标约定

三个坐标系全部对齐，是叠层能精确重合的前提：

- **世界**：Y 上、Z 前（经度 0°）、X 东（经度 90°）。`lonLatToVec(lon, lat)`。
- **相机**：`yaw` = 画面中心经度，`pitch` = 中心纬度，`fov` = 垂直视场角，无滚转。
- **投影**：球心投影（gnomonic），与常见全景播放器一致；大圆在屏幕上呈现为直线。

由此得到的两个性质被测试固定下来：

1. 视口内任意屏幕点都对应相机前半球的一个唯一方向 —— 所以「拖到边缘保持经纬度」天然成立。
2. 视口边界是球面大圆弧围成的四边形 —— 缩略图上的视口轮廓直接用 `viewPolygon()` 采样得到的真实球面多边形。

## 目录结构

```
src/
  lib/
    geo.ts         球面数学：经纬度↔方向、相机基、球心投影、大圆、罗德里格斯旋转
    cubemap.ts     六面立方体切分、邻接关系、接缝色差、放大镜、打分
    overlay.ts     大圆弧折线、罗盘名称、屏幕方向→朝向反解
    visibility.ts  热点屏幕可见性与边缘压扁
    tour.ts        数据模型、校验、序列化（tour.json 格式）
    sampleTour.ts  示例漫游模板（三张全景 + 热点 + 导航链路）
    style.ts       热点视觉规范（尺寸 / 字形 / 字体）
  render/
    sphere.ts      WebGL2 球面渲染器 + CPU 回退 + 纹理预处理
  state/
    editor.ts      可撤销的编辑器文档状态（快照式撤销栈）
  components/
    Viewport.tsx   canvas + SVG 叠层 + 拖动 / 缩放 / 拖拽热点 / 取景
    Minimap.tsx    d3.geo 缩略球
    HotspotMarker.tsx  热点图标与标签
    Sidebar.tsx    全景列表 / 放置工具 / 分组 / 当前热点
    Inspector.tsx  属性面板
    SeamChecker.tsx 立方体接缝检查
    ImportDialog.tsx 导入 / 导出
    HelpDialog.tsx
scripts/
  make-samples.mjs  生成示例全景（PNG 编码，纯 Node）
  render/           极简光线投射器与三个场景
tests/
  unit/             几何、立方体、序列化（54 个用例）
  e2e/              真实浏览器交互（12 个用例）
```

## tour.json 格式

```json
{
  "format": "pano-tour/v1",
  "version": 1,
  "title": "林间漫游 · 自然探索馆",
  "startId": "pano-entrance",
  "groups": [
    { "id": "g-route", "name": "通道", "color": "#5fd3a8", "visible": true, "locked": false }
  ],
  "panoramas": [
    {
      "id": "pano-entrance",
      "name": "入口大厅",
      "src": "entrance.png",
      "fileName": "entrance.png",
      "width": 4096,
      "height": 2048,
      "initialView": { "lon": 0, "lat": -6, "fov": 74 },
      "hotspots": [
        {
          "id": "hs-xxxx",
          "type": "nav",
          "groupId": "g-route",
          "lon": 0,
          "lat": -12,
          "label": "前往雨林温室",
          "description": "穿过中庭的玻璃廊道……",
          "target": { "panorama": "pano-canopy", "lon": 0, "lat": -4, "fov": 76, "fadeMs": 800 }
        },
        { "id": "hs-yyyy", "type": "arrow", "groupId": "g-flow", "lon": 22, "lat": -18, "label": "参观动线", "heading": 90 }
      ]
    }
  ],
  "index": {
    "hotspots": 18,
    "byGroup": { "g-route": 6, "g-exhibit": 6, "g-note": 3, "g-flow": 3 },
    "byType": { "nav": 6, "info": 6, "label": 3, "arrow": 3 }
  }
}
```

- `type`：`nav`（跳转）、`info`（讲解）、`label`（标注）、`arrow`（箭头，`heading` 为罗盘角度 0=北）。
- `lon/lat` 为球面经纬度，导出精度可选 0.1° / 0.01° / 0.001°。
- 本地导入的图片以 `blob:` URL 使用，导出时写入 `fileName`；把同名图片与 `tour.json` 放在一起即可部署。
- 导入时 `validateTour()` 会检查缺字段、未知分组、指向不存在全景的跳转、非 2:1 比例等，错误阻断导入、警告照常导入并提示。

## 立方体接缝检查

把全景按六个 90° 面重采样为立方体贴图（每面 256/384/512 可选），对 12 条接缝分别在两侧「边内 0.75px」处采样，
比较颜色差，并用「沿缝方向的自然纹理变化」作基线换算超出比例，得到一个 0–100 的接缝分：

- 十字展开图上每条接缝按色差着色（绿 = 连续、黄/橙 = 轻微错位、红 = 明显接缝），点击查看渲染该处细节的放大镜。
- 同时给出源全景 ±180° 竖缝的色差（等距柱状图自身的接缝）。
- 可导出六面 PNG 与 JSON 报告。

## 示例全景

`public/samples/` 下三张 4096×2048 等距柱状图（入口大厅 / 雨林温室 / 夜行馆）由 `scripts/render/` 里的
极简光线投射器生成：带阴影、环境光遮蔽、ACES 色调映射，全部是解析式几何体，不依赖任何第三方库。

## 已知取舍

- 球心投影在极近 ±90° 俯仰时角点会外扩很快；纬度统一夹在 ±89.5°，拖动到底也不会翻转。
- 软渲染回退固定在约 680px 采样宽度，仅用于确保无 WebGL2 环境可用，画质明显低于 GPU 路径。
- 拖动热点时每 ~8ms 提交一次坐标，抬起时再补最后一帧，保证松手位置精确。
