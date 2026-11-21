import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireStudio } from '@/src/server/studio/context';
import { activities, staffList } from '@/src/server/studio/transport';
import { listProjects } from '@/src/server/studio/projects';
import { stageLabel } from '@/src/server/studio/stages';
import { ProjectForm } from '@/components/studio/ProjectForm';
import { Activity } from '@/components/studio/Activity';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStudio();
  const id = z.uuid().safeParse((await params).id).data;
  if (!id) notFound();
  const [project] = await listProjects(session, { id: 'eq.' + id, limit: '1' });
  if (!project) notFound();
  const [staff, history] = await Promise.all([staffList(session), activities(session, project.prospect_id)]);

  return <>
    <Link className="studio-text-link" href="/studio/projects">All projects</Link>
    <div className="studio-page-heading"><div><h1>{project.title}</h1>
      <p>{project.client_name} · {stageLabel(project.status)}</p>
      <p>Approved by {staff.find(person => person.id === project.approved_by)?.display_name || 'Studio administrator'}</p>
    </div><Link className="studio-button studio-button-secondary" href={'/studio/prospects/' + project.prospect_id}>Source prospect</Link></div>
    <ProjectForm key={project.id} id={project.id} revision={project.revision} initial={project}
      staff={staff} admin={session.staff.role === 'admin'} readOnly={!!session.preview}/>
    <section className="studio-card"><h2>Project activity</h2>
      <Activity records={history.filter(record => record.metadata.project_id === id)} staff={staff}/>
    </section>
  </>;
}
