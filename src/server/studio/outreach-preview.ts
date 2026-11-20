import {buildOutreachDraft,selectedEvidence,pipelineFiltersSchema} from './outreach-content.ts';
import type {Outreach,PipelineCard,PipelineResult} from './outreach-content.ts';
import type {Prospect,Staff} from './domain.ts';
import type {Audit} from './audits.ts';
export function sampleOutreach(prospect:Prospect,audit:Audit,staff:Staff):Outreach{
 const ids=audit.report!.findings.filter(item=>item.status==='warning').slice(0,2).map(item=>item.id);const content=buildOutreachDraft(prospect,audit,ids,'Sample ARA founder');
 return {id:'88888888-8888-4888-8888-888888888888',prospect_id:prospect.id,source_audit_id:audit.id,reply_to_id:null,content,evidence:selectedEvidence(audit,ids,prospect),revision:1,status:'draft',review_note:'',created_by:staff.id,approved_by:null,approved_at:null,approved_revision:null,sent_by:null,sent_recorded_at:null,created_at:prospect.created_at,updated_at:prospect.updated_at};
}
export function samplePipeline(prospects:Prospect[],input:Record<string,unknown>):PipelineResult{
 const filters=pipelineFiltersSchema.parse({q:input.p_query,owner:input.p_owner,priority:input.p_priority,due:input.p_due,stage:input.p_stage,view:input.p_view,page:input.p_page});const now=Date.now();
 const base=prospects.filter(row=>(row.lifecycle_status!=='archived'||filters.stage==='archived')&&(!filters.q||(row.business_name+' '+row.normalized_domain).toLowerCase().includes(filters.q.toLowerCase()))&&(filters.owner==='all'||(filters.owner==='unassigned'?!row.assigned_to:row.assigned_to===filters.owner))&&(filters.priority==='all'||row.priority===filters.priority)&&(!filters.due||(!!row.follow_up_at&&Date.parse(row.follow_up_at)<=now&&!['won','lost','archived'].includes(row.lifecycle_status))));
 const counts:Record<string,number>={};for(const row of base)counts[row.lifecycle_status]=(counts[row.lifecycle_status]||0)+1;
 const chosen=base.filter(row=>filters.stage==='all'||row.lifecycle_status===filters.stage).sort((a,b)=>({high:0,normal:1,low:2}[a.priority]-{high:0,normal:1,low:2}[b.priority])||(a.follow_up_at===b.follow_up_at?0:a.follow_up_at===null?1:b.follow_up_at===null?-1:a.follow_up_at.localeCompare(b.follow_up_at))||b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id));
 const seen:Record<string,number>={};const selected=filters.view==='list'?chosen.slice((filters.page-1)*25,filters.page*25):chosen.filter(row=>(seen[row.lifecycle_status]=(seen[row.lifecycle_status]||0)+1)<=8);
 const rows:PipelineCard[]=selected.map(row=>({id:row.id,business_name:row.business_name,normalized_domain:row.normalized_domain,lifecycle_status:row.lifecycle_status,priority:row.priority,assigned_to:row.assigned_to,follow_up_at:row.follow_up_at,updated_at:row.updated_at,outreach_paused:false,followup_due:!!row.follow_up_at&&Date.parse(row.follow_up_at)<=now&&!['won','lost','archived'].includes(row.lifecycle_status),last_manual_sent_at:null}));
 return {total:base.length,matching:chosen.length,due:base.filter(row=>row.follow_up_at&&Date.parse(row.follow_up_at)<=now&&!['won','lost','archived'].includes(row.lifecycle_status)).length,paused:0,counts,rows};
}
