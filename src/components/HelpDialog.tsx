import { For } from 'solid-js';

interface Props {
  onClose: () => void;
}

const SECTIONS = [
  {
    title: '环视与缩放',
    items: [
      '拖动画面：按球面坐标换算视野偏移，跨 ±180° 经线也不会跳变',
      '滚轮 / 右侧滑杆 / +− 键：视野角 30°–110°',
      '双击导航热点，或在预览模式单击：淡入淡出前往下一张全景',
    ],
  },
  {
    title: '布置热点',
    items: [
      '左侧选择类型（讲解 / 导航 / 标注 / 箭头），在画面上点击放置',
      '直接拖动热点微调位置；拖到视口边缘时取边界球面坐标，经纬度不会漂移',
      '箭头热点可拖动方向柄或输入罗盘角度',
      '导航热点在右侧指定目标全景：可在画面取景、沿用当前视角、拖动预览落点',
    ],
  },
  {
    title: '分组管理',
    items: [
      '每个热点归属一个分组；分组可隐藏、锁定、改色',
      '删除分组时其热点自动并入剩余分组',
      '导出的 tour.json 同时记录 groupId 与 groups 表',
    ],
  },
  {
    title: '校核与导出',
    items: [
      '右下方 d3.geo 缩略球：点击任意位置视口跟随',
      '「检查立方体接缝」把全景切成六面，量化 12 条接缝的色差并提供放大镜',
      '「导出 tour.json」一键拿到含热点坐标与分组信息的文件',
    ],
  },
];

export function HelpDialog(props: Props) {
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal modal--narrow" role="dialog" aria-modal="true" aria-label="使用说明">
        <header class="modal__head">
          <div>
            <h2>使用说明</h2>
            <p class="modal__sub">面向自然探索馆的全景漫游编辑器</p>
          </div>
          <button class="icon-btn" aria-label="关闭" onClick={props.onClose}>
            ×
          </button>
        </header>
        <div class="help-body">
          <For each={SECTIONS}>
            {(s) => (
              <section>
                <h3>{s.title}</h3>
                <ul>
                  <For each={s.items}>{(i) => <li>{i}</li>}</For>
                </ul>
              </section>
            )}
          </For>
          <section>
            <h3>快捷键</h3>
            <dl class="keys">
              <div><dt><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd></dt><dd>旋转视角（Shift 加速）</dd></div>
              <div><dt><kbd>+</kbd> / <kbd>−</kbd></dt><dd>缩放视野</dd></div>
              <div><dt><kbd>Del</kbd></dt><dd>删除选中热点</dd></div>
              <div><dt><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>撤销</dd></div>
              <div><dt><kbd>Esc</kbd></dt><dd>退出取景 / 关闭对话框</dd></div>
            </dl>
          </section>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--primary btn--sm" onClick={props.onClose}>
            开始编辑
          </button>
        </footer>
      </div>
    </div>
  );
}
