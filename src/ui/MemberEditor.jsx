export default function MemberEditor({ member, onApply, onCancel, busy }) {
  if (!member) return null;
  return (
    <div className="member-editor">
      <div className="member-editor-head">
        <h4>{member.label}</h4>
        <button type="button" className="icon-btn" onClick={onCancel} title="关闭">
          ×
        </button>
      </div>
      <div className="member-row">
        <span>类型</span>
        <b>{typeLabel(member.type)}</b>
      </div>
      <div className="member-row">
        <span>当前长度</span>
        <b>{member.length.toFixed(1)} mm</b>
      </div>
      <MemberLengthForm key={member.memberId} initial={member.length} onApply={onApply} busy={busy} />
    </div>
  );
}

function typeLabel(t) {
  return (
    {
      chord: '弦杆',
      web: '腹杆',
      leg: '塔腿',
      towerWeb: '塔斜撑',
      towerRing: '塔环杆',
    }[t] ?? t
  );
}

function MemberLengthForm({ initial, onApply, busy }) {
  const min = Math.round(initial * 0.5);
  const max = Math.round(initial * 1.5);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = Number(new FormData(e.currentTarget).get('length'));
        if (Number.isFinite(v)) onApply(v);
      }}
    >
      <label className="field">
        <span className="field-label">
          新长度 mm <em className="field-hint">{min}–{max}</em>
        </span>
        <input
          name="length"
          type="number"
          defaultValue={initial.toFixed(1)}
          min={min}
          max={max}
          step={1}
          required
        />
      </label>
      <button type="submit" className="build-btn small" disabled={busy}>
        {busy ? '增量重算中…' : '应用并重算受影响布尔链'}
      </button>
    </form>
  );
}
