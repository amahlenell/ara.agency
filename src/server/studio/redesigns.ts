import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { database, getProspect, studioConfig, StudioError } from './transport.ts';
import type { StudioSession, StudioConfig } from './transport.ts';
import { approvalIssues, newRedesignContent, redesignContentSchema, redesignTemplate } from './redesign-content.ts';
import type { Redesign, RedesignContent, RedesignDemo, SharedRedesign } from './redesign-content.ts';

const demoColumns = 'id,redesign_id,revision,expires_at,revoked_at,created_by,created_at';
const parse = (row: Redesign): Redesign => ({ ...row, content: redesignContentSchema.parse(row.content) });
export async function listRedesigns(session: StudioSession, prospectId?: string) {
  const params = new URLSearchParams({ select: '*', order: 'updated_at.desc', limit: '50' });
  if (prospectId) params.set('prospect_id', 'eq.' + z.uuid().parse(prospectId));
  return (await database<Redesign[]>(session, 'studio_redesigns?' + params)).map(parse);
}
export async function getRedesign(session: StudioSession, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const rows = await database<Redesign[]>(session, 'studio_redesigns?' + new URLSearchParams({ select: '*', id: 'eq.' + id, limit: '1' }));
  return rows[0] ? parse(rows[0]) : null;
}
async function command(session: StudioSession, id: string, action: string, revision: number, extra: Record<string, unknown> = {}) {
  return parse(await database<Redesign>(session, 'rpc/studio_redesign_command', { method: 'POST', body: JSON.stringify({ p_id: id, p_action: action, p_revision: revision, ...extra }) }));
}
export async function createRedesign(session: StudioSession, prospectId: string) {
  z.uuid().parse(prospectId);
  const prospect = await getProspect(session, prospectId);
  if (!prospect) throw new StudioError(404, 'This prospect was not found.');
  if (prospect.lifecycle_status === 'archived') throw new StudioError(409, 'Restore this prospect before creating a redesign.');
  return command(session, prospectId, 'create', 0, { p_content: newRedesignContent(prospect) });
}
export async function saveRedesign(session: StudioSession, id: string, revision: number, content: RedesignContent) {
  return command(session, z.uuid().parse(id), 'save', z.number().int().positive().parse(revision), { p_content: redesignContentSchema.parse(content) });
}
export async function reviewRedesign(session: StudioSession, id: string, input: { revision: number; action: 'submit' | 'approve' | 'request_changes'; note?: string; confirmed?: boolean }) {
  const current = await getRedesign(session, id);
  if (!current) throw new StudioError(404, 'This redesign was not found.');
  if (input.action !== 'submit' && session.staff.role !== 'admin') throw new StudioError(403, 'An administrator must review this redesign.');
  if (input.action === 'approve' && input.confirmed !== true) throw new StudioError(400, 'Confirm that you have reviewed the content and contact links.');
  if (input.action === 'submit' || input.action === 'approve') {
    const issues = approvalIssues(current.content);
    if (issues.length) throw new StudioError(400, issues.join(' '));
  }
  if (input.action === 'request_changes' && (input.note || '').trim().length < 3) throw new StudioError(400, 'Add a short explanation of the changes needed.');
  return command(session, id, input.action, input.revision, { p_note: input.note || '', p_confirmed: input.confirmed === true });
}
export async function listRedesignDemos(session: StudioSession, id: string) {
  return database<RedesignDemo[]>(session, 'studio_redesign_demos?' + new URLSearchParams({ select: demoColumns, redesign_id: 'eq.' + id, order: 'created_at.desc', limit: '50' }));
}
export function demoTokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function privateDemoOrigin() {
  const value = process.env.STUDIO_ORIGIN;
  try {
    const url = new URL(value || '');
    if (url.username || url.password || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error();
    return url.origin;
  } catch { throw new StudioError(503, 'Set the exact Studio origin before creating a private preview link.'); }
}
export async function createRedesignDemo(session: StudioSession, id: string, revision: number, days: number) {
  if (session.staff.role !== 'admin') throw new StudioError(403, 'An administrator must approve and share this redesign.');
  z.uuid().parse(id); z.number().int().positive().parse(revision); z.union([z.literal(1), z.literal(3), z.literal(7)]).parse(days);
  const origin = privateDemoOrigin();
  const token = randomBytes(32).toString('base64url');
  const link = await database<RedesignDemo>(session, 'rpc/studio_create_redesign_demo', { method: 'POST', body: JSON.stringify({ p_id: id, p_revision: revision, p_hash: demoTokenHash(token), p_days: days }) });
  // Fragments never reach HTTP access logs or referrer headers. The token is
  // shown once to staff and exchanged only in the private access POST body.
  return { link, url: origin + '/preview/' + link.id + '#' + token, local: ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname) };
}
export async function revokeRedesignDemo(session: StudioSession, id: string) {
  if (session.staff.role !== 'admin') throw new StudioError(403, 'An administrator must revoke private preview links.');
  return database<void>(session, 'rpc/studio_revoke_redesign_demo', { method: 'POST', body: JSON.stringify({ p_id: z.uuid().parse(id) }) });
}
export async function readSharedRedesign(id: string, token: string, config: StudioConfig | null = studioConfig(), fetcher: typeof fetch = fetch): Promise<SharedRedesign | null> {
  if (process.env.NODE_ENV === 'development' && process.env.STUDIO_LOCAL_PREVIEW === 'true') return null;
  if (!z.uuid().safeParse(id).success || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  if (!config) throw new StudioError(503, 'This private preview is temporarily unavailable.');
  let response: Response;
  try { response = await fetcher(config.url + '/rest/v1/rpc/studio_read_redesign_demo', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id, p_hash: demoTokenHash(token) }) }); }
  catch { throw new StudioError(503, 'This private preview is temporarily unavailable.'); }
  if (!response.ok) throw new StudioError(503, 'This private preview is temporarily unavailable.');
  const row: unknown = await response.json();
  if (!row) return null;
  const parsed = z.object({ content: redesignContentSchema, template_id: z.literal(redesignTemplate), revision: z.number().int().positive(), expires_at: z.iso.datetime({ offset: true }) }).strict().safeParse(row);
  if (!parsed.success || Date.parse(parsed.data.expires_at) <= Date.now()) return null;
  return parsed.data;
}
export function setRedesignReference(session: StudioSession, id: string, revision: number, reference: string) {
  return command(session, id, 'reference', revision, { p_reference: reference });
}
