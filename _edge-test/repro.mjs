// 最小复现: 模块暴露 -> 两次 flyTo -> activateHotspot, 逐步打印
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
const snap = async tag => console.log(tag, await ev(`JSON.stringify({id:M.state.currentPointId,n:M.state.pointOrder.length,active:M.state.transition.active})`))

await ev(`new Promise(res=>{const s=document.createElement('script');s.type='module';
  s.textContent='import(\"/src/store/editor.js\").then(m=>{window.M=m;window.__m=true})';
  document.head.appendChild(s);const t=setInterval(()=>{if(window.__m){clearInterval(t);res(1)}},100)})`)
await new Promise(r => { const t = setInterval(() => ev("document.querySelectorAll('.point-item').length===2").then(v => { if (v === true) { clearInterval(t); r() } }), 300); setTimeout(() => r(), 15000) })
await snap('初始       :')

await ev("M.flyTo(90,0,{duration:300})")
await new Promise(r => setTimeout(r, 800))
await snap('flyTo(90)  :')

await ev("M.flyTo(-60,20,{duration:300,extraSpins:1})")
await new Promise(r => setTimeout(r, 800))
await snap('带圈飞行   :')

const before = await ev("M.state.currentPointId")
console.log('跳转前热点:', await ev(`JSON.stringify(M.state.points[${JSON.stringify(before)}].hotspots.map(h=>({t:h.targetPointId})))`))
await ev(`window.__b=${JSON.stringify(before)};window.__fin=false;
  M.activateHotspot(M.state.points[window.__b].hotspots.find(h=>h.targetPointId))
   .then(()=>window.__fin=true).catch(e=>window.__fin='ERR:'+e)`)
await new Promise(r => setTimeout(r, 2500))
await snap('热点跳转后 :')
console.log('fin flag:', await ev('String(window.__fin)'))
ws.close(); process.exit(0)
