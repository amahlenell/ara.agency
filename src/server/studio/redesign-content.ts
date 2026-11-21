import { z } from 'zod';
import type { Prospect } from './domain.ts';

export const redesignTemplate = 'beauty_salon_v1' as const;
export const redesignPalettes = {
  sage: { label: 'Sage & cream', ink: '#253e33', paper: '#f5f1e8', accent: '#cb744d', soft: '#e3e8dc' },
  rose: { label: 'Rose & plum', ink: '#4c2e40', paper: '#fff4ee', accent: '#a6576b', soft: '#ecdce2' },
  midnight: { label: 'Midnight & sand', ink: '#1d3542', paper: '#f4f0e7', accent: '#b58145', soft: '#dce4e7' },
};
const text = (max: number) => z.string().trim().max(max);
const publicBookingUrl = z.union([z.literal(''), z.url().max(2048).refine(value => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
    && /^[a-z0-9.-]+$/.test(host) && host.includes('.') && !/^[\d.]+$/.test(host)
    && !/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) && host !== 'metadata.google.internal';
}, 'Use a public HTTPS booking URL without credentials.')]).transform(value => value ? new URL(value).href : '');
export function safeBookingLink(value: string) { const parsed = publicBookingUrl.safeParse(value); return parsed.success && parsed.data ? parsed.data : null; }
export const redesignContentSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  brand: z.object({ name: text(180).min(2), tagline: text(100), palette: z.enum(['sage', 'rose', 'midnight']), art: z.enum(['petal', 'arch', 'none']) }).strict(),
  hero: z.object({ eyebrow: text(70), heading: text(120).min(3), body: text(600), cta: text(40).min(2) }).strict(),
  services: z.array(z.object({ name: text(80).min(1), description: text(400), price: text(60) }).strict()).max(12),
  about: z.object({ heading: text(100).min(2), body: text(1800) }).strict(),
  contact: z.object({ email: z.union([z.email().max(254), z.literal('')]), phone: text(60).refine(value => !value || (/^[+\d ()/.-]+$/.test(value) && value.replace(/\D/g, '').length >= 3), 'Use a phone number or leave it empty.'), address: text(500), hours: text(300), bookingUrl: publicBookingUrl }).strict(),
  seo: z.object({ title: text(100).min(2), description: text(200) }).strict(),
}).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 19000, 'Keep the redesign content below 19 KB.');
export type RedesignContent = z.infer<typeof redesignContentSchema>;
export function approvalIssues(content: RedesignContent) {
  const issues: string[] = [];
  if (content.hero.body.length < 20) issues.push('Add an introduction of at least 20 characters.');
  if (content.version === 1 && !content.services.length) issues.push('Add at least one real service.');
  if (content.version === 1 && content.about.body.length < 20) issues.push('Add an about section of at least 20 characters.');
  if (!content.contact.email && !content.contact.phone && !content.contact.bookingUrl) issues.push('Add a verified email, phone number or booking link.');
  return issues;
}
export function newRedesignContent(prospect: Pick<Prospect, 'business_name' | 'industry' | 'business_description' | 'contact_email' | 'contact_phone' | 'city' | 'country'>): RedesignContent {
  const phone = prospect.contact_phone || '';
  return redesignContentSchema.parse({
    version: 1,
    brand: { name: prospect.business_name, tagline: '', palette: 'sage', art: 'petal' },
    hero: { eyebrow: prospect.industry.slice(0, 70), heading: 'A little time, just for you.', body: (prospect.business_description || '').slice(0, 600), cta: 'Explore services' },
    services: [], about: { heading: 'A thoughtful approach to feeling good.', body: (prospect.business_description || '').slice(0, 1800) },
    contact: { email: z.email().max(254).safeParse(prospect.contact_email).success ? prospect.contact_email : '', phone: /^[+\d ()/.-]+$/.test(phone) && phone.replace(/\D/g, '').length >= 3 ? phone : '', address: [prospect.city, prospect.country].filter(Boolean).join(', '), hours: '', bookingUrl: '' },
    seo: { title: prospect.business_name.slice(0, 100), description: (prospect.business_description || '').slice(0, 200) },
  });
}

export type Redesign = {
  id: string; prospect_id: string; source_audit_id: string | null; original_url: string;
  template_id: typeof redesignTemplate; content: RedesignContent; revision: number;
  status: 'draft' | 'in_review' | 'approved'; review_note: string; reference_path: string | null;
  created_by: string; approved_by: string | null; approved_at: string | null; approved_revision: number | null;
  created_at: string; updated_at: string;
};
export type RedesignDemo = { id: string; redesign_id: string; revision: number; expires_at: string; revoked_at: string | null; created_by: string; created_at: string };
export type SharedRedesign = { content: RedesignContent; template_id: typeof redesignTemplate; revision: number; expires_at: string };
