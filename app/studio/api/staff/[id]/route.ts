import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { canManageStaff } from '@/src/server/studio/domain';
import { database,StudioError } from '@/src/server/studio/transport';
import { jsonBody,apiError } from '@/src/server/studio/http';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{const session=await apiSession();if(!canManageStaff(session.staff))throw new StudioError(403,'Administrator access is required.');const {id}=await params;z.uuid().parse(id);const input=z.object({role:z.enum(['admin','editor']),active:z.boolean()}).strict().parse(await jsonBody(request));await database(session,'rpc/studio_set_staff',{method:'POST',body:JSON.stringify({target_id:id,new_role:input.role,new_active:input.active})});return Response.json({ok:true});}catch(error){return apiError(error);}}
