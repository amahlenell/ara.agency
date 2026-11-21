import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { analyzePage } from '../src/server/studio/audit-report.ts';
const founder='11111111-1111-4111-8111-111111111111',editor='22222222-2222-4222-8222-222222222222',outsider='33333333-3333-4333-8333-333333333333',session='44444444-4444-4444-8444-444444444444';

test('audit persistence, rate limits, RLS and append-only history use the real migrations',async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
   grant usage on schema auth to anon,authenticated,service_role;
   insert into auth.users values('${founder}'),('${editor}'),('${outsider}');insert into auth.sessions values('${session}','${founder}');`);
  for(const name of ['20261119034827_studio_foundation.sql','20261119094142_website_audits.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.exec(`insert into studio_users(auth_user_id,display_name,role) values('${founder}','Founder','admin'),('${editor}','Editor','editor');`);
  const asUser=async(id:string)=>{await db.exec('reset role');await db.query('update auth.sessions set user_id=$1 where id=$2',[id,session]);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session})]);await db.exec('set role authenticated');};
  await asUser(founder);
  const staff=(await db.query<{id:string}>('select id from studio_users where auth_user_id=$1',[founder])).rows[0].id;
  const prospect=(await db.query<{id:string}>("insert into studio_prospects(business_name,website_url,industry,country) values('Audit Fixture','https://fixture-beauty.co.za/','Beauty','South Africa') returning id")).rows[0].id;
  const create=()=>db.query<{id:string;website_url:string}>('insert into studio_audits(prospect_id,requested_by,website_url) values($1,$2,$3) returning id,website_url',[prospect,staff,'https://fixture-beauty.co.za/']);
  let auditId='';
  await t.test('starts a report with a website snapshot and transactional history',async()=>{
   const result=await create();auditId=result.rows[0].id;
   assert.equal(result.rows[0].website_url,'https://fixture-beauty.co.za/');
   const rows=await db.query<{action:string}>('select action from studio_activity_log where entity_id=$1 order by created_at',[prospect]);
   assert.equal(rows.rows.at(-1)?.action,'audit_started');
  });
  await t.test('duplicate in-flight audits are rejected without creating another row',async()=>{
   await assert.rejects(create,/audit_already_running/);assert.equal((await db.query('select * from studio_audits')).rows.length,1);
  });
  await t.test('another staff member can read but cannot finish someone else’s audit',async()=>{
   await asUser(editor);assert.equal((await db.query('select * from studio_audits')).rows.length,1);
   assert.equal((await db.query("update studio_audits set status='failed',error_message='Intrusion' where id=$1 returning id",[auditId])).rows.length,0);
   await asUser(founder);
  });
  await t.test('finishes with a persisted report, completion time and linked history',async()=>{
   const report=analyzePage({url:'https://fixture-beauty.co.za/',body:'<html lang=en><title>Fixture beauty salon website</title><h1>Beauty salon</h1></html>',status:200,headers:{},bytes:90,responseMs:50},'https://fixture-beauty.co.za/');
   await db.query("update studio_audits set status='completed',report=$1 where id=$2",[JSON.stringify(report),auditId]);
   const result=await db.query<{status:string;report:{checksTotal:number};completed_at:Date}>('select * from studio_audits where id=$1',[auditId]);
   assert.equal(result.rows[0].status,'completed');assert.equal(result.rows[0].report.checksTotal,report.checksTotal);assert.ok(result.rows[0].completed_at);
   assert.equal((await db.query("select * from studio_activity_log where action='audit_completed' and metadata->>'audit_id'=$1",[auditId])).rows.length,1);
  });
  await t.test('completed reports and snapshot fields are immutable to staff',async()=>{
   assert.equal((await db.query("update studio_audits set status='failed',error_message='Overwrite' where id=$1 returning id",[auditId])).rows.length,0);
   await assert.rejects(()=>db.query('update studio_audits set website_url=$1 where id=$2',['https://changed.co.za/',auditId]),/permission denied/);
   await assert.rejects(()=>db.exec('delete from studio_audits'),/permission denied/);
   await assert.rejects(()=>db.exec("update studio_activity_log set action='fake'"),/permission denied/);
  });
  await t.test('failed attempts save a reason; old interrupted attempts allow a new run',async()=>{
   // Advance the isolated fixture clock; production grants and triggers prohibit changing timestamps.
   await db.exec('reset role;alter table studio_audits disable trigger user');
   await db.query("update studio_audits set created_at=clock_timestamp()-interval '3 minutes' where id=$1",[auditId]);
   await db.exec('alter table studio_audits enable trigger user');await asUser(founder);
   const next=(await create()).rows[0].id;
   await db.query("update studio_audits set status='failed',error_message='The site is unavailable.' where id=$1",[next]);
   assert.equal((await db.query<{error_message:string}>('select error_message from studio_audits where id=$1',[next])).rows[0].error_message,'The site is unavailable.');
  });
  await t.test('mismatched website snapshots and archived prospects cannot start an audit',async()=>{
   await assert.rejects(()=>db.query('insert into studio_audits(prospect_id,requested_by,website_url) values($1,$2,$3)',[prospect,staff,'https://other.co.za/']),/audit_target_changed/);
   await db.query("update studio_prospects set lifecycle_status='archived' where id=$1",[prospect]);await assert.rejects(create,/audit_target_changed/);
  });
  await t.test('authenticated outsiders and anonymous users have no audit access',async()=>{
   await asUser(outsider);assert.equal((await db.query('select * from studio_audits')).rows.length,0);
   await assert.rejects(create,/active_staff|row.level/);
   await db.exec('reset role;set role anon');await assert.rejects(()=>db.exec('select * from studio_audits'),/permission denied/);
  });
 } finally {await db.close();}
});
