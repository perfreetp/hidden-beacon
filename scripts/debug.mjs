import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--use-angle=swiftshader'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 500)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http', r.status() + ']', r.url()); });
await page.goto('http://localhost:4519/', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 6000));
const state = await page.evaluate(() => {
  const app = document.querySelector('terrain-app');
  const out = { appDefined: !!customElements.get('terrain-app'), appConnected: !!app };
  if (app) {
    out.hasRenderer = !!app.renderer;
    out.hasTm = !!app.tm;
    out.tileCount = app.tm ? app.tm.loadedCount : -1;
    out.camY = app.camera ? app.camera.position.y.toFixed(1) : null;
    out.hudEl = !!app.hud;
    try { out.tickProbe = (app.tickRan ?? 'no-counter'); } catch { /* noop */ }
  }
  return out;
});
console.log('STATE:', JSON.stringify(state, null, 2));
await browser.close();
