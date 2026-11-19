const wsUrl = process.argv[2]
const ws = new WebSocket(wsUrl)
let id = 0
const pending = new Map()
const logs = []
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
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push('console.' + msg.params.type + ': ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '))
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    logs.push('EXCEPTION: ' + (d.exception?.description || d.text))
  }
  if (msg.method === 'Log.entryAdded') logs.push('LOG: ' + JSON.stringify(msg.params.entry))
}
await new Promise(r => ws.onopen = r)
await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Page.reload', { ignoreCache: true })
await new Promise(r => setTimeout(r, 10000))
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({ url: location.href, appHtml: document.getElementById('app')?.innerHTML?.slice(0,200), boot: typeof window.__bootErrors })`,
  returnByValue: true
})
console.log('PAGE:', r.result.value)
console.log('--- LOGS ---')
console.log(logs.join('\n') || '(none)')
ws.close(); process.exit(0)
