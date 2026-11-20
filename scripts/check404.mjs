import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--disable-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('response', (r) => { if (r.status() === 404) console.log('404:', r.url()); });
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 3000));
await browser.close();
