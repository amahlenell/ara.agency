import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { newRedesignContent } from '../src/server/studio/redesign-content.ts';
import type { Redesign } from '../src/server/studio/redesign-content.ts';
const admin = '11111111-1111-4111-8111-111111111111', editor = '22222222-2222-4222-8222-222222222222', outsider = '33333333-3333-4333-8333-333333333333';
const sessions = { [admin]: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', [editor]: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', [outsider]: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };

test('redesign permissions, review states, snapshots, private files and capability links use the actual SQL', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;
      grant select,insert,delete on storage.objects to authenticated;grant select on storage.objects to anon;
      insert into auth.users values('${admin}'),('${editor}'),('${outsider}');
      insert into auth.sessions values('${sessions[admin]}','${admin}'),('${sessions[editor]}','${editor}'),('${sessions[outsider]}','${outsider}');`);
    const migrationRoot = new URL('../supabase/migrations/', import.meta.url);
    for (const name of ['20261119034827_studio_foundation.sql', '20261119094142_website_audits.sql']) await db.exec(fs.readFileSync(new URL(name, migrationRoot), 'utf8'));
    const phase3 = fs.readdirSync(migrationRoot).find(name => name.endsWith('_studio_redesigns.sql'));
    await db.exec(fs.readFileSync(phase3 ? new URL(phase3, migrationRoot) : path.resolve('work/studio-redesigns.sql'), 'utf8'));
    for (const name of fs.readdirSync(migrationRoot).filter(name => name.endsWith('_studio_redesign_indexes.sql'))) await db.exec(fs.readFileSync(new URL(name, migrationRoot), 'utf8'));
    const siteMigration = fs.readdirSync(migrationRoot).find(name => name.endsWith('_studio_site_redesigns.sql'));
    await db.exec(fs.readFileSync(siteMigration ? new URL(siteMigration, migrationRoot) : path.resolve('work/studio_site_redesigns.sql'), 'utf8'));
    await db.exec(`insert into studio_users(auth_user_id,display_name,role) values('${admin}','Fixture admin','admin'),('${editor}','Fixture editor','editor');`);
    const asUser = async (user: string | null) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)", [user ? JSON.stringify({ sub: user, session_id: sessions[user] }) : '{}']); await db.exec(user ? 'set role authenticated' : 'set role anon'); };
    await asUser(admin);
    const prospect = (await db.query<{id:string}>("insert into studio_prospects(business_name,website_url,industry,country) values('Fixture Salon','https://fixture-salon.co.za/','Beauty','South Africa') returning id")).rows[0].id;
    const content = newRedesignContent({ business_name: 'Fixture Salon', industry: 'Beauty', business_description: '', contact_email: '', contact_phone: '', city: '', country: 'South Africa' });
    const command = async (id: string, action: string, revision: number, body: unknown = null, note = '', reference: string | null = null, confirmed = false) =>
      (await db.query<{result:Redesign}>('select studio_redesign_command($1,$2,$3,$4,$5,$6,$7) result', [id, action, revision, body ? JSON.stringify(body) : null, note, reference, confirmed])).rows[0].result;
    let design: Redesign = await command(prospect, 'create', 0, content);
    const hash = createHash('sha256').update('fixture-private-demo-token').digest('hex'); let demoId = '';
    const readDemo = async (id = demoId, digest = hash) => (await db.query<{result:unknown}>('select studio_read_redesign_demo($1,$2) result', [id, digest])).rows[0].result;

    await t.test('draft creation records linked history without logging copy or contact values', async () => {
      assert.equal(design.status, 'draft'); assert.equal(design.revision, 1); assert.equal(design.original_url, 'https://fixture-salon.co.za/');
      const history = await db.query<{metadata:{redesign_id:string}}>("select metadata from studio_activity_log where action='redesign_create'");
      assert.equal(history.rows[0].metadata.redesign_id, design.id);
      await assert.rejects(() => db.query('insert into studio_redesigns(prospect_id,original_url,content,created_by) values($1,$2,$3,$4)', [prospect, design.original_url, JSON.stringify(content), design.created_by]), /permission denied/);
      await assert.rejects(() => db.query("update studio_redesigns set status='approved' where id=$1", [design.id]), /permission denied/);
      await assert.rejects(() => db.exec('delete from studio_redesigns'), /permission denied/);
    });
    await t.test('SQL independently rejects invalid structure and scripts in link fields', async () => {
      for (const invalid of [{ ...content, html: '<script>alert(1)</script>' }, { ...content, version: '1' }, { ...content, brand: { ...content.brand, palette: null } }, { ...content, contact: { ...content.contact, bookingUrl: 'javascript:alert(1)' } }]) {
        await assert.rejects(() => command(design.id, 'save', 1, invalid), /invalid_redesign_content/);
      }
      await assert.rejects(() => command(design.id, 'submit', 1), /redesign_not_ready/);
    });
    await t.test('site-based drafts require the current URL and can be reviewed without a salon service menu', async () => {
      const siteContent = { ...content, version: 2, hero: { ...content.hero, body: 'This is the introduction observed on the business website.' }, contact: { ...content.contact, email: 'team@example.com' } };
      await assert.rejects(() => command(prospect, 'create', 0, siteContent, 'https://old-site.co.za/'), /stale_prospect_website/);
      const site = await command(prospect, 'create', 0, siteContent, design.original_url);
      assert.equal(site.content.version, 2);
      await command(site.id, 'submit', 1);
      assert.equal((await command(site.id, 'approve', 1, null, '', null, true)).status, 'approved');
    });
    await t.test('editors can prepare and submit, while stale writes cannot overwrite newer copy', async () => {
      await asUser(editor);
      const ready = structuredClone(content); ready.hero.body = 'Verified introduction to the fictional salon and its services.';
      ready.about.body = 'Verified background for this fictional beauty business, for testing.';
      ready.services = [{ name: 'Fixture service', description: 'Verified fixture details.', price: '' }]; ready.contact.email = 'reception@example.com';
      design = await command(design.id, 'save', 1, ready); assert.equal(design.revision, 2);
      await assert.rejects(() => command(design.id, 'save', 1, content), /stale_redesign/);
      design = await command(design.id, 'submit', 2); assert.equal(design.status, 'in_review');
      await assert.rejects(() => command(design.id, 'approve', 2, null, '', null, true), /admin_required/);
    });
    await t.test('review requires an administrator, an acknowledgement and an explicit review state', async () => {
      await asUser(admin);
      await assert.rejects(() => command(design.id, 'approve', 2), /review_required/);
      design = await command(design.id, 'request_changes', 2, null, 'Review the contact details.'); assert.equal(design.status, 'draft');
      assert.equal(design.review_note, 'Review the contact details.');
      await assert.rejects(() => command(design.id, 'approve', 2, null, '', null, true), /redesign_state_changed/);
      design = await command(design.id, 'submit', 2);
      design = await command(design.id, 'approve', 2, null, '', null, true);
      assert.equal(design.approved_revision, 2); assert.ok(design.approved_by); assert.ok(design.approved_at);
    });
    await t.test('only administrators can create bounded demo links, and stored credentials are hashes', async () => {
      await asUser(editor);
      await assert.rejects(() => db.query('select studio_create_redesign_demo($1,$2,$3,$4)', [design.id, 2, hash, 3]), /admin_required/);
      await asUser(admin);
      await assert.rejects(() => db.query('select studio_create_redesign_demo($1,$2,$3,$4)', [design.id, 2, hash, 30]), /invalid_demo_link/);
      const result = (await db.query<{result:{id:string;revision:number}}>('select studio_create_redesign_demo($1,$2,$3,$4) result', [design.id, 2, hash, 3])).rows[0].result;
      demoId = result.id; assert.equal(result.revision, 2); assert.equal('token_hash' in result, false); assert.equal('content_snapshot' in result, false);
      await assert.rejects(() => db.exec('select token_hash from studio_redesign_demos'), /permission denied/);
      assert.equal((await db.query('select id,revision from studio_redesign_demos')).rows.length, 1);
    });
    await t.test('anonymous visitors need both the right link ID and secret hash and cannot read tables', async () => {
      await asUser(null);
      await assert.rejects(() => db.exec('select * from studio_redesigns'), /permission denied/);
      await assert.rejects(() => db.exec('select * from studio_redesign_demos'), /permission denied/);
      assert.equal(await readDemo(demoId, '0'.repeat(64)), null); assert.equal(await readDemo(randomUUID()), null);
      const shared = await readDemo() as {content:{brand:{name:string}}}; assert.equal(shared.content.brand.name, 'Fixture Salon');
      assert.deepEqual(Object.keys(shared).sort(), ['content','expires_at','revision','template_id']);
      assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    });
    await t.test('saving another draft clears approval but leaves an already shared approved snapshot unchanged', async () => {
      await asUser(editor); const updated = structuredClone(design.content); updated.brand.name = 'Unapproved draft name';
      design = await command(design.id, 'save', 2, updated); assert.equal(design.status, 'draft'); assert.equal(design.approved_by, null);
      await asUser(null); const shared = await readDemo() as {content:{brand:{name:string}}}; assert.equal(shared.content.brand.name, 'Fixture Salon');
      await asUser(admin); await assert.rejects(() => db.query('select studio_create_redesign_demo($1,$2,$3,$4)', [design.id, 3, '1'.repeat(64), 3]), /approved_redesign_required/);
    });
    await t.test('reference screenshots are private, constrained to a real redesign and cannot be deleted while referenced', async () => {
      await asUser(editor); const reference = design.id + '/' + randomUUID() + '.png';
      await assert.rejects(() => db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['studio-redesign-references', randomUUID() + '/' + randomUUID() + '.png']), /row-level security/);
      await assert.rejects(() => db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['studio-redesign-references', design.id + '/' + randomUUID() + '.svg']), /row-level security/);
      await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['studio-redesign-references', reference]);
      design = await command(design.id, 'reference', 3, null, '', reference); assert.equal(design.reference_path, reference); assert.equal(design.revision, 4);
      assert.equal((await db.query('delete from storage.objects where name=$1 returning id', [reference])).rows.length, 0);
      await asUser(null); assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    });
    await t.test('expiry, revocation and archive checks prevent new public access', async () => {
      await db.exec('reset role'); await db.query("update studio_redesign_demos set expires_at=now()-interval '1 second' where id=$1", [demoId]);
      await asUser(null); assert.equal(await readDemo(), null);
      await db.exec('reset role'); await db.query("update studio_redesign_demos set expires_at=now()+interval '1 day' where id=$1", [demoId]);
      await asUser(editor); await db.query("update studio_prospects set lifecycle_status='archived' where id=$1", [prospect]);
      await asUser(null); assert.equal(await readDemo(), null);
      await asUser(editor); await db.query("update studio_prospects set lifecycle_status='discovered' where id=$1", [prospect]);
      await asUser(admin); await db.query('select studio_revoke_redesign_demo($1)', [demoId]);
      await asUser(null); assert.equal(await readDemo(), null);
    });
    await t.test('nonmembers, revoked sessions and exhausted write limits cannot mutate designs', async () => {
      await asUser(outsider); assert.equal((await db.query('select * from studio_redesigns')).rows.length, 0);
      await assert.rejects(() => command(design.id, 'save', 4, design.content), /active_staff_required/);
      await db.exec('reset role'); await db.query('update ara_studio_private.write_limits set attempts=60,window_start=clock_timestamp() where actor=$1', [design.created_by]);
      await asUser(admin); await assert.rejects(() => command(design.id, 'save', 4, design.content), /write_rate_limited/);
      await db.exec('reset role'); await db.query('delete from auth.sessions where id=$1', [sessions[editor]]);
      await asUser(editor); assert.equal((await db.query('select * from studio_redesigns')).rows.length, 0);
      await assert.rejects(() => command(design.id, 'save', 4, design.content), /active_staff_required/);
    });
  } finally { await db.close(); }
});
