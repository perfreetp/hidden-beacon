<script lang="ts">
  import { project } from '../../lib/state';
  import { EFFECT_META, type EffectId, type TonemapMode } from '../../lib/types';

  let expanded = $state<EffectId | null>(null);
  let dragId = $state<EffectId | null>(null);
  let dragOverId = $state<EffectId | null>(null);

  const s = $derived($project);

  const tonemapModes: { id: TonemapMode; name: string; hint: string }[] = [
    { id: 'soft', name: '柔和', hint: '胶片般暖暖软软' },
    { id: 'vivid', name: '鲜艳', hint: '颜色蹦出来' },
    { id: 'night', name: '夜色', hint: '深深的蓝夜晚' }
  ];

  function toggleCard(id: EffectId) {
    expanded = expanded === id ? null : id;
  }

  function onDragStart(e: DragEvent, id: EffectId) {
    dragId = id;
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', id);
  }
  function onDragOver(e: DragEvent, id: EffectId) {
    e.preventDefault();
    if (dragId && dragId !== id) dragOverId = id;
  }
  function onDrop(e: DragEvent, targetId: EffectId) {
    e.preventDefault();
    if (dragId && dragId !== targetId) {
      const toIndex = s.effectOrder.indexOf(targetId);
      project.reorderEffect(dragId, toIndex);
    }
    dragId = null;
    dragOverId = null;
  }
  function onDragEnd() {
    dragId = null;
    dragOverId = null;
  }

  // 触屏拖拽兜底：卡片上的上移/下移按钮
  function move(id: EffectId, dir: -1 | 1) {
    project.moveEffect(id, dir);
  }

  function enabledOf(id: EffectId): boolean {
    if (id === 'bloom') return s.bloom.enabled;
    if (id === 'dof') return s.dof.enabled;
    if (id === 'tonemap') return s.tonemap.enabled;
    return s.outline.enabled;
  }
  function toggleEnabled(id: EffectId) {
    project.patch((st) => {
      if (id === 'bloom') st.bloom.enabled = !st.bloom.enabled;
      if (id === 'dof') st.dof.enabled = !st.dof.enabled;
      if (id === 'tonemap') st.tonemap.enabled = !st.tonemap.enabled;
      if (id === 'outline') st.outline.enabled = !st.outline.enabled;
    });
  }
</script>

<aside class="effects panel">
  <p class="panel-title">魔法效果卡 <span class="sub">（拖动换顺序）</span></p>

  <div class="card-list">
    {#each s.effectOrder as id, index (id)}
      {@const meta = EFFECT_META[id]}
      <div
        class="effect-card"
        role="listitem"
        aria-label={`${meta.name}效果卡，第 ${index + 1} 位，可拖拽排序`}
        class:open={expanded === id}
        class:on={enabledOf(id)}
        class:dragover={dragOverId === id}
        draggable="true"
        ondragstart={(e) => onDragStart(e, id)}
        ondragover={(e) => onDragOver(e, id)}
        ondrop={(e) => onDrop(e, id)}
        ondragend={onDragEnd}
      >
        <div class="card-head">
          <span class="order-num">{index + 1}</span>
          <span class="card-icon">{meta.icon}</span>
          <button class="head-btn" onclick={() => toggleCard(id)}>
            <span class="card-name">{meta.name}</span>
            <span class="chevron">{expanded === id ? '▾' : '▸'}</span>
          </button>
          <label class="switch" title={enabledOf(id) ? '关掉效果' : '打开效果'}>
            <input
              type="checkbox"
              checked={enabledOf(id)}
              onchange={() => toggleEnabled(id)}
            />
            <span class="slider"></span>
          </label>
        </div>

        {#if expanded === id}
          <div class="card-body">
            <p class="card-desc">{meta.desc}</p>

            {#if id === 'bloom'}
              <label class="param">
                <span>泛光强度 <b>{s.bloom.intensity.toFixed(2)}</b></span>
                <input
                  type="range" min="0" max="2" step="0.05"
                  value={s.bloom.intensity}
                  oninput={(e) => project.patch((st) => {
                    st.bloom.intensity = parseFloat(e.currentTarget.value);
                  })}
                />
              </label>
              <label class="param">
                <span>扩散半径 <b>{s.bloom.radius} 档</b></span>
                <input
                  type="range" min="1" max="12" step="1"
                  value={s.bloom.radius}
                  oninput={(e) => project.patch((st) => {
                    st.bloom.radius = parseInt(e.currentTarget.value);
                  })}
                />
              </label>
              <label class="param">
                <span>发光门槛 <b>{s.bloom.threshold.toFixed(2)}</b></span>
                <input
                  type="range" min="0.1" max="1" step="0.05"
                  value={s.bloom.threshold}
                  oninput={(e) => project.patch((st) => {
                    st.bloom.threshold = parseFloat(e.currentTarget.value);
                  })}
                />
              </label>
            {/if}

            {#if id === 'dof'}
              <label class="param">
                <span>清晰范围 <b>{s.dof.range.toFixed(2)}</b></span>
                <input
                  type="range" min="0.04" max="0.5" step="0.01"
                  value={s.dof.range}
                  oninput={(e) => project.patch((st) => {
                    st.dof.range = parseFloat(e.currentTarget.value);
                  })}
                />
              </label>
              <label class="param">
                <span>模糊程度 <b>{s.dof.blur.toFixed(1)}</b></span>
                <input
                  type="range" min="1" max="8" step="0.5"
                  value={s.dof.blur}
                  oninput={(e) => project.patch((st) => {
                    st.dof.blur = parseFloat(e.currentTarget.value);
                  })}
                />
              </label>
              <div class="param two-col">
                <label>
                  对焦点 X
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={s.dof.focusX}
                    oninput={(e) => project.patch((st) => {
                      st.dof.focusX = parseFloat(e.currentTarget.value);
                    })}
                  />
                </label>
                <label>
                  对焦点 Y
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={s.dof.focusY}
                    oninput={(e) => project.patch((st) => {
                      st.dof.focusY = parseFloat(e.currentTarget.value);
                    })}
                  />
                </label>
              </div>
              <p class="mini-hint">也可以直接在画布里拖动金色对焦环 ✨</p>
            {/if}

            {#if id === 'tonemap'}
              <div class="mode-grid">
                {#each tonemapModes as m (m.id)}
                  <button
                    class="mode-btn"
                    class:active={s.tonemap.mode === m.id}
                    onclick={() => project.setTonemapMode(m.id)}
                  >
                    <b>{m.name}</b>
                    <small>{m.hint}</small>
                  </button>
                {/each}
              </div>
            {/if}

            {#if id === 'outline'}
              <label class="param">
                <span>描边粗细 <b>{s.outline.thickness.toFixed(1)} px</b></span>
                <input
                  type="range" min="0.5" max="6" step="0.1"
                  value={s.outline.thickness}
                  oninput={(e) => project.patch((st) => {
                    st.outline.thickness = parseFloat(e.currentTarget.value);
                  })}
                />
              </label>
              <label class="color-row">
                描边颜色
                <input
                  type="color"
                  value={s.outline.color}
                  oninput={(e) => project.patch((st) => {
                    st.outline.color = e.currentTarget.value;
                  })}
                />
              </label>
            {/if}
          </div>
        {/if}

        <div class="card-actions">
          <button
            class="icon-btn tiny"
            disabled={index === 0}
            onclick={() => move(id, -1)}
            title="往前移"
          >↑</button>
          <button
            class="icon-btn tiny"
            disabled={index === s.effectOrder.length - 1}
            onclick={() => move(id, 1)}
            title="往后移"
          >↓</button>
        </div>
      </div>
    {/each}
  </div>
</aside>

<style>
  .effects {
    width: 272px;
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sub {
    font-weight: 400;
    color: var(--fg-dim);
    font-size: 11px;
  }
  .card-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .effect-card {
    background: var(--bg-card);
    border: 1.5px solid var(--line);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
    position: relative;
  }
  .effect-card.dragover {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(255, 215, 94, 0.4);
    transform: translateY(-2px);
  }
  .effect-card.on {
    border-left: 4px solid var(--accent);
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .order-num {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--bg-panel-solid);
    border: 1px solid var(--line-strong);
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 700;
    flex: none;
  }
  .card-icon {
    font-size: 20px;
  }
  .head-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: transparent;
    border: none;
    padding: 4px 2px;
    min-height: 32px;
    text-align: left;
  }
  .head-btn:hover {
    background: transparent;
  }
  .card-name {
    font-weight: 700;
    font-size: 15px;
  }
  .chevron {
    color: var(--fg-dim);
  }
  .card-body {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .card-desc {
    margin: 0 0 10px;
    font-size: 12.5px;
    color: var(--fg-dim);
  }
  .param {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
    font-size: 13px;
  }
  .param b {
    color: var(--accent);
    font-weight: 600;
  }
  .param.two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .param.two-col label {
    display: flex;
    flex-direction: column;
    font-size: 12px;
    color: var(--fg-dim);
  }
  .mini-hint {
    font-size: 11.5px;
    color: var(--fg-dim);
    margin: 4px 0 0;
  }
  .mode-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .mode-btn {
    padding: 8px 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }
  .mode-btn small {
    font-size: 10px;
    color: var(--fg-dim);
    font-weight: 400;
  }
  .color-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
  }
  .card-actions {
    position: absolute;
    right: 8px;
    bottom: -12px;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .effect-card:hover .card-actions,
  .effect-card.open .card-actions {
    opacity: 1;
  }
  .tiny {
    min-width: 28px;
    min-height: 28px;
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: 13px;
    border-radius: 8px;
  }

  /* 开关 */
  .switch {
    position: relative;
    width: 46px;
    height: 26px;
    flex: none;
  }
  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .slider {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    transition: 0.2s;
    cursor: pointer;
  }
  .slider::before {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    left: 3px;
    top: 3px;
    background: #fff;
    border-radius: 50%;
    transition: 0.2s;
  }
  .switch input:checked + .slider {
    background: var(--accent);
  }
  .switch input:checked + .slider::before {
    transform: translateX(20px);
  }
</style>
