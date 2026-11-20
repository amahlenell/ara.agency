import { z } from 'zod';
import { database, getProspect, StudioError } from './transport.ts';
import type { StudioSession } from './transport.ts';
import { getAudit } from './audits.ts';
import { buildOutreachDraft, outreachContentSchema, outreachReadiness, outreachStatuses, pipelineFiltersSchema } from './outreach-content.ts';
import type { Outreach, OutreachContent, OutreachPreference, OutreachResult, PipelineResult } from './outreach-content.ts';
import type { Prospect } from './domain.ts';
import { stages } from './stages.ts';
export async function listOutreach(session:StudioSession,{prospect,status,page=1}:{prospect?:string;status?:string;page?:number}={}) {
  const query=new URLSearchParams({select:'*,prospect:studio_prospects!studio_outreach_prospect_id_fkey(id,business_name,lifecycle_status)',order:'updated_at.desc,id.asc',limit:'26',offset:String((Math.max(1,Math.min(page,10000))-1)*25)});
  if(prospect)query.set('prospect_id','eq.'+z.uuid().parse(prospect));if(status)query.set('status','eq.'+z.enum(outreachStatuses).parse(status));
  const rows=await database<(Outreach&{prospect:Pick<Prospect,'id'|'business_name'|'lifecycle_status'>})[]>(session,'studio_outreach?'+query);
  return {rows:rows.slice(0,25),more:rows.length>25,page};
}
export async function getOutreach(session:StudioSession,id:string){if(!z.uuid().safeParse(id).success)return null;const row=(await database<Outreach[]>(session,'studio_outreach?'+new URLSearchParams({id:'eq.'+id,select:'*',limit:'1'})))[0];return row?{...row,content:outreachContentSchema.parse(row.content)}:null;}
export async function outreachPreference(session:StudioSession,id:string):Promise<OutreachPreference>{const rows=await database<OutreachPreference[]>(session,'studio_outreach_preferences?'+new URLSearchParams({select:'*',prospect_id:'eq.'+z.uuid().parse(id)}));return rows[0]||{prospect_id:id,blocked:false,reason:'',revision:0,updated_at:null,updated_by:null};}
export async function setOutreachPreference(session:StudioSession,id:string,input:{blocked:boolean;revision:number;reason:string;confirmed:boolean}){
  if(!input.blocked&&session.staff.role!=='admin')throw new StudioError(403,'An administrator must resume outreach.');
  return database<OutreachPreference>(session,'rpc/studio_set_outreach_preference',{method:'POST',body:JSON.stringify({p_id:id,p_blocked:input.blocked,p_revision:input.revision,p_reason:input.reason,p_confirmed:input.confirmed})});
}
export async function createOutreach(session:StudioSession,input:{prospect_id:string;audit_id:string;finding_ids:string[];channel:'email'|'manual';reply_to_id?:string|null}){
  const [prospect,audit,previous]=await Promise.all([getProspect(session,input.prospect_id),getAudit(session,input.audit_id),input.reply_to_id?getOutreach(session,input.reply_to_id):Promise.resolve(null)]);
  if(!prospect||!audit)throw new StudioError(404,'Choose a saved prospect and audit.');
  if(input.reply_to_id&&(!previous||previous.prospect_id!==prospect.id||previous.status!=='sent'))throw new StudioError(400,'A follow-up needs a manually sent record for this prospect.');
  let content:OutreachContent;try{content=buildOutreachDraft(prospect,audit,input.finding_ids,session.staff.display_name,input.channel,previous||undefined);}catch(error){throw new StudioError(400,error instanceof Error?error.message:'Check the selected findings.');}
  return database<OutreachResult>(session,'rpc/studio_outreach_command',{method:'POST',body:JSON.stringify({p_id:prospect.id,p_action:'create',p_revision:0,p_content:content,p_audit:input.audit_id,p_reply_to:input.reply_to_id||null})});
}
export const outreachActionSchema=z.object({action:z.enum(['submit','approve','request_changes','record_sent','cancel','copy']),revision:z.number().int().positive(),confirmed:z.boolean().default(false),note:z.string().trim().max(1000).default(''),follow_up_at:z.iso.datetime({offset:true}).nullable().default(null),prospect_version:z.iso.datetime({offset:true}).optional()}).strict();
export async function saveOutreach(session:StudioSession,id:string,revision:number,content:OutreachContent){return database<OutreachResult>(session,'rpc/studio_outreach_command',{method:'POST',body:JSON.stringify({p_id:id,p_action:'save',p_revision:revision,p_content:outreachContentSchema.parse(content)})});}
export async function outreachAction(session:StudioSession,id:string,input:z.infer<typeof outreachActionSchema>){
  const current=await getOutreach(session,id);if(!current)throw new StudioError(404,'This outreach draft was not found.');
  if(['approve','request_changes'].includes(input.action)&&session.staff.role!=='admin')throw new StudioError(403,'An administrator must review this draft.');
  if(['approve','record_sent'].includes(input.action)&&!input.confirmed)throw new StudioError(400,'Confirm the review or manual sending before continuing.');
  if(['submit','approve'].includes(input.action)){const issues=outreachReadiness(current.content);if(issues.length)throw new StudioError(400,issues.join(' '));}
  if(input.action==='request_changes'&&input.note.length<3)throw new StudioError(400,'Describe the changes needed.');
  if(input.action==='record_sent'&&!input.prospect_version)throw new StudioError(400,'Reload the current prospect before recording the message.');
  return database<OutreachResult>(session,'rpc/studio_outreach_command',{method:'POST',body:JSON.stringify({p_id:id,p_action:input.action,p_revision:input.revision,p_confirmed:input.confirmed,p_note:input.note,p_follow_up:input.follow_up_at,p_prospect_version:input.prospect_version||null})});
}
export async function pipeline(session:StudioSession,filters:unknown){const input=pipelineFiltersSchema.parse(filters);return database<PipelineResult>(session,'rpc/studio_pipeline',{method:'POST',body:JSON.stringify({p_query:input.q,p_owner:input.owner,p_priority:input.priority,p_due:input.due,p_stage:input.stage,p_view:input.view,p_page:input.page})});}
export const pipelinePatchSchema=z.object({expected_updated_at:z.iso.datetime({offset:true}),lifecycle_status:z.enum(stages).optional(),assigned_to:z.uuid().nullable().optional(),priority:z.enum(['high','normal','low']).optional(),follow_up_at:z.iso.datetime({offset:true}).nullable().optional()}).strict().refine(input=>Object.keys(input).length>1,'Choose a pipeline change.');
export async function updatePipeline(session:StudioSession,id:string,input:z.infer<typeof pipelinePatchSchema>){
  const {expected_updated_at,...patch}=pipelinePatchSchema.parse(input);
  const rows=await database<Prospect[]>(session,'studio_prospects?'+new URLSearchParams({id:'eq.'+z.uuid().parse(id),updated_at:'eq.'+expected_updated_at,select:'*'}),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});
  if(!rows.length)throw new StudioError(409,'This prospect changed. Reload before updating it.');return rows[0];
}
