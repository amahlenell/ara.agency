import { previewReport } from './preview-report.ts';
import { parseProspect } from './domain.ts';
import type { Activity, Prospect, Staff } from './domain.ts';
import type { Audit } from './audits.ts';
import type { StudioSession } from './transport.ts';
import { newRedesignContent, redesignTemplate } from './redesign-content.ts';
import type { Redesign } from './redesign-content.ts';
import {sampleOutreach,samplePipeline} from './outreach-preview.ts';

type PreviewEnvironment = { NODE_ENV?: string; STUDIO_LOCAL_PREVIEW?: string; STUDIO_ORIGIN?: string };
export const previewReadOnlyMessage = 'Local preview uses sample data. Sign in to save changes or run a live audit.';

export function localPreviewEnabled(host: string | null, env: PreviewEnvironment = process.env) {
  if (env.NODE_ENV !== 'development' || env.STUDIO_LOCAL_PREVIEW !== 'true' || !host) return false;
  try {
    const origin = new URL(env.STUDIO_ORIGIN || '');
    return origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
      && !origin.username && !origin.password && host === origin.host;
  } catch { return false; }
}

const staff: Staff = {
  id: '11111111-1111-4111-8111-111111111111',
  auth_user_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Preview visitor', role: 'admin', active: true,
};
export function localPreviewSession(host: string | null): StudioSession | null {
  if (!localPreviewEnabled(host)) return null;
  return { preview: true, token: 'local-preview-only', staff: { ...staff },
    config: { url: 'http://studio-preview.invalid', key: 'local-preview-only' } };
}

const timestamp = '2026-11-19T22:00:00.000Z';
const prospectIds = [
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
];
const prospects: Prospect[] = [
  { business_name: 'Sample Beauty Studio', website_url: 'https://example.com/', industry: 'Beauty & Wellness', country: 'South Africa', lifecycle_status: 'audited' as const, priority: 'high' as const },
  { business_name: 'Sample Plumbing Co.', website_url: 'https://example.org/', industry: 'Trades', country: 'New Zealand', lifecycle_status: 'researching' as const, priority: 'normal' as const },
  { business_name: 'Sample Café', website_url: 'https://example.net/', industry: 'Hospitality', country: 'New Zealand', lifecycle_status: 'discovered' as const, priority: 'normal' as const },
].map((fields, index) => ({ ...parseProspect(fields), id: prospectIds[index],
  assigned_to: index === 2 ? null : staff.id,
  notes: 'Fictional sample record for exploring the local Studio preview.',
  follow_up_at: index === 0 ? timestamp : null,
  created_by: staff.id, created_at: timestamp, updated_at: timestamp,
}));

// This fixture describes fictional HTML, never a real company website.
const sampleReport = previewReport;
const audits: Audit[] = [{ id: '66666666-6666-4666-8666-666666666666', prospect_id: prospectIds[0],
  website_url: prospects[0].website_url, requested_by: staff.id, created_at: timestamp,
  completed_at: timestamp, status: 'completed', report: sampleReport, error_message: null }];
const activity: Activity[] = prospects.map(prospect => ({ id: prospect.id, entity_type: 'prospect',
  entity_id: prospect.id, action: 'created', actor_user_id: staff.id, previous_state: null,
  new_state: { lifecycle_status: prospect.lifecycle_status }, metadata: {}, created_at: timestamp }));
const sampleRedesign: Redesign = { id: '77777777-7777-4777-8777-777777777777', prospect_id: prospects[0].id, source_audit_id: audits[0].id, original_url: prospects[0].website_url, template_id: redesignTemplate, content: newRedesignContent(prospects[0]), revision: 1, status: 'draft', review_note: '', reference_path: null, created_by: staff.id, approved_by: null, approved_at: null, approved_revision: null, created_at: timestamp, updated_at: timestamp };

function filtered<T extends { id: string }>(items: T[], params: URLSearchParams) {
  let rows = [...items];
  for (const field of ['id', 'prospect_id', 'entity_id', 'entity_type', 'lifecycle_status', 'country', 'priority', 'status', 'active', 'auth_user_id']) {
    const value = params.get(field);
    if (value?.startsWith('eq.')) rows = rows.filter(row => String((row as Record<string, unknown>)[field]) === value.slice(3));
  }
  const search = params.get('or')?.match(/business_name\.ilike\.\*([^*]*)\*/)?.[1]?.toLowerCase();
  if (search) rows = rows.filter(row => {
    const value = row as Record<string, unknown>;
    return [value.business_name, value.normalized_domain].some(field => String(field).toLowerCase().includes(search));
  });
  const [field, direction] = (params.get('order') || 'id.asc').split(',')[0].split('.');
  rows.sort((left, right) => {
    const a = (left as Record<string, unknown>)[field], b = (right as Record<string, unknown>)[field];
    if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
    return String(a).localeCompare(String(b)) * (direction === 'desc' ? -1 : 1);
  });
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const limit = Math.max(0, Math.min(50, Number(params.get('limit') || 50)));
  return rows.slice(offset, offset + limit);
}

export function localPreviewData(resource: string, method = 'GET', body = '{}'): unknown {
  const url = new URL(resource, 'http://studio-preview.invalid/');
  if (url.origin !== 'http://studio-preview.invalid') throw new Error(previewReadOnlyMessage);
  if(url.pathname==='/rpc/studio_pipeline'&&method==='POST')return structuredClone(samplePipeline(prospects,JSON.parse(body)));
  if (url.pathname === '/rpc/studio_dashboard' && method === 'POST') {
    return { total: prospects.length, active: prospects.length, followups_due: 1, archived: 0 };
  }
  if (method !== 'GET') throw new Error(previewReadOnlyMessage);
  let result: unknown;
  switch (url.pathname) {
    case '/studio_prospects': result = filtered(prospects, url.searchParams); break;
    case '/studio_users': result = filtered([staff], url.searchParams); break;
    case '/studio_activity_log': result = filtered(activity, url.searchParams); break;
    case '/studio_audits': result = filtered(audits, url.searchParams); break;
    case '/studio_redesigns': result = filtered([sampleRedesign], url.searchParams); break;
    case '/studio_redesign_demos': result = []; break;
    case '/studio_outreach': {const row=sampleOutreach(prospects[0],audits[0],staff);result=filtered([{...row,prospect:{id:prospects[0].id,business_name:prospects[0].business_name,lifecycle_status:prospects[0].lifecycle_status}}],url.searchParams);break;}
    case '/studio_projects': result = []; break;
    case '/studio_outreach_preferences': result=[];break;
    default: throw new Error(previewReadOnlyMessage);
  }
  return structuredClone(result);
}
