import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditURL,isPublicIPv4,publicAddress,robotsAllows,fetchAuditPage } from '../src/server/studio/audit-network.ts';
import type { PageResponse } from '../src/server/studio/audit-network.ts';
import { analyzePage } from '../src/server/studio/audit-report.ts';

const page=(url:string,body='<html><title>Fixture business website</title></html>',status=200,headers:Record<string,string>={}):PageResponse=>({url,body,status,headers:{'content-type':'text/html',...headers},bytes:Buffer.byteLength(body),responseMs:100});
test('audit targets reject private, encoded IP, credential, scheme and nonstandard-port destinations',()=>{
 for(const url of ['http://127.0.0.1','http://2130706433','http://0x7f000001','http://169.254.169.254','http://[::ffff:127.0.0.1]','http://user:pass@public.co.za/','file:///etc/passwd','https://public.co.za:8080/','http://private.home/'])assert.throws(()=>auditURL(url));
 assert.equal(auditURL('https://www.public.co.za/#section').href,'https://www.public.co.za/');
 for(const ip of ['0.0.0.0','10.1.1.1','127.0.0.1','169.254.169.254','100.64.1.1','172.31.1.1','192.0.0.1','192.168.1.1','192.0.2.1','198.51.100.1','203.0.113.5','224.0.0.1','255.255.255.255','::1','::ffff:8.8.8.8'])assert.equal(isPublicIPv4(ip),false,ip);
 assert.equal(isPublicIPv4('8.8.8.8'),true);
});
test('DNS validation rejects mixed public/private answers before opening a socket',async()=>{
 const resolver=async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}];
 await assert.rejects(()=>publicAddress('rebind.co.za',resolver as typeof import('node:dns/promises').lookup),/private or reserved/);
});
test('robots rules apply agent-specific groups, wildcards, longest match and allow ties',()=>{
 const target=(path:string)=>new URL(path,'https://fixture.co.za');
 assert.equal(robotsAllows('User-agent: *\nDisallow: /',target('/')),false);
 assert.equal(robotsAllows('User-agent: *\nDisallow: /private*\nAllow: /private/public',target('/private/public')),true);
 assert.equal(robotsAllows('User-agent: *\nDisallow: /\nUser-agent: ARAStudioAudit\nAllow: /',target('/')),true);
 assert.equal(robotsAllows('User-agent: *\nDisallow: /a$\nAllow: /a',target('/a')),true);
 assert.equal(robotsAllows('User-agent: *\nDisallow:',target('/')),true);
});
test('a redirect to an internal address is rejected before a second request',async()=>{
 const calls:string[]=[];
 await assert.rejects(()=>fetchAuditPage('https://fixture.co.za/',async url=>{calls.push(url);return url.endsWith('/robots.txt')?page(url,'',404):page(url,'',302,{location:'http://127.0.0.1/secret'});}),/public/);
 assert.equal(calls.length,2);
});
test('robots disallow prevents the page fetch; unavailable robots fails closed',async()=>{
 let calls=0;
 await assert.rejects(()=>fetchAuditPage('https://fixture.co.za/',async url=>{calls++;return page(url,'User-agent: *\nDisallow: /');}),/disallow/);
 assert.equal(calls,1);
 await assert.rejects(()=>fetchAuditPage('https://fixture.co.za/',async url=>page(url,'',503)),/crawler rules|Crawler rules/);
});
test('successful redirects check robots on the final origin and reject non-HTML and HTTP errors',async()=>{
 const calls:string[]=[];
 const result=await fetchAuditPage('http://fixture.co.za/',async url=>{
  calls.push(url);if(url.endsWith('robots.txt'))return page(url,'',404);
  return url.startsWith('http:')?page(url,'',301,{location:'https://www.fixture.co.za/'}):page(url);
 });
 assert.equal(result.url,'https://www.fixture.co.za/');assert.ok(calls.includes('https://www.fixture.co.za/robots.txt'));
 await assert.rejects(()=>fetchAuditPage('https://fixture.co.za/',async url=>url.endsWith('robots.txt')?page(url,'',404):page(url,'{}',200,{'content-type':'application/json'})),/HTML/);
 await assert.rejects(()=>fetchAuditPage('https://fixture.co.za/',async url=>page(url,'',403)),/allow|rules/);
});
test('reports provide evidence and recommendations without claiming browser measurements',()=>{
 const html='<html lang="en"><head><title>A useful business website</title><meta name="description" content="A clear description of this business and the services offered to visitors every day."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="/"></head><body><h1>Our business</h1><img src="a.png" alt=""><label for="name">Your name</label><input id="name"><a href="/contact">Contact us</a><script>throw new Error("must never execute")</script></body></html>';
 const report=analyzePage(page('https://fixture.co.za/',html),'https://fixture.co.za/');
 assert.equal(report.checksPassed,report.checksTotal);assert.equal(report.findings.filter(f=>f.status==='manual').length,4);
 assert.equal(report.findings.find(f=>f.id==='image-alt')?.status,'pass');assert.equal(report.findings.find(f=>f.id==='form-labels')?.status,'pass');
 assert.ok(report.limitations.some(item=>item.includes('not a Lighthouse')));
 const bad=analyzePage(page('http://fixture.co.za/','<html><meta name=robots content=noindex><img src=x><input><script src=x></script></html>'),'http://fixture.co.za/');
 for(const id of ['title','description','h1','language','viewport','image-alt','form-labels','indexing','https','contact-action'])assert.equal(bad.findings.find(f=>f.id===id)?.status,'warning',id);
 assert.ok(bad.findings.filter(f=>f.status==='warning').every(f=>f.recommendation.length>20));
});
