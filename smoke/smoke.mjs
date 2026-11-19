// 冒烟测试：加载页面，收集控制台错误，截图，并驱动各模块交互
import puppeteer from 'puppeteer'

const url = 'http://127.0.0.1:5176/'
const errors = []

const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()) })
page.on('pageerror', e => errors.push('[pageerror] ' + e.message))

await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise(r => setTimeout(r, 2500))
await page.screenshot({ path: 'shot-path.png' })

// 切到朝向目标页
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('nav button')]
  btns.find(b => b.textContent.includes('朝向'))?.click()
})
await new Promise(r => setTimeout(r, 600))
await page.screenshot({ path: 'shot-target.png' })

// 切到速度曲线页
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('nav button')]
  btns.find(b => b.textContent.includes('速度'))?.click()
})
await new Promise(r => setTimeout(r, 600))
await page.screenshot({ path: 'shot-speed.png' })

// 切到漫游页并播放
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('nav button')]
  btns.find(b => b.textContent.includes('漫游'))?.click()
})
await new Promise(r => setTimeout(r, 400))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('aside button')].find(b => b.textContent.includes('播放'))
  btn?.click()
})
await new Promise(r => setTimeout(r, 3000))
await page.screenshot({ path: 'shot-roam.png' })

// 读取 HUD 与状态
const state = await page.evaluate(() => ({
  hud: document.querySelector('.hud')?.textContent || '(no hud)',
  save: document.querySelector('.save')?.textContent || ''
}))
console.log('HUD:', state.hud)
console.log('SAVE:', state.save)

// 测试导出序列化（在页面上下文里走一遍 store）
const exported = await page.evaluate(async () => {
  const mod = await import('/src/store.js')
  return JSON.stringify(mod.serialize()).length
})
console.log('serialize length:', exported)

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS')
await browser.close()
