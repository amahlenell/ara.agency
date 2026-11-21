// Own-app acceptance test: real Next routes and SQL, isolated Auth/REST/Storage.
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { newRedesignContent } from '../src/server/studio/redesign-content.ts';
const phase5Mode=process.argv.includes('--projects');
const phase4Mode=phase5Mode||process.argv.includes('--outreach');
const root = process.cwd(), appPort = phase4Mode?4204:4194, providerPort = phase4Mode?4205:4195;
const origin = `http://127.0.0.1:${appPort}`, providerOrigin = `http://127.0.0.1:${providerPort}`;
const userId = randomUUID(), sessionId = randomUUID(), token = randomBytes(32).toString('hex'), password = randomBytes(24).toString('hex');
const db = new PGlite(), files = new Map(); let application;
await fs.mkdir('work', { recursive: true }); const log = await fs.open(phase4Mode?'work/outreach-e2e.log':'work/redesign-e2e.log', 'w');
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;
 grant select,insert,delete on storage.objects to authenticated;grant select on storage.objects to anon;`);
for (const name of ['20261119034827_studio_foundation.sql', '20261119094142_website_audits.sql']) await db.exec(await fs.readFile('supabase/migrations/' + name, 'utf8'));
const phase3 = (await fs.readdir('supabase/migrations')).find(name => name.endsWith('_studio_redesigns.sql'));
await db.exec(await fs.readFile(phase3 ? 'supabase/migrations/' + phase3 : 'work/studio-redesigns.sql', 'utf8'));
await db.exec(await fs.readFile("supabase/migrations/20261121021603_studio_site_redesigns.sql","utf8"));
for (const name of (await fs.readdir('supabase/migrations')).filter(name => name.endsWith('_studio_redesign_indexes.sql'))) await db.exec(await fs.readFile('supabase/migrations/' + name, 'utf8'));
{const name=(await fs.readdir('supabase/migrations')).find(name=>name.endsWith('_studio_outreach.sql'));await db.exec(await fs.readFile(name?'supabase/migrations/'+name:'work/studio-outreach.sql','utf8'));}
{ const name=(await fs.readdir('supabase/migrations')).find(name=>name.endsWith('_studio_projects.sql')); await db.exec(await fs.readFile(name?'supabase/migrations/'+name:'work/studio-projects.sql','utf8')); }
await db.query('insert into auth.users values($1)', [userId]); await db.query('insert into auth.sessions values($1,$2)', [sessionId, userId]);
await db.query("insert into studio_users(auth_user_id,display_name,role) values($1,'Redesign QA','admin')", [userId]);
const authenticated = async (fn, anon = false) => db.transaction(async tx => {
  await tx.query("select set_config('request.jwt.claims',$1,true)", [anon ? '{}' : JSON.stringify({ sub: userId, session_id: sessionId })]);
  await tx.exec('set local role ' + (anon ? 'anon' : 'authenticated')); return fn(tx);
});
const prospect = (await authenticated(tx => tx.query("insert into studio_prospects(business_name,website_url,industry,country) values('Fixture Salon','https://fixture-salon.co.za/','Beauty & Wellness','South Africa') returning *"))).rows[0];
let outreachAuditId;
if(phase4Mode){const {analyzePage}=await import('../src/server/studio/audit-report.ts');const report=analyzePage({url:prospect.website_url,body:'<html lang="en"><h1>Fixture Salon</h1></html>',status:200,headers:{'content-type':'text/html'},bytes:50,responseMs:20},prospect.website_url);await authenticated(async tx=>{outreachAuditId=(await tx.query('insert into studio_audits(prospect_id,requested_by,website_url) values($1,(select id from studio_users where auth_user_id=$2),$3) returning id',[prospect.id,userId,prospect.website_url])).rows[0].id;await tx.query("update studio_audits set status='completed',report=$1 where id=$2",[JSON.stringify(report),outreachAuditId]);});}
const provider = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json'); const url = new URL(request.url, providerOrigin);
  try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk); const raw = Buffer.concat(chunks);
    const body = raw.length && request.headers['content-type']?.includes('application/json') ? JSON.parse(raw) : {};
    if (url.pathname === '/auth/v1/token') { assert.equal(body.email, 'redesign-qa@example.com'); assert.equal(body.password, password); response.end(JSON.stringify({ access_token: token, expires_in: 3600 })); return; }
    const anon = url.pathname === '/rest/v1/rpc/studio_read_redesign_demo';
    if (!anon && request.headers.authorization !== 'Bearer ' + token) { response.statusCode = 401; response.end('{}'); return; }
    if (url.pathname === '/auth/v1/user') { response.end(JSON.stringify({ id: userId, is_anonymous: false })); return; }
    const result = await authenticated(async tx => {
      const id = url.searchParams.get('id')?.replace(/^eq\./, ''), parent = url.searchParams.get('prospect_id')?.replace(/^eq\./, '');
      if (url.pathname === '/rest/v1/studio_users') return (await tx.query('select id,auth_user_id,display_name,role,active from studio_users')).rows;
      if (url.pathname === '/rest/v1/studio_prospects') {
 if(request.method==='PATCH'){const keys=Object.keys(body);assert.ok(keys.every(key=>['lifecycle_status','assigned_to','priority','follow_up_at'].includes(key)));return(await tx.query('update studio_prospects set '+keys.map((key,i)=>key+'=$'+(i+1)).join(',')+' where id=$'+(keys.length+1)+' and updated_at=$'+(keys.length+2)+' returning to_jsonb(studio_prospects) result',[...keys.map(key=>body[key]),id,url.searchParams.get('updated_at')?.replace(/^eq\./,'')])).rows.map(row=>row.result);}
 return (await tx.query('select to_jsonb(prospect) result from studio_prospects prospect'+(id?' where id=$1':'')+' limit 26',id?[id]:[])).rows.map(row=>row.result);
}
if (url.pathname === '/rest/v1/studio_audits') return (await tx.query('select * from studio_audits'+(id?' where id=$1':parent?' where prospect_id=$1':''),id?[id]:parent?[parent]:[])).rows;
      if (url.pathname === '/rest/v1/studio_activity_log') return (await tx.query('select * from studio_activity_log order by created_at desc limit 50')).rows;
      if (url.pathname === '/rest/v1/rpc/studio_dashboard') return (await tx.query('select studio_dashboard() result')).rows[0].result;
      if (url.pathname === '/rest/v1/studio_redesigns') return (await tx.query('select * from studio_redesigns' + (id ? ' where id=$1' : parent ? ' where prospect_id=$1' : '') + ' order by updated_at desc limit 50', id ? [id] : parent ? [parent] : [])).rows;
      if (url.pathname === '/rest/v1/studio_redesign_demos') { const designId = url.searchParams.get('redesign_id')?.replace(/^eq\./, ''); return (await tx.query('select id,redesign_id,revision,expires_at,revoked_at,created_by,created_at from studio_redesign_demos where redesign_id=$1 order by created_at desc', [designId])).rows; }
      if(url.pathname==='/rest/v1/studio_outreach'){const join=url.searchParams.get('select')?.includes('prospect:');return(await tx.query('select message.*'+(join?",jsonb_build_object('id',prospect.id,'business_name',prospect.business_name,'lifecycle_status',prospect.lifecycle_status) prospect":'')+' from studio_outreach message join studio_prospects prospect on prospect.id=message.prospect_id'+(id?' where message.id=$1':parent?' where message.prospect_id=$1':'')+' order by message.updated_at desc',id?[id]:parent?[parent]:[])).rows;}
if(url.pathname==='/rest/v1/studio_outreach_preferences')return(await tx.query('select * from studio_outreach_preferences where prospect_id=$1',[parent])).rows;
if(url.pathname==='/rest/v1/studio_projects'){const where=id?'id=$1':parent?'prospect_id=$1':'true';return (await tx.query('select * from studio_projects where '+where,id?[id]:parent?[parent]:[])).rows;}
const rpc = async (sql, values) => (await tx.query(sql + ' result', values)).rows[0].result;
      if(url.pathname==='/rest/v1/rpc/studio_project_command')return rpc('select studio_project_command($1,$2,$3,$4,$5,$6)',[body.p_id,body.p_action,body.p_revision,JSON.stringify(body.p_details),body.p_confirmed||false,body.p_prospect_version||null]);
if(url.pathname==='/rest/v1/rpc/studio_outreach_command')return rpc('select studio_outreach_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[body.p_id,body.p_action,body.p_revision,body.p_content?JSON.stringify(body.p_content):null,body.p_audit||null,body.p_reply_to||null,body.p_note||'',body.p_confirmed||false,body.p_follow_up||null,body.p_prospect_version||null]);
if(url.pathname==='/rest/v1/rpc/studio_set_outreach_preference')return rpc('select studio_set_outreach_preference($1,$2,$3,$4,$5)',[body.p_id,body.p_blocked,body.p_revision,body.p_reason,body.p_confirmed]);
if(url.pathname==='/rest/v1/rpc/studio_pipeline')return rpc('select studio_pipeline($1,$2,$3,$4,$5,$6,$7)',[body.p_query,body.p_owner,body.p_priority,body.p_due,body.p_stage,body.p_view,body.p_page]);
if (url.pathname === '/rest/v1/rpc/studio_redesign_command') return rpc('select studio_redesign_command($1,$2,$3,$4,$5,$6,$7)', [body.p_id, body.p_action, body.p_revision, body.p_content ? JSON.stringify(body.p_content) : null, body.p_note || '', body.p_reference || null, body.p_confirmed || false]);
      if (url.pathname === '/rest/v1/rpc/studio_create_redesign_demo') return rpc('select studio_create_redesign_demo($1,$2,$3,$4)', [body.p_id, body.p_revision, body.p_hash, body.p_days]);
      if (url.pathname === '/rest/v1/rpc/studio_revoke_redesign_demo') return rpc('select studio_revoke_redesign_demo($1)', [body.p_id]);
      if (anon) return rpc('select studio_read_redesign_demo($1,$2)', [body.p_id, body.p_hash]);
      const bucket = 'studio-redesign-references', prefix = '/storage/v1/object/';
      if (url.pathname.startsWith(prefix)) {
        const objectPath = url.pathname.slice(prefix.length).replace(/^authenticated\//, ''), name = objectPath.slice(bucket.length + 1);
        if (request.method === 'POST') { await tx.query('insert into storage.objects(bucket_id,name) values($1,$2)', [bucket, name]); files.set(name, raw); return { Key: name }; }
        if (request.method === 'DELETE') { for (const item of body.prefixes) { const deleted = await tx.query('delete from storage.objects where bucket_id=$1 and name=$2 returning id', [bucket, item]); if (deleted.rows.length) files.delete(item); } return {}; }
        const row = await tx.query('select id from storage.objects where bucket_id=$1 and name=$2', [bucket, name]); assert.equal(row.rows.length, 1); return files.get(name);
      }
      throw new Error('Unsupported fixture endpoint: ' + url.pathname);
    }, anon);
    if (Buffer.isBuffer(result)) { response.setHeader('Content-Type', 'image/png'); response.end(result); } else response.end(JSON.stringify(result ?? null));
  } catch (error) { response.statusCode = error.code === '40001' ? 409 : error.code === '42501' ? 403 : error.code === 'PT404' ? 404 : 400; response.end(JSON.stringify({ code: error.code || 'fixture_error' })); }
});
try {
  await new Promise(resolve => provider.listen(providerPort, '127.0.0.1', resolve));
  application = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(appPort)], { cwd: root, windowsHide: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', STUDIO_E2E: 'true', STUDIO_LOCAL_PREVIEW: 'false', SUPABASE_URL: providerOrigin, SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable-key', STUDIO_ORIGIN: origin } });
  let ready = false; for (let i = 0; i < 30; i++) { try { if ((await fetch(origin + '/studio/login', { signal: AbortSignal.timeout(10000) })).ok) { ready = true; break; } } catch {} if (application.exitCode !== null) break; await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(ready, 'Fixture application started; see work/redesign-e2e.log');
  const request = (route, method = 'GET', body, cookie) => fetch(origin + route, { method, redirect: 'manual', headers: { origin, 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = async (response, status) => { assert.equal(response.status, status, await response.clone().text()); return response.json(); };
  assert.equal((await request('/studio/api/redesigns', 'POST', { prospect_id: prospect.id })).status, 401);
  const login = await request('/studio/auth/login', 'POST', { email: 'redesign-qa@example.com', password }); await json(login, 200); const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i); assert.match(login.headers.get('set-cookie'), /SameSite=strict/i);
  // Seed a legacy draft so this isolated check does not fetch a real company website.
  let design = (await authenticated(tx => tx.query(
    "select studio_redesign_command($1,'create',0,$2) result",
    [prospect.id, JSON.stringify(newRedesignContent(prospect))],
  ))).rows[0].result;
  const base = '/studio/api/redesigns/' + design.id;
  const content = newRedesignContent(prospect); content.hero.body = 'A thoughtful approach to beauty, with room to slow down and feel yourself.'; content.about.body = 'Fictional content for acceptance testing. A welcoming studio with a personal approach to every appointment.';
  content.services = [{ name: 'Consultation', description: 'Example service for the test fixture.', price: '' }]; content.contact.email = 'hello@example.com';
  design = (await json(await request(base, 'PATCH', { revision: 1, content }, cookie), 200)).redesign;
  assert.equal((await request(base, 'PATCH', { revision: 1, content }, cookie)).status, 409);
  const screenshot = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
  design = (await json(await fetch(origin + base + '/reference', { method: 'POST', headers: { origin, cookie, 'Content-Type': 'image/png', 'X-Redesign-Revision': String(design.revision) }, body: screenshot }), 200)).redesign;
  const image = await request(base + '/reference', 'GET', undefined, cookie); assert.equal(image.status, 200); assert.deepEqual(Buffer.from(await image.arrayBuffer()), screenshot); assert.match(image.headers.get('cache-control'), /no-store/);
  assert.equal((await request(base + '/reference')).status, 401);
  for (const route of ['/studio/redesigns', '/studio/redesigns/new?prospect=' + prospect.id, '/studio/templates', '/studio/redesigns/' + design.id, '/studio/preview/' + design.id, '/studio/prospects/' + prospect.id]) {
    const response = await request(route, 'GET', undefined, cookie); assert.equal(response.status, 200); const html = await response.text(); assert.ok(!html.includes('Internal Server Error'), route); assert.match(response.headers.get('x-robots-tag'), /noindex/);
  }
  const review = async (action, confirmed = false) => (await json(await request(base + '/review', 'POST', { revision: design.revision, action, confirmed }, cookie), 200)).redesign;
  design = await review('submit'); assert.equal(design.status, 'in_review');
  assert.equal((await request(base + '/review', 'POST', { revision: design.revision, action: 'approve' }, cookie)).status, 400);
  design = await review('approve', true); const approvedRevision = design.revision;
  const shared = await json(await request(base + '/demos', 'POST', { revision: approvedRevision, days: 3 }, cookie), 201);
  const link = new URL(shared.url); assert.equal(link.search, ''); assert.equal(link.hash.length, 44);
  const publicRoute = link.pathname + '/access', access = () => request(publicRoute, 'POST', { token: link.hash.slice(1) });
  const snapshot = await json(await access(), 200); assert.equal(snapshot.revision, approvedRevision); assert.equal(snapshot.content.brand.name, 'Fixture Salon');
  assert.equal((await request(publicRoute, 'POST', { token: 'a'.repeat(43) })).status, 404);
  const shell = await request(link.pathname); assert.equal(shell.status, 200); assert.match(shell.headers.get('x-robots-tag'), /noindex/); assert.match(shell.headers.get('referrer-policy'), /no-referrer/); assert.ok(!(await shell.text()).includes('Fixture Salon'));
  assert.equal((await fetch(origin + publicRoute, { method: 'POST', headers: { origin: 'https://elsewhere.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ token: link.hash.slice(1) }) })).status, 403);
  const stored = (await db.query('select token_hash,content_snapshot from studio_redesign_demos where id=$1', [shared.link.id])).rows[0]; assert.equal(stored.token_hash.length, 64); assert.ok(!JSON.stringify(stored).includes(link.hash.slice(1)));
  if (process.argv.includes('--browser')) { const { browserCheckRedesigns } = await import('./redesign-browser-check.mjs'); await browserCheckRedesigns({ origin, email: 'redesign-qa@example.com', password, designId: design.id, url: shared.url }); }
  content.brand.name = 'Unapproved change'; design = (await json(await request(base, 'PATCH', { revision: approvedRevision, content }, cookie), 200)).redesign; assert.equal(design.status, 'draft');
  assert.equal((await json(await access(), 200)).content.brand.name, 'Fixture Salon');
  assert.equal((await request(base + '/demos', 'POST', { revision: design.revision, days: 3 }, cookie)).status, 400);
  await db.query("update studio_redesign_demos set expires_at=now()-interval '1 second' where id=$1", [shared.link.id]); assert.equal((await access()).status, 404);
  await db.query("update studio_redesign_demos set expires_at=now()+interval '1 day' where id=$1", [shared.link.id]);
  await json(await request(base + '/demos/' + shared.link.id, 'DELETE', {}, cookie), 200); assert.equal((await access()).status, 404);
  if(phase4Mode){const {outreachAcceptance}=await import('./outreach-acceptance.mjs');await outreachAcceptance({request,json,cookie,db,prospect,auditId:outreachAuditId,origin});}
  if(phase5Mode){const {projectAcceptance}=await import('./project-acceptance.mjs');await projectAcceptance({request,json,cookie,db,prospect,authenticated,userId});}
  await db.query("update studio_users set role='editor' where auth_user_id=$1", [userId]);
  assert.equal((await request(base + '/demos', 'POST', { revision: design.revision, days: 3 }, cookie)).status, 403);
  assert.equal((await request(base + '/review', 'POST', { revision: design.revision, action: 'approve', confirmed: true }, cookie)).status, 403);
  assert.equal((await request('/studio/api/redesigns/' + randomUUID(), 'PATCH', { revision: 1, content }, cookie)).status, 404);
  console.log('Redesign acceptance passed: authenticated creation/save/stale edits, private upload/read, all six screens, review acknowledgement/admin limits, snapshot sharing, token privacy, origin protection, expiry and revocation. Isolated fixtures; no live records changed.');
} finally {
  if (application && application.exitCode === null) {
    application.kill();
  }
  provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); await db.close(); await log.close();
}
