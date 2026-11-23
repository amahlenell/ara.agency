import type { AuditReport } from './audit-report.ts';
import { analyzePage } from './audit-report.ts';
import { AuditFailure, fetchAuditPage } from './audit-network.ts';
import { database, getProspect, StudioError } from './transport.ts';
import type { StudioSession } from './transport.ts';

export type Audit = {
  id:string; prospect_id:string; website_url:string; requested_by:string; created_at:string;
  completed_at:string|null; status:'running'|'completed'|'failed'; report:AuditReport|null; error_message:string|null; interrupted?:boolean;
};
export const auditSelect='id,prospect_id,website_url,requested_by,created_at,completed_at,status,report,error_message';
export async function listAudits(session:StudioSession,prospectId?:string) {
  const params=new URLSearchParams({select:auditSelect,order:'created_at.desc',limit:'50'});
  if(prospectId)params.set('prospect_id','eq.'+prospectId);
  return (await database<Audit[]>(session,'studio_audits?'+params)).map(audit=>({...audit,interrupted:audit.status==='running'&&Date.now()-Date.parse(audit.created_at)>120_000}));
}
export async function getAudit(session:StudioSession,id:string) {
  const params=new URLSearchParams({select:auditSelect,id:'eq.'+id,limit:'1'});
  const audit=(await database<Audit[]>(session,'studio_audits?'+params))[0];
  return audit?{...audit,interrupted:audit.status==='running'&&Date.now()-Date.parse(audit.created_at)>120_000}:null;
}
export async function runAudit(session:StudioSession,prospectId:string,inspect=fetchAuditPage) {
  const prospect=await getProspect(session,prospectId);
  if(!prospect)throw new StudioError(404,'This prospect was not found.');
  if(prospect.lifecycle_status==='archived')throw new StudioError(409,'Restore this prospect before running an audit.');
  const rows=await database<Audit[]>(session,'studio_audits?select='+auditSelect,{
    method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({prospect_id:prospect.id,requested_by:session.staff.id,website_url:prospect.website_url}),
  });
  const audit=rows[0];if(!audit)throw new StudioError(503,'The audit could not be started.');
  let result:{status:'completed';report:AuditReport}|{status:'failed';error_message:string};
  try {
    const page = await inspect(audit.website_url);
    try {
      result = { status:'completed', report:analyzePage(page, audit.website_url) };
    } catch {
      console.error('Studio could not generate an audit report', { auditId:audit.id });
      result = { status:'failed', error_message:'Studio reached the website but could not analyze its HTML.' };
    }
  }
  catch(error) {
    result={status:'failed',error_message:error instanceof AuditFailure?error.message:error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)?'The website took too long to respond. Try again later.':'The website could not be reached securely. It may be unavailable or blocking automated requests.'};
  }
  const saved=await database<Audit[]>(session,'studio_audits?'+new URLSearchParams({id:'eq.'+audit.id,status:'eq.running',select:auditSelect}),{
    method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(result),
  });
  if(!saved[0])throw new StudioError(409,'This audit changed while it was running. Reload the report.');
  return saved[0];
}
