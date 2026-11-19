import type { Audit } from '@/src/server/studio/audits';

export function AuditHistory({audits}:{audits:Audit[]}) {
  return audits.length?<ol className="studio-audit-history">{audits.map(audit=><li key={audit.id}>
    <div><a className="studio-text-link" href={'/studio/audits/'+audit.id}>{audit.status==='completed'?'View audit report':audit.status==='failed'?'View failed audit':'View audit progress'}</a><span className={'studio-audit-badge '+audit.status}>{audit.interrupted?'Interrupted':audit.status}</span></div>
    <p>{new Date(audit.created_at).toLocaleString('en-NZ',{timeZone:'UTC'})} UTC · {audit.report?`${audit.report.checksPassed}/${audit.report.checksTotal} automated checks passed`:audit.error_message||'Audit in progress. Open for details.'}</p>
    <span className="studio-audit-url">{audit.website_url}</span>
  </li>)}</ol>:<p>No audits yet. Run a website audit to save the first report.</p>;
}
