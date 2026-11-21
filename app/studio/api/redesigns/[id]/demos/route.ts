import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { jsonBody, apiError } from '@/src/server/studio/http';
import { createRedesignDemo } from '@/src/server/studio/redesigns';
export async function POST(request: Request, { params }: { params: Promise<{id:string}> }) { try { const session = await apiSession(); const { id } = await params; z.uuid().parse(id); const input = z.object({ revision: z.number().int().positive(), days: z.union([z.literal(1),z.literal(3),z.literal(7)]) }).strict().parse(await jsonBody(request)); return Response.json(await createRedesignDemo(session, id, input.revision, input.days), { status: 201, headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return apiError(error); } }
