import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { jsonBody,apiError } from '@/src/server/studio/http';
import { setOutreachPreference } from '@/src/server/studio/outreach';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const session=await apiSession();const {id}=await params;z.uuid().parse(id);const input=z.object({blocked:z.boolean(),revision:z.number().int().nonnegative(),reason:z.string().trim().min(3).max(1000),confirmed:z.boolean().default(false)}).strict().parse(await jsonBody(request));return Response.json({preference:await setOutreachPreference(session,id,input)},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiError(error);}}
