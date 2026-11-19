// 交互冒烟测试：拾取加点、闭合切换、导入导出、衔接预览、IndexedDB 恢复
import puppeteer from 'puppeteer'

const url = 'http://127.0.0.1:5176/'
const errors = []
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('[console] ' + m.text()) })
page.on('pageerror', e => errors.push('[pageerror] ' + e.message))

await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise(r => setTimeout(r, 2000))

// 1. 记录当前点数，然后在画布中央点击模型 -> 应新增一个控制点
const before = await page.evaluate(async () => (await import('/src/store.js')).store.path.points.length)
await page.mouse.click(500, 450)
await new Promise(r => setTimeout(r, 400))
const after = await page.evaluate(async () => (await import('/src/store.js')).store.path.points.length)
console.log(`拾取加点: ${before} -> ${after} ${after === before + 1 ? 'PASS' : 'FAIL'}`)

// 2. 切换闭合路径
await page.evaluate(async () => { (await import('/src/store.js')).store.path.closed = true })
await new Promise(r => setTimeout(r, 300))
const segInfo = await page.evaluate(async () => {
  const m = await import('/src/store.js')
  const s = m.getSpline()
  return { closed: m.store.path.closed, segCount: s.segCount, n: m.store.path.points.length }
})
console.log(`闭合路径: segCount=${segInfo.segCount} n=${segInfo.n} ${segInfo.segCount === segInfo.n ? 'PASS' : 'FAIL'}`)

// 3. 导出 -> 修改 -> 导入恢复
const roundtrip = await page.evaluate(async () => {
  const m = await import('/src/store.js')
  const snap = JSON.stringify(m.serialize())
  const data = JSON.parse(snap)
  // 模拟外部修改后导入
  data.speed.gear = 5
  data.transition = 1.2
  data.path.points[0].position = [1, 2, 3]
  m.applyData(data)
  const s2 = m.serialize()
  const ok = s2.speed.gear === 5 && s2.transition === 1.2 &&
    s2.path.points[0].position[0] === 1 && s2.path.closed === true &&
    Object.keys(s2.bindings).length > 0
  // 还原
  m.applyData(JSON.parse(snap))
  return ok
})
console.log(`导入导出往返: ${roundtrip ? 'PASS' : 'FAIL'}`)

// 4. 衔接预览
await page.evaluate(async () => {
  const m = await import('/src/store.js')
  m.store.tab = 'roam'
  m.store.preview.joint = 2
  m.store.preview.active = true
})
await new Promise(r => setTimeout(r, 1200))
await page.screenshot({ path: 'shot-preview.png' })
const previewOn = await page.evaluate(async () => (await import('/src/store.js')).store.preview.active)
console.log(`衔接预览: ${previewOn ? 'PASS' : 'FAIL'}`)
await page.evaluate(async () => { (await import('/src/store.js')).store.preview.active = false })

// 5. IndexedDB 持久化：改一个值、等自动保存、刷新、验证恢复
await page.evaluate(async () => { (await import('/src/store.js')).store.speed.gear = 4 })
await new Promise(r => setTimeout(r, 1200))
await page.reload({ waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 1500))
const restored = await page.evaluate(async () => (await import('/src/store.js')).store.speed.gear)
console.log(`IndexedDB 恢复: gear=${restored} ${restored === 4 ? 'PASS' : 'FAIL'}`)
await page.evaluate(async () => { (await import('/src/store.js')).store.speed.gear = 3 })

// 清理：删掉测试 1 添加的控制点并恢复闭合状态，等待自动保存
await page.evaluate(async () => {
  const m = await import('/src/store.js')
  const pts = m.store.path.points
  if (pts.length > 8) m.removePoint(pts[pts.length - 1].id)
  m.store.path.closed = false
})
await new Promise(r => setTimeout(r, 1200))

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS')
await browser.close()
