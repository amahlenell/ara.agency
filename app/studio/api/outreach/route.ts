import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { jsonBody,apiError } from '@/src/server/studio/http';
import { createOutreach } from '@/src/server/studio/outreach';
export async function POST(request:Request){try{const session=await apiSession();const input=z.object({prospect_id:z.uuid(),audit_id:z.uuid(),finding_ids:z.array(z.string().regex(/^[a-z0-9_-]{1,80}$/)).min(1).max(3),channel:z.enum(['email','manual']),reply_to_id:z.uuid().nullable().optional()}).strict().parse(await jsonBody(request));return Response.json(await createOutreach(session,input),{status:201,headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiError(error);}}
