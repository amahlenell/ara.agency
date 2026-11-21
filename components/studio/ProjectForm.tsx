'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { studioRequest } from './redesigns/client';
import { projectDetails, projectStages } from '@/src/server/studio/project-content';
import type { ProjectDetails } from '@/src/server/studio/project-content';
import type { Staff } from '@/src/server/studio/domain';
import { stageLabel } from '@/src/server/studio/stages';

type Props = {
  id: string;
  initial: ProjectDetails;
  staff: Staff[];
  admin: boolean;
  readOnly?: boolean;
} & ({ version: string } | { revision: number });

export function ProjectForm(props: Props) {
  const router = useRouter();
  const converting = 'version' in props;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState('revision' in props ? props.revision : 0);
  const [savedStatus, setSavedStatus] = useState(props.initial.status);
  const initial = props.initial;

  return <form className="studio-card" onSubmit={async event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const details = projectDetails.safeParse({
      title: fields.get('title'), scope: fields.get('scope'), next_step: fields.get('next_step'),
      status: fields.get('status') || savedStatus, assigned_to: fields.get('assigned_to') || null,
      due_on: fields.get('due_on') || null,
    });
    setMessage('');
    if (!details.success) {
      setError('Check the project title, scope and delivery details.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const input = 'version' in props
        ? { details: details.data, confirmed: fields.get('confirmed') === 'on', version: props.version }
        : { details: details.data, revision };
      const { project } = await studioRequest('/studio/api/projects/' + props.id, converting ? 'POST' : 'PATCH', input);
      if (converting) router.push('/studio/projects/' + project.id);
      else {
        setRevision(project.revision);
        setSavedStatus(project.status);
        setMessage('Project saved.');
      }
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The project could not be saved.');
    } finally {
      setBusy(false);
    }
  }}>
    <fieldset disabled={busy || props.readOnly} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <label>Project title<input name="title" defaultValue={initial.title} required minLength={3} maxLength={180}/></label>
      <label>Agreed scope<textarea name="scope" defaultValue={initial.scope} rows={5} required minLength={10} maxLength={4000}/></label>
      <div className="studio-form-grid">
        <label>Project owner<select name="assigned_to" defaultValue={initial.assigned_to || ''}>
          <option value="">Unassigned</option>
          {props.staff.filter(person => person.active || person.id === initial.assigned_to).map(person =>
            <option key={person.id} value={person.id}>{person.display_name}{person.active ? '' : ' (inactive)'}</option>)}
        </select></label>
        <label>Target date<input type="date" name="due_on" defaultValue={initial.due_on || ''} min="1900-01-01" max="9999-12-31"/></label>
      </div>
      {!converting && <label>Status<select name="status" defaultValue={initial.status} disabled={savedStatus === 'completed' && !props.admin}>
        {projectStages.map(stage => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}
      </select></label>}
      <label>Next step<textarea name="next_step" defaultValue={initial.next_step} rows={3} maxLength={500}/></label>
      {converting && <label className="studio-checkbox"><input type="checkbox" name="confirmed" required/>I confirm the client accepted this work and the scope above reflects what was agreed.</label>}
      <button className="studio-button">{busy ? 'Saving…' : converting ? 'Approve and create project' : 'Save project'}</button>
    </fieldset>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {message && <p className="redesign-success" role="status">{message}</p>}
  </form>;
}
