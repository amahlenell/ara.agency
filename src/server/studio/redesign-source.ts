import { parse } from 'node-html-parser';
import type { HTMLElement } from 'node-html-parser';
import { newRedesignContent, redesignContentSchema, safeBookingLink } from './redesign-content.ts';
import type { Prospect } from './domain.ts';
import type { PageResponse } from './audit-network.ts';

const clean = (value: string | undefined, limit: number) => (value || '').replace(/\s+/g, ' ').trim().slice(0, limit).trim();
const offeringsHeading = /^(?:(?:our\s+)?(?:services|products|solutions|specialties|specialities)\b|what we (?:do|offer)\b)/i;
const aboutHeading = /^(?:about\b|who we are\b|our story\b)/i;
const contactAction = /^(?:contact(?: us)?|get in touch|book(?:\s+(?:now|online|(?:(?:an?|your)\s+)?appointment)(?:\s+now)?)?|(?:get|request)\s+(?:a\s+)?(?:free\s+)?quote)$/i;

function importSections(main: HTMLElement, draft: ReturnType<typeof newRedesignContent>) {
  const seen = new Set<string>();
  let section = '';
  let descriptionTarget: (typeof draft.services)[number] | undefined;

  for (const node of main.querySelectorAll('h2,h3,li,p')) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'h2') {
      const heading = clean(node.textContent, 100);
      section = offeringsHeading.test(heading) ? 'offerings' : aboutHeading.test(heading) ? 'about' : '';
      if (section === 'about') draft.about.heading = heading;
      descriptionTarget = undefined;
      continue;
    }
    if (section === 'about' && tag === 'p' && !draft.about.body) {
      draft.about.body = clean(node.textContent, 600);
    }
    if (section !== 'offerings') continue;
    if (tag === 'p' && descriptionTarget && !descriptionTarget.description) {
      descriptionTarget.description = clean(node.textContent, 400);
      continue;
    }
    if (tag !== 'h3' && tag !== 'li') continue;
    descriptionTarget = undefined;
    const item = clean(node.textContent, 490);
    const [label, ...details] = item.split(/:\s+|\s+[–—]\s+/);
    const name = clean(label, 80);
    if (!name || label.length > 80 || seen.has(name.toLowerCase()) || draft.services.length >= 12) continue;
    seen.add(name.toLowerCase());
    const service = { name, description: clean(details.join(' — '), 400), price: '' };
    draft.services.push(service);
    if (tag === 'h3') descriptionTarget = service;
  }
}

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
  draft.about.heading = 'About ' + prospect.business_name.slice(0, 90);
  draft.about.body = '';
  importSections(main, draft);

  const brandColor = doc.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '';
  if (/^#[\da-f]{6}$/i.test(brandColor)) {
    const [red, green, blue] = [1, 3, 5].map(index => Number.parseInt(brandColor.slice(index, index + 2), 16));
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 20) {
      draft.brand.palette = red > green && red >= blue ? 'rose' : green > blue ? 'sage' : 'midnight';
    } else draft.brand.palette = 'midnight';
  } else draft.brand.palette = 'midnight';

  let actionLabel = '';
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
    const label = clean(anchor.textContent, 80);
    if (contactAction.test(label) && label.length <= 40) {
      try {
        const target = new URL(href, finalUrl);
        if (target.origin === finalUrl.origin && !target.hash && href && !href.startsWith('#')) {
          const link = safeBookingLink(target.href);
          const specificAction = /^(?:book\b|(?:get|request)\b.*\bquote$)/i.test(label);
          if (link && (!draft.contact.bookingUrl || (specificAction && /^(?:contact|get in touch)/i.test(actionLabel)))) {
            draft.contact.bookingUrl = link;
            actionLabel = label;
          }
        }
      } catch { /* Skip malformed source links. */ }
    }
  }

  const title = clean(doc.querySelector('title')?.textContent, 100);
  draft.version = 2;
  draft.brand.art = 'none';
  draft.hero.heading = heading.length >= 3 ? heading : prospect.business_name.length >= 3 ? prospect.business_name.slice(0, 120) : 'Welcome to ' + prospect.business_name;
  draft.hero.body = paragraphs[0] || description || draft.hero.body;
  draft.hero.cta = actionLabel || (draft.services.length ? 'Explore what we offer' : 'Get in touch');
  draft.seo.title = title.length >= 2 ? title : draft.seo.title;
  draft.seo.description = description || draft.hero.body.slice(0, 200);
  return redesignContentSchema.parse(draft);
}
