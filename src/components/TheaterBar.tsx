import { For, createSignal, type JSX } from 'solid-js';
import {
  currentTheater,
  deleteTheater,
  duplicateTheater,
  renameTheater,
  state,
  switchTheater,
} from '../store/theaterStore';

export function TheaterBar(): JSX.Element {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal('');

  const beginRename = () => {
    setDraft(currentTheater().name);
    setEditing(true);
  };
  const commitRename = () => {
    renameTheater(currentTheater().id, draft());
    setEditing(false);
  };

  return (
    <div class="theater-bar">
      <div class="theater-tabs">
        <For each={state().theaters}>
          {(t) => (
            <button
              class="theater-tab"
              classList={{ active: t.id === state().currentId }}
              type="button"
              onClick={() => switchTheater(t.id)}
              title={t.builtin ? '内置剧场' : '我的剧场'}
            >
              <span class="theater-tab-icon">{t.builtin ? '★' : '✿'}</span>
              <span class="theater-tab-name">{t.name}</span>
            </button>
          )}
        </For>
      </div>

      <div class="theater-actions">
        <button class="btn btn-primary" type="button" onClick={() => duplicateTheater()}>
          ＋ 复制一份再改
        </button>
        {editing() ? (
          <span class="rename-box">
            <input
              value={draft()}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              autofocus
            />
            <button class="btn" type="button" onClick={commitRename}>
              好
            </button>
          </span>
        ) : (
          <button class="btn" type="button" onClick={beginRename}>
            ✎ 改名
          </button>
        )}
        <button
          class="btn btn-danger"
          type="button"
          disabled={state().theaters.length <= 1 || currentTheater().builtin}
          title={currentTheater().builtin ? '内置剧场不能删除，可以复制后改' : '删除这个剧场'}
          onClick={() => deleteTheater(currentTheater().id)}
        >
          🗑 删除
        </button>
      </div>
    </div>
  );
}
