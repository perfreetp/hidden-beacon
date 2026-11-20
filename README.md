# 影子小剧场 · 三维光影启蒙应用

给学龄前孩子玩的光影认知小应用：拖动台灯、改变太阳角度，观察毛绒玩具和小屋的影子如何变长变短、改变方向。基于 **SolidJS + Babylon.js + TypeScript + Vite**。

## 运行

```bash
npm install
npm run dev      # 开发服务器 http://127.0.0.1:5180
npm run build    # 生产构建到 dist/
npm run preview  # 预览生产构建
```

## 给孩子的玩法

- **拖动**画面里的玩具、小屋或台灯，影子会实时跟着移动。
- 拨动 **太阳高低** 滑块：太阳低时影子又长又斜，太阳高时影子缩到脚边。
- 拖动 **台灯**，或调台灯高度，看点光源投出的影子方向变化。
- 切换内置的三个小剧场（午后小客厅 / 夕阳长影子 / 台灯小夜场），也可以「复制一份再改」。
- 画面太黑时会弹出友好提示，点「一键变亮」即可。
- 所有布置都自动存在浏览器 localStorage 里，下次打开还在。

## 功能与技术对照

| 需求 | 实现 |
| --- | --- |
| 场景：小屋、毛绒玩具、地板 | `src/babylon/meshFactory.ts` 用基础几何体搭建 |
| 方向光模拟窗口日光 | `DirectionalLight`，方位角/仰角可调 |
| 点光源台灯 | `PointLight`，可拖动、可调高度 |
| 两光源各自生成阴影贴图 | `CascadedShadowGenerator`（日光）+ `ShadowGenerator`（台灯立方体贴图） |
| 三级级联，近高远低 | CSM `numCascades=3`，每层独立 2D 纹理数组深度图 |
| 调级联切换距离 | `lambda` 滑块（0 均匀切分 / 1 对数切分） |
| 调阴影贴图分辨率 | 256~4096 下拉，改动时重建生成器 |
| PCF 软化、范围可调 | 低/中/高三档 `filteringQuality`（1/9/25 采样） |
| 调试视图 | 主画面叠加级联覆盖染色 + 视锥线框；右侧显示三级深度贴图 |
| 拖动时影子实时跟随 | 指针拾取 + 射线/地面平面求交，每帧更新 |
| 剧场切换与复制 | Solid store + 内置/副本管理 |
| 强度、色温滑块 | 开尔文→RGB 转换，灯泡自发光同步 |
| 偏暗提示 | 定时回读屏幕像素亮度，连续偏暗弹出提示 |
| 浏览器持久化 | localStorage 自动保存整个 AppState |

## 调试视图深度图的实现要点

CSM 开启 PCF 后关闭颜色写入，深度数据位于渲染目标的**独立 depthStencil 附件**（一个处于
`COMPARE_REF_TO_TEXTURE` 模式的 `sampler2DArrayShadow` 纹理数组），普通 `setTexture` 只会绑到空的颜色附件。
`src/babylon/DebugDepthMonitor.ts` 的处理方式：

1. 用 `sampler2DArrayShadow` + `texture(sampler, vec4(u,v,layer,ref))` 采样；
2. 在材质 `onBindObservable` 中通过 `engine.setDepthStencilTexture` 把采样器重定向到深度附件；
3. 用 32 档阈值扫描还原每个纹素的近似深度，再做幂曲线增强后回读到页面 canvas。

## 目录结构

```
src/
  babylon/
    TheaterEngine.ts      # Babylon 场景、灯光、阴影、拖拽、检测总控
    DebugDepthMonitor.ts  # 调试用级联深度图可视化
    meshFactory.ts        # 小屋/玩具/台灯/地板建模
  components/             # Solid UI 组件
  store/theaterStore.ts   # 状态与 localStorage 持久化
  lib/                    # 色温转换、默认剧场
  types.ts
scripts/                  # 无头浏览器冒烟/回归脚本（puppeteer-core）
```
