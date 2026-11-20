// STL(二进制)/ OBJ(ASCII)导出,输入为 worker 传来的可序列化 mesh
// { numProp, vertProperties: Float32|number[], triVerts: Uint32|number[] }

function asF32(a) {
  return a instanceof Float32Array ? a : new Float32Array(a);
}
function asU32(a) {
  return a instanceof Uint32Array ? a : new Uint32Array(a);
}

// 二进制 STL,单位 mm
export function buildSTL(mesh, name = 'truss') {
  const vp = asF32(mesh.vertProperties);
  const tv = asU32(mesh.triVerts);
  const numProp = mesh.numProp;
  const triCount = tv.length / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // 80 字节头
  const header = new TextEncoder().encode(`Binary STL ${name}`);
  bytes.set(header.slice(0, 80), 0);
  dv.setUint32(80, triCount, true);

  let offset = 84;
  for (let i = 0; i < triCount; i += 1) {
    const ia = tv[i * 3] * numProp;
    const ib = tv[i * 3 + 1] * numProp;
    const ic = tv[i * 3 + 2] * numProp;
    const ax = vp[ia];
    const ay = vp[ia + 1];
    const az = vp[ia + 2];
    const bx = vp[ib];
    const by = vp[ib + 1];
    const bz = vp[ib + 2];
    const cx = vp[ic];
    const cy = vp[ic + 1];
    const cz = vp[ic + 2];
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    dv.setFloat32(offset, nx, true);
    dv.setFloat32(offset + 4, ny, true);
    dv.setFloat32(offset + 8, nz, true);
    dv.setFloat32(offset + 12, ax, true);
    dv.setFloat32(offset + 16, ay, true);
    dv.setFloat32(offset + 20, az, true);
    dv.setFloat32(offset + 24, bx, true);
    dv.setFloat32(offset + 28, by, true);
    dv.setFloat32(offset + 32, bz, true);
    dv.setFloat32(offset + 36, cx, true);
    dv.setFloat32(offset + 40, cy, true);
    dv.setFloat32(offset + 44, cz, true);
    dv.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return new Blob([buffer], { type: 'model/stl' });
}

// OBJ ASCII,单位 mm;非索引三角面,每面 3 顶点
export function buildOBJ(mesh, name = 'truss') {
  const vp = asF32(mesh.vertProperties);
  const tv = asU32(mesh.triVerts);
  const numProp = mesh.numProp;
  const lines = [`# OBJ export ${name}`, 'o truss'];
  const triCount = tv.length / 3;
  for (let i = 0; i < triCount; i += 1) {
    const ia = tv[i * 3] * numProp;
    const ib = tv[i * 3 + 1] * numProp;
    const ic = tv[i * 3 + 2] * numProp;
    lines.push(`v ${vp[ia].toFixed(4)} ${vp[ia + 1].toFixed(4)} ${vp[ia + 2].toFixed(4)}`);
    lines.push(`v ${vp[ib].toFixed(4)} ${vp[ib + 1].toFixed(4)} ${vp[ib + 2].toFixed(4)}`);
    lines.push(`v ${vp[ic].toFixed(4)} ${vp[ic + 1].toFixed(4)} ${vp[ic + 2].toFixed(4)}`);
    lines.push(`f ${i * 3 + 1} ${i * 3 + 2} ${i * 3 + 3}`);
  }
  return new Blob([lines.join('\n') + '\n'], { type: 'model/obj' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
