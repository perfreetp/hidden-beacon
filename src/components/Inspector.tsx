/**
 * 右侧属性面板：编辑选中热点的类型、分组、标签、描述、目标全景与朝向。
 */
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Editor } from '../state/editor';
import { TYPE_HINT, TYPE_NAME } from '../lib/style';
import { compassName } from '../lib/overlay';
import { defaultGroupFor, normalizeHeading, type Hotspot, type HotspotType } from '../lib/tour';
import { clampFov } from '../lib/geo';

const TYPES: HotspotType[] = ['nav', 'info', 'label', 'arrow'];

export function Inspector(props: { editor: Editor }) {
  const ed = props.editor;
  const h = () => ed.selectedHotspot();
  const pano = () => ed.activePano();
  const [pickMode, setPickMode] = createSignal(false);

  const otherPanos = createMemo(() => ed.state.tour.panoramas.filter((p) => p.id !== ed.state.activeId));

  function patch(p: Partial<Hotspot>, coalesce?: string) {
    const sel = h();
    if (!sel) return;
    ed.updateHotspot(sel.id, p, { coalesce });
  }

  function setType(type: HotspotType) {
    const sel = h();
    if (!sel) return;
    const groupId = sel.type === type ? sel.groupId : defaultGroupFor(type, ed.state.tour.groups);
    const patchObj: Partial<Hotspot> = { type, groupId };
    if (type === 'nav' && !sel.target) {
      const target = otherPanos()[0];
      patchObj.target = target
        ? { panorama: target.id, lon: target.initialView.lon, lat: target.initialView.lat, fov: target.initialView.fov, fadeMs: 700 }
        : undefined;
    }
    if (type === 'arrow' && sel.heading === undefined) patchObj.heading = 0;
    ed.updateHotspot(sel.id, patchObj);
  }

  function useCurrentViewAsTarget() {
    const sel = h();
    const target = sel?.target;
    if (!sel || !target) return;
    patch({
      target: {
        ...target,
        lon: Math.round(ed.state.camera.yaw * 100) / 100,
        lat: Math.round(ed.state.camera.pitch * 100) / 100,
        fov: Math.round(ed.state.camera.fov * 10) / 10,
      },
    });
    ed.notify('已把当前视角设为目标视角', 'ok');
  }

  return (
    <aside class="inspector">
      <Show
        when={h()}
        fallback={
          <div class="inspector__empty">
            <h2>属性</h2>
            <p>选中一个热点后，可在这里编辑它的类型、分组、文字与跳转目标。</p>
            <ul class="tip-list">
              <li>拖动热点可微调位置，贴近视口边缘时经纬度保持稳定。</li>
              <li>滚轮缩放视角，范围 30°–110°。</li>
              <li>点击右下角缩略球可瞬间转向。</li>
            </ul>
          </div>
        }
      >
        {(sel) => (
          <>
            <header class="inspector__head">
              <span class="inspector__glyph" style={{ background: ed.groupById(sel().groupId)?.color ?? '#7a8' }} />
              <h2>{sel().label || '未命名热点'}</h2>
              <button class="icon-btn" title="复制" onClick={() => ed.duplicateHotspot(sel().id)}>
                ⧉
              </button>
              <button class="icon-btn" title="删除" onClick={() => ed.removeHotspot(sel().id)}>
                ×
              </button>
            </header>

            <div class="field">
              <span class="field__label">类型</span>
              <div class="seg">
                <For each={TYPES}>
                  {(t) => (
                    <button class={`seg__btn${sel().type === t ? ' is-on' : ''}`} onClick={() => setType(t)}>
                      {TYPE_NAME[t]}
                    </button>
                  )}
                </For>
              </div>
              <p class="hint">{TYPE_HINT[sel().type]}</p>
            </div>

            <div class="field">
              <label class="field__label" for="hs-label">
                标签
              </label>
              <input
                id="hs-label"
                class="input"
                value={sel().label}
                onInput={(e) => patch({ label: e.currentTarget.value }, `label-${sel().id}`)}
              />
            </div>

            <div class="field">
              <label class="field__label" for="hs-group">
                分组
              </label>
              <div class="field__row">
                <select
                  id="hs-group"
                  class="input"
                  value={sel().groupId}
                  onChange={(e) => patch({ groupId: e.currentTarget.value })}
                >
                  <For each={ed.state.tour.groups}>
                    {(g) => (
                      <option value={g.id}>
                        {g.name}
                        {g.locked ? '（已锁定）' : ''}
                      </option>
                    )}
                  </For>
                </select>
                <span class="swatch-inline" style={{ background: ed.groupById(sel().groupId)?.color ?? '#7a8' }} />
              </div>
            </div>

            <div class="field">
              <label class="field__label" for="hs-desc">
                说明文字
              </label>
              <textarea
                id="hs-desc"
                class="input input--area"
                rows={3}
                value={sel().description ?? ''}
                placeholder="展项介绍、参观提示……"
                onInput={(e) => patch({ description: e.currentTarget.value }, `desc-${sel().id}`)}
              />
            </div>

            <div class="field">
              <span class="field__label">位置（球面经纬度）</span>
              <div class="field__row field__row--tight">
                <label class="mini-field">
                  <span>经度</span>
                  <input
                    class="input input--num"
                    type="number"
                    step="0.1"
                    min="-180"
                    max="180"
                    value={sel().lon.toFixed(2)}
                    onChange={(e) => patch({ lon: Number(e.currentTarget.value) })}
                  />
                </label>
                <label class="mini-field">
                  <span>纬度</span>
                  <input
                    class="input input--num"
                    type="number"
                    step="0.1"
                    min="-90"
                    max="90"
                    value={sel().lat.toFixed(2)}
                    onChange={(e) => patch({ lat: Number(e.currentTarget.value) })}
                  />
                </label>
              </div>
              <p class="hint">
                {sel().lat >= 0 ? '北纬' : '南纬'} {Math.abs(sel().lat).toFixed(1)}° ·{' '}
                {sel().lon >= 0 ? '东经' : '西经'} {Math.abs(sel().lon).toFixed(1)}°
              </p>
            </div>

            <Show when={sel().type === 'arrow'}>
              <div class="field">
                <span class="field__label">朝向（罗盘）</span>
                <input
                  class="range"
                  type="range"
                  min="0"
                  max="359"
                  step="1"
                  value={Math.round(normalizeHeading(sel().heading ?? 0))}
                  onInput={(e) => patch({ heading: Number(e.currentTarget.value) }, `heading-${sel().id}`)}
                />
                <div class="field__row field__row--tight">
                  <span class="hint">
                    {Math.round(normalizeHeading(sel().heading ?? 0))}° · {compassName(sel().heading ?? 0)}
                  </span>
                  <button class="mini-btn" onClick={() => patch({ heading: 0 })}>
                    正北
                  </button>
                </div>
              </div>
            </Show>

            <Show when={sel().type === 'nav'}>
              <div class="field field--target">
                <span class="field__label">跳转目标</span>
                <Show
                  when={otherPanos().length > 0}
                  fallback={<p class="hint">至少还需要另一张全景才能设置跳转目标。</p>}
                >
                  <select
                    class="input"
                    value={sel().target?.panorama ?? ''}
                    onChange={(e) => {
                      const id = e.currentTarget.value;
                      const target = ed.state.tour.panoramas.find((p) => p.id === id);
                      patch({
                        target: target
                          ? {
                              panorama: id,
                              lon: target.initialView.lon,
                              lat: target.initialView.lat,
                              fov: target.initialView.fov,
                              fadeMs: sel().target?.fadeMs ?? 700,
                            }
                          : undefined,
                      });
                    }}
                  >
                    <option value="">— 未指定 —</option>
                    <For each={otherPanos()}>{(p) => <option value={p.id}>{p.name}</option>}</For>
                  </select>
                  <Show when={sel().target}>
                    {(t) => (
                      <>
                        <div class="field__row field__row--tight">
                          <span class="hint">
                            落点 {t().lon.toFixed(1)}° / {t().lat.toFixed(1)}° · 视角 {t().fov.toFixed(0)}°
                          </span>
                          <button class="mini-btn" onClick={() => ed.setState('pickingTargetFor', sel().id)}>
                            在画面取景
                          </button>
                        </div>
                        <div class="field__row field__row--tight">
                          <button class="mini-btn" onClick={useCurrentViewAsTarget}>
                            用当前视角
                          </button>
                          <button class="mini-btn" onClick={() => ed.flyTo({ yaw: t().lon, pitch: t().lat, fov: t().fov })}>
                            预览落点
                          </button>
                        </div>
                        <label class="field__label field__label--sub" for="fade-range">
                          淡入淡出 {t().fadeMs ?? 700} ms
                        </label>
                        <input
                          id="fade-range"
                          class="range"
                          type="range"
                          min="0"
                          max="2000"
                          step="50"
                          value={t().fadeMs ?? 700}
                          onInput={(e) =>
                            patch({
                              target: { ...t(), fadeMs: Number(e.currentTarget.value) },
                            }, `fade-${sel().id}`)
                          }
                        />
                      </>
                    )}
                  </Show>
                </Show>
              </div>
            </Show>

            <div class="field">
              <label class="switch switch--wide">
                <input
                  type="checkbox"
                  checked={!!sel().showLeader}
                  onChange={(e) => patch({ showLeader: e.currentTarget.checked })}
                />
                <span>显示引导线</span>
              </label>
            </div>

            <Show when={ed.state.pickingTargetFor === sel().id}>
              <div class="picking-hint">
                取景中：点击画面确定目标落点，或按下 Esc 取消。
                <button class="mini-btn" onClick={() => ed.setState('pickingTargetFor', null)}>
                  取消
                </button>
              </div>
            </Show>

            <Show when={pickMode()}>
              <p class="hint">提示：取景模式下，点击画面的任意位置即可确定目标视角。</p>
            </Show>

            <footer class="inspector__foot">
              <span class="muted">
                视角 {clampFov(ed.state.camera.fov).toFixed(0)}° · {compassName(ed.state.camera.yaw)}
              </span>
              <button class="mini-btn" onClick={() => ed.saveInitialView()}>
                保存为初始视角
              </button>
            </footer>
          </>
        )}
      </Show>
    </aside>
  );
}
