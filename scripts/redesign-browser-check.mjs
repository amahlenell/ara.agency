// Automated browser acceptance against this app and its disposable test data.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
export async function browserCheckRedesigns({ origin, email, password, designId, url }) {
  const directory = path.resolve('work/redesign-browser-qa'); await fs.mkdir(directory, { recursive: true });
  const browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9258', '--user-data-dir=' + path.join(directory, 'profile'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let client;
  try {
    let target; for (let i = 0; i < 60; i++) { try { target = (await (await fetch('http://127.0.0.1:9258/json/list')).json()).find(item => item.type === 'page'); if (target) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } assert.ok(target, 'QA Chrome started');
    client = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { client.addEventListener('open', resolve, { once: true }); client.addEventListener('error', reject, { once: true }); });
    let sequence = 0; const pending = new Map(); const browserErrors = [];
    client.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text); const task = pending.get(message.id); if (task) { pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); } });
    const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(Error('Browser timeout: ' + method)); }, 15000); pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } }); client.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    const waitFor = async expression => { for (let i = 0; i < 200; i++) { if (await evaluate(expression).catch(() => false)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw Error('Browser condition: ' + expression); };
    const screenshot = async name => { const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await fs.writeFile(path.join(directory, name + '.png'), Buffer.from(shot.data, 'base64')); };
    await call('Page.enable'); await call('Runtime.enable'); await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: origin + '/studio/login' }); await waitFor("!!document.querySelector('input[name=email]')"); await new Promise(resolve => setTimeout(resolve, 700));
    await evaluate(`document.querySelector('input[name=email]').value=${JSON.stringify(email)};document.querySelector('input[name=password]').value=${JSON.stringify(password)};document.querySelector('form').requestSubmit()`);
    await waitFor("!!document.querySelector('.studio-shell')&&location.pathname==='/studio'");
    await call('Page.navigate', { url: origin + '/studio/redesigns/' + designId }); await waitFor("!!document.querySelector('.redesign-workbench')"); await new Promise(resolve => setTimeout(resolve, 700));
    assert.equal(await evaluate("document.querySelector('.beauty-site')?.textContent.includes('Fixture Salon')"), true);
    assert.equal(await evaluate("!!document.querySelector('script[src*=googletagmanager]')"), false);
    await screenshot('editor-desktop');
    // Controlled input update must refresh the live canvas before any save.
    await evaluate("(()=>{const field=document.querySelector('input[name=\"brand.name\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'Live canvas edit');field.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await waitFor("document.querySelector('.beauty-site')?.textContent.includes('Live canvas edit')");
    await evaluate("Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Discard edits').click()");
    await waitFor("document.querySelector('.beauty-site')?.textContent.includes('Fixture Salon')");
    await evaluate("Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Before / after').click()");
    await waitFor("document.querySelector('.redesign-original img')?.complete");
    await screenshot('comparison-desktop');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 1050, deviceScaleFactor: 1, mobile: true });
    await new Promise(resolve => setTimeout(resolve, 300)); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, 'Mobile editor fits'); await screenshot('editor-mobile');
    await call('Page.navigate', { url }); await waitFor("!!document.querySelector('.shared-preview-banner')");
    const secretFragment = new URL(url).hash;
    await evaluate("document.querySelector('.beauty-header a[href=\"#beauty-services\"]').click()");
    assert.equal(await evaluate('location.hash'), secretFragment, 'Section navigation preserves the private link');
    await evaluate("window.scrollTo({top:0,behavior:'instant'})");
    assert.equal(await evaluate("document.querySelector('.beauty-site')?.textContent.includes('Fixture Salon')"), true); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, 'Mobile shared template fits'); await screenshot('shared-mobile');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false }); await new Promise(resolve => setTimeout(resolve, 200)); await screenshot('shared-desktop');
    assert.deepEqual(browserErrors, []); await call('Browser.close').catch(() => {}); console.log('Browser acceptance passed: real login, live editing, before/after image, desktop/mobile layout, approved private preview and no client exceptions.');
  } finally { client?.close(); browser.kill(); }
}
