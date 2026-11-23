import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { normalizeWebsite } from './domain.ts';

export class AuditFailure extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
function requestFailure(error: unknown, phase: 'crawler rules' | 'website page') {
  if (error instanceof AuditFailure) return error;
  const rawCode = (error as NodeJS.ErrnoException | null)?.code;
  const code = typeof rawCode === 'string' ? rawCode : undefined;
  if (error instanceof Error && (['AbortError', 'TimeoutError'].includes(error.name) || code === 'ETIMEDOUT')) {
    return new AuditFailure('timeout', `Studio timed out while requesting the ${phase}.`);
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new AuditFailure('network_permission', `Studio's host denied the outgoing connection while requesting the ${phase}.`);
  }
  if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return new AuditFailure('connection_failed', `Studio could not establish or maintain the connection while requesting the ${phase}.`);
  }
  if (code?.startsWith('ERR_TLS_') || code?.startsWith('ERR_SSL_') || code?.includes('CERT_') ||
      code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return new AuditFailure('tls_failed', `Studio could not verify the secure connection while requesting the ${phase}.`);
  }
  const reason = typeof code === 'string' && /^[A-Z0-9_]{1,60}$/.test(code) ? code : 'unknown';
  console.warn('Studio audit transport error', { phase, reason });
  return new AuditFailure('transport_failed', `Studio could not complete the request for the ${phase}.`);
}
export const auditAgent = 'ARAStudioAudit/1.0';
export type PageResponse = { url: string; status: number; headers: Record<string,string>; body: string; bytes: number; responseMs: number };
export function isPublicIPv4(address: string) {
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a===0 || a===10 || a===127 || a>=224 || (a===100&&b>=64&&b<=127) || (a===169&&b===254)
    || (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0||b===2||(b===88&&c===99)))
    || (a===198&&(b===18||b===19||(b===51&&c===100))) || (a===203&&b===0&&c===113));
}
export function auditURL(value: string) {
  let url: URL;
  try { url = new URL(normalizeWebsite(value).website_url); } catch { throw new AuditFailure('blocked_address','Only public HTTP or HTTPS websites can be audited.'); }
  if (url.port || /(^|\.)(lan|home|onion|arpa)$/.test(url.hostname)) throw new AuditFailure('blocked_address','Only public websites on their standard HTTP or HTTPS port can be audited.');
  return url;
}
export async function publicAddress(hostname: string, resolver = lookup) {
  // IPv4 only: fail closed on IPv6-only sites rather than permitting mapped/private IPv6 ranges.
  let addresses;
  try { addresses = await resolver(hostname,{all:true,family:4,verbatim:true}); }
  catch { throw new AuditFailure('dns_failed','The website hostname could not be resolved to a public IPv4 address.'); }
  if (!addresses.length || addresses.some(item=>!isPublicIPv4(item.address))) throw new AuditFailure('blocked_address','This website resolves to a private or reserved network address.');
  return addresses[0].address;
}
export async function readPublicPage(value: string, signal: AbortSignal, maxBytes = 1_500_000): Promise<PageResponse> {
  const url = auditURL(value);
  const address = await new Promise<string>((resolve,reject)=>{
    const abort=()=>reject(new AuditFailure('timeout','The website took too long to respond.'));
    if(signal.aborted){abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    publicAddress(url.hostname).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const start = performance.now();
    // Pin the validated address on this socket. No second DNS lookup, proxy, cookies or credentials.
    const request = (url.protocol==='https:'?httpsRequest:httpRequest)(url,{
      method:'GET', agent:false, signal, family:4,
      lookup:(_host,_options,callback)=>callback(null,address,4),
      headers:{'User-Agent':auditAgent,'Accept':'text/html, text/plain;q=0.8','Accept-Encoding':'identity'},
    },response=>{
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key,value])=>[key,Array.isArray(value)?value.join(', '):value||'']));
      const responseMs = Math.round(performance.now()-start);
      const chunks: Buffer[] = []; let bytes=0;
      response.on('error',reject);
      if (headers['content-encoding'] && headers['content-encoding']!=='identity') {
        response.destroy(); reject(new AuditFailure('unsupported_encoding','The website requires compressed responses that this audit cannot safely inspect.')); return;
      }
      if (Number(headers['content-length'])>maxBytes) {
        response.destroy(); reject(new AuditFailure('page_too_large','The page exceeds the audit size limit.')); return;
      }
      response.on('data',(chunk:Buffer)=>{
        bytes+=chunk.length;
        if (bytes>maxBytes) { response.destroy(new AuditFailure('page_too_large','The page exceeds the audit size limit.')); return; }
        chunks.push(chunk);
      });
      response.on('end',()=>resolve({url:url.href,status:response.statusCode||0,headers,body:Buffer.concat(chunks).toString('utf8'),bytes,responseMs}));
    });
    request.setTimeout(8000,()=>request.destroy(new AuditFailure('timeout','The website took too long to respond.')));
    request.on('error',reject); request.end();
  });
}

export function robotsAllows(text: string, target: URL) {
  const groups: {agents:string[];rules:{allow:boolean;path:string}[]}[]=[];
  let group: typeof groups[number]|undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line=raw.replace(/#.*/,'').trim(); const colon=line.indexOf(':'); if(colon<0)continue;
    const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
    if(key==='user-agent') { if(!group||group.rules.length){group={agents:[],rules:[]};groups.push(group);} group.agents.push(value.toLowerCase()); }
    else if(group&&(key==='allow'||key==='disallow')&&value)group.rules.push({allow:key==='allow',path:value});
  }
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'arastudioaudit'.startsWith(a)));
  const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  const path=target.pathname+target.search;
  const matching=selected.flatMap(g=>g.rules).filter(rule=>{
    const pattern=rule.path.replace(/\$$/,'').split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
    return new RegExp('^'+pattern+(rule.path.endsWith('$')?'$':'')).test(path);
  }).sort((a,b)=>b.path.replace(/[*$]/g,'').length-a.path.replace(/[*$]/g,'').length||Number(b.allow)-Number(a.allow));
  return matching[0]?.allow!==false;
}

type Reader = typeof readPublicPage;
const redirects = new Set([301,302,303,307,308]);
async function robotsFor(url: URL, signal: AbortSignal, read: Reader) {
  let current=new URL('/robots.txt',url);
  for(let hop=0;hop<=3;hop++) {
    const result=await read(current.href,signal,128_000);
    if(redirects.has(result.status)&&result.headers.location) { current=auditURL(new URL(result.headers.location,current).href); continue; }
    if(result.status===404||result.status===410)return;
    if(result.status===401||result.status===403)throw new AuditFailure('robots_blocked','The website does not allow this audit crawler.');
    if(result.status!==200)throw new AuditFailure('robots_unavailable','Crawler rules could not be checked. Try again later.');
    if(!robotsAllows(result.body,url))throw new AuditFailure('robots_blocked','The robots.txt rules disallow auditing this page.');
    return;
  }
  throw new AuditFailure('redirect_limit','The crawler rules redirect too many times.');
}
export async function fetchAuditPage(value: string, read: Reader = readPublicPage) {
  const signal=AbortSignal.timeout(22_000); let url=auditURL(value); const visited=new Set<string>();
  for(let hop=0;hop<=4;hop++) {
    signal.throwIfAborted();
    if(visited.has(url.href))throw new AuditFailure('redirect_loop','The website redirects in a loop.');
    visited.add(url.href);
    await robotsFor(url,signal,read).catch(error => { throw requestFailure(error, 'crawler rules'); });
    const page=await read(url.href,signal).catch(error => { throw requestFailure(error, 'website page'); });
    if(redirects.has(page.status)&&page.headers.location) { url=auditURL(new URL(page.headers.location,url).href);continue; }
    if(page.status<200||page.status>=300)throw new AuditFailure('http_error',`The website returned HTTP ${page.status}. No page report was generated.`);
    if(!/^(text\/html|application\/xhtml\+xml)\b/i.test(page.headers['content-type']||''))throw new AuditFailure('not_html','This URL does not return an HTML web page.');
    if(!page.body.trim())throw new AuditFailure('empty_page','The website returned an empty page.');
    return {...page,url:url.href};
  }
  throw new AuditFailure('redirect_limit','The website redirects too many times.');
}
