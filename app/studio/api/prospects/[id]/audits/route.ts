import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { jsonBody,apiError } from '@/src/server/studio/http';
import { runAudit } from '@/src/server/studio/audits';

export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const session=await apiSession();const {id}=await params;z.uuid().parse(id);
    z.object({}).strict().parse(await jsonBody(request));
    const audit=await runAudit(session,id);
    return Response.json({id:audit.id,status:audit.status},{status:201,headers:{'Cache-Control':'private, no-store'}});
  } catch(error) { return apiError(error); }
}
