import { useEffect, useState } from 'react';
import { buildSTL, buildOBJ, downloadBlob } from '../model/exporters.js';
import { saveExportRecord } from '../model/storage.js';
import { addExportRecord, useExportHistory } from './exportHistoryStore.js';

// 导出页:横梁 / 塔架 分别导出 STL 与 OBJ(共 4 个文件),并写入 IndexedDB
export default function ExportPage({ parts, partsKey, projectId, busy, onRequestParts }) {
  const [working, setWorking] = useState(null);
  const [partsReady, setPartsReady] = useState(parts);
  const history = useExportHistory();

  // 挂载或模型变化后自动拉取拆分实体
  useEffect(() => {
    if (parts) {
      setPartsReady(parts);
      return;
    }
    let cancelled = false;
    onRequestParts((received) => {
      if (!cancelled) setPartsReady(received);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partsKey]);

  const exportOne = async (part, format) => {
    setWorking(`${part}-${format}`);
    try {
      const p = partsReady;
      const mesh = part === 'beam' ? p?.beamMesh : p?.towerMesh;
      if (!mesh) {
        setWorking(null);
        alert('该部件不存在(塔架未启用)');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const name = `${part}-${stamp}`;
      const blob = format === 'stl' ? buildSTL(mesh, part) : buildOBJ(mesh, part);
      const ext = format === 'stl' ? 'stl' : 'obj';
      const triCount = mesh.triVerts.length / 3;
      // 先写 IndexedDB,再触发浏览器下载(下载在部分 headless 环境会阻塞)
      let dbId = null;
      try {
        dbId = await saveExportRecord({ projectId, part, format, blob, triangleCount: triCount });
      } catch (e) {
        console.warn('IndexedDB 写入失败', e);
      }
      downloadBlob(blob, `${name}.${ext}`);
      addExportRecord({
        key: `${part}-${format}-${Date.now()}`,
        part,
        format: format.toUpperCase(),
        size: blob.size,
        triangles: triCount,
        dbId,
        at: new Date().toLocaleTimeString(),
      });
    } finally {
      setWorking(null);
    }
  };

  const Card = ({ part, title, desc, triCount }) => (
    <div className="export-card">
      <div className="export-card-head">
        <h3>{title}</h3>
        <span className="muted">{desc}</span>
      </div>
      <div className="export-stats">
        {triCount != null ? `${Math.round(triCount).toLocaleString()} 三角面` : '部件不可用'}
      </div>
      <div className="export-actions">
        <button
          type="button"
          className="export-btn"
          disabled={busy || working != null || triCount == null}
          onClick={() => exportOne(part, 'stl')}
        >
          {working === `${part}-stl` ? '生成中…' : '导出 STL'}
        </button>
        <button
          type="button"
          className="export-btn alt"
          disabled={busy || working != null || triCount == null}
          onClick={() => exportOne(part, 'obj')}
        >
          {working === `${part}-obj` ? '生成中…' : '导出 OBJ'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="export-page">
      <p className="muted">
        整段横梁与塔架分别作为独立水密实体导出,每种部件提供二进制 STL 与 ASCII OBJ
        两种格式,导出记录(含 Blob)存入 IndexedDB。
      </p>
      <div className="export-grid">
        <Card
          part="beam"
          title="整段横梁"
          desc="全部横梁组并集,含 4 螺栓孔差集"
          triCount={partsReady?.beamMesh ? partsReady.beamMesh.triVerts.length / 3 : null}
        />
        <Card
          part="tower"
          title="塔架"
          desc="全部塔架组并集,无开孔"
          triCount={partsReady?.towerMesh ? partsReady.towerMesh.triVerts.length / 3 : null}
        />
      </div>
      {history.length > 0 && (
        <section className="export-history">
          <h3>本次导出记录</h3>
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>部件</th>
                <th>格式</th>
                <th>三角面</th>
                <th>大小</th>
                <th>IndexedDB</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.key}>
                  <td>{r.at}</td>
                  <td>{r.part === 'beam' ? '横梁' : '塔架'}</td>
                  <td>{r.format}</td>
                  <td>{Math.round(r.triangles).toLocaleString()}</td>
                  <td>{(r.size / 1024).toFixed(1)} KB</td>
                  <td>{r.dbId != null ? `#${r.dbId}` : '未写入'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
