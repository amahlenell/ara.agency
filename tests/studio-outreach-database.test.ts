import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import type {OutreachResult,OutreachContent} from '../src/server/studio/outreach-content.ts';
const admin=randomUUID(),editor=randomUUID(),outsider=randomUUID();const sessions:Record<string,string>={[admin]:randomUUID(),[editor]:randomUUID(),[outsider]:randomUUID()};
test('Phase 4 uses real SQL for evidence, review, manual records, contact preferences and pipeline',async t=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,delete on storage.objects to authenticated;
  insert into auth.users values('${admin}'),('${editor}'),('${outsider}');insert into auth.sessions values('${sessions[admin]}','${admin}'),('${sessions[editor]}','${editor}'),('${sessions[outsider]}','${outsider}');`);
  const root=new URL('../supabase/migrations/',import.meta.url);for(const name of fs.readdirSync(root).filter(name=>/_(studio_foundation|website_audits|studio_redesigns|studio_redesign_indexes)\.sql$/.test(name)).sort())await db.exec(fs.readFileSync(new URL(name,root),'utf8'));
  const phase4=fs.readdirSync(root).find(name=>name.endsWith('_studio_outreach.sql'));await db.exec(fs.readFileSync(phase4?new URL(phase4,root):new URL('../work/studio-outreach.sql',import.meta.url),'utf8'));
  await db.exec(`insert into studio_users(auth_user_id,display_name,role) values('${admin}','Fixture admin','admin'),('${editor}','Fixture editor','editor');`);
  const asUser=async(user:string|null)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[user?JSON.stringify({sub:user,session_id:sessions[user]}):'{}']);await db.exec(user?'set role authenticated':'set role anon');};
  await asUser(admin);const prospect=(await db.query<{id:string}>("insert into studio_prospects(business_name,website_url,industry,country) values('Fixture salon','https://fixture-salon.co.za/','Beauty','South Africa') returning id")).rows[0].id;
  const other=(await db.query<{id:string}>("insert into studio_prospects(business_name,website_url,industry,country) values('Other fixture','https://other-fixture.co.za/','Beauty','South Africa') returning id")).rows[0].id;
  const audit=(await db.query<{id:string}>('insert into studio_audits(prospect_id,requested_by,website_url) values($1,(select id from studio_users where auth_user_id=$2),$3) returning id',[prospect,admin,'https://fixture-salon.co.za/'])).rows[0].id;
  await db.query("update studio_audits set status='completed',report=$1 where id=$2",[JSON.stringify({version:1,method:'html-baseline',requestedUrl:'https://fixture-salon.co.za/',findings:[{id:'title',status:'warning',title:'Page title',evidence:'No page title was found.',recommendation:'Add a descriptive title.'},{id:'lang',status:'pass',title:'Language',evidence:'Present'},{id:'speed',status:'manual',title:'Browser speed',evidence:'Not measured'}]}),audit]);
  const body:OutreachContent={channel:'email',recipient:'recipient@example.com',subject:'A useful website note',body:'A verified observation about the saved website, for this fictional test business.',finding_ids:['title']};
  const command=async(id:string,action:string,revision:number,content:OutreachContent|null=null,options:{audit?:string;reply?:string;confirmed?:boolean;note?:string;date?:string|null;version?:string}={})=>(await db.query<{result:OutreachResult}>('select studio_outreach_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',[id,action,revision,content?JSON.stringify(content):null,options.audit||null,options.reply||null,options.note||'',options.confirmed||false,options.date||null,options.version||null])).rows[0].result;
  const preference=async(blocked:boolean,revision:number,confirmed=false)=>(await db.query<{result:{revision:number}}>('select studio_set_outreach_preference($1,$2,$3,$4,$5) result',[prospect,blocked,revision,'Fixture private preference note',confirmed])).rows[0].result;
  const pipeline=async(query='',owner='all',due=false,view='board',page=1)=>(await db.query<{result:{total:number;matching:number;due:number;rows:{id:string;outreach_paused:boolean}[];counts:Record<string,number>}}>('select studio_pipeline($1,$2,$3,$4,$5,$6,$7) result',[query,owner,'all',due,'all',view,page])).rows[0].result;
  let saved:OutreachResult;
  await t.test('only distinct observed warnings from a matching completed audit can support a draft',async()=>{
   for(const ids of [['lang'],['speed'],['missing'],['title','title']])await assert.rejects(()=>command(prospect,'create',0,{...body,finding_ids:ids},{audit}),/observed|invalid_outreach|finding/i);
   await assert.rejects(()=>command(other,'create',0,body,{audit}),/audit|finding/i);
   saved=await command(prospect,'create',0,body,{audit});assert.equal(saved.outreach.evidence[0].evidence,'No page title was found.');
   await assert.rejects(()=>db.query("update studio_outreach set status='approved'"),/permission denied/);await assert.rejects(()=>db.exec('delete from studio_outreach'),/permission denied/);
  });
  await t.test('stale edits and executable or credential-bearing extra fields fail independently in SQL',async()=>{
   saved=await command(saved.outreach.id,'save',1,{...body,body:body.body+' Updated.'});
   await assert.rejects(()=>command(saved.outreach.id,'save',1,body),/stale_outreach/);
   await assert.rejects(()=>command(saved.outreach.id,'save',2,{...body,html:'<script>alert(1)</script>'} as OutreachContent),/invalid_outreach/);
   await assert.rejects(()=>command(saved.outreach.id,'save',2,{...body,body:'https://studio.example.com/preview/'+randomUUID()+'#'+'a'.repeat(43)}),/invalid_outreach/);
   await assert.rejects(()=>command(saved.outreach.id,'copy',2),/approved_outreach/);
  });
  await t.test('review requires readiness, current evidence, administrator role and explicit acknowledgement',async()=>{
   await asUser(editor);saved=await command(saved.outreach.id,'save',2,{...body,recipient:''});await assert.rejects(()=>command(saved.outreach.id,'submit',3),/not_ready/);
   saved=await command(saved.outreach.id,'save',3,body);saved=await command(saved.outreach.id,'submit',4);
   await assert.rejects(()=>command(saved.outreach.id,'approve',4,null,{confirmed:true}),/admin_required/);
   await asUser(admin);await assert.rejects(()=>command(saved.outreach.id,'approve',4),/review_required/);
   saved=await command(saved.outreach.id,'request_changes',4,null,{note:'Review this private note.'});assert.equal(saved.outreach.status,'draft');
   saved=await command(saved.outreach.id,'submit',4);saved=await command(saved.outreach.id,'approve',4,null,{confirmed:true});assert.equal(saved.outreach.approved_revision,4);
   saved=await command(saved.outreach.id,'save',4,{...body,subject:'A revised website note'});assert.equal(saved.outreach.status,'draft');assert.equal(saved.outreach.approved_by,null);
   saved=await command(saved.outreach.id,'submit',5);saved=await command(saved.outreach.id,'approve',5,null,{confirmed:true});
  });
  await t.test('copying has no sending side effect; recording manual sending is confirmed, atomic and idempotent',async()=>{
   const copied=await command(saved.outreach.id,'copy',5);assert.equal(copied.outreach.status,'approved');assert.equal(copied.outreach.sent_recorded_at,null);
   await assert.rejects(()=>command(saved.outreach.id,'record_sent',5),/confirmation_required/);
   await assert.rejects(()=>command(saved.outreach.id,'record_sent',5,null,{confirmed:true,version:'2000-01-01T00:00:00Z'}),/stale_prospect/);
   await assert.rejects(()=>command(saved.outreach.id,'record_sent',5,null,{confirmed:true,version:saved.prospect.updated_at,date:'2000-01-01T00:00:00Z'}),/future_follow_up/);
   const date=new Date(Date.now()+86400000).toISOString();saved=await command(saved.outreach.id,'record_sent',5,null,{confirmed:true,version:saved.prospect.updated_at,date});assert.equal(saved.outreach.status,'sent');assert.ok(saved.outreach.sent_by);assert.equal(saved.prospect.lifecycle_status,'discovered');assert.ok(saved.prospect.follow_up_at);
   const count=(await db.query<{n:number}>('select count(*)::int n from studio_activity_log')).rows[0].n;
   const retry=await command(saved.outreach.id,'record_sent',5,null,{confirmed:true,version:'2000-01-01T00:00:00Z'});assert.equal(retry.outreach.sent_recorded_at,saved.outreach.sent_recorded_at);assert.equal((await db.query<{n:number}>('select count(*)::int n from studio_activity_log')).rows[0].n,count);
   await assert.rejects(()=>command(saved.outreach.id,'save',5,body),/immutable/);
   const log=JSON.stringify((await db.query('select new_state,previous_state,metadata from studio_activity_log')).rows);assert.ok(!log.includes(body.recipient));assert.ok(!log.includes(body.body));assert.ok(!log.includes('Review this private note.'));
  });
  await t.test('follow-ups require a sent parent for the same prospect and have their own review',async()=>{
   await assert.rejects(()=>command(other,'create',0,body,{audit,reply:saved.outreach.id}),/audit/);
   const followup=await command(prospect,'create',0,body,{audit,reply:saved.outreach.id});assert.equal(followup.outreach.reply_to_id,saved.outreach.id);assert.equal(followup.outreach.status,'draft');
   await assert.rejects(()=>command(prospect,'create',0,body,{audit,reply:followup.outreach.id}),/sent_parent/);
  });
  await t.test('any staff may pause, pauses clear reminders, only confirmed administrators may resume',async()=>{
   await asUser(editor);const paused=await preference(true,0);assert.equal(paused.revision,1);
   assert.equal((await db.query<{follow_up_at:null}>('select follow_up_at from studio_prospects where id=$1',[prospect])).rows[0].follow_up_at,null);
   await assert.rejects(()=>command(saved.outreach.id,'copy',5),/outreach_paused/);await assert.rejects(()=>command(prospect,'create',0,body,{audit}),/outreach_paused/);
   await assert.rejects(()=>preference(false,1,true),/admin_confirmation/);await asUser(admin);await assert.rejects(()=>preference(false,1),/admin_confirmation/);await preference(false,1,true);
   await assert.rejects(()=>preference(true,1),/stale_preference/);
  });
  await t.test('a changed prospect website makes old audit evidence unusable',async()=>{
   await db.query("update studio_prospects set website_url='https://changed-fixture.co.za/' where id=$1",[prospect]);await assert.rejects(()=>command(prospect,'create',0,body,{audit}),/audit/);await db.query("update studio_prospects set website_url='https://fixture-salon.co.za/' where id=$1",[prospect]);
  });
  await t.test('pipeline counts cover all matching rows, board is bounded and list pages do not overlap',async()=>{
   await db.exec('reset role');await db.exec('delete from ara_studio_private.write_limits');await asUser(admin);
   for(let i=0;i<32;i++)await db.query("insert into studio_prospects(business_name,website_url,industry,country,assigned_to,priority,follow_up_at) values($1,$2,'Beauty','South Africa',(select id from studio_users where auth_user_id=$3),$4,now()-interval '1 hour')",['Board fixture '+String(i).padStart(2,'0'),'https://board-fixture-'+i+'.co.za/',editor,i%2?'normal':'high']);
   const board=await pipeline('Board fixture');assert.equal(board.total,32);assert.equal(board.counts.discovered,32);assert.equal(board.rows.length,8);assert.equal(board.due,32);
   const first=await pipeline('Board fixture','all',false,'list',1),second=await pipeline('Board fixture','all',false,'list',2);assert.equal(first.rows.length,25);assert.equal(second.rows.length,7);assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,32);
   assert.equal((await pipeline('%')).total,0);assert.equal((await pipeline('Board fixture','unassigned')).total,0);
   await preference(true,2);await db.query("update studio_prospects set follow_up_at=now()-interval '1 hour' where id=$1",[prospect]);assert.ok(!(await pipeline('','all',true)).rows.some(row=>row.id===prospect));
   await assert.rejects(()=>db.query("select studio_pipeline(p_page=>0)"),/invalid_pipeline/);
  });
  await t.test('anonymous users, nonmembers, revoked sessions and exhausted write limits cannot mutate',async()=>{
   await asUser(null);await assert.rejects(()=>db.exec('select * from studio_outreach'),/permission denied/);await assert.rejects(()=>db.exec('select studio_pipeline()'),/permission denied/);await assert.rejects(()=>preference(true,3),/permission denied/);
   await asUser(outsider);assert.equal((await db.exec('select * from studio_outreach'))[0].rows.length,0);await assert.rejects(()=>pipeline(),/active_staff/);
   await asUser(admin);await db.exec('reset role');await db.query('update ara_studio_private.write_limits set attempts=60,window_start=clock_timestamp() where actor=(select id from studio_users where auth_user_id=$1)',[admin]);await asUser(admin);await assert.rejects(()=>preference(true,3),/write_rate_limited/);
   await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[sessions[editor]]);await asUser(editor);await assert.rejects(()=>command(prospect,'create',0,body,{audit}),/active_staff/);
  });
 }finally{await db.close();}
});
