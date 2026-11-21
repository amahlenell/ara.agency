import { createRequire } from 'node:module';
import { newRedesignContent, redesignContentSchema, safeBookingLink } from './redesign-content.ts';
import type { Prospect } from './domain.ts';
import type { PageResponse } from './audit-network.ts';

type Element = {
  textContent: string;
  getAttribute(name: string): string | undefined;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): Element[];
  remove(): void;
};
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): Element };
const clean = (value: string | undefined, limit: number) => (value || '').replace(/\s+/g, ' ').trim().slice(0, limit).trim();

export function draftFromWebsite(prospect: Prospect, page: PageResponse) {
  const doc = parse(page.body);
  for (const item of doc.querySelectorAll('script,style,noscript,template,iframe,svg,[hidden],[aria-hidden="true"]')) item.remove();
  const main = doc.querySelector('main') || doc.querySelector('body') || doc;
  const heading = clean(main.querySelector('h1')?.textContent, 120);
  const paragraphs = main.querySelectorAll('p').map(node => clean(node.textContent, 600)).filter(value => value.length >= 20);
  const description = clean(doc.querySelector('meta[name="description"]')?.getAttribute('content'), 200);
  if (heading.length < 3 && !paragraphs.length && !description) {
    throw new Error('The page did not expose enough readable content for a redesign. Try a public page with business information.');
  }

  const draft = newRedesignContent(prospect);
  const finalUrl = new URL(page.url);
  const sections = main.querySelectorAll('section,article');
  const findSection = (pattern: RegExp) => sections.find(section => pattern.test(clean(section.querySelector('h2')?.textContent, 100)));
  const offerings = findSection(/^(?:our\s+)?(?:services|products|solutions|what we (?:do|offer))\b/i);
  const about = findSection(/^(?:about|who we are|our story)\b/i);
  const names = new Set<string>();
  for (const item of offerings?.querySelectorAll('h3') || []) {
    const name = clean(item.textContent, 80);
    if (name && !names.has(name.toLowerCase()) && draft.services.length < 12) {
      names.add(name.toLowerCase());
      draft.services.push({ name, description: '', price: '' });
    }
  }

  const brandColor = doc.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '';
  if (/^#[\da-f]{6}$/i.test(brandColor)) {
    const [red, green, blue] = [1, 3, 5].map(index => Number.parseInt(brandColor.slice(index, index + 2), 16));
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 20) {
      draft.brand.palette = red > green && red >= blue ? 'rose' : green > blue ? 'sage' : 'midnight';
    } else draft.brand.palette = 'midnight';
  } else draft.brand.palette = 'midnight';

  for (const anchor of doc.querySelectorAll('a[href]').slice(0, 200)) {
    const href = anchor.getAttribute('href') || '';
    if (/^mailto:/i.test(href) && !draft.contact.email) {
      const email = href.slice(7).split('?')[0];
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 254) {
        const candidate = redesignContentSchema.shape.contact.shape.email.safeParse(email);
        if (candidate.success) draft.contact.email = candidate.data;
      }
    }
    if (/^tel:/i.test(href) && !draft.contact.phone) {
      const candidate = redesignContentSchema.shape.contact.shape.phone.safeParse(href.slice(4));
      if (candidate.success) draft.contact.phone = candidate.data;
    }
    if (!draft.contact.bookingUrl && /^(contact(?: us)?|get in touch|book(?: now| online)?|request a quote)$/i.test(clean(anchor.textContent, 80))) {
      try {
        const target = new URL(href, finalUrl);
        if (target.origin === finalUrl.origin && !target.hash && href && !href.startsWith('#')) {
          draft.contact.bookingUrl = safeBookingLink(target.href) || '';
        }
      } catch { /* Skip malformed source links. */ }
    }
  }

  const title = clean(doc.querySelector('title')?.textContent, 100);
  const aboutText = clean(about?.querySelector('p')?.textContent, 600);
  draft.version = 2;
  draft.brand.art = 'none';
  draft.hero.heading = heading.length >= 3 ? heading : prospect.business_name.length >= 3 ? prospect.business_name.slice(0, 120) : 'Welcome to ' + prospect.business_name;
  draft.hero.body = description || paragraphs[0] || draft.hero.body;
  draft.hero.cta = draft.services.length ? 'Explore what we offer' : 'Get in touch';
  draft.about.heading = clean(about?.querySelector('h2')?.textContent, 100) || 'About ' + prospect.business_name.slice(0, 90);
  draft.about.body = aboutText || draft.about.body;
  draft.seo.title = title.length >= 2 ? title : draft.seo.title;
  draft.seo.description = description || draft.hero.body.slice(0, 200);
  return redesignContentSchema.parse(draft);
}
