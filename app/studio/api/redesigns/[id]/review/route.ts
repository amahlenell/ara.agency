import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { jsonBody, apiError } from '@/src/server/studio/http';
import { reviewRedesign } from '@/src/server/studio/redesigns';
export async function POST(request: Request, { params }: { params: Promise<{id:string}> }) { try { const session = await apiSession(); const { id } = await params; z.uuid().parse(id); const input = z.object({ revision: z.number().int().positive(), action: z.enum(['submit','approve','request_changes']), note: z.string().trim().max(1000).default(''), confirmed: z.boolean().default(false) }).strict().parse(await jsonBody(request)); return Response.json({ redesign: await reviewRedesign(session, id, input) }, { headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return apiError(error); } }
