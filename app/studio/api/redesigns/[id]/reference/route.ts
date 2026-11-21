import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { assertOrigin, apiError } from '@/src/server/studio/http';
import { readReferenceBody, uploadRedesignReference, openRedesignReference } from '@/src/server/studio/redesign-reference';
export async function POST(request: Request, { params }: { params: Promise<{id:string}> }) { try { const session = await apiSession(); assertOrigin(request); const { id } = await params; z.uuid().parse(id); const revision = z.coerce.number().int().positive().parse(request.headers.get('x-redesign-revision')); const image = await readReferenceBody(request); return Response.json({ redesign: await uploadRedesignReference(session, id, revision, image.bytes, image.type) }, { headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return apiError(error); } }
export async function GET(_request: Request, { params }: { params: Promise<{id:string}> }) { try { const session = await apiSession(); const { id } = await params; z.uuid().parse(id); return await openRedesignReference(session, id); } catch (error) { return apiError(error); } }
