'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { studioRequest } from './client';
export function CreateRedesignButton({ prospectId, disabled = false }: { prospectId: string; disabled?: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <div><button className="studio-button" disabled={disabled || busy} onClick={async () => { setBusy(true); setError(''); try { const result = await studioRequest('/studio/api/redesigns', 'POST', { prospect_id: prospectId }); router.push('/studio/redesigns/' + result.redesign.id); } catch (error) { setError(error instanceof Error ? error.message : 'The draft could not be created.'); setBusy(false); } }}>{busy ? 'Creating draft…' : 'Create Beauty Salon draft'}</button>{error && <p className="studio-error" role="alert">{error}</p>}</div>;
}
