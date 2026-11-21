import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localPreviewEnabled, localPreviewSession, localPreviewData } from '../src/server/studio/preview.ts';
import { database, signOut } from '../src/server/studio/transport.ts';
import type { Prospect } from '../src/server/studio/domain.ts';
import type { Audit } from '../src/server/studio/audits.ts';

const enabled = { NODE_ENV: 'development', STUDIO_LOCAL_PREVIEW: 'true', STUDIO_ORIGIN: 'http://127.0.0.1:4173' };
test('preview requires development, explicit opt-in and an exact loopback host', () => {
  assert.equal(localPreviewEnabled('127.0.0.1:4173', enabled), true);
  for (const env of [
    { ...enabled, NODE_ENV: 'production' }, { ...enabled, NODE_ENV: 'test' },
    { ...enabled, STUDIO_LOCAL_PREVIEW: 'false' }, { ...enabled, STUDIO_LOCAL_PREVIEW: undefined },
    { ...enabled, STUDIO_ORIGIN: 'https://studio.company.com' },
    { ...enabled, STUDIO_ORIGIN: 'http://127.0.0.1.evil.com:4173' },
    { ...enabled, STUDIO_ORIGIN: 'invalid' },
  ]) assert.equal(localPreviewEnabled('127.0.0.1:4173', env), false);
  for (const host of [null, '', 'studio.company.com', '127.0.0.1:4174', '127.0.0.1.evil.com:4173']) {
    assert.equal(localPreviewEnabled(host, enabled), false);
  }
});

test('sample prospects, filters and audit detail are consistent and clearly fictional', () => {
  const prospects = localPreviewData('studio_prospects') as Prospect[];
  assert.equal(prospects.length, 3);
  assert.ok(prospects.every(prospect => prospect.business_name.startsWith('Sample')));
  assert.equal((localPreviewData('studio_prospects?country=eq.New%20Zealand') as Prospect[]).length, 2);
  assert.equal((localPreviewData('studio_prospects?or=(business_name.ilike.*plumbing*,normalized_domain.ilike.*plumbing*)') as Prospect[]).length, 1);
  const audit = (localPreviewData('studio_audits') as Audit[])[0];
  assert.ok(audit.report?.limitations.some(text => text.includes('SAMPLE REPORT')));
  const matched = localPreviewData('studio_prospects?id=eq.' + audit.prospect_id) as Prospect[];
  assert.equal(matched.length, 1);
  assert.equal(matched[0].website_url, audit.website_url);
  prospects[0].business_name = 'Changed';
  assert.ok((localPreviewData('studio_prospects') as Prospect[])[0].business_name.startsWith('Sample'));
});

test('preview reads stay local, every mutation is rejected, and production refuses preview sessions', async () => {
  const original = Object.fromEntries(Object.keys(enabled).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, enabled);
    const session = localPreviewSession('127.0.0.1:4173');
    assert.ok(session?.preview);
    let networkCalls = 0;
    const noNetwork: typeof fetch = async () => { networkCalls++; throw new Error('Preview must not contact Supabase'); };
    assert.equal((await database<Prospect[]>(session, 'studio_prospects', {}, noNetwork)).length, 3);
    await signOut(session, noNetwork);
    assert.equal((await database<{total:number}>(session, 'rpc/studio_dashboard', { method: 'POST' }, noNetwork)).total, 3);
    const outreach=await database<{prospect_id:string}[]>(session,'studio_outreach',{},noNetwork);assert.equal(outreach.length,1);assert.equal(outreach[0].prospect_id,'33333333-3333-4333-8333-333333333333');
    const board=await database<{total:number;rows:unknown[]}>(session,'rpc/studio_pipeline',{method:'POST',body:'{}'},noNetwork);assert.equal(board.total,3);assert.equal(board.rows.length,3);
    for (const [resource, method] of [
      ['studio_prospects', 'POST'], ['studio_prospects?id=eq.any', 'PATCH'],
      ['studio_audits', 'POST'], ['rpc/studio_update_staff', 'POST'], ['studio_users', 'DELETE'],
      ['rpc/studio_outreach_command','POST'],['rpc/studio_set_outreach_preference','POST'],['studio_outreach','PATCH'],
      ['https://real.supabase.co/rest/v1/studio_prospects', 'GET'],
    ]) await assert.rejects(() => database(session, resource, { method }, noNetwork), /sample data/);
    process.env.NODE_ENV = 'production';
    assert.equal(localPreviewSession('127.0.0.1:4173'), null);
    await assert.rejects(() => database(session, 'studio_prospects', {}, noNetwork), /sample data/);
    assert.equal(networkCalls, 0);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
