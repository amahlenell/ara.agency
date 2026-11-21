import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStudio } from '@/src/server/studio/context';
import { getRedesign } from '@/src/server/studio/redesigns';
import { BeautySalonSite } from '@/components/studio/redesigns/BeautySalonSite';
export default async function SavedRedesignPreview({ params }: { params: Promise<{id:string}> }) {
  const session = await requireStudio(); const { id } = await params; const redesign = await getRedesign(session, id); if (!redesign) notFound();
  return <><header className="redesign-standalone-toolbar"><Link href={'/studio/redesigns/' + id}>← Back to editor</Link><span>Staff preview · Revision {redesign.revision} · {redesign.status.replaceAll('_', ' ')}</span></header><main id="main" className="redesign-standalone-main"><BeautySalonSite content={redesign.content} draft={redesign.status !== 'approved'}/></main></>;
}
