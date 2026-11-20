import { NextResponse } from 'next/server';
import { studioConfig,signIn,StudioError,studioLoginSchema } from '@/src/server/studio/transport';
import { sessionCookie,cookieOptions } from '@/src/server/studio/context';
import { apiError,jsonBody } from '@/src/server/studio/http';
export async function POST(request:Request){try{const input=studioLoginSchema.parse(await jsonBody(request));const config=studioConfig();if(!config)throw new StudioError(503,'Studio setup is required before signing in.');const session=await signIn(input.email,input.password,config);const response=NextResponse.json({ok:true});response.cookies.set(sessionCookie,session.token,{...cookieOptions,maxAge:session.maxAge});return response;}catch(error){return apiError(error);}}
