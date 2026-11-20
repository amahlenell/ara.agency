import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { database, StudioError } from '@/src/server/studio/transport';
import { jsonBody, apiError } from '@/src/server/studio/http';
import { revokeRedesignDemo } from '@/src/server/studio/redesigns';
export async function DELETE(request: Request, { params }: { params: Promise<{id:string;demoId:string}> }) { try { const session = await apiSession(); await jsonBody(request); const { id, demoId } = await params; z.uuid().parse(id); z.uuid().parse(demoId); const matches = await database<{id:string}[]>(session, 'studio_redesign_demos?' + new URLSearchParams({ select: 'id', id: 'eq.' + demoId, redesign_id: 'eq.' + id, limit: '1' })); if (!matches.length) throw new StudioError(404, 'This private link was not found.'); await revokeRedesignDemo(session, demoId); return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return apiError(error); } }
