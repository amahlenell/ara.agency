import { z } from 'zod';
import { isIP } from 'node:net';

export const stages = ['discovered','researching','audited','demo_in_progress','demo_ready','contacted','replied','meeting_booked','proposal_sent','won','lost','archived'] as const;
export type Stage = typeof stages[number];
export const transitions: Record<Stage, readonly Stage[]> = {
  discovered:['researching','archived'], researching:['discovered','audited','archived'],
  audited:['researching','demo_in_progress','archived'], demo_in_progress:['audited','demo_ready','archived'],
  demo_ready:['demo_in_progress','contacted','archived'], contacted:['replied','lost','archived'],
  replied:['meeting_booked','proposal_sent','lost','archived'], meeting_booked:['replied','proposal_sent','lost','archived'],
  proposal_sent:['meeting_booked','won','lost','archived'], won:['archived'], lost:['researching','archived'], archived:['discovered'],
};
export const stageLabel = (value:string) => value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function assertTransition(before:Stage,after:Stage){if(before!==after&&!transitions[before].includes(after))throw new Error('This lifecycle transition is not allowed.');}

export function normalizeWebsite(value:string){
  const url=new URL(value.trim());
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>2048)throw new Error('Use a public HTTP or HTTPS website without credentials.');
  if(url.port&&!['80','443'].includes(url.port))throw new Error('Only standard website ports are supported.');
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  const ip=isIP(host.replace(/^\[|\]$/g,''));
  if(ip===6||!host.includes('.')||/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)||host==='metadata.google.internal')throw new Error('Use a public website hostname.');
  if(ip===4){const [a,b,c]=host.split('.').map(Number);if(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0&&c===113))throw new Error('Private and reserved network addresses are not supported.');}
  url.hostname=host;url.hash='';
  return {website_url:url.href,normalized_domain:host.replace(/^www\./,'')};
}
const optionalText=(max:number)=>z.string().trim().max(max).default('');
export const prospectSchema=z.object({
  business_name:z.string().trim().min(2).max(180), website_url:z.string().trim().max(2048),
  industry:z.string().trim().min(2).max(120), country:z.string().trim().min(2).max(80), city:optionalText(120),
  contact_name:optionalText(180),contact_email:z.union([z.email(),z.literal('')]).default(''),contact_phone:optionalText(60),
  social_links:z.array(z.url().max(2048).refine(url=>['https:','http:'].includes(new URL(url).protocol),'Use HTTP or HTTPS social links.')).max(10).default([]),
  business_description:optionalText(4000),source:optionalText(300),priority:z.enum(['low','normal','high']).default('normal'),
  lifecycle_status:z.enum(stages).default('discovered'),assigned_to:z.uuid().nullable().default(null),notes:optionalText(8000),
  follow_up_at:z.iso.datetime({offset:true}).nullable().default(null),
}).strict();
export function parseProspect(input:unknown){const fields=prospectSchema.parse(input);return {...fields,...normalizeWebsite(fields.website_url)};}
export type ProspectInput=ReturnType<typeof parseProspect>;
export type Staff={id:string;auth_user_id:string;display_name:string;role:'admin'|'editor';active:boolean};
export type Prospect=ProspectInput & {id:string;created_at:string;updated_at:string;created_by:string};
export type Activity={id:string;entity_type:string;entity_id:string;action:string;actor_user_id:string|null;previous_state:Record<string,unknown>|null;new_state:Record<string,unknown>|null;metadata:{changed_fields?:string[]};created_at:string};
export function canManageStaff(staff:Staff|null){return staff?.active===true&&staff.role==='admin';}
export const bodySphere = {business_name:'Body Sphere Beauty',website_url:'https://www.bodyspherebeauty.co.za/',industry:'Beauty & Wellness',country:'South Africa'};
