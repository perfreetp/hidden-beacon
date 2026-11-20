import * as THREE from 'three';

// 轻量轨道控制器(两个视口共用同一份相机姿态,实现联动旋转)
export class LinkedOrbit {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.target = new THREE.Vector3(0, 0, 0);
    this.spherical = new THREE.Spherical();
    this.minDistance = 500;
    this.maxDistance = 200000;
    this.rotateSpeed = 0.4;
    this.panSpeed = 0.8;
    this.zoomSpeed = 0.0012;
    this._dragging = false;
    this._mode = null; // 'rotate' | 'pan'
    this._last = { x: 0, y: 0 };
    this._listeners = new Set();
    this._bind();
    this.syncFromCamera();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit() {
    this._listeners.forEach((fn) => fn());
  }

  syncFromCamera() {
    const off = this.camera.position.clone().sub(this.target);
    this.spherical.setFromVector3(off);
  }

  apply() {
    this.spherical.radius = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.spherical.radius),
    );
    const off = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);
    this.emit();
  }

  // 外部(另一视口)同步姿态
  adopt(other) {
    this.spherical.copy(other.spherical);
    this.target.copy(other.target);
    this.apply();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('pointerdown', (e) => {
      this._dragging = true;
      this._mode = e.button === 2 || e.shiftKey ? 'pan' : 'rotate';
      this._last = { x: e.clientX, y: e.clientY };
      try {
        d.setPointerCapture(e.pointerId);
      } catch {
        /* 合成事件或指针已释放时无活动指针,忽略即可 */
      }
    });
    d.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._last.x;
      const dy = e.clientY - this._last.y;
      this._last = { x: e.clientX, y: e.clientY };
      if (this._mode === 'rotate') {
        this.spherical.theta -= dx * this.rotateSpeed * (Math.PI / 180);
        this.spherical.phi -= dy * this.rotateSpeed * (Math.PI / 180);
        this.spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.spherical.phi));
      } else {
        const pan = this.spherical.radius * this.panSpeed * 0.0015;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        this.camera.matrix.extractBasis(right, up, new THREE.Vector3());
        this.target.addScaledVector(right, -dx * pan);
        this.target.addScaledVector(up, dy * pan);
      }
      this.apply();
    });
    const end = (e) => {
      this._dragging = false;
      this._mode = null;
      try {
        d.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', end);
    d.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.spherical.radius *= 1 + e.deltaY * this.zoomSpeed;
        this.apply();
      },
      { passive: false },
    );
    d.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  frameObject(box3) {
    const sphere = new THREE.Sphere();
    box3.getBoundingSphere(sphere);
    this.target.copy(sphere.center);
    const fov = (this.camera.fov * Math.PI) / 180;
    this.spherical.radius = sphere.radius / Math.sin(fov / 2) * 1.25;
    this.apply();
  }
}
