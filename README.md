# 山地地形分块渲染器

原生 TypeScript + Web Components + three.js 实现的山地地形分块(瓦片)浏览渲染器。
地形为程序化生成的确定性高程场(任意坐标可解析采样),瓦片按 **256 m × 256 m** 切分。

## 运行

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 构建到 dist/
npm run preview    # 预览构建产物
npm run typecheck  # 类型检查
```

辅助脚本(需先 `npm run preview` 或 `npm run dev`,并修改脚本内端口):

```bash
node scripts/smoke.mjs      # 无头浏览器冒烟测试 + 截图
node scripts/interact.mjs   # 交互测试:拾取/框选/显示模式/缩放
node scripts/export-test.mjs # 导出 OBJ / 高程图测试
```

## 功能对照

| 需求 | 实现 |
| --- | --- |
| 256m 瓦片分块 | `TileManager`,LOD0 每块 64×64 段原始网格 |
| 山谷出生点 | 高程场内置蜿蜒山谷,相机落在谷底朝下游 |
| 拖拽旋转 / 滚轮缩放 | OrbitControls(左键旋转、滚轮推拉、右键平移) |
| 相机离地高度决定 LOD | 离地 < 350 m 时近处 3 环用 LOD0 原始网格,否则全部 LOD1 |
| 远处四合一低精度 | LOD1 块覆盖 2×2 瓦片(512m),32×32 段,按 2×2 边界对齐避免重叠 |
| 裙边补缝 | 每块边界一圈顶点下拉(LOD0 10m / LOD1 24m) |
| 视锥剔除 | 每块 Box3 对 `THREE.Frustum` 测试 |
| 山脊遮挡剔除 | 相机到块中心顶/四角顶连线,沿射线步进采样解析高程,全部被截断则剔除 |
| 角上统计 | 左上 HUD:已加载块、被裁块(视锥/遮挡)、三角形数、相机离地高度 |
| 点击拾取 | 经纬度(虚拟原点 29.595°N 101.88°E)、高程、坡度、坡向,坡面立贴法线标记(锥+环) |
| 框选 | Shift+左键拖拽,四角反投影到地形,算水平对角距离与区域最大高差,并画出贴地范围线 |
| 显示切换 | 工具栏:线框 / 法线着色 / 等高线叠加(20/50/100 m 间距可选) |
| 细节纹理混合 | 程序化裸岩 + 草甸两张纹理,按坡度(0.18~0.42)与高程(1750~2300m)混合 |
| 雾随视距 | 视距 = 离地高度 × 10(900~7000m 截断),指数平方雾密度 = 1.1/视距 |
| 慢瓦片标红 | 右下面板记录每块加载耗时,> 1.5 s 红色高亮并显示编号与耗时 |
| 单块导出 | 工具栏导出选中瓦片(点击坡面选取,默认准星处)的 OBJ(局部坐标+法线)与灰度高程 PNG |

## 结构

```
src/
  core/
    heightfield.ts     确定性高程场(值噪声 fBm + 山脊噪声 + 蜿蜒山谷)
    geoutils.ts        米制坐标 ↔ 经纬度,坡度坡向
    terrainMaterial.ts 地形 ShaderMaterial(纹理混合/等高线/法线着色/雾)
    tileManager.ts     瓦片调度、LOD、异步构建、视锥+遮挡剔除、统计
    exporter.ts        OBJ / 高程图导出
  components/          全部为原生 Web Components
    terrain-app.ts     根组件:渲染循环、拾取、框选、工具栏命令
    terrain-hud.ts     左上统计
    terrain-toolbar.ts 右上工具栏
    terrain-inspector.ts 左下拾取/框选信息
    tile-monitor.ts    右下瓦片加载监控
scripts/               无头浏览器测试脚本
```
