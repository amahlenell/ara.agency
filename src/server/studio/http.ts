import { StudioError } from './transport.ts';
import { z } from 'zod';
export function assertOrigin(request:Request){
  const expected=process.env.STUDIO_ORIGIN||process.env.NEXT_PUBLIC_SITE_URL;
  const origin=request.headers.get('origin');const target=expected?new URL(expected).origin:new URL(request.url).origin;
  if(!origin||origin!==target)throw new StudioError(403,'This request must come from Studio.');
}
export async function jsonBody(request:Request){
  assertOrigin(request);
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new StudioError(415,'Use JSON for this request.');
  if(Number(request.headers.get('content-length'))>24576)throw new StudioError(413,'This request is too large.');
  const reader=request.body?.getReader();if(!reader)throw new StudioError(400,'A request body is required.');
  let bytes=0;const chunks:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>24576){await reader.cancel();throw new StudioError(413,'This request is too large.');}chunks.push(value);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new StudioError(400,'The request is not valid JSON.');}
}
export function apiError(error:unknown){
  if(error instanceof StudioError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'private, no-store'}});
  if(error instanceof z.ZodError)return Response.json({error:'Check the form fields.',fields:error.issues.map(issue=>({field:issue.path.join('.'),message:issue.message}))},{status:400});
  return Response.json({error:'Studio could not complete this request.'},{status:503});
}
