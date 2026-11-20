import { useEffect, useMemo, useRef, useState } from 'react';
import ParamPanel from './ui/ParamPanel.jsx';
import MemberEditor from './ui/MemberEditor.jsx';
import ExportPage from './ui/ExportPage.jsx';
import Viewport from './three/Viewport.jsx';
import { DEFAULT_PARAMS } from './model/params.js';
import { saveProject } from './model/storage.js';

export default function App() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [tab, setTab] = useState('model'); // model | export
  const [meshData, setMeshData] = useState(null);
  const [stats, setStats] = useState(null);
  const [dagSummary, setDagSummary] = useState(null);
  const [model, setModel] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [exportParts, setExportParts] = useState(null);
  const [exportPartsKey, setExportPartsKey] = useState(0); // 模型变化后使旧部件失效
  const [projectId, setProjectId] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [busyCount, setBusyCount] = useState(0);

  const workerRef = useRef(null);
  const controllersRef = useRef([]);
  const exportResolversRef = useRef(new Set());
  const exportInFlightRef = useRef(false);

  // worker 生命周期
  useEffect(() => {
    const worker = new Worker(new URL('./model/modelWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (ev) => {
      const msg = ev.data;
      if (msg.type === 'ready') {
        setProgress(null);
      } else if (msg.type === 'progress') {
        setProgress(msg.message);
      } else if (msg.type === 'done') {
        setMeshData(msg.mesh);
        setStats(msg.stats);
        setDagSummary(msg.dagSummary);
        setModel(msg.model);
        setProgress(null);
        setError(null);
        setBusyCount((n) => Math.max(0, n - 1));
        setExportParts(null);
        setExportPartsKey((k) => k + 1);
        persistProject(params, msg.stats, msg.dagSummary);
      } else if (msg.type === 'editDone') {
        setMeshData(msg.mesh);
        setStats(msg.stats);
        setModel(msg.model);
        setProgress(null);
        setError(null);
        setBusyCount((n) => Math.max(0, n - 1));
        setExportParts(null); // 模型已变,旧导出失效
        setExportPartsKey((k) => k + 1);
      } else if (msg.type === 'exportDone') {
        const next = { beamMesh: msg.beamMesh, towerMesh: msg.towerMesh };
        setExportParts(next);
        setProgress(null);
        setBusyCount((n) => Math.max(0, n - 1));
        exportInFlightRef.current = false;
        exportResolversRef.current.forEach((fn) => fn(next));
        exportResolversRef.current.clear();
      } else if (msg.type === 'error') {
        setProgress(null);
        setBusyCount((n) => Math.max(0, n - 1));
        exportInFlightRef.current = false;
        exportResolversRef.current.clear();
        setError(msg.message);
      }
    };
    return () => worker.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistProject = async (p, st, dag) => {
    try {
      const doc = await saveProject({
        id: projectId,
        name: `桁架 ${p.cols}×${p.rows} 阵列`,
        params: p,
        stats: st,
        modelMeta: dag,
      });
      setProjectId(doc.id);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      console.warn('项目持久化失败', e);
    }
  };

  const build = () => {
    setError(null);
    setMeshData(null);
    setExportParts(null);
    setSelectedMemberId(null);
    setBusyCount((n) => n + 1);
    setProgress('初始化 manifold WASM…');
    workerRef.current.postMessage({ type: 'build', params });
  };

  const applyMemberLength = (newLength) => {
    if (!selectedMemberId) return;
    setBusyCount((n) => n + 1);
    setProgress('增量重算布尔链…');
    workerRef.current.postMessage({ type: 'edit', memberId: selectedMemberId, newLength });
  };

  const requestExportParts = (resolver) => {
    if (exportParts) {
      resolver(exportParts);
      return;
    }
    exportResolversRef.current.add(resolver);
    // StrictMode 双挂载会重复请求;在途时只登记回调,不重复发消息、不重复计数
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setBusyCount((n) => n + 1);
    setProgress('拆分导出实体…');
    workerRef.current.postMessage({ type: 'exportParts' });
  };

  // 拾取层记录:只取圆柱类杆件(球节点不可选)
  const pickRecords = useMemo(() => {
    if (!model) return [];
    return model.primitives.filter((r) => r.shape === 'cylinder' && r.kind !== 'cutter');
  }, [model]);

  const selectedMember = useMemo(() => {
    if (!model || !selectedMemberId) return null;
    return model.members.find((m) => m.memberId === selectedMemberId) ?? null;
  }, [model, selectedMemberId]);

  const registerController = (orbit) => {
    if (!controllersRef.current.includes(orbit)) controllersRef.current.push(orbit);
  };

  // 两视口联动:任一相机变化时把姿态同步给另一个(用守卫避免 A→B→A 无限循环)
  const syncingRef = useRef(false);
  const handleCameraChange = (src) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      controllersRef.current.forEach((other) => {
        if (other !== src) other.adopt(src);
      });
    } finally {
      syncingRef.current = false;
    }
  };

  const building = busyCount > 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">桁架阵列实体建模</div>
        <div className="stats">
          <Stat label="三角面数" value={stats ? Math.round(stats.triangleCount).toLocaleString() : '—'} />
          <Stat label="顶点数" value={stats ? Math.round(stats.vertexCount).toLocaleString() : '—'} />
          <Stat
            label="布尔耗时"
            value={stats ? `${stats.buildMs.toFixed(1)} ms` : '—'}
            accent={stats?.incremental}
          />
          <Stat label="布尔次数" value={stats ? stats.booleans : '—'} />
          <Stat label="基元(去重后)" value={stats ? `${stats.dedupedCount}/${stats.rawCount}` : '—'} />
          <Stat label="DAG 组" value={dagSummary ? `${dagSummary.groupCount}` : '—'} />
        </div>
        <div className="top-right">
          {savedAt && <span className="saved-tag">已存 IndexedDB · {savedAt}</span>}
          <nav className="tabs">
            <button className={tab === 'model' ? 'tab active' : 'tab'} onClick={() => setTab('model')}>
              建模
            </button>
            <button className={tab === 'export' ? 'tab active' : 'tab'} onClick={() => setTab('export')}>
              导出
            </button>
          </nav>
        </div>
      </header>

      {tab === 'model' ? (
        <div className="workspace">
          <aside className="sidebar">
            <ParamPanel
              params={params}
              onChange={setParams}
              onBuild={build}
              building={building}
            />
            {selectedMember && (
              <MemberEditor
                member={selectedMember}
                busy={building}
                onCancel={() => setSelectedMemberId(null)}
                onApply={(v) => applyMemberLength(v)}
              />
            )}
          </aside>
          <main className="viewports">
            <Viewport
              title="视口 A · 实体着色(左键旋转 / 右键平移 / 滚轮缩放 / 点击选杆)"
              mode="solid"
              meshData={meshData}
              pickRecords={pickRecords}
              selectedMemberId={selectedMemberId}
              onSelectMember={setSelectedMemberId}
              registerController={registerController}
              onCameraChange={handleCameraChange}
            />
            <Viewport
              title="视口 B · 线框校验(与 A 联动)"
              mode="wire"
              meshData={meshData}
              pickRecords={pickRecords}
              selectedMemberId={selectedMemberId}
              onSelectMember={setSelectedMemberId}
              registerController={registerController}
              onCameraChange={handleCameraChange}
            />
            {progress && (
              <div className="overlay-banner">
                <span className="spinner" />
                {progress}
              </div>
            )}
            {error && <div className="overlay-banner error">运算失败:{error}</div>}
            {!meshData && !progress && !error && (
              <div className="overlay-banner hint">设置参数后点击「生成实体」</div>
            )}
            {stats?.incremental && (
              <div className="overlay-banner ok">
                增量重算完成:{stats.changedPrimitiveCount} 个基元受影响,仅重算对应布尔链,耗时{' '}
                {stats.buildMs.toFixed(1)} ms
              </div>
            )}
          </main>
        </div>
      ) : (
        <main className="export-wrap">
          <ExportPage
            parts={exportParts}
            partsKey={exportPartsKey}
            projectId={projectId}
            busy={building}
            onRequestParts={requestExportParts}
          />
        </main>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={accent ? 'stat accent' : 'stat'}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
