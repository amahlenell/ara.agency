import { z } from 'zod';
import type { Staff, Prospect, Activity } from './domain.ts';

export class StudioError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status;}}
export type StudioConfig={url:string;key:string};
export type StudioSession={token:string;staff:Staff;config:StudioConfig};
type Fetcher=typeof fetch;
export function studioConfig():StudioConfig|null{
  const url=process.env.SUPABASE_URL?.replace(/\/$/,'');const key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return null;
  try{const parsed=new URL(url);if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname)))return null;}catch{return null;}
  return {url,key};
}
async function remote(config:StudioConfig,endpoint:string,token:string|null,init:RequestInit={},fetcher:Fetcher=fetch){
  let response:Response;
  try{response=await fetcher(config.url+endpoint,{...init,cache:'no-store',signal:AbortSignal.timeout(8000),headers:{apikey:config.key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...init.headers}});}catch{throw new StudioError(503,'Studio could not connect to its database. Try again shortly.');}
  if(!response.ok){let code='';try{code=(await response.json()).code||'';}catch{}
    if(code==='55P03')throw new StudioError(409,'An audit was started recently. Open its report or wait a minute before running another.');
    if(code==='23505')throw new StudioError(409,'A prospect with this website domain already exists. Open the existing record instead.');
    if(code==='40001')throw new StudioError(409,'This record changed while you were editing. Reload it before saving again.');
    if(code==='P0002')throw new StudioError(429,'Too many changes. Wait a minute before trying again.');
    if(code==='23514'||code==='22P02')throw new StudioError(400,'Check the fields, assigned staff member and lifecycle transition.');
    throw new StudioError(response.status===401?401:response.status===403?403:503,response.status===401?'Your session has expired. Sign in again.':response.status===403?'This account does not have permission for that action.':'Studio could not complete this operation. Check the database setup or try again.');
  }
  return response;
}
const staffSchema=z.object({id:z.uuid(),auth_user_id:z.uuid(),display_name:z.string(),role:z.enum(['admin','editor']),active:z.literal(true)});
export async function verifySession(token:string,config:StudioConfig,fetcher:Fetcher=fetch):Promise<StudioSession>{
  if(!token||token.length>8192)throw new StudioError(401,'Sign in to continue.');
  const user=await(await remote(config,'/auth/v1/user',token,{},fetcher)).json();
  if(!z.uuid().safeParse(user.id).success||user.is_anonymous===true)throw new StudioError(403,'An active staff account is required.');
  const query=new URLSearchParams({select:'id,auth_user_id,display_name,role,active',auth_user_id:'eq.'+user.id,active:'eq.true',limit:'1'});
  const rows=await(await remote(config,'/rest/v1/studio_users?'+query,token,{},fetcher)).json();
  const staff=staffSchema.safeParse(rows[0]);
  if(!staff.success)throw new StudioError(403,'An active staff account is required.');
  return {token,config,staff:staff.data};
}
export async function signIn(email:string,password:string,config:StudioConfig,fetcher:Fetcher=fetch){
  let response:Response;
  try{response=await fetcher(config.url+'/auth/v1/token?grant_type=password',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});}catch{throw new StudioError(503,'Sign-in is temporarily unavailable.');}
  if(!response.ok)throw new StudioError(response.status===429?429:401,response.status===429?'Too many sign-in attempts. Wait before trying again.':'Unable to sign in with those details.');
  const session=z.object({access_token:z.string().min(10).max(8192),expires_in:z.number().positive().max(604800)}).parse(await response.json());
  await verifySession(session.access_token,config,fetcher);
  return {token:session.access_token,maxAge:Math.min(session.expires_in,3600)};
}
export async function signOut(session:StudioSession,fetcher:Fetcher=fetch){await remote(session.config,'/auth/v1/logout?scope=local',session.token,{method:'POST'},fetcher);}
export async function database<T>(session:StudioSession,resource:string,init:RequestInit={},fetcher:Fetcher=fetch):Promise<T>{
  // Re-check identity and current staff membership for every sensitive operation.
  const verified=await verifySession(session.token,session.config,fetcher);
  const response=await remote(verified.config,'/rest/v1/'+resource,verified.token,init,fetcher);
  return response.status===204?undefined as T:await response.json() as T;
}
export async function listProspects(session:StudioSession,filters:{q?:string;stage?:string;country?:string;priority?:string;sort?:string;page?:number}={}){
  const page=Math.max(1,Math.min(filters.page||1,10000));
  const query=new URLSearchParams({select:'*',order:filters.sort==='name'?'business_name.asc,id.asc':filters.sort==='followup'?'follow_up_at.asc.nullslast,id.asc':'updated_at.desc,id.asc',limit:'26',offset:String((page-1)*25)});
  if(filters.q){const term=filters.q.slice(0,80).replace(/[^\p{L}\p{N} -]/gu,' ').trim();if(term)query.set('or',`(business_name.ilike.*${term}*,normalized_domain.ilike.*${term}*)`);}
  if(filters.stage)query.set('lifecycle_status','eq.'+filters.stage);
  if(filters.country)query.set('country','eq.'+filters.country.slice(0,80));
  if(filters.priority)query.set('priority','eq.'+filters.priority);
  const rows=await database<Prospect[]>(session,'studio_prospects?'+query);
  return {rows:rows.slice(0,25),more:rows.length>25,page};
}
export async function getProspect(session:StudioSession,id:string){if(!z.uuid().safeParse(id).success)return null;return (await database<Prospect[]>(session,'studio_prospects?'+new URLSearchParams({id:'eq.'+id,select:'*',limit:'1'})))[0]||null;}
export async function staffList(session:StudioSession){return database<Staff[]>(session,'studio_users?select=id,auth_user_id,display_name,role,active&order=display_name');}
export async function activities(session:StudioSession,id?:string){const query=new URLSearchParams({select:'*',order:'created_at.desc',limit:'50'});if(id){query.set('entity_type','eq.prospect');query.set('entity_id','eq.'+id);}return database<Activity[]>(session,'studio_activity_log?'+query);}
export async function counts(session:StudioSession){return database<{total:number;active:number;followups_due:number;archived:number}>(session,'rpc/studio_dashboard',{method:'POST',body:'{}'});}
