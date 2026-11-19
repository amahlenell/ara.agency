import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { parseProspect } from '@/src/server/studio/domain';
import { database,StudioError } from '@/src/server/studio/transport';
import { jsonBody,apiError } from '@/src/server/studio/http';
import type { Prospect } from '@/src/server/studio/domain';
export async function POST(request:Request){try{const session=await apiSession();const input=await jsonBody(request);let payload;try{payload=parseProspect(input);}catch(error){if(error instanceof z.ZodError)throw error;throw new StudioError(400,'Use a valid public HTTP or HTTPS website.');}if(payload.lifecycle_status!=='discovered')throw new StudioError(400,'New prospects start at the discovered stage.');const result=await database<Prospect[]>(session,'studio_prospects?select=id',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({...payload,created_by:session.staff.id})});return Response.json({id:result[0].id},{status:201});}catch(error){return apiError(error);}}
