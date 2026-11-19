// CDP 诊断: 读取启动错误与应用状态
const wsUrl = process.argv[2]
const ws = new WebSocket(wsUrl)
let id = 0
const pending = new Map()
function send(method, params = {}) {
  return new Promise(res => {
    const mid = ++id
    pending.set(mid, res)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}
ws.onmessage = e => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id) }
}
await new Promise(r => ws.onopen = r)
await send('Runtime.enable')
await new Promise(r => setTimeout(r, 8000)) // 等 loadDemo 跑完
const expr = `JSON.stringify({
  errors: window.__bootErrors,
  points: Object.keys(window).__x,
  state: (() => { try { return null } catch (e) { return String(e) } })()
})`
const r1 = await send('Runtime.evaluate', { expression: "JSON.stringify(window.__bootErrors)", returnByValue: true })
console.log('BOOT ERRORS:', r1.result.value)
const r2 = await send('Runtime.evaluate', {
  expression: `(() => {
    const c = document.querySelector('.pano-canvas');
    return JSON.stringify({ cw: c?.width, ch: c?.height, pointItems: document.querySelectorAll('.point-item').length })
  })()`,
  returnByValue: true
})
console.log('CANVAS:', r2.result.value)
const r3 = await send('Runtime.evaluate', {
  expression: `(() => {
    const img = document.querySelector('.eq-svg image');
    return JSON.stringify({ hasMapImage: !!img, hrefLen: img?.href?.baseVal?.length || 0 })
  })()`,
  returnByValue: true
})
console.log('EQ MAP:', r3.result.value)
ws.close()
process.exit(0)
