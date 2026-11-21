import { NextResponse } from 'next/server';
import { sessionCookie,cookieOptions,getStudioSession } from '@/src/server/studio/context';
import { signOut } from '@/src/server/studio/transport';
import { assertOrigin,apiError } from '@/src/server/studio/http';
export async function POST(request:Request){try{assertOrigin(request);const session=await getStudioSession();if(session){try{await signOut(session);}catch{/* Always remove the browser cookie, including provider outages. */}}const response=NextResponse.redirect(new URL('/studio/login',request.url),303);response.cookies.set(sessionCookie,'',{...cookieOptions,maxAge:0});return response;}catch(error){return apiError(error);}}
