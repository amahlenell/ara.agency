import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStudio } from '@/src/server/studio/context';
import { getProspect,activities,staffList } from '@/src/server/studio/transport';
import { getAudit } from '@/src/server/studio/audits';
import { getOutreach,outreachPreference } from '@/src/server/studio/outreach';
import { OutreachEditor,ContactPreference } from '@/components/studio/outreach/OutreachForms';
import { Activity } from '@/components/studio/Activity';
export default async function OutreachWorkspace({params}:{params:Promise<{id:string}>}){
  const session=await requireStudio();const {id}=await params;const outreach=await getOutreach(session,id);if(!outreach)notFound();
  const [prospect,audit,preference,history,staff]=await Promise.all([getProspect(session,outreach.prospect_id),getAudit(session,outreach.source_audit_id),outreachPreference(session,outreach.prospect_id),activities(session,outreach.prospect_id),staffList(session)]);if(!prospect)notFound();
  return <><Link className="studio-text-link" href="/studio/outreach">All outreach</Link><div className="studio-page-heading"><div><span className="studio-kicker">{outreach.reply_to_id?'Follow-up':'Initial message'} / Manual outreach</span><h1>{prospect.business_name}</h1><p>A reviewed message, with the observations behind it.</p></div><Link className="studio-button studio-button-secondary" href={'/studio/prospects/'+prospect.id}>Prospect workspace</Link></div><OutreachEditor key={outreach.id} outreach={outreach} prospect={prospect} audit={audit} paused={preference.blocked} isAdmin={session.staff.role==='admin'} readOnly={!!session.preview}/><ContactPreference key={preference.revision} preference={preference} isAdmin={session.staff.role==='admin'} readOnly={!!session.preview}/><section className="studio-card"><div className="studio-section-title"><h2>Outreach activity</h2><Link className="studio-text-link" href={'/studio/audits/'+outreach.source_audit_id}>Source audit report</Link></div><Activity records={history.filter(item=>item.metadata.outreach_id===id)} staff={staff}/></section></>;
}
