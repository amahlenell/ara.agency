import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { jsonBody, apiError } from '@/src/server/studio/http';
import { createRedesign } from '@/src/server/studio/redesigns';
export async function POST(request: Request) { try { const session = await apiSession(); const input = z.object({ prospect_id: z.uuid() }).strict().parse(await jsonBody(request)); return Response.json({ redesign: await createRedesign(session, input.prospect_id) }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return apiError(error); } }
