import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireStudio } from '@/src/server/studio/context';
import { getAudit } from '@/src/server/studio/audits';
import { getProspect } from '@/src/server/studio/transport';
import { AuditButton } from '@/components/studio/AuditButton';

export default async function AuditPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
  const session=await requireStudio();const audit=await getAudit(session,id);if(!audit)notFound();
  const prospect=await getProspect(session,audit.prospect_id);if(!prospect)notFound();
  const report=audit.report;const stale=audit.interrupted;
  return <><a className="studio-text-link" href={'/studio/prospects/'+audit.prospect_id+'#audit'}>Back to {prospect.business_name}</a>
    <div className="studio-page-heading"><div><span className="studio-kicker">Website audit · {audit.status}</span><h1>{prospect.business_name}</h1><p className="studio-audit-url">{audit.website_url}</p><p>{new Date(audit.created_at).toLocaleString('en-NZ',{timeZone:'UTC'})} UTC</p></div><AuditButton prospectId={prospect.id} label="Run a new audit" disabled={!!session.preview||prospect.lifecycle_status==='archived'||(audit.status==='running'&&!stale)}/></div>
    {report&&audit.website_url===prospect.website_url&&<p><a className="studio-button studio-button-secondary" href={"/studio/outreach/new?prospect="+prospect.id+"&audit="+audit.id}>Create outreach draft from this audit</a></p>}
    {audit.website_url!==prospect.website_url&&<div className="studio-notice">This report is for an earlier website URL. Run a new audit to check the current saved website.</div>}
    {audit.status==='failed'&&<section className="studio-card"><h2>The audit could not be completed.</h2><p className="studio-error">{audit.error_message}</p><p>No successful report or score was generated. Check the website address and try again later.</p></section>}
    {audit.status==='running'&&<section className="studio-card"><h2>{stale?'This audit appears to have been interrupted.':'The audit is running.'}</h2><p>{stale?'No completed report was saved. You can start a new audit; this attempt remains in the history.':'Refresh this page shortly to see the saved result.'}</p><a className="studio-text-link" href={'/studio/audits/'+id}>Refresh report</a></section>}
    {report&&<>
      <section className="studio-card studio-audit-summary"><div><span className="studio-kicker">Baseline HTML audit</span><h2>{report.checksPassed} of {report.checksTotal} automated checks passed</h2><p>Prioritise the flagged checks, then review the website in a browser. This count is not a quality rating or Lighthouse score.</p></div><div className="studio-audit-count"><strong>{report.findings.filter(f=>f.status==='warning').length}</strong><span>checks to review</span></div></section>
      <section className="studio-card"><h2>Page evidence</h2><dl className="studio-audit-evidence"><dt>Final URL</dt><dd>{report.finalUrl}</dd><dt>Page title</dt><dd>{report.pageTitle||'Not detected'}</dd><dt>Response</dt><dd>HTTP {report.httpStatus} · {report.responseMs} ms to HTML response headers · {Math.round(report.htmlBytes/1024)} KiB HTML</dd><dt>Scope</dt><dd>One page. Public HTML only; scripts and remote assets are not executed.</dd></dl></section>
      <section className="studio-card"><h2>Recommended next steps</h2>{report.findings.some(f=>f.status==='warning')?<ol className="studio-audit-recommendations">{[...report.findings].filter(f=>f.status==='warning').sort((a,b)=>({high:0,medium:1,low:2}[a.priority]-{high:0,medium:1,low:2}[b.priority])).map(f=><li key={f.id}><strong>{f.title}</strong><span>{f.recommendation}</span></li>)}</ol>:<p>No automated warnings were found. Complete the manual reviews below before drawing conclusions about the website.</p>}</section>
      {['SEO','Mobile setup','Accessibility','Performance','Conversion','Security'].map(category=><section className="studio-card" key={category}><h2>{category}</h2><div className="studio-audit-findings">{report.findings.filter(f=>f.category===category).map(f=><article key={f.id}><div><h3>{f.title}</h3><span className={'studio-audit-badge '+f.status}>{f.status==='pass'?'Passed':f.status==='warning'?'Review':'Manual review'}</span></div><p>{f.evidence}</p>{f.status!=='pass'&&<p className="studio-audit-advice">{f.recommendation}</p>}</article>)}</div></section>)}
      <section className="studio-card"><h2>What this report covers</h2><ul>{report.limitations.map(item=><li key={item}>{item}</li>)}</ul><p className="studio-help">Results are observations from {new Date(report.analyzedAt).toLocaleString('en-NZ',{timeZone:'UTC'})} UTC. Website content may change. Checks use audit rules v1.</p></section>
    </>}
  </>;
}
