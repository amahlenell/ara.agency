import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { jsonBody,apiError } from '@/src/server/studio/http';
import { saveOutreach } from '@/src/server/studio/outreach';
import { outreachContentSchema } from '@/src/server/studio/outreach-content';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{const session=await apiSession();const {id}=await params;z.uuid().parse(id);const input=z.object({revision:z.number().int().positive(),content:outreachContentSchema}).strict().parse(await jsonBody(request));return Response.json(await saveOutreach(session,id,input.revision,input.content),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiError(error);}}
