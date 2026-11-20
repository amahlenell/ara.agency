import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { jsonBody,apiError } from '@/src/server/studio/http';
import { outreachAction,outreachActionSchema } from '@/src/server/studio/outreach';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const session=await apiSession();const {id}=await params;z.uuid().parse(id);const input=outreachActionSchema.parse(await jsonBody(request));return Response.json(await outreachAction(session,id,input),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiError(error);}}
