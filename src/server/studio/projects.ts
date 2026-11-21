import { database } from './transport.ts';
import type { StudioSession } from './transport.ts';
import type { Project, ProjectDetails } from './project-content.ts';

export function listProjects(session: StudioSession, params: Record<string, string> = {}) {
  return database<Project[]>(session, 'studio_projects?' + new URLSearchParams({
    select: '*', order: 'updated_at.desc,id.asc', limit: '26', ...params,
  }));
}

export function projectCommand(session: StudioSession, id: string, details: ProjectDetails,
  change: { action: 'convert'; version: string } | { action: 'update'; revision: number }) {
  return database<Project>(session, 'rpc/studio_project_command', {
    method: 'POST',
    body: JSON.stringify({
      p_id: id, p_action: change.action, p_details: details,
      p_revision: change.action === 'update' ? change.revision : 0,
      ...(change.action === 'convert' && { p_confirmed: true, p_prospect_version: change.version }),
    }),
  });
}
