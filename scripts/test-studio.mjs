// Isolated integration harness. No mock provider or auth bypass is mounted in the app.
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID,randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { runAudit } from '../src/server/studio/audits.ts';
import { AuditFailure } from '../src/server/studio/audit-network.ts';
const database=new PGlite();const root=process.cwd();const appPort=4184,providerPort=4185;
const origin=`http://127.0.0.1:${appPort}`;const userId=randomUUID(),sessionId=randomUUID();const password=randomBytes(24).toString('hex'),token=randomBytes(32).toString('hex');
const logDirectory=path.join(root,'work');await fs.mkdir(logDirectory,{recursive:true});const log=await fs.open(path.join(logDirectory,'studio-e2e.log'),'w');
let application;
await database.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;`);
await database.exec(await fs.readFile(path.join(root,'supabase/migrations/20261119034827_studio_foundation.sql'),'utf8'));
await database.exec(await fs.readFile(path.join(root,'supabase/migrations/20261119094142_website_audits.sql'),'utf8'));
await database.query('insert into auth.users values($1)',[userId]);await database.query('insert into auth.sessions values($1,$2)',[sessionId,userId]);
await database.query("insert into studio_users(auth_user_id,display_name,role) values($1,'Fixture Founder','admin')",[userId]);
let revoked=false;
const provider=createServer(async(request,response)=>{
 response.setHeader('content-type','application/json');const url=new URL(request.url,`http://127.0.0.1:${providerPort}`);
 try{
  let raw='';for await(const chunk of request){raw+=chunk;if(raw.length>30000)throw new Error('Fixture body limit');}const body=raw?JSON.parse(raw):{};
  if(url.pathname==='/auth/v1/token'){if(body.email!=='fixture-founder@example.com'||body.password!==password){response.statusCode=401;response.end('{}');return;}response.end(JSON.stringify({access_token:token,expires_in:3600}));return;}
  if(request.headers.authorization!==`Bearer ${token}`||revoked){response.statusCode=401;response.end('{}');return;}
  if(url.pathname==='/auth/v1/user'){response.end(JSON.stringify({id:userId,is_anonymous:false}));return;}
  if(url.pathname==='/auth/v1/logout'){revoked=true;await database.query('delete from auth.sessions where id=$1',[sessionId]);response.statusCode=204;response.end();return;}
  const result=await database.transaction(async tx=>{
   await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:userId,session_id:sessionId,is_anonymous:false})]);await tx.exec('set local role authenticated');
   if(url.pathname==='/rest/v1/studio_users'){const id=url.searchParams.get('auth_user_id')?.replace(/^eq\./,'');return (await tx.query('select id,auth_user_id,display_name,role,active from studio_users'+(id?' where auth_user_id=$1':''),id?[id]:[])).rows;}
   if(url.pathname==='/rest/v1/studio_activity_log'){const id=url.searchParams.get('entity_id')?.replace(/^eq\./,'');return(await tx.query('select * from studio_activity_log'+(id?' where entity_id=$1':'')+' order by created_at desc limit 50',id?[id]:[])).rows;}
   if(url.pathname==='/rest/v1/rpc/studio_dashboard')return(await tx.query('select studio_dashboard() result')).rows[0].result;
   if(url.pathname==='/rest/v1/studio_audits'){
    const id=url.searchParams.get('id')?.replace(/^eq\./,'');const prospect=url.searchParams.get('prospect_id')?.replace(/^eq\./,'');
    if(request.method==='POST')return(await tx.query('insert into studio_audits(prospect_id,requested_by,website_url) values($1,$2,$3) returning *',[body.prospect_id,body.requested_by,body.website_url])).rows;
    if(request.method==='PATCH')return(await tx.query("update studio_audits set status=$1,report=$2,error_message=$3 where id=$4 and status='running' returning *",[body.status,body.report?JSON.stringify(body.report):null,body.error_message||null,id])).rows;
    return(await tx.query('select * from studio_audits'+(id?' where id=$1':prospect?' where prospect_id=$1':'')+' order by created_at desc limit 50',id?[id]:prospect?[prospect]:[])).rows;
   }
   if(url.pathname==='/rest/v1/studio_prospects'){
    const columns=['business_name','website_url','normalized_domain','industry','country','city','contact_name','contact_email','contact_phone','social_links','business_description','source','priority','lifecycle_status','assigned_to','notes','follow_up_at','created_by'];
    const projection='*,to_char(updated_at at time zone \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') as updated_at';
    const id=url.searchParams.get('id')?.replace(/^eq\./,'');
    if(request.method==='POST'||request.method==='PATCH'){
     const keys=Object.keys(body);assert.ok(keys.every(key=>columns.includes(key)));const values=keys.map(key=>key==='social_links'?JSON.stringify(body[key]):body[key]);
     if(request.method==='POST')return(await tx.query(`insert into studio_prospects(${keys.join(',')}) values(${keys.map((_,index)=>'$'+(index+1)).join(',')}) returning ${projection}`,values)).rows;
     const version=url.searchParams.get('updated_at')?.replace(/^eq\./,'');return(await tx.query(`update studio_prospects set ${keys.map((key,index)=>`${key}=$${index+1}`).join(',')} where id=$${keys.length+1} and updated_at=$${keys.length+2} returning ${projection}`,[...values,id,version])).rows;
    }
    return(await tx.query(`select ${projection} from studio_prospects${id?' where id=$1':''} order by studio_prospects.updated_at desc limit 26`,id?[id]:[])).rows;
   }
   throw new Error('Unsupported fixture endpoint');
  });response.end(JSON.stringify(result));
 }catch(error){if(error.code!=='23505')console.error('Fixture provider:',url.pathname,error.message);response.statusCode=error.code==='23505'?409:error.code==='42501'?403:400;response.end(JSON.stringify({code:error.code||'fixture_error'}));}
});
try{
 await new Promise(resolve=>provider.listen(providerPort,'127.0.0.1',resolve));
 application=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(appPort)],{cwd:root,windowsHide:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${providerPort}`,SUPABASE_PUBLISHABLE_KEY:'fixture-publishable-key',STUDIO_ORIGIN:origin}});
 let ready=false;for(let attempt=0;attempt<100;attempt++){try{const response=await fetch(origin+'/studio/login');if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,'Fixture application started');
 const request=(route,method='GET',body,cookie)=>fetch(origin+route,{method,redirect:'manual',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const assertLoginRedirect=async response=>{if(response.status===307){assert.equal(response.headers.get('location'),'/studio/login');return;}assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('/studio/login')&&(html.includes('NEXT_REDIRECT')||html.includes('http-equiv="refresh"')),'Next streamed a login redirect');assert.ok(!html.includes('Fixture Founder'));assert.ok(!html.includes('Fixture Beauty'));};
 await assertLoginRedirect(await request('/studio'));
 assert.equal((await request('/studio/api/prospects','POST',{business_name:'Blocked'})).status,401);
 const login=await request('/studio/auth/login','POST',{email:'fixture-founder@example.com',password});assert.equal(login.status,200);const setCookie=login.headers.get('set-cookie');assert.ok(setCookie?.includes('HttpOnly'));assert.match(setCookie,/SameSite=strict/i);assert.match(setCookie,/Path=\/studio/);assert.match(setCookie,/Secure/);const cookie=setCookie.split(';')[0];
 assert.equal((await request('/studio','GET',undefined,cookie)).status,200);
 const base={business_name:'Fixture Beauty',website_url:'https://www.fixture-beauty.co.za/',industry:'Beauty & Wellness',country:'South Africa'};
 const created=await request('/studio/api/prospects','POST',base,cookie);assert.equal(created.status,201,await created.clone().text());const {id}=await created.json();
 const detail=await request('/studio/prospects/'+id,'GET',undefined,cookie);assert.equal(detail.status,200);const detailHtml=await detail.text();assert.ok(detailHtml.includes('Fixture Beauty'));assert.ok(detailHtml.includes('Activity history'));assert.match(detail.headers.get('x-robots-tag'),/noindex/);assert.match(detail.headers.get('cache-control'),/no-store/);
 assert.equal((await request('/studio/api/prospects','POST',base,cookie)).status,409);
 const version=(await database.query("select to_char(updated_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') version from studio_prospects where id=$1",[id])).rows[0].version;
 const edited=await request('/studio/api/prospects/'+id,'PATCH',{...base,notes:'Verified fixture note',lifecycle_status:'researching',expected_updated_at:version},cookie);assert.equal(edited.status,200,await edited.clone().text());
 assert.equal((await request('/studio/api/prospects/'+id,'PATCH',{...base,notes:'Stale fixture note',expected_updated_at:version},cookie)).status,409);
 const history=await database.query('select * from studio_activity_log where entity_id=$1',[id]);assert.equal(history.rows.length,2);assert.equal(history.rows[1].action,'stage_changed');assert.ok(!JSON.stringify(history.rows).includes('Verified fixture note'));
 const crossOrigin=await fetch(origin+'/studio/api/prospects',{method:'POST',headers:{origin:'https://other.test',cookie,'content-type':'application/json'},body:JSON.stringify(base)});assert.equal(crossOrigin.status,403);
 assert.equal((await request('/studio/api/prospects/'+id+'/audits','POST',{})).status,401);
 const blockedAudit=await fetch(origin+'/studio/api/prospects/'+id+'/audits',{method:'POST',headers:{origin:'https://other.test',cookie,'content-type':'application/json'},body:'{}'});assert.equal(blockedAudit.status,403);
 assert.equal((await request('/studio/api/prospects/'+id+'/audits','POST',{website_url:'http://127.0.0.1/'},cookie)).status,400);
 const staff=(await database.query('select id,auth_user_id,display_name,role,active from studio_users where auth_user_id=$1',[userId])).rows[0];
 const auditSession={token,staff,config:{url:`http://127.0.0.1:${providerPort}`,key:'fixture-publishable-key'}};
 const savedAudit=await runAudit(auditSession,id,async website=>({url:website,body:'<html lang="en"><title>Fixture beauty salon website</title><h1>Fixture salon</h1><img src="photo.jpg"></html>',status:200,headers:{'content-type':'text/html'},bytes:130,responseMs:100}));
 assert.equal(savedAudit.status,'completed');assert.ok(savedAudit.report.findings.length>10);
 const reportResponse=await request('/studio/audits/'+savedAudit.id,'GET',undefined,cookie);assert.equal(reportResponse.status,200);const reportHtml=await reportResponse.text();assert.ok(reportHtml.includes('Recommended next steps'));assert.ok(reportHtml.includes('Baseline HTML audit'));assert.ok(reportHtml.includes('Image alternatives'));assert.ok(!reportHtml.includes('Internal Server Error'));
 const auditIndex=await(await request('/studio/audits','GET',undefined,cookie)).text();assert.ok(auditIndex.includes(savedAudit.id));
 const auditedDetail=await(await request('/studio/prospects/'+id,'GET',undefined,cookie)).text();assert.ok(auditedDetail.includes('View audit report'));assert.ok(auditedDetail.includes('audit completed'));
 await assert.rejects(()=>runAudit(auditSession,id,async()=>{throw new Error('Must not fetch twice');}),/recently/);
 const second=await request('/studio/api/prospects','POST',{...base,business_name:'Failed audit fixture',website_url:'https://failed-audit-fixture.co.za/'},cookie);assert.equal(second.status,201);const secondId=(await second.json()).id;
 const failed=await runAudit(auditSession,secondId,async()=>{throw new AuditFailure('robots_blocked','Crawler rules disallow this page.');});assert.equal(failed.status,'failed');
 const failureHtml=await(await request('/studio/audits/'+failed.id,'GET',undefined,cookie)).text();assert.ok(failureHtml.includes('Crawler rules disallow'));assert.ok(failureHtml.includes('No successful report'));
 const publicHtml=await(await request('/')).text();assert.ok(!publicHtml.includes('Fixture Beauty'));assert.ok(!publicHtml.includes('href="/studio"'));
 if(process.argv.includes('--browser')){const {browserCheck}=await import('./studio-browser-check.mjs');await browserCheck({origin,email:'fixture-founder@example.com',password});}
 const logout=await request('/studio/auth/logout','POST',undefined,cookie);assert.equal(logout.status,303);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);await assertLoginRedirect(await request('/studio','GET',undefined,cookie));
 console.log('Studio end-to-end fixture passed: login, CRUD/history, audit service persistence, saved report/list/detail pages, failure reports, duplicate-run protection, audit CSRF and input validation, private headers, public-page isolation and logout.');
 console.log('Provider: isolated Auth/REST fixtures. Database: actual migration in PGlite. No live Supabase or prospect website was contacted.');
}finally{application?.kill();await new Promise(resolve=>provider.close(resolve));await database.close();await log.close();}
