import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LinkedOrbit } from './LinkedOrbit.js';

// 单个视口:实体网格 + 杆件拾取层 + 选中高亮
export default function Viewport({
  title,
  mode, // 'solid' | 'wire'
  meshData,
  pickRecords,
  selectedMemberId,
  onSelectMember,
  registerController,
  peerController,
  onCameraChange,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);

  // 初始化 three 场景(只做一次)
  useEffect(() => {
    const dom = mountRef.current;
    const width = dom.clientWidth;
    const height = dom.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    dom.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(mode === 'wire' ? 0x10141c : 0x1b2029);
    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 1e6);
    camera.position.set(9000, 7000, 11000);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(1, 1.4, 1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.45);
    fill.position.set(-1, -0.6, -0.8);
    scene.add(fill);

    const orbit = new LinkedOrbit(camera, renderer.domElement);
    let raf = 0;
    const render = () => {
      raf = 0;
      renderer.render(scene, camera);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(render);
    };
    const offChange = orbit.onChange(schedule);
    orbit.onChange(() => onCameraChange?.(orbit));

    // 射线拾取
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos = null;
    const onDown = (e) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e) => {
      if (!downPos || !stateRef.current?.pickMesh) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 5) return; // 拖拽旋转不算点击
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(stateRef.current.pickMesh);
      if (hits.length > 0) {
        const instanceId = hits[0].instanceId;
        const rec = stateRef.current.pickRecords?.[instanceId];
        if (rec?.memberId) onSelectMember?.(rec.memberId, rec);
      } else {
        onSelectMember?.(null);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const onResize = () => {
      const w = dom.clientWidth;
      const h = dom.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      schedule();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(dom);

    stateRef.current = {
      renderer,
      scene,
      camera,
      orbit,
      schedule,
      solidGroup: new THREE.Group(),
      wireGroup: new THREE.Group(),
      pickMesh: null,
      pickRecords: null,
      highlight: null,
      disposeList: [],
    };
    scene.add(stateRef.current.solidGroup, stateRef.current.wireGroup);
    // 暴露相机姿态与拾取诊断,供联动测试与调试
    window.__viewports = window.__viewports || [];
    const debugHandle = {
      title,
      orbit,
      camera,
      pickCount: () => stateRef.current.pickMesh?.count ?? 0,
      pickVisible: () => stateRef.current.pickMesh?.visible ?? null,
      // 用归一化 NDC 坐标做一次射线拾取,返回命中信息
      raycast: (ndcX, ndcY) => {
        if (!stateRef.current?.pickMesh) return { error: 'no pickMesh' };
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
        const hits = raycaster.intersectObject(stateRef.current.pickMesh);
        if (hits.length === 0) return { hit: false };
        const rec = stateRef.current.pickRecords?.[hits[0].instanceId];
        return { hit: true, instanceId: hits[0].instanceId, memberId: rec?.memberId ?? null };
      },
      // 屏幕像素坐标 -> NDC
      clientToNdc: (clientX, clientY) => {
        const rect = renderer.domElement.getBoundingClientRect();
        return [
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        ];
      },
    };
    window.__viewports.push(debugHandle);
    registerController?.(orbit);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      offChange();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      if (window.__viewports) {
        window.__viewports = window.__viewports.filter((v) => v !== debugHandle);
      }
      stateRef.current.disposeList.forEach((d) => d.dispose?.());
      renderer.dispose();
      dom.removeChild(renderer.domElement);
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 模式切换背景
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.scene.background = new THREE.Color(mode === 'wire' ? 0x10141c : 0x1b2029);
    s.solidGroup.visible = mode !== 'wire';
    s.wireGroup.visible = true;
    s.schedule();
  }, [mode]);

  // 实体网格更新
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !meshData) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(meshData.vertProperties), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(meshData.triVerts), 1));
    geo.computeVertexNormals();
    geo.computeBoundingBox();

    // 清空旧对象
    while (s.solidGroup.children.length) {
      const child = s.solidGroup.children.pop();
      child.geometry?.dispose();
      child.material?.dispose();
    }
    while (s.wireGroup.children.length) {
      const child = s.wireGroup.children.pop();
      child.geometry?.dispose();
      child.material?.dispose();
    }

    const solid = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0x8fb7e8, metalness: 0.35, roughness: 0.55 }),
    );
    s.solidGroup.add(solid);

    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x5d7ba6, transparent: true, opacity: mode === 'wire' ? 0.85 : 0.18 }),
    );
    s.wireGroup.add(wire);

    // 首次有数据时自动取景
    if (!stateRef.current._framed) {
      stateRef.current._framed = true;
      s.orbit.frameObject(geo.boundingBox);
    }
    s.schedule();
  }, [meshData]); // eslint-disable-line react-hooks/exhaustive-deps

  // 拾取层(杆件圆柱 InstancedMesh,不可见但可射线)
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.pickMesh) {
      s.scene.remove(s.pickMesh);
      s.pickMesh.geometry.dispose();
      s.pickMesh.material.dispose();
      s.pickMesh = null;
    }
    if (!pickRecords || pickRecords.length === 0) return;

    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const inst = new THREE.InstancedMesh(cylGeo, mat, pickRecords.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const scale = new THREE.Vector3();
    const center = new THREE.Vector3();
    pickRecords.forEach((rec, i) => {
      const dir = new THREE.Vector3(...rec.dir).normalize();
      q.setFromUnitVectors(up, dir);
      scale.set(rec.radius, rec.length, rec.radius);
      center.set(...rec.center);
      m4.compose(center, q, scale);
      inst.setMatrixAt(i, m4);
    });
    inst.instanceMatrix.needsUpdate = true;
    s.scene.add(inst);
    s.pickMesh = inst;
    s.pickRecords = pickRecords;
  }, [pickRecords]);

  // 选中高亮:把选中杆件放大一点的红色线框
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.highlight) {
      s.scene.remove(s.highlight);
      s.highlight.geometry.dispose();
      s.highlight.material.dispose();
      s.highlight = null;
    }
    if (!selectedMemberId || !pickRecords) return;
    const recs = pickRecords.filter((r) => r.memberId === selectedMemberId);
    if (recs.length === 0) return;
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5d5d, wireframe: true });
    const inst = new THREE.InstancedMesh(cylGeo, mat, recs.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    recs.forEach((rec, i) => {
      const dir = new THREE.Vector3(...rec.dir).normalize();
      q.setFromUnitVectors(up, dir);
      m4.compose(
        new THREE.Vector3(...rec.center),
        q,
        new THREE.Vector3(rec.radius * 1.08, rec.length, rec.radius * 1.08),
      );
      inst.setMatrixAt(i, m4);
    });
    s.scene.add(inst);
    s.highlight = inst;
    s.schedule();
  }, [selectedMemberId, pickRecords]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="viewport">
      <div className="viewport-title">{title}</div>
      <div className="viewport-mount" ref={mountRef} />
    </div>
  );
}
