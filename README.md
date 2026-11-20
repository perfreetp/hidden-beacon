# 桁架横梁与塔架阵列实体建模

基于 **React + three.js + manifold-3d** 的桁架阵列实体建模页。所有布尔运算在 Web Worker
内通过 manifold WASM 完成,UI 线程只负责 three.js 渲染与交互。

## 运行

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 生产构建
npm run preview    # 预览构建产物
```

Node 侧建模管线冒烟(不依赖浏览器):

```bash
node scripts/verify-model.mjs
```

无头浏览器端到端(需要本机 Chrome):

```bash
node tests/e2e.mjs http://localhost:5173/
```

## 功能与实现映射

| 需求 | 实现 |
| --- | --- |
| 跨度 4–24 m | 参数滑块,500 mm 步进(`src/model/params.js`) |
| 节间距 500 / 1000 两档 | 分段按钮 |
| 弦杆 5 种规格 | `CHORD_SPECS`,外径 48.3–114.3 mm |
| 腹杆角度 30–60°,5° 步进 | 梁高由 `tan(θ)·节间距` 推导 |
| 球节点 / 弦杆 / 腹杆依次并集 | 基元分三类,cell → group → root 的平衡两两并集 DAG |
| 阵列 ≤ 12×4 | `cols/rows`,世界坐标量化哈希去重重合基元 |
| 梁-塔连接 4 螺栓孔差集 | 孔径 18–26 mm,孔深默认 = 弦杆外径,圆柱刀具 `subtract` |
| 双视口联动旋转 | 两个视口共享 `LinkedOrbit` 姿态,带同步守卫防回环 |
| 选杆改长度,只重算受影响布尔链 | DAG 缓存 + 叶/组/根失效,增量重测毫秒级 |
| 顶部三角面数与布尔耗时 | worker 回传统计,含分项耗时与布尔次数 |
| 横梁 / 塔架分别导出 STL、OBJ | 按 DAG 组拆分独立实体,二进制 STL + ASCII OBJ |
| 模型数据存 IndexedDB | 项目参数/统计存 `projects`,导出 Blob 存 `exports` |

## 目录结构

```
src/
  model/
    params.js        参数、规格、常量、世界坐标哈希
    geometry.js      基元生成:单梁 Pratt 桁架、方塔、阵列复制、螺栓刀具、去重
    manifoldDag.js   manifold 封装 + 布尔 DAG(平衡并集、缓存、增量失效)
    modelWorker.js   Web Worker:build / edit / exportParts 三类消息
    exporters.js     二进制 STL / ASCII OBJ
    storage.js       IndexedDB 封装
  three/
    LinkedOrbit.js   轻量轨道控制器(两视口联动)
    Viewport.jsx     单视口:实体/线框、射线拾取、选中高亮
  ui/
    ParamPanel.jsx   参数面板
    MemberEditor.jsx 杆件长度编辑
    ExportPage.jsx   导出页
    exportHistoryStore.js 模块级导出历史(跨 StrictMode 重挂载)
  App.jsx            顶栏统计、页签、worker 编排
```

## 关键工程决策

- **杆件用凸包(hull)而非旋转圆柱**:manifold-3d v3.5 的 `transform`/`rotate` 对圆柱
  基元的懒变换在本版本无法稳定定向(实测多种矩阵打包与欧拉角均失效),改用两端点球
  `Manifold.hull` 生成杆件,方向由端点直接决定;半球端帽会被节点球完全包裹,布尔后
  与圆柱等价。
- **平衡两两并集**:N 个基元两两配对合并,比线性链快约 6 倍(200 球体基准 1.7s → 0.3s)。
- **WASM 定位**:`manifold-3d/manifold.wasm?url` 显式 `locateFile`,绕过 Vite 预打包后
  `import.meta.url` 指向依赖缓存导致的 WASM 404。
- **manifold 初始化**:v3.5 需在 `Module()` 之后显式调用 `setup()` 才会挂载
  `cylinder/sphere/hull` 等工厂。
