import Link from 'next/link';
import { z } from 'zod';
import { requireStudio } from '@/src/server/studio/context';
import { listProjects } from '@/src/server/studio/projects';
import { projectStages } from '@/src/server/studio/project-content';
import { stageLabel } from '@/src/server/studio/stages';

export default async function Projects({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const session = await requireStudio();
  const query = await searchParams;
  const status = z.enum(projectStages).safeParse(query.status).data;
  const page = Math.max(1, Math.min(10000, Number.parseInt(query.page || '') || 1));
  const rows = await listProjects(session, {
    offset: String((page - 1) * 25), ...(status && { status: 'eq.' + status }),
  });
  const pageLink = (next: number) => '/studio/projects?' + new URLSearchParams({ page: String(next), ...(status && { status }) });

  return <>
    <div className="studio-page-heading"><div><h1>Client projects</h1><p>Track agreed work, owners and delivery dates.</p></div>
      <Link className="studio-button studio-button-secondary" href="/studio/pipeline?stage=won&view=list">Won prospects</Link>
    </div>
    <form className="outreach-filter-bar" method="get">
      <label>Status<select name="status" defaultValue={status || ''}><option value="">All statuses</option>
        {projectStages.map(stage => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}
      </select></label>
      <button className="studio-button studio-button-secondary">Filter</button>
    </form>
    <div className="outreach-list">{rows.slice(0, 25).map(project => <article className="studio-card" key={project.id}>
      <div className="outreach-list-heading"><h2><Link href={'/studio/projects/' + project.id}>{project.title}</Link></h2>
        <span className="studio-stage">{stageLabel(project.status)}</span></div>
      <p>{project.client_name}{project.due_on && ' · Target ' + project.due_on}</p>
      {project.next_step && <p>{project.next_step}</p>}
    </article>)}</div>
    {!rows.length && <section className="studio-card studio-empty"><h2>No projects match this view</h2><p>Start from a won prospect to approve its first project.</p></section>}
    <nav className="studio-pagination" aria-label="Project pages">
      {page > 1 && <Link href={pageLink(page - 1)}>Previous</Link>}<span>Page {page}</span>
      {rows.length > 25 && <Link href={pageLink(page + 1)}>Next</Link>}
    </nav>
  </>;
}
