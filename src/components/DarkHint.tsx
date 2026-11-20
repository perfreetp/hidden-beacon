import { type JSX } from 'solid-js';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onBrighten: () => void;
}

/** 画面偏暗时出现的儿童友好提示气泡 */
export function DarkHint(props: Props): JSX.Element {
  return (
    <div class="dark-hint" classList={{ show: props.visible }} role="status">
      <span class="dark-hint-icon">🌙</span>
      <div class="dark-hint-text">
        <strong>屋里有点黑呀～</strong>
        <span>把台灯调亮一点，或让阳光照进来，影子会更清楚！</span>
      </div>
      <div class="dark-hint-actions">
        <button class="btn btn-primary btn-small" type="button" onClick={() => props.onBrighten()}>
          一键变亮
        </button>
        <button class="btn btn-small" type="button" onClick={() => props.onDismiss()}>
          知道了
        </button>
      </div>
    </div>
  );
}
