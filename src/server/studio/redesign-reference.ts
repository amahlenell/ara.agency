import { randomUUID } from 'node:crypto';
import { getRedesign, setRedesignReference } from './redesigns.ts';
import { StudioError } from './transport.ts';
import type { StudioSession } from './transport.ts';
export const referenceBucket = 'studio-redesign-references';
export const referenceLimit = 5 * 1024 * 1024;
const types: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export function referenceImageType(bytes: Uint8Array, type: string) {
  const png = bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
  const jpg = bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 20 && Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP';
  if (bytes.length > referenceLimit || !((type === 'image/png' && png) || (type === 'image/jpeg' && jpg) || (type === 'image/webp' && webp))) throw new StudioError(400, 'Upload a PNG, JPEG or WebP screenshot up to 5 MB.');
  return types[type];
}
export async function readReferenceBody(request: Request) {
  const type = request.headers.get('content-type')?.split(';')[0] || '';
  if (!types[type]) throw new StudioError(415, 'Use a PNG, JPEG or WebP screenshot.');
  if (Number(request.headers.get('content-length')) > referenceLimit) throw new StudioError(413, 'The screenshot must be 5 MB or smaller.');
  const reader = request.body?.getReader(); if (!reader) throw new StudioError(400, 'Choose a screenshot to upload.');
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > referenceLimit) { await reader.cancel(); throw new StudioError(413, 'The screenshot must be 5 MB or smaller.'); } chunks.push(value); }
  const bytes = Buffer.concat(chunks); referenceImageType(bytes, type); return { bytes, type };
}
async function storage(session: StudioSession, endpoint: string, init: RequestInit) {
  let response: Response;
  try { response = await fetch(session.config.url + '/storage/v1/' + endpoint, { ...init, cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { apikey: session.config.key, Authorization: 'Bearer ' + session.token, ...init.headers } }); }
  catch { throw new StudioError(503, 'The screenshot store could not be reached. Try again shortly.'); }
  if (!response.ok) throw new StudioError(response.status === 401 || response.status === 403 ? 403 : 503, 'The screenshot could not be stored or opened. Check your access and the Storage setup.');
  return response;
}
async function cleanup(session: StudioSession, reference: string) {
  try { await storage(session, 'object/' + referenceBucket, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [reference] }) }); } catch { /* The private orphan can be removed during retention cleanup. */ }
}
export async function uploadRedesignReference(session: StudioSession, id: string, revision: number, bytes: Uint8Array, type: string) {
  const current = await getRedesign(session, id);
  if (!current) throw new StudioError(404, 'This redesign was not found.');
  if (current.revision !== revision) throw new StudioError(409, 'This redesign changed. Reload before uploading.');
  const extension = referenceImageType(bytes, type);
  const reference = id + '/' + randomUUID() + '.' + extension;
  await storage(session, 'object/' + referenceBucket + '/' + reference, { method: 'POST', headers: { 'Content-Type': type, 'x-upsert': 'false' }, body: new Uint8Array(bytes) });
  let saved;
  try { saved = await setRedesignReference(session, id, revision, reference); }
  catch (error) { await cleanup(session, reference); throw error; }
  if (current.reference_path) await cleanup(session, current.reference_path);
  return saved;
}
export async function openRedesignReference(session: StudioSession, id: string) {
  const current = await getRedesign(session, id);
  if (!current?.reference_path || !new RegExp('^' + id + '/[a-f0-9-]{36}\\.(png|jpg|webp)$').test(current.reference_path)) throw new StudioError(404, 'No original screenshot has been uploaded.');
  const response = await storage(session, 'object/authenticated/' + referenceBucket + '/' + current.reference_path, { method: 'GET' });
  const extension = current.reference_path.split('.').at(-1);
  return new Response(response.body, { headers: { 'Content-Type': extension === 'jpg' ? 'image/jpeg' : 'image/' + extension, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Disposition': 'inline' } });
}
