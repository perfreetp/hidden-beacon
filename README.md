# 🌌 魔法光影画板 (Magic Light Board)

给学龄前儿童亲子光影创作用的 WebGL2 画板。孩子用粗笔刷在暗色画布上涂出**星星、小鱼、房子**，
每一笔都成为独立图层；右侧的效果卡可以拖拽重排，画面按新顺序实时重算。

## 功能对照

| 需求 | 实现 |
| --- | --- |
| 粗笔刷涂星星/小鱼/房子 | 实例化四边形 + 片段着色器 SDF（`sdStar`/鱼椭圆+三角尾/房子圆角方+三角顶），落笔按间距补点，快速拖动不断线 |
| 每个形状独立图层 | 每次落笔自动建图层，左下角图层面板可显隐/改名/排序/删除/新建 |
| 四张效果卡 | 泛光、景深、色调映射、描边，HTML5 拖拽重排（触屏用上/下移按钮），顺序变化整条链立即重算 |
| 泛光强度 / 扩散半径 | 亮度提取 + 多趟双向高斯，迭代次数即扩散半径；另带发光门槛 |
| 景深对焦 / 模糊范围 | CoC 混合：对焦环可在画布直接拖动，清晰范围与最大模糊可调 |
| 色调映射三档 | 柔和（ACES）/ 鲜艳（Reinhard+提饱和）/ 夜色（压暗偏蓝） |
| 描边粗细 / 颜色 | Sobel 边缘检测，颜色取色器 |
| 分屏前后对比 | 同一帧分别渲染"效果前"与完整效果链，显示着色器按滑块取样；可拖竖线或用底部预设 |
| 缩放 / 拖动看细节 | 滚轮、双指捏合缩放（0.5x–4x），Shift/右键拖动平移，顶部可复位 |
| 色弱高对比模式 | 全局 CSS 变量切换 + 着色器提亮加饱和，纯黑底让发光色更跳 |
| 浏览器持久化 | 全部图层、效果顺序、参数、视图 400ms 防抖写入 `localStorage`，刷新/重开自动还原 |
| 导出 | 高清 PNG（后备缓冲 2 倍尺寸整条链重算后回读）+ 效果配置 JSON；JSON 可再导入还原 |

另含：撤销/重做（60 步，Ctrl+Z / Ctrl+Shift+Z）、橡皮擦（alpha 混合擦除）、无浮点扩展时自动回退 RGBA8。

## 技术架构

```
src/
├─ lib/
│  ├─ types.ts            数据模型（世界归一化坐标，与分辨率无关）
│  ├─ shaders.ts          全部 GLSL ES 3.00 着色器
│  ├─ renderer.ts         WebGL2 渲染器（FBO 池/实例化/效果链/导出回读）
│  ├─ state.ts            Svelte store + localStorage + 撤销栈
│  └─ download.ts         浏览器下载工具
├─ lib/components/
│  ├─ CanvasStage.svelte  画布手势、分屏、对焦环
│  ├─ Toolbar.svelte      工具/调色板/全局操作
│  ├─ EffectPanel.svelte  可拖拽效果卡与参数
│  ├─ LayerPanel.svelte   图层管理
│  └─ SplitBar.svelte     分屏预设滑块
└─ App.svelte             三栏布局与状态编排
```

**渲染管线**：场景 SDF 绘制到 HDR 帧缓冲（RGBA16F，不可用回退 RGBA8）→
按 `effectOrder` 在 ping-pong FBO 间依次执行效果 → 显示 pass 按分屏位置
从"效果前/效果后"两张纹理取样。场景原图所在的 FBO 在整条链中不被覆写，
因此分屏两侧永远来自同一帧。

## 操作

- **画画**：选工具与颜色，左键/手指直接画
- **平移**：按住 Shift 或右键拖动
- **缩放**：鼠标滚轮，或双指捏合
- **分屏**：拖画布上的金色竖线，或底部"只看原图 / 左右对比 / 全看效果"
- **景深对焦**：开启景深后，拖动画布上的金色对焦环
- **效果排序**：拖卡片，或卡片下方 ↑/↓ 按钮
- **快捷键**：B 光笔、S 星星、F 小鱼、H 房子、E 橡皮、Ctrl+Z 撤销、Ctrl+Shift+Z 重做

## 开发

```bash
npm install
npm run dev        # 开发服务器
npm run check      # svelte-check 类型检查
npm run build      # 生产构建到 dist/
npm run preview    # 预览构建产物
```

## 冒烟测试（需要本机 Chrome）

测试用 playwright-core 驱动系统 Chrome，先启动 dev server（端口 5199）：

```bash
npx vite --port 5199 --strictPort   # 终端 A
node tests/smoke-test.mjs           # 终端 B：WebGL/绘画/持久化/导出主链路
node tests/smoke-detail.mjs         # 图层/橡皮/对焦环/分屏/重排/高对比/撤销
node tests/smoke-export.mjs         # 高清 PNG 尺寸与配置 JSON 结构
```
