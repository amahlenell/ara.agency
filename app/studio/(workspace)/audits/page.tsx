import Link from 'next/link';
import { requireStudio } from '@/src/server/studio/context';
import { listAudits } from '@/src/server/studio/audits';
import { AuditHistory } from '@/components/studio/AuditHistory';
export default async function AuditsPage() {
  const session=await requireStudio();const audits=await listAudits(session);
  return <><div className="studio-page-heading"><div><span className="studio-kicker">Website audits</span><h1>Evidence for the next conversation.</h1><p>Saved website checks, findings and recommended improvements. The latest 50 audits are shown.</p></div><Link className="studio-button studio-button-secondary" href="/studio/prospects">Choose a prospect</Link></div><section className="studio-card"><h2>Audit history</h2><AuditHistory audits={audits}/></section></>;
}
