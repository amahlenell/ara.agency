// Optional local browser acceptance check against the isolated test provider.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
export async function browserCheck({origin,email,password}){
 const directory=path.resolve('work/studio-browser-qa');await fs.mkdir(directory,{recursive:true});
 const browser=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--disable-extensions','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=9248','--user-data-dir='+path.join(directory,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
 let client;
 try{
  let target;for(let attempt=0;attempt<50;attempt++){try{target=(await(await fetch('http://127.0.0.1:9248/json/list')).json()).find(item=>item.type==='page');if(target)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(target,'Chrome is available for the optional browser check');
  client=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{client.addEventListener('open',resolve,{once:true});client.addEventListener('error',reject,{once:true});});
  let sequence=0;const pending=new Map();client.addEventListener('message',event=>{const message=JSON.parse(event.data);const request=pending.get(message.id);if(request){pending.delete(message.id);message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);}});client.addEventListener('close',()=>{for(const request of pending.values())request.reject(new Error('Browser closed'));pending.clear();});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Browser check timed out: '+method));},10000);pending.set(id,{resolve:result=>{clearTimeout(timer);resolve(result);},reject:error=>{clearTimeout(timer);reject(error);}});client.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const waitFor=async expression=>{for(let attempt=0;attempt<100;attempt++){try{if(await evaluate(expression))return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Browser condition not met: '+expression);};
  await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:origin+'/studio/login'});await waitFor("!!document.querySelector('input[name=email]')");await new Promise(resolve=>setTimeout(resolve,500));
  await evaluate(`document.querySelector('input[name=email]').value=${JSON.stringify(email)};document.querySelector('input[name=password]').value=${JSON.stringify(password)};document.querySelector('form').requestSubmit();`);
  await waitFor("!!document.querySelector('.studio-shell')&&location.pathname==='/studio'");
  await call('Page.navigate',{url:origin+'/studio/prospects/new'});await waitFor("!!document.querySelector('input[name=business_name]')");await new Promise(resolve=>setTimeout(resolve,500));
  await evaluate("document.querySelector('input[name=business_name]').value='Browser Fixture Beauty';document.querySelector('input[name=website_url]').value='https://browser-fixture-beauty.co.za/';document.querySelector('input[name=industry]').value='Beauty & Wellness';document.querySelector('input[name=country]').value='South Africa';document.querySelector('.studio-prospect-form').requestSubmit();");
  await waitFor("document.querySelector('h1')?.textContent==='Browser Fixture Beauty'");
  assert.equal(await evaluate("!!document.querySelector('#activity')"),true);assert.equal(await evaluate("!!document.querySelector('script[src*=googletagmanager]')"),false);
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,1100]]){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<620});await new Promise(resolve=>setTimeout(resolve,300));assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Studio has no horizontal overflow');const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(directory,name+'.png'),Buffer.from(shot.data,'base64'));}
  await call('Browser.close').catch(()=>{});console.log('Browser check passed: real login form, staff dashboard, create-prospect form, persisted workspace/history, private analytics exclusion, desktop/mobile layout.');
 }finally{client?.close();browser.kill();}
}
