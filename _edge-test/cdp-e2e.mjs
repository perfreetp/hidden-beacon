// 端到端验证 v5: 使用应用自身暴露的 window.__editor / __geo (同一模块实例)
const ws = new WebSocket(process.argv[2])
let id = 0
const pending = new Map()
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) } }
await new Promise(r => ws.onopen = r)
await send('Runtime.enable')
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
async function waitTrue(jsExpr, ms = 8000) {
  return ev(`new Promise(resolve => {
    const t0 = performance.now()
    const timer = setInterval(() => {
      try { if (${jsExpr}) { clearInterval(timer); resolve(true); return } } catch (e) {}
      if (performance.now() - t0 > ${ms}) { clearInterval(timer); resolve(false) }
    }, 80)
  })`)
}
// M/GEO 直接取应用挂的全局
await waitTrue("window.__editor && window.__geo", 10000)
await ev("window.M = window.__editor; window.GEO = window.__geo")
if (!(await waitTrue("document.querySelectorAll('.point-item').length === 2", 15000))) { console.log('演示数据未就绪'); process.exit(1) }
console.log('1) 两点位就绪 ✓  state 点数 =', await ev("M.state.pointOrder.length"))

await ev("window.__d = false; M.flyTo(90, 0, {duration: 400}).then(() => window.__d = true)")
await waitTrue("window.__d === true")
const yaw2 = Number(await ev("M.state.view.yaw"))
console.log('2) 飞行 yaw =', yaw2.toFixed(2), Math.abs(yaw2 - 90) < 0.1 ? '✓' : '✗')

await ev("window.__d = false; M.flyTo(-60, 20, {duration: 600, extraSpins: 1}).then(() => window.__d = true)")
await waitTrue("window.__d === true")
const y3 = Number(await ev("M.state.view.yaw")), p3 = Number(await ev("M.state.view.pitch"))
console.log('3) 带圈飞行 =', y3.toFixed(1), p3.toFixed(1), (Math.abs(y3 + 60) < 0.1 && Math.abs(p3 - 20) < 0.1) ? '✓' : '✗')

const before4 = await ev("M.state.currentPointId")
await ev("window.__done4 = false; " +
  "M.activateHotspot(M.state.points[M.state.currentPointId].hotspots.find(x => x.targetPointId)).then(() => window.__done4 = true)")
await waitTrue("window.__done4 === true")
const after4 = await ev("M.state.currentPointId")
console.log('4) 热点跳转换点:', after4 !== before4 ? '✓' : '✗', '→', await ev("M.state.points[M.state.currentPointId].name"), '| 剩余点数', await ev("M.state.pointOrder.length"))

const pkgInfo = await ev(`JSON.stringify((function () {
  const p = M.exportPackage()
  return {
    format: p.format, points: p.points.length, links: p.links.length,
    sixFaces: p.points.every(x => Object.keys(x.faces).length === 6),
    equirect: p.points.every(x => x.equirect && x.equirect.indexOf('data:image') === 0),
    hotspots: p.points.reduce((s, x) => s + x.hotspots.length, 0),
    annotations: p.points.reduce((s, x) => s + x.annotations.length, 0),
    comments: p.points.reduce((s, x) => s + x.comments.length, 0),
    gainFaces: Object.keys(p.points[0].gains || {}).length
  }
})())`)
console.log('5) 漫游包:', pkgInfo)

const pickErr = await ev(`(function () {
  let e = 0
  const cases = [[0,0],[.8,.7],[-.8,.7],[.8,-.7],[-.8,-.7]]
  for (const c of cases) for (const fov of [30,75,110]) for (const pitch of [0,70,-80]) {
    M.setView(47, pitch, fov)
    const q = GEO.unprojectToPolar(c[0], c[1], 47, pitch, fov)
    const pr = GEO.projectDirection(GEO.polarToVec(q[0], q[1]), 47, pitch, fov)
    e = Math.max(e, Math.max(Math.abs(pr.x - c[0]), Math.abs(pr.y - c[1])) * fov * 0.5)
  }
  return e
})()`)
console.log('6) 最大拾取误差 =', Number(pickErr).toFixed(6) + '°', Number(pickErr) < 1 ? '✓' : '✗')

const cmDelta = await ev(`(function () {
  const n = M.currentPoint.value.comments.length
  M.addComment(M.state.currentPointId, 12, 34, '测试留言', '测试员')
  return M.currentPoint.value.comments.length - n
})()`)
console.log('7) 留言新增:', cmDelta === 1 ? '✓' : '✗ (' + cmDelta + ')')

const arrowMoved = await ev(`(function () {
  const a = M.currentPoint.value.annotations[0]
  const p1 = M.projectPoint(a.heading, a.lat)
  a.heading = a.heading + 90
  const p2 = M.projectPoint(a.heading, a.lat)
  return Math.hypot(p1.x - p2.x, p1.y - p2.y) > 0.5
})()`)
console.log('8) 朝向箭头随视角转动:', arrowMoved === true ? '✓' : '✗ (' + arrowMoved + ')')

await ev("window.__pkg = JSON.stringify(M.exportPackage()); window.__imp = false; M.importPackage(window.__pkg).then(() => window.__imp = true)")
await waitTrue("window.__imp === true")
console.log('9) 导入往返:', await ev(`JSON.stringify({
  points: M.state.pointOrder.length,
  hotspots: M.state.points[M.state.pointOrder[0]].hotspots.length,
  hasEq: !!M.state.points[M.state.pointOrder[0]].equirect
})`))

console.log('bootErrors:', await ev("JSON.stringify(window.__bootErrors)"))
ws.close(); process.exit(0)
