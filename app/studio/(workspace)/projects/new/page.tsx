import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { requireStudio } from '@/src/server/studio/context';
import { getProspect, staffList } from '@/src/server/studio/transport';
import { listProjects } from '@/src/server/studio/projects';
import { ProjectForm } from '@/components/studio/ProjectForm';

export default async function ConvertProject({ searchParams }: { searchParams: Promise<{ prospect?: string }> }) {
  const session = await requireStudio();
  const id = z.uuid().safeParse((await searchParams).prospect).data;
  if (!id) redirect('/studio/pipeline?stage=won&view=list');
  const [prospect, staff, existing] = await Promise.all([
    getProspect(session, id), staffList(session), listProjects(session, { prospect_id: 'eq.' + id, limit: '1' }),
  ]);
  if (!prospect) notFound();
  if (existing[0]) redirect('/studio/projects/' + existing[0].id);

  const allowed = session.staff.role === 'admin' && !session.preview && prospect.lifecycle_status === 'won';
  return <>
    <Link className="studio-text-link" href={'/studio/prospects/' + id}>Back to prospect</Link>
    <div className="studio-page-heading"><div><h1>Create project for {prospect.business_name}</h1>
      <p>Record the accepted scope and hand over the next delivery step.</p></div></div>
    {allowed ? <ProjectForm id={id} version={prospect.updated_at} staff={staff} admin initial={{
      title: ('Client project for ' + prospect.business_name).slice(0, 180), scope: '', next_step: '',
      assigned_to: staff.some(person => person.id === prospect.assigned_to && person.active) ? prospect.assigned_to : null,
      due_on: null, status: 'planned',
    }}/> : <p className="studio-notice">An administrator can create a project once this prospect is marked Won.</p>}
  </>;
}
