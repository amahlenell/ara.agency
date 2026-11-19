import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStudio } from '@/src/server/studio/context';
import { getProspect,staffList,activities } from '@/src/server/studio/transport';
import { transitions,stageLabel } from '@/src/server/studio/domain';
import { ProspectForm } from '@/components/studio/Forms';
import { Activity } from '@/components/studio/Activity';
import { AuditButton } from '@/components/studio/AuditButton';
import { AuditHistory } from '@/components/studio/AuditHistory';
import { listAudits } from '@/src/server/studio/audits';

export default async function Workspace({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;const session=await requireStudio();
  const prospect=await getProspect(session,id);if(!prospect)notFound();
  const [staff,history,audits]=await Promise.all([staffList(session),activities(session,id),listAudits(session,id)]);
  return <>
    <Link className="studio-text-link" href="/studio/prospects">All prospects</Link>
    <div className="studio-page-heading"><div><span className="studio-kicker">Prospect workspace</span><h1>{prospect.business_name}</h1><p>{prospect.industry} · {prospect.country} · <a href={prospect.website_url} target="_blank" rel="noreferrer">Visit website</a></p></div><span className="studio-stage">{stageLabel(prospect.lifecycle_status)}</span></div>
    <nav className="studio-tabs" aria-label="Prospect workspace"><a href="#audit">Website audit</a><a href="#overview">Overview</a><a href="#activity">Activity</a>{['Screenshots','Redesign','Outreach','Client project'].map(name=><span key={name} aria-disabled="true">{name} · planned</span>)}</nav>
    <section className="studio-card studio-audit-intro" id="audit">
      <div><span className="studio-kicker">Website audit</span><h2>Find the opportunities in this website.</h2><p>Check the saved page for SEO, mobile setup, accessibility and performance signals. Get a private report with evidence and recommended next steps.</p><p className="studio-help">Save website URL changes before running. Browser speed tests and visual reviews are separate checks.</p><AuditButton prospectId={id} disabled={prospect.lifecycle_status==='archived'}/></div>
      <div><h3>Previous audits</h3><AuditHistory audits={audits}/></div>
    </section>
    <section id="overview"><ProspectForm prospect={prospect} staff={staff} allowedStages={[prospect.lifecycle_status,...transitions[prospect.lifecycle_status]]}/></section>
    <section className="studio-card" id="activity"><h2>Activity history</h2><p className="studio-help">Changes are recorded with their author and time. Contact details and free-text notes are excluded from history snapshots.</p><Activity records={history} staff={staff}/></section>
  </>;
}
