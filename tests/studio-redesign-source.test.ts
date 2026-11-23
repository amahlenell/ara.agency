import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftFromWebsite } from '../src/server/studio/redesign-source.ts';
import type { Prospect } from '../src/server/studio/domain.ts';
import type { PageResponse } from '../src/server/studio/audit-network.ts';

const prospect = {
  business_name: 'Fixture Engineering', industry: 'Engineering', city: '', country: 'New Zealand',
  contact_email: '', contact_phone: '', business_description: '',
} as Prospect;
const page = (body: string): PageResponse => ({
  url: 'https://fixture-engineering.co.nz/', status: 200, headers: { 'content-type': 'text/html' },
  body, responseMs: 10, bytes: Buffer.byteLength(body),
});

test('source drafts use observed content and ignore scripts, hidden text and external contact links', () => {
  const result = draftFromWebsite(prospect, page(`<html><head>
    <title>Fixture Engineering | Civil design</title><meta name="theme-color" content="#147b30">
    <script>document.write('Invented service')</script></head><body><main>
    <h1>Practical engineering for local communities</h1><p>We design water infrastructure for towns and cities.</p>
    <section><h2>Our services</h2><h3>Stormwater design</h3><h3 hidden>Hidden offer</h3><h3>Asset planning</h3></section>
    <section><h2>About us</h2><p>Our engineers are based in Hamilton and work across New Zealand.</p></section>
    <a href="https://unrelated.co.nz/contact">Contact us</a><a href="/contact">Contact us</a>
    <a href="mailto:info@fixture-engineering.co.nz">Email us</a></main></body></html>`));
  assert.equal(result.version, 2);
  assert.equal(result.hero.heading, 'Practical engineering for local communities');
  assert.match(result.hero.body, /water infrastructure/);
  assert.deepEqual(result.services.map(item => item.name), ['Stormwater design', 'Asset planning']);
  assert.equal(result.brand.palette, 'sage');
  assert.match(result.about.body, /Hamilton/);
  assert.equal(result.contact.bookingUrl, 'https://fixture-engineering.co.nz/contact');
  assert.equal(result.contact.email, 'info@fixture-engineering.co.nz');
});

test('sparse sites are not silently replaced with a salon draft', () => {
  assert.throws(() => draftFromWebsite(prospect, page('<div id="app"></div><script>loadPage()</script>')), /readable content/);
  const result = draftFromWebsite(prospect, page('<main><h1>Local conservation</h1><p>We coordinate restoration work across the region.</p></main>'));
  assert.equal(result.hero.cta, 'Get in touch');
  assert.deepEqual(result.services, []);
  assert.equal(result.about.body, '');
});

test('drafts retain visible service details and surface the existing quote action', () => {
  const result = draftFromWebsite(prospect, page(`<html><head><meta name="description" content="Generic search description"></head>
    <body><main><h1>Water services</h1><p>We maintain stormwater networks for local councils.</p>
    <div><h2>Services for councils</h2></div>
    <div><ul><li>Inspection: Camera surveys for stormwater assets.</li></ul>
    <h3>Pipe relining</h3><p>Rehabilitation for existing networks.</p></div>
    <h2>About us</h2><p>Our crews are based in Hamilton.</p>
    <a href="/contact">Contact us</a><a href="/quotes">Request a free quote</a></main></body></html>`));
  assert.equal(result.hero.body, 'We maintain stormwater networks for local councils.');
  assert.equal(result.hero.cta, 'Request a free quote');
  assert.equal(result.contact.bookingUrl, 'https://fixture-engineering.co.nz/quotes');
  assert.deepEqual(result.services.map(({ name, description }) => [name, description]), [
    ['Inspection', 'Camera surveys for stormwater assets.'],
    ['Pipe relining', 'Rehabilitation for existing networks.'],
  ]);
  assert.equal(result.about.body, 'Our crews are based in Hamilton.');
});
