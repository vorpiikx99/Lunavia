import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const browser = await chromium.launch({ executablePath:'/usr/bin/google-chrome', headless:true, args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{width:390,height:780}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const page = await ctx.newPage();
const logs=[]; page.on('console',m=>logs.push(m.type()+': '+m.text())); page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
await page.route('**/*', async route => {
  const u = route.request().url();
  if (u === 'https://app.test/') return route.fulfill({ contentType:'text/html', body: fs.readFileSync('test/spike.html','utf8') });
  if (u.includes('cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js')) return route.fulfill({ contentType:'application/javascript', body: fs.readFileSync('node_modules/maplibre-gl/dist/maplibre-gl.js','utf8') });
  return route.abort();
});
await page.goto('https://app.test/');
await page.waitForFunction('window.idle===true',{timeout:20000}).catch(e=>logs.push('TIMEOUT idle'));
console.log(await page.evaluate('({loaded:window.loaded,idle:window.idle,errs:window.errs,net:window.net,gl:!!document.querySelector("canvas")})'));
await page.screenshot({ path:'test/spike.png' });
console.log(logs.join('\n'));
await browser.close();
