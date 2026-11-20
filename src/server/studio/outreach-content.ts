import { z } from 'zod';
import type { Prospect } from './domain.ts';
import type { Audit } from './audits.ts';
const privateCredential = /\/preview\/[a-f0-9-]{36}#[A-Za-z0-9_-]{43}/i;
export const outreachStatuses = ['draft','in_review','approved','sent','cancelled'] as const;
export const outreachContentSchema = z.object({
  channel: z.enum(['email','manual']), recipient: z.string().trim().max(254),
  subject: z.string().trim().min(3).max(180), body: z.string().trim().max(8000),
  finding_ids: z.array(z.string().regex(/^[a-z0-9_-]{1,80}$/)).min(1).max(3).refine(ids => new Set(ids).size === ids.length, 'Select each finding once.'),
}).strict().refine(doc => new TextEncoder().encode(JSON.stringify(doc)).length <= 17000, 'Keep the draft below 17 KB.')
  .refine(doc => ![doc.recipient,doc.subject,doc.body].some(value => privateCredential.test(value)), 'Add private preview links in your email app after copying. Their secrets must stay outside saved drafts.');
export type OutreachContent = z.infer<typeof outreachContentSchema>;
export type OutreachEvidence = { id:string; title:string; evidence:string; recommendation:string };
export type Outreach = {
  id:string;prospect_id:string;source_audit_id:string;reply_to_id:string|null;
  content:OutreachContent;evidence:OutreachEvidence[];revision:number;status:typeof outreachStatuses[number];review_note:string;
  created_by:string;approved_by:string|null;approved_at:string|null;approved_revision:number|null;
  sent_by:string|null;sent_recorded_at:string|null;created_at:string;updated_at:string;
};
export type OutreachPreference = {prospect_id:string;blocked:boolean;reason:string;revision:number;updated_by:string|null;updated_at:string|null};
export type OutreachProspectState = Pick<Prospect,'id'|'lifecycle_status'|'updated_at'|'follow_up_at'>;
export type OutreachResult = {outreach:Outreach;prospect:OutreachProspectState};
export function outreachReadiness(content:OutreachContent) {
  const issues:string[]=[];
  if(content.channel==='email' ? !z.email().max(254).safeParse(content.recipient).success : content.recipient.trim().length<3) issues.push('Add a verified recipient for this channel.');
  if(content.body.trim().length<40) issues.push('Write a message of at least 40 characters.');
  return issues;
}
export function selectedEvidence(audit:Audit, ids:string[], prospect:Pick<Prospect,'id'|'website_url'>):OutreachEvidence[] {
  if(audit.status!=='completed'||!audit.report||audit.prospect_id!==prospect.id||audit.website_url!==prospect.website_url) throw new Error('Choose a completed audit for this prospect’s current website.');
  if(!ids.length||ids.length>3||new Set(ids).size!==ids.length) throw new Error('Choose one to three distinct audit warnings.');
  return ids.map(id=>{const finding=audit.report!.findings.find(item=>item.id===id&&item.status==='warning');if(!finding)throw new Error('Only observed warnings from this saved audit can support the draft.');return {id,title:finding.title,evidence:finding.evidence,recommendation:finding.recommendation};});
}
export function buildOutreachDraft(prospect:Prospect,audit:Audit,ids:string[],sender:string,channel:OutreachContent['channel']='email',previous?:Outreach):OutreachContent {
  const evidence=selectedEvidence(audit,ids,prospect);
  const introduction=previous ? 'I’m following up on my previous note about '+prospect.normalized_domain+'.' : 'I’m '+sender+' from ARA. I took a look at '+prospect.normalized_domain+'.';
  return outreachContentSchema.parse({channel,recipient:channel==='email'?(z.email().max(254).safeParse(prospect.contact_email).success?prospect.contact_email:''):'',
    subject:(previous?(previous.content.subject.startsWith('Re: ')?previous.content.subject:'Re: '+previous.content.subject):'A website note for '+prospect.business_name).slice(0,180),
    finding_ids:ids,body:'Hi '+(prospect.contact_name||'team')+',\n\n'+introduction+'\n\nA saved HTML check on '+new Date(audit.report!.analyzedAt).toISOString().slice(0,10)+' recorded:\n\n'+evidence.map(item=>'- '+item.title+': '+item.evidence).join('\n')+'\n\nThese are page observations, rather than a complete browser performance test. Would you be open to a short conversation about the website?\n\nRegards,\n'+sender+'\nARA'});
}
export const pipelineFiltersSchema=z.object({q:z.string().trim().max(80).default(''),owner:z.union([z.literal('all'),z.literal('unassigned'),z.uuid()]).default('all'),priority:z.enum(['all','high','normal','low']).default('all'),due:z.boolean().default(false),stage:z.enum(['all','discovered','researching','audited','demo_in_progress','demo_ready','contacted','replied','meeting_booked','proposal_sent','won','lost','archived']).default('all'),view:z.enum(['board','list']).default('board'),page:z.number().int().min(1).max(10000).default(1)}).strict();
export type PipelineFilters=z.infer<typeof pipelineFiltersSchema>;
export type PipelineCard=Pick<Prospect,'id'|'business_name'|'normalized_domain'|'lifecycle_status'|'priority'|'assigned_to'|'follow_up_at'|'updated_at'> & {outreach_paused:boolean;followup_due:boolean;last_manual_sent_at:string|null};
export type PipelineResult={total:number;matching:number;due:number;paused:number;counts:Record<string,number>;rows:PipelineCard[]};
export function studioTime(value:string){return new Intl.DateTimeFormat('en-NZ',{dateStyle:'medium',timeStyle:'short',timeZone:'Pacific/Auckland'}).format(new Date(value))+' NZ time';}
