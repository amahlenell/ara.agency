import { z } from 'zod';
import { jsonBody, apiError } from '@/src/server/studio/http';
import { readSharedRedesign } from '@/src/server/studio/redesigns';
export async function POST(request: Request, { params }: { params: Promise<{id:string}> }) { try { const { id } = await params; z.uuid().parse(id); const input = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(await jsonBody(request)); const content = await readSharedRedesign(id, input.token); return Response.json(content || { error: 'This private preview is unavailable.' }, { status: content ? 200 : 404, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } }); } catch (error) { return apiError(error); } }
