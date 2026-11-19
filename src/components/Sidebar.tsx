import { For, Show, createSignal } from 'solid-js';
import type { Editor } from '../state/editor';
import { TYPE_NAME } from '../lib/style';
import { defaultGroupFor, type HotspotType, type PanoramaNode } from '../lib/tour';

interface Props {
  editor: Editor;
  onImport: () => void;
  onLoadSample: (name: string) => void;
  onOpenSeam: () => void;
}

const TYPE_OPTIONS: HotspotType[] = ['info', 'nav', 'label', 'arrow'];

const SAMPLE_IDS = [
  { id: 'entrance', name: '入口大厅', src: '/samples/entrance.png' },
  { id: 'canopy', name: '雨林温室', src: '/samples/canopy.png' },
  { id: 'night', name: '夜行馆', src: '/samples/night.png' },
];

export function Sidebar(props: Props) {
  const ed = props.editor;
  const [renaming, setRenaming] = createSignal<string | null>(null);
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});

  const toggle = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const activeHotspots = () => ed.activePano()?.hotspots ?? [];

  function hotspotCount(p: PanoramaNode) {
    return p.hotspots.length;
  }

  return (
    <aside class="sidebar">
      {/* 全景列表 */}
      <section class="panel">
        <header class="panel__head">
          <h2>全景节点</h2>
          <span class="badge">{ed.state.tour.panoramas.length}</span>
          <button class="icon-btn" title="导入全景图" onClick={props.onImport}>
            ＋
          </button>
        </header>
        <Show
          when={ed.state.tour.panoramas.length > 0}
          fallback={
            <div class="panel__empty">
              <p>还没有全景。可以导入自己的等距柱状图，或一键载入示例漫游。</p>
              <button class="btn btn--primary btn--sm" onClick={() => props.onLoadSample('__all')}>
                载入示例漫游
              </button>
            </div>
          }
        >
          <ul class="pano-list">
            <For each={ed.state.tour.panoramas}>
              {(p) => (
                <li
                  class={`pano-item${p.id === ed.state.activeId ? ' is-active' : ''}`}
                  onClick={() => ed.switchTo(p.id)}
                  onDblClick={() => setRenaming(p.id)}
                >
                  <div class="pano-item__thumb">
                    <img src={p.src} alt="" loading="lazy" />
                    <Show when={p.id === ed.state.tour.startId}>
                      <span class="pano-item__start" title="漫游起点">
                        起
                      </span>
                    </Show>
                  </div>
                  <div class="pano-item__meta">
                    <Show
                      when={renaming() === p.id}
                      fallback={<span class="pano-item__name">{p.name}</span>}
                    >
                      <input
                        class="inline-input"
                        value={p.name}
                        ref={(el) => setTimeout(() => el.select())}
                        onBlur={(e) => {
                          ed.updatePanorama(p.id, { name: e.currentTarget.value.trim() || p.name });
                          setRenaming(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    </Show>
                    <span class="pano-item__sub">
                      {hotspotCount(p)} 个热点 · {p.width}×{p.height}
                    </span>
                  </div>
                  <div class="pano-item__actions">
                    <button
                      class="icon-btn icon-btn--sm"
                      title="设为漫游起点"
                      onClick={(e) => {
                        e.stopPropagation();
                        ed.setDocMeta({ startId: p.id });
                      }}
                    >
                      ★
                    </button>
                    <button
                      class="icon-btn icon-btn--sm"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        ed.removePanorama(p.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      {/* 新建热点工具 */}
      <section class="panel">
        <header class="panel__head">
          <h2>放置热点</h2>
          <label class="switch" title="显示/隐藏所有热点">
            <input
              type="checkbox"
              checked={ed.state.showHotspots}
              onChange={(e) => ed.setState('showHotspots', e.currentTarget.checked)}
            />
            <span>显示</span>
          </label>
        </header>
        <div class="tool-grid">
          <For each={TYPE_OPTIONS}>
            {(t) => (
              <button
                class={`tool-btn${ed.state.tool === 'hotspot' && ed.state.newHotspotType === t ? ' is-armed' : ''}`}
                onClick={() => {
                  ed.setState('newHotspotType', t);
                  ed.setState('tool', ed.state.tool === 'hotspot' && ed.state.newHotspotType === t ? 'select' : 'hotspot');
                }}
                title={`在画面中点击放置${TYPE_NAME[t]}热点`}
              >
                <span class={`tool-dot tool-dot--${t}`} />
                {TYPE_NAME[t]}
              </button>
            )}
          </For>
        </div>
        <p class="hint">
          {ed.state.tool === 'hotspot'
            ? '已就绪：在画面上点击即可放置。按 Esc 取消。'
            : '选择一种热点类型，然后在画面中点击放置。也可以直接拖动已有热点调整位置。'}
        </p>
      </section>

      {/* 分组 */}
      <section class="panel">
        <header class="panel__head">
          <h2>分组</h2>
          <button class="icon-btn" title="新建分组" onClick={() => ed.addGroup()}>
            ＋
          </button>
        </header>
        <ul class="group-list">
          <For each={ed.state.tour.groups}>
            {(g) => {
              const count = () =>
                ed.state.tour.panoramas.reduce((n, p) => n + p.hotspots.filter((h) => h.groupId === g.id).length, 0);
              return (
                <li
                  class={`group-item${ed.state.selectedGroupId === g.id ? ' is-active' : ''}`}
                  data-group-id={g.id}
                  data-group-name={g.name}
                >
                  <button
                    class="group-item__main"
                    onClick={() => ed.setState('selectedGroupId', g.id)}
                    title="设为新建热点的默认分组"
                  >
                    <label class="group-swatch-wrap" title="分组颜色" onClick={(e) => e.stopPropagation()}>
                      <span class="group-swatch" style={{ background: g.color }} />
                      <input
                        type="color"
                        class="group-color"
                        value={g.color}
                        aria-label={`${g.name} 颜色`}
                        onInput={(e) => ed.updateGroup(g.id, { color: e.currentTarget.value })}
                      />
                    </label>
                    <input
                      class="group-name"
                      value={g.name}
                      onInput={(e) => ed.updateGroup(g.id, { name: e.currentTarget.value })}
                      onClick={(e) => {
                        e.stopPropagation();
                        ed.setState('selectedGroupId', g.id);
                      }}
                      onFocus={() => ed.setState('selectedGroupId', g.id)}
                    />
                    <span class="group-count">{count()}</span>
                  </button>
                  <div class="group-item__tools">
                    <button
                      class={`icon-btn icon-btn--sm${g.visible ? '' : ' is-off'}`}
                      title={g.visible ? '隐藏该分组' : '显示该分组'}
                      data-action="visibility"
                      aria-pressed={g.visible}
                      onClick={() => ed.updateGroup(g.id, { visible: !g.visible })}
                    >
                      {g.visible ? '◉' : '◎'}
                    </button>
                    <button
                      class={`icon-btn icon-btn--sm${g.locked ? ' is-on' : ''}`}
                      title={g.locked ? '解锁' : '锁定（禁止编辑）'}
                      data-action="lock"
                      onClick={() => ed.updateGroup(g.id, { locked: !g.locked })}
                    >
                      {g.locked ? '🔒' : '🔓'}
                    </button>
                    <button class="icon-btn icon-btn--sm" title="删除分组" onClick={() => ed.removeGroup(g.id)}>
                      ×
                    </button>
                  </div>
                </li>
              );
            }}
          </For>
        </ul>
      </section>

      {/* 当前全景的热点列表 */}
      <section class="panel panel--grow">
        <header class="panel__head">
          <h2>当前热点</h2>
          <span class="badge">{activeHotspots().length}</span>
        </header>
        <Show when={activeHotspots().length > 0} fallback={<p class="hint">这张全景还没有热点。</p>}>
          <ul class="hs-list">
            <For each={activeHotspots()}>
              {(h) => {
                const g = () => ed.groupById(h.groupId);
                return (
                  <li
                    class={`hs-item${ed.state.selectedHotspotId === h.id ? ' is-active' : ''}`}
                    onClick={() => ed.setState('selectedHotspotId', h.id)}
                  >
                    <span class="hs-item__dot" style={{ background: g()?.color ?? '#7a8' }} />
                    <div class="hs-item__text">
                      <span class="hs-item__label">{h.label}</span>
                      <span class="hs-item__sub">
                        {TYPE_NAME[h.type]} · {g()?.name ?? '未分组'} · {h.lon.toFixed(1)}°, {h.lat.toFixed(1)}°
                      </span>
                    </div>
                    <button class="icon-btn icon-btn--sm" title="删除" onClick={(e) => { e.stopPropagation(); ed.removeHotspot(h.id); }}>
                      ×
                    </button>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
        <Show when={ed.state.tour.panoramas.length > 0}>
          <button class="btn btn--ghost btn--block" onClick={props.onOpenSeam}>
            检查立方体接缝
          </button>
        </Show>
      </section>

      <section class="panel panel--samples">
        <header class="panel__head">
          <h2>示例场景</h2>
        </header>
        <div class="sample-list">
          <For each={SAMPLE_IDS}>
            {(s) => (
              <button class="sample-chip" onClick={() => props.onLoadSample(s.id)} title={`载入「${s.name}」`}>
                <img src={s.src.replace('.png', '-preview.png')} alt="" />
                <span>{s.name}</span>
              </button>
            )}
          </For>
        </div>
        <p class="hint">
          示例图由内置光追脚本生成，可直接用于试验导航与接缝检查。选中某个分组后新建热点会归入该组。
        </p>
      </section>
    </aside>
  );
}
