import { LIMITS, CHORD_SPECS, PANEL_LENGTHS, beamHeight, panelCount, getChordSpec } from '../model/params.js';

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <em className="field-hint">{hint}</em>}
      </span>
      {children}
    </label>
  );
}

export default function ParamPanel({ params, onChange, onBuild, building, disabled }) {
  const set = (key, value) => onChange({ ...params, [key]: value });
  const H = beamHeight(params);
  const n = panelCount(params);
  const chord = getChordSpec(params.chordSpecId);

  return (
    <div className="param-panel">
      <section className="param-group">
        <h3>横梁</h3>
        <Field label={`跨度 ${(params.span / 1000).toFixed(1)} m`} hint="4–24 m">
          <input
            type="range"
            min={LIMITS.span.min}
            max={LIMITS.span.max}
            step={LIMITS.span.step}
            value={params.span}
            onChange={(e) => set('span', Number(e.target.value))}
          />
        </Field>
        <Field label="节间距">
          <div className="seg">
            {PANEL_LENGTHS.map((p) => (
              <button
                key={p}
                className={params.panelLength === p ? 'seg-btn active' : 'seg-btn'}
                onClick={() => set('panelLength', p)}
                type="button"
              >
                {p} mm
              </button>
            ))}
          </div>
        </Field>
        <Field label="弦杆规格" hint="5 选 1">
          <select value={params.chordSpecId} onChange={(e) => set('chordSpecId', e.target.value)}>
            {CHORD_SPECS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}(Ø{s.outerDiameter} mm)
              </option>
            ))}
          </select>
        </Field>
        <Field label={`腹杆斜撑角度 ${params.braceAngle}°`} hint="30–60°,步长 5°">
          <input
            type="range"
            min={LIMITS.braceAngle.min}
            max={LIMITS.braceAngle.max}
            step={LIMITS.braceAngle.step}
            value={params.braceAngle}
            onChange={(e) => set('braceAngle', Number(e.target.value))}
          />
        </Field>
        <div className="readout">
          节间数 <b>{n}</b> · 梁高 <b>{H} mm</b> · 腹杆 Ø
          <b>{(chord.outerDiameter * 0.62).toFixed(1)}</b>
        </div>
      </section>

      <section className="param-group">
        <h3>阵列复制</h3>
        <Field label={`列数(沿梁长)${params.cols}`} hint="≤12">
          <input
            type="range"
            min={LIMITS.cols.min}
            max={LIMITS.cols.max}
            step={1}
            value={params.cols}
            onChange={(e) => set('cols', Number(e.target.value))}
          />
        </Field>
        <Field label={`行数(竖向堆叠)${params.rows}`} hint="≤4">
          <input
            type="range"
            min={LIMITS.rows.min}
            max={LIMITS.rows.max}
            step={1}
            value={params.rows}
            onChange={(e) => set('rows', Number(e.target.value))}
          />
        </Field>
        <Field label="行间距 mm">
          <input
            type="number"
            min={200}
            max={3000}
            step={50}
            value={params.rowGap}
            onChange={(e) => set('rowGap', Number(e.target.value))}
          />
        </Field>
      </section>

      <section className="param-group">
        <h3>塔架与螺栓孔</h3>
        <Field label="生成塔架">
          <div className="seg">
            <button
              type="button"
              className={params.towerEnabled ? 'seg-btn active' : 'seg-btn'}
              onClick={() => set('towerEnabled', true)}
            >
              是
            </button>
            <button
              type="button"
              className={!params.towerEnabled ? 'seg-btn active' : 'seg-btn'}
              onClick={() => set('towerEnabled', false)}
            >
              否
            </button>
          </div>
        </Field>
        <Field label="塔架截面边长 mm">
          <input
            type="number"
            min={400}
            max={2000}
            step={50}
            value={params.towerWidth}
            disabled={!params.towerEnabled}
            onChange={(e) => set('towerWidth', Number(e.target.value))}
          />
        </Field>
        <Field label="塔架高度 mm">
          <input
            type="number"
            min={1000}
            max={12000}
            step={500}
            value={params.towerHeight}
            disabled={!params.towerEnabled}
            onChange={(e) => set('towerHeight', Number(e.target.value))}
          />
        </Field>
        <Field label={`孔径 ${params.holeDiameter} mm`} hint="18–26 mm">
          <input
            type="range"
            min={LIMITS.holeDiameter.min}
            max={LIMITS.holeDiameter.max}
            step={LIMITS.holeDiameter.step}
            value={params.holeDiameter}
            onChange={(e) => set('holeDiameter', Number(e.target.value))}
          />
        </Field>
        <div className="readout">
          孔深 <b>{params.holeDepth ?? chord.outerDiameter} mm</b>(= 弦杆外径,4 孔/梁)
        </div>
      </section>

      <section className="param-group">
        <h3>网格精度</h3>
        <Field label={`圆周分段 ${params.circularSegments}`}>
          <input
            type="range"
            min={8}
            max={32}
            step={4}
            value={params.circularSegments}
            onChange={(e) => set('circularSegments', Number(e.target.value))}
          />
        </Field>
      </section>

      <button className="build-btn" onClick={onBuild} disabled={disabled || building} type="button">
        {building ? '布尔运算中…' : '生成实体'}
      </button>
    </div>
  );
}
