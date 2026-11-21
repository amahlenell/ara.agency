import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifySession,signIn,database,StudioError } from '../src/server/studio/transport.ts';
const user='11111111-1111-4111-8111-111111111111';
const staff={id:'22222222-2222-4222-8222-222222222222',auth_user_id:user,display_name:'Test Founder',role:'admin' as const,active:true};
const config={url:'https://supabase.test',key:'public-test-key'};
const token='test-access-token';
function authMock(options:{member?:boolean;active?:boolean;anonymous?:boolean;expired?:boolean}={}){const calls:{url:string;headers:Headers}[]=[];const fetcher:typeof fetch=async(input,init)=>{const url=String(input);calls.push({url,headers:new Headers(init?.headers)});if(url.includes('/auth/v1/token'))return Response.json({access_token:token,refresh_token:'must-not-be-persisted',expires_in:7200});if(url.endsWith('/auth/v1/user'))return Response.json({id:user,is_anonymous:!!options.anonymous,user_metadata:{role:'admin'}},{status:options.expired?401:200});if(url.includes('studio_users'))return Response.json(options.member===false?[]:[{...staff,active:options.active!==false}]);return Response.json([{id:'prospect'}]);};return {calls,fetcher};}
test('verifies the authenticated user and active membership before creating a cookie session',async()=>{const mock=authMock();const result=await signIn('founder@example.com','test-password',config,mock.fetcher);assert.equal(result.maxAge,3600);assert.deepEqual(Object.keys(result).sort(),['maxAge','token']);assert.equal(mock.calls.filter(call=>call.url.endsWith('/auth/v1/user')).length,1);});
test('does not trust editable auth metadata for staff access',async()=>{const mock=authMock({member:false});await assert.rejects(()=>verifySession(token,config,mock.fetcher),/active staff/);});
test('rejects inactive, anonymous and expired sessions',async()=>{for(const options of [{active:false},{anonymous:true},{expired:true}])await assert.rejects(()=>verifySession(token,config,authMock(options).fetcher));});
test('database operations recheck membership and use the user token, never a service role',async()=>{const mock=authMock();await database({token,staff,config},'studio_prospects',{},mock.fetcher);assert.equal(mock.calls.length,3);assert.equal(mock.calls[2].headers.get('authorization'),'Bearer '+token);assert.equal(mock.calls[2].headers.get('apikey'),config.key);});
test('a deactivated staff member cannot perform a later operation',async()=>{const mock=authMock({member:false});await assert.rejects(()=>database({token,staff,config},'studio_prospects',{method:'POST'},mock.fetcher));assert.ok(mock.calls.every(call=>!call.url.endsWith('/studio_prospects')));});
test('provider errors do not leak credentials or backend details',async()=>{const fetcher:typeof fetch=async()=>Response.json({message:'secret-database-password',code:'unknown'},{status:500});await assert.rejects(()=>database({token,staff,config},'studio_prospects',{},fetcher),error=>error instanceof Error&&!error.message.includes('secret-database-password'));});
test('normalizes staff email without changing the password',async()=>{
 const mock=authMock();let sent:unknown;
 const fetcher:typeof fetch=async(input,init)=>{if(String(input).includes('/auth/v1/token'))sent=JSON.parse(String(init?.body));return mock.fetcher(input,init);};
 await signIn('  Founder@Example.COM  ',' password with spaces ',config,fetcher);
 assert.deepEqual(sent,{email:'founder@example.com',password:' password with spaces '});
});
test('recognizes current and legacy invalid-credential responses',async()=>{
 for(const body of [{code:'invalid_credentials'},{code:400,error_code:'invalid_credentials'},{error:'invalid_grant'}]){
  const fetcher:typeof fetch=async()=>Response.json(body,{status:400});
  await assert.rejects(()=>signIn('founder@example.com','test-password',config,fetcher),error=>error instanceof StudioError&&error.status===401&&error.message.includes('Studio staff email'));
 }
});
test('does not misreport gateway, service or malformed provider responses as incorrect credentials',async()=>{
 for(const [status,body] of [[500,{code:'unexpected_failure'}],[401,{message:'secret-invalid-api-key'}],[403,{message:'secret-gateway-detail'}],[200,{access_token:'secret-invalid-token',expires_in:0}]] as const){
  const fetcher:typeof fetch=async()=>Response.json(body,{status});
  await assert.rejects(()=>signIn('founder@example.com','test-password',config,fetcher),error=>error instanceof StudioError&&error.status===503&&!error.message.includes('secret-')&&!error.message.includes('those details'));
 }
 const invalidJson:typeof fetch=async()=>new Response('not-json',{status:200});
 await assert.rejects(()=>signIn('founder@example.com','test-password',config,invalidJson),error=>error instanceof StudioError&&error.status===503);
});
test('distinguishes connection errors, rate limiting and account restrictions',async()=>{
 const disconnected:typeof fetch=async()=>{throw new Error('private-proxy-details');};
 await assert.rejects(()=>signIn('founder@example.com','test-password',config,disconnected),error=>error instanceof StudioError&&error.status===503&&error.message.includes('could not reach Supabase')&&!error.message.includes('private-proxy'));
 for(const [status,body,expected] of [[429,{},429],[400,{code:'email_not_confirmed'},403],[400,{code:'user_banned'},403]] as const){
  const fetcher:typeof fetch=async()=>Response.json(body,{status});
  await assert.rejects(()=>signIn('founder@example.com','test-password',config,fetcher),error=>error instanceof StudioError&&error.status===expected);
 }
});
test('a valid provider login still requires active Studio membership',async()=>{
 await assert.rejects(()=>signIn('founder@example.com','test-password',config,authMock({member:false}).fetcher),error=>error instanceof StudioError&&error.status===403);
});
