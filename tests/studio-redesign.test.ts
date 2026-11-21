import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRedesignContent, redesignContentSchema, approvalIssues, safeBookingLink } from '../src/server/studio/redesign-content.ts';
import { demoTokenHash, readSharedRedesign, privateDemoOrigin } from '../src/server/studio/redesigns.ts';
import { referenceImageType, readReferenceBody, referenceLimit } from '../src/server/studio/redesign-reference.ts';
const prospect = { business_name: 'Fixture Beauty', industry: 'Beauty & Wellness', business_description: '', contact_email: '', contact_phone: '', city: '', country: 'South Africa' };
test('a new concept uses supplied business information and leaves unknown services and contacts empty', () => {
  const content = newRedesignContent(prospect);
  assert.equal(content.brand.name, prospect.business_name);
  assert.equal(content.contact.address, 'South Africa');
  assert.deepEqual(content.services, []);
  assert.equal(content.contact.email, ''); assert.equal(content.contact.phone, ''); assert.equal(content.about.body, '');
  assert.equal(approvalIssues(content).length, 4);
  assert.equal(newRedesignContent({ ...prospect, industry: 'a'.repeat(120) }).hero.eyebrow.length, 70);
});
test('structured content rejects executable fields, arbitrary styles and unsafe booking links', () => {
  const content = newRedesignContent(prospect);
  for (const url of ['javascript:alert(1)', 'http://salon.co.za/', 'https://user:password@salon.co.za/', 'https://127.0.0.1/', 'https://[::1]/', 'https://metadata.google.internal/']) {
    assert.equal(safeBookingLink(url), null);
    assert.equal(redesignContentSchema.safeParse({ ...content, contact: { ...content.contact, bookingUrl: url } }).success, false);
  }
  assert.equal(safeBookingLink('https://BOOK.salon.co.za'), 'https://book.salon.co.za/');
  assert.equal(redesignContentSchema.safeParse({ ...content, html: '<script>alert(1)</script>' }).success, false);
  assert.equal(redesignContentSchema.safeParse({ ...content, brand: { ...content.brand, palette: 'url(evil)' } }).success, false);
  assert.equal(redesignContentSchema.safeParse({ ...content, services: Array.from({ length: 13 }, () => ({ name: 'Service', description: '', price: '' })) }).success, false);
});
test('readiness requires meaningful copy, a service and a contact method', () => {
  const content = newRedesignContent(prospect);
  content.hero.body = 'A verified introduction to the fictional salon.';
  content.about.body = 'A verified account of the fictional business and its approach.';
  content.services = [{ name: 'Verified service', description: 'Proposed service description.', price: '' }];
  content.contact.email = 'reception@example.com';
  assert.deepEqual(approvalIssues(content), []);
});
test('private demo access sends only a hash to the provider and validates expiry and payload', async () => {
  const token = 'a'.repeat(43), id = '11111111-1111-4111-8111-111111111111';
  const content = newRedesignContent(prospect); let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++; const body = JSON.parse(String(init?.body));
    assert.equal(body.p_id, id); assert.equal(body.p_hash, demoTokenHash(token)); assert.ok(!String(init?.body).includes(token));
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    return Response.json({ content, template_id: 'beauty_salon_v1', revision: 2, expires_at: new Date(Date.now() + 60000).toISOString() });
  };
  const config = { url: 'https://provider.example.com', key: 'publishable-test' };
  assert.equal((await readSharedRedesign(id, token, config, fetcher))?.revision, 2);
  assert.equal(await readSharedRedesign(id, 'short', config, fetcher), null); assert.equal(calls, 1);
  assert.equal(await readSharedRedesign(id, token, config, async () => Response.json(null)), null);
  assert.equal(await readSharedRedesign(id, token, config, async () => Response.json({ content, template_id: 'beauty_salon_v1', revision: 2, expires_at: '2000-01-01T00:00:00Z' })), null);
});
test('demo origins require HTTPS in production and allow loopback only in development', () => {
  const oldOrigin = process.env.STUDIO_ORIGIN, oldMode = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production'; process.env.STUDIO_ORIGIN = 'http://127.0.0.1:4173'; assert.throws(privateDemoOrigin);
    process.env.STUDIO_ORIGIN = 'https://user:password@studio.example.com'; assert.throws(privateDemoOrigin);
    process.env.STUDIO_ORIGIN = 'https://studio.example.com'; assert.equal(privateDemoOrigin(), 'https://studio.example.com');
    process.env.NODE_ENV = 'development'; process.env.STUDIO_ORIGIN = 'http://127.0.0.1:4173'; assert.equal(privateDemoOrigin(), 'http://127.0.0.1:4173');
  } finally { if (oldOrigin === undefined) delete process.env.STUDIO_ORIGIN; else process.env.STUDIO_ORIGIN = oldOrigin; if (oldMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldMode; }
});
test('reference uploads reject mislabeled, oversized and active-content files', async () => {
  const png = new Uint8Array(24); png.set([137,80,78,71,13,10,26,10]);
  assert.equal(referenceImageType(png, 'image/png'), 'png');
  assert.throws(() => referenceImageType(png, 'image/jpeg'));
  assert.throws(() => referenceImageType(new TextEncoder().encode('<svg onload="alert(1)"></svg>'), 'image/svg+xml'));
  await assert.rejects(() => readReferenceBody(new Request('http://localhost/upload', { method: 'POST', headers: { 'Content-Type': 'image/png', 'Content-Length': String(referenceLimit + 1) }, body: png })), /5 MB/);
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(referenceLimit + 1)); controller.close(); } });
  await assert.rejects(() => readReferenceBody(new Request('http://localhost/upload', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: stream, duplex: 'half' } as RequestInit)), /5 MB/);
});
