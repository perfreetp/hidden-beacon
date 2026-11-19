const wsUrl = process.argv[2]
const ws = new WebSocket(wsUrl)
let id = 0
const pending = new Map()
function send(method, params = {}) {
  return new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })) })
}
ws.onmessage = e => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id) }
}
await new Promise(r => ws.onopen = r)
await send('Runtime.enable')
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value
console.log('bootErrors:', await ev('JSON.stringify(window.__bootErrors)'))
console.log('points:', await ev(`JSON.stringify([...document.querySelectorAll('.point-item')].map(e=>e.textContent.trim()))`))
console.log('canvas:', await ev(`(()=>{const c=document.querySelector('.pano-canvas');return JSON.stringify({w:c.width,h:c.height,cls:c.className})})()`))
// 检查 canvas 是否全黑: 取中心像素
console.log('pixel:', await ev(`(()=>{const c=document.querySelector('.pano-canvas');const x=c.getContext('2d');try{const d=x.getImageData(c.width/2|0,c.height/2|0,1,1).data;return JSON.stringify([...d])}catch(e){return e.message}})()`))
console.log('eqImage:', await ev(`(()=>{const i=document.querySelector('.eq-svg image');return JSON.stringify({exists:!!i,len:i?.href.baseVal.length||0})})()`))
console.log('markers:', await ev(`document.querySelectorAll('.marker-layer').length`))
ws.close(); process.exit(0)
