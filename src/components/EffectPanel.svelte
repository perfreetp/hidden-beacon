<script>
  import { effects, pickingFocus } from '../lib/stores.js';

  const META = {
    bloom: { name: '泛光', icon: '✨', desc: '让光晕开来' },
    dof: { name: '景深', icon: '🔍', desc: '焦点外变模糊' },
    tonemap: { name: '色调映射', icon: '🎨', desc: '换种画面味道' },
    outline: { name: '描边', icon: '✏️', desc: '给形状勾个边' }
  };

  const TONE_MODES = [
    { id: 'soft', name: '柔和' },
    { id: 'vivid', name: '鲜艳' },
    { id: 'night', name: '夜色' }
  ];

  let expanded = null;
  let dragIdx = null;
  let overIdx = null;

  function setParam(id, key, val) {
    effects.update((fx) => ({
      ...fx,
      params: { ...fx.params, [id]: { ...fx.params[id], [key]: val } }
    }));
  }

  function toggleExpand(id) {
    expanded = expanded === id ? null : id;
  }

  // ---- 拖拽排序 ----
  function dragStart(e, i) {
    dragIdx = i;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  }
  function dragOver(e, i) {
    e.preventDefault();
    if (dragIdx == null || dragIdx === i) return;
    overIdx = i;
    effects.update((fx) => {
      const order = [...fx.order];
      const [moved] = order.splice(dragIdx, 1);
      order.splice(i, 0, moved);
      dragIdx = i;
      return { ...fx, order };
    });
  }
  function dragEnd() {
    dragIdx = null;
    overIdx = null;
  }

  function pickFocus() {
    pickingFocus.set(true);
  }
</script>

<section class="fx">
  <h2>效果卡 <span class="sub">拖动卡片改变顺序</span></h2>

  <div class="cards">
    {#each $effects.order as id, i (id)}
      {@const p = $effects.params[id]}
      <div
        class="card"
        class:off={!p.enabled}
        class:dragging={dragIdx === i}
        class:over={overIdx === i && dragIdx !== i}
        on:dragover={(e) => dragOver(e, i)}
        on:drop={(e) => e.preventDefault()}
      >
        <div class="head">
          <span
            class="grip"
            draggable="true"
            on:dragstart={(e) => dragStart(e, i)}
            on:dragend={dragEnd}
            title="拖动调整顺序"
          >⠿</span>
          <button class="title" on:click={() => toggleExpand(id)}>
            <span class="ic">{META[id].icon}</span>
            <span class="nm">{i + 1}. {META[id].name}</span>
            <span class="arrow">{expanded === id ? '▾' : '▸'}</span>
          </button>
          <label class="switch" title="启用/关闭">
            <input
              type="checkbox"
              checked={p.enabled}
              on:change={(e) => setParam(id, 'enabled', e.currentTarget.checked)}
            />
          </label>
        </div>

        {#if expanded === id}
          <div class="params" on:dragover|stopPropagation>
            <p class="desc">{META[id].desc}</p>

            {#if id === 'bloom'}
              <label>强度 <b>{p.intensity.toFixed(1)}</b>
                <input type="range" min="0" max="3" step="0.1" value={p.intensity}
                  on:input={(e) => setParam(id, 'intensity', +e.currentTarget.value)} />
              </label>
              <label>扩散半径 <b>{p.radius.toFixed(1)}</b>
                <input type="range" min="0.5" max="4" step="0.1" value={p.radius}
                  on:input={(e) => setParam(id, 'radius', +e.currentTarget.value)} />
              </label>
            {/if}

            {#if id === 'dof'}
              <label>对焦点 横向 <b>{Math.round(p.focusX * 100)}%</b>
                <input type="range" min="0" max="1" step="0.01" value={p.focusX}
                  on:input={(e) => setParam(id, 'focusX', +e.currentTarget.value)} />
              </label>
              <label>对焦点 纵向 <b>{Math.round(p.focusY * 100)}%</b>
                <input type="range" min="0" max="1" step="0.01" value={p.focusY}
                  on:input={(e) => setParam(id, 'focusY', +e.currentTarget.value)} />
              </label>
              <button class="pick" on:click={pickFocus}>🎯 在画布上点选对焦点</button>
              <label>模糊范围 <b>{Math.round(p.range * 100)}%</b>
                <input type="range" min="0.05" max="1" step="0.01" value={p.range}
                  on:input={(e) => setParam(id, 'range', +e.currentTarget.value)} />
              </label>
              <label>模糊强度 <b>{p.strength.toFixed(1)}</b>
                <input type="range" min="0" max="3" step="0.1" value={p.strength}
                  on:input={(e) => setParam(id, 'strength', +e.currentTarget.value)} />
              </label>
            {/if}

            {#if id === 'tonemap'}
              <div class="modes">
                {#each TONE_MODES as m}
                  <button
                    class:active={p.mode === m.id}
                    on:click={() => setParam(id, 'mode', m.id)}
                  >{m.name}</button>
                {/each}
              </div>
            {/if}

            {#if id === 'outline'}
              <label>粗细 <b>{p.width}px</b>
                <input type="range" min="1" max="12" step="0.5" value={p.width}
                  on:input={(e) => setParam(id, 'width', +e.currentTarget.value)} />
              </label>
              <label class="colorrow">颜色
                <input type="color" value={p.color}
                  on:input={(e) => setParam(id, 'color', e.currentTarget.value)} />
              </label>
            {/if}
          </div>
        {/if}
      </div>
      <div
        class="dropzone"
        on:dragover={(e) => dragOver(e, i)}
        on:drop={(e) => e.preventDefault()}
      ></div>
    {/each}
  </div>

  <p class="hint">顺序就是计算的先后，换一换会有不一样的魔法！</p>
</section>

<style>
  .fx { display: flex; flex-direction: column; gap: 0.5rem; }
  h2 { margin: 0.2rem 0; font-size: 0.85rem; color: #8f95c8; font-weight: 600; letter-spacing: 0.1em; }
  .sub { font-weight: 400; font-size: 0.72rem; letter-spacing: 0; color: #6f74a5; }
  .cards { display: flex; flex-direction: column; }
  .card {
    background: #181b3d; border: 2px solid #2c3060; border-radius: 14px;
    transition: border-color 0.15s, opacity 0.15s, transform 0.1s;
  }
  .card.off { opacity: 0.55; }
  .card.dragging { opacity: 0.4; transform: scale(0.98); }
  .card.over { border-color: #ffd76a; }
  .dropzone { height: 8px; }
  .head { display: flex; align-items: center; gap: 0.2rem; padding: 0.35rem 0.4rem; }
  .grip {
    cursor: grab; color: #6f74a5; font-size: 1rem; padding: 0.3rem 0.25rem;
    touch-action: none;
  }
  .grip:active { cursor: grabbing; }
  .title {
    flex: 1; display: flex; align-items: center; gap: 0.4rem;
    background: none; border: none; color: #e8e9f5; cursor: pointer;
    font-size: 0.95rem; font-family: inherit; padding: 0.25rem 0;
  }
  .nm { flex: 1; text-align: left; font-weight: 600; }
  .arrow { color: #6f74a5; }
  .switch input { width: 18px; height: 18px; accent-color: #ffd76a; cursor: pointer; }
  .params {
    padding: 0.2rem 0.7rem 0.7rem; display: flex; flex-direction: column; gap: 0.5rem;
    border-top: 1px dashed #2c3060;
  }
  .desc { margin: 0.3rem 0 0; font-size: 0.75rem; color: #8f95c8; }
  label { display: flex; flex-direction: column; font-size: 0.8rem; gap: 0.15rem; color: #c6c9ea; }
  label b { color: #ffd76a; font-weight: 600; }
  input[type='range'] { width: 100%; accent-color: #ffd76a; }
  .colorrow { flex-direction: row; align-items: center; gap: 0.5rem; }
  .colorrow input { width: 42px; height: 28px; border: none; background: none; padding: 0; cursor: pointer; }
  .modes { display: flex; gap: 0.4rem; }
  .modes button {
    flex: 1; padding: 0.45rem 0; border-radius: 10px; cursor: pointer;
    border: 2px solid #2c3060; background: #12142f; color: #e8e9f5;
    font-family: inherit; font-size: 0.85rem;
  }
  .modes button.active { border-color: #ffd76a; background: #2a2450; }
  .pick {
    padding: 0.4rem; border-radius: 10px; cursor: pointer;
    border: 2px dashed #3f6fd8; background: #14204a; color: #9fc2ff;
    font-family: inherit; font-size: 0.82rem;
  }
  .hint { font-size: 0.72rem; color: #6f74a5; margin: 0.2rem 0 0; line-height: 1.4; }
  :global(body.hc) .card { border-color: #aaa; background: #000; }
  :global(body.hc) .modes button { border-color: #aaa; background: #000; color: #fff; }
  :global(body.hc) .modes button.active { border-color: #ffff00; }
</style>
