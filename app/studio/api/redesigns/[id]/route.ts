import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { jsonBody, apiError } from '@/src/server/studio/http';
import { saveRedesign } from '@/src/server/studio/redesigns';
import { redesignContentSchema } from '@/src/server/studio/redesign-content';
export async function PATCH(request: Request, { params }: { params: Promise<{id:string}> }) { try { const session = await apiSession(); const { id } = await params; z.uuid().parse(id); const input = z.object({ revision: z.number().int().positive(), content: redesignContentSchema }).strict().parse(await jsonBody(request)); return Response.json({ redesign: await saveRedesign(session, id, input.revision, input.content) }, { headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return apiError(error); } }
