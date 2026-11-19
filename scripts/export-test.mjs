// 导出测试:点击导出按钮,验证 OBJ / PNG 下载落盘
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DL = process.env.TEMP + '\\terrain-dl';
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await page.goto('http://localhost:4519/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 5000));

// 先点一下坡面选中瓦片
await page.mouse.click(700, 600);
await new Promise((r) => setTimeout(r, 400));

const clickBtn = (cmd) => page.evaluate((c) => {
  document.querySelector('terrain-app').shadowRoot
    .querySelector('terrain-toolbar').shadowRoot
    .querySelector(`button[data-cmd="${c}"]`).click();
}, cmd);

await clickBtn('export-obj');
await new Promise((r) => setTimeout(r, 1500));
await clickBtn('export-height');
await new Promise((r) => setTimeout(r, 1500));

const msg = await page.evaluate(() =>
  document.querySelector('terrain-app').shadowRoot
    .querySelector('terrain-inspector').shadowRoot.querySelector('#pick').textContent);
console.log('MSG:', msg);
for (const f of fs.readdirSync(DL)) {
  const p = DL + '\\' + f;
  const size = fs.statSync(p).size;
  console.log('FILE:', f, size, 'bytes');
  if (f.endsWith('.obj')) {
    const head = fs.readFileSync(p, 'utf8').split('\n').slice(0, 5).join(' | ');
    console.log('OBJ head:', head);
  }
}
await browser.close();
