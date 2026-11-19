import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { studioConfig, verifySession, StudioError } from './transport';
export const sessionCookie='ara-studio-session';
export const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/studio',priority:'high' as const};
export const getStudioSession=cache(async()=>{
  const config=studioConfig();const token=(await cookies()).get(sessionCookie)?.value;
  if(!config||!token)return null;
  try{return await verifySession(token,config);}catch(error){if(error instanceof StudioError&&[401,403].includes(error.status))return null;throw error;}
});
export async function requireStudio(){const session=await getStudioSession();if(!session)redirect('/studio/login');return session;}
export async function apiSession(){const session=await getStudioSession();if(!session)throw new StudioError(401,'Sign in to continue.');return session;}
