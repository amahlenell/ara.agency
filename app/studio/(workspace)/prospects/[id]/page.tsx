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
import { listProjects } from '@/src/server/studio/projects';
import { listRedesigns } from '@/src/server/studio/redesigns';
import { listOutreach,outreachPreference } from '@/src/server/studio/outreach';
import { ContactPreference } from '@/components/studio/outreach/OutreachForms';

export default async function Workspace({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;const session=await requireStudio();
  const prospect=await getProspect(session,id);if(!prospect)notFound();
  const [staff,history,audits,redesigns,outreach,preference,projects]=await Promise.all([staffList(session),activities(session,id),listAudits(session,id),listRedesigns(session,id),listOutreach(session,{prospect:id}),outreachPreference(session,id),listProjects(session,{prospect_id:"eq."+id,limit:"1"})]);
  return <>
    <Link className="studio-text-link" href="/studio/prospects">All prospects</Link>
    <div className="studio-page-heading"><div><span className="studio-kicker">Prospect workspace</span><h1>{prospect.business_name}</h1><p>{prospect.industry} · {prospect.country} · <a href={prospect.website_url} target="_blank" rel="noreferrer">Visit website</a></p></div><span className="studio-stage">{stageLabel(prospect.lifecycle_status)}</span></div>
    <nav className="studio-tabs" aria-label="Prospect workspace"><a href="#audit">Website audit</a><a href="#redesigns">Redesigns</a><a href="#overview">Overview</a><a href="#outreach">Outreach</a><a href="#projects">Client project</a><a href="#activity">Activity</a>{['Screenshots'].map(name=><span key={name} aria-disabled="true">{name} · planned</span>)}</nav>
    <section className="studio-card studio-audit-intro" id="audit">
      <div><span className="studio-kicker">Website audit</span><h2>Find the opportunities in this website.</h2><p>Check the saved page for SEO, mobile setup, accessibility and performance signals. Get a private report with evidence and recommended next steps.</p><p className="studio-help">Save website URL changes before running. Browser speed tests and visual reviews are separate checks.</p><AuditButton prospectId={id} disabled={!!session.preview||prospect.lifecycle_status==='archived'}/></div>
      <div><h3>Previous audits</h3><AuditHistory audits={audits}/></div>
    </section>
    <section className="studio-card" id="redesigns"><div className="studio-section-title"><div><span className="studio-kicker">Phase 3 / Redesigns</span><h2>Turn the opportunity into a concept.</h2></div><Link className="studio-button studio-button-secondary" href={'/studio/redesigns/new?prospect='+id}>New redesign</Link></div><p>Build a draft from the company website. Review its copy, services and customer actions, then share an approved private preview.</p>{redesigns.length ? <ul>{redesigns.slice(0,5).map(design=><li key={design.id}><Link className="studio-text-link" href={'/studio/redesigns/'+design.id}>{design.content.brand.name} - revision {design.revision} - {design.status.replaceAll('_',' ')}</Link></li>)}</ul> : <p className="studio-help">No redesigns yet for this prospect.</p>}{redesigns.length>5&&<Link className="studio-text-link" href={'/studio/redesigns?prospect='+id}>View all redesigns for this prospect</Link>}</section>
    <section className="studio-card" id="outreach"><div className="studio-section-title"><div><span className="studio-kicker">Phase 4 / Outreach</span><h2>Prepare a useful conversation.</h2></div><Link className="studio-button studio-button-secondary" href={'/studio/outreach/new?prospect='+id}>New outreach draft</Link></div><p>Choose observed audit findings, review the message, then record your manual sending and follow-up.</p>{outreach.rows.length?<ul>{outreach.rows.slice(0,5).map(row=><li key={row.id}><Link className="studio-text-link" href={'/studio/outreach/'+row.id}>{row.content.subject} - {row.status.replaceAll('_',' ')}</Link></li>)}</ul>:<p className="studio-help">No outreach drafts for this prospect yet.</p>}<Link className="studio-text-link" href={'/studio/outreach?prospect='+id}>All outreach records</Link></section>
    <ContactPreference key={preference.revision} preference={preference} isAdmin={session.staff.role==='admin'} readOnly={!!session.preview}/>
    <section className="studio-card" id="projects"><h2>Client project</h2>
      {projects[0] ? <Link className="studio-text-link" href={'/studio/projects/'+projects[0].id}>{projects[0].title} · {stageLabel(projects[0].status)}</Link>
        : prospect.lifecycle_status==='won' && session.staff.role==='admin' && !session.preview
          ? <Link className="studio-button" href={'/studio/projects/new?prospect='+id}>Review and create project</Link>
          : <p>An administrator can create a project after this prospect is marked Won.</p>}
    </section>
    <section id="overview"><ProspectForm readOnly={!!session.preview} prospect={prospect} staff={staff} allowedStages={[prospect.lifecycle_status,...transitions[prospect.lifecycle_status]]}/></section>
    <section className="studio-card" id="activity"><h2>Activity history</h2><p className="studio-help">Changes are recorded with their author and time. Contact details and free-text notes are excluded from history snapshots.</p><Activity records={history} staff={staff}/></section>
  </>;
}
