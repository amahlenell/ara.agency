import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStudio } from '@/src/server/studio/context';
import { getProspect, activities, staffList } from '@/src/server/studio/transport';
import { getRedesign, listRedesignDemos } from '@/src/server/studio/redesigns';
import { getAudit } from '@/src/server/studio/audits';
import { RedesignEditor } from '@/components/studio/redesigns/RedesignEditor';
import { Activity } from '@/components/studio/Activity';
export default async function RedesignWorkspace({ params }: { params: Promise<{id:string}> }) {
  const session = await requireStudio(); const { id } = await params; const redesign = await getRedesign(session, id); if (!redesign) notFound();
  const [prospect, demos, staff, history, audit] = await Promise.all([getProspect(session, redesign.prospect_id), listRedesignDemos(session, id), staffList(session), activities(session, redesign.prospect_id), redesign.source_audit_id ? getAudit(session, redesign.source_audit_id) : Promise.resolve(null)]);
  if (!prospect) notFound();
  const summary = audit?.report ? { title: audit.report.pageTitle, description: audit.report.description, analyzedAt: audit.report.analyzedAt, warnings: audit.report.findings.filter(item => item.status === 'warning').map(item => item.title) } : null;
  return <><Link className="studio-text-link" href="/studio/redesigns">All redesigns</Link><div className="studio-page-heading"><div><span className="studio-kicker">Redesign editor</span><h1>{prospect.business_name}</h1><p>Shape the concept, compare it with the original and prepare it for review.</p></div><Link className="studio-button studio-button-secondary" href={'/studio/prospects/' + prospect.id}>Prospect workspace</Link></div><RedesignEditor key={redesign.id} redesign={redesign} demos={demos} isAdmin={session.staff.role === 'admin'} readOnly={!!session.preview} archived={prospect.lifecycle_status === 'archived'} audit={summary}/><section className="studio-card"><h2>Redesign activity</h2><Activity records={history.filter(item => item.metadata.redesign_id === id)} staff={staff}/></section></>;
}
