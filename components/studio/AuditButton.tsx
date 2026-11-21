'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AuditButton({prospectId,label='Run website audit',disabled=false}:{prospectId:string;label?:string;disabled?:boolean}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const router=useRouter();
  return <div className="studio-audit-action"><button type="button" className="studio-button" disabled={disabled||busy} onClick={async()=>{
    setBusy(true);setError('');
    try {
      const response=await fetch('/studio/api/prospects/'+prospectId+'/audits',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'The audit could not be started.');
      router.push('/studio/audits/'+result.id);router.refresh();
    } catch(error) { setError(error instanceof Error?error.message:'Connection lost. Check audit history before retrying.');setBusy(false); }
  }}>{busy?'Auditing website…':label}</button>
    {busy&&<p role="status" aria-live="polite" className="studio-help">Checking the public page and saving the findings. This can take up to a minute.</p>}
    {error&&<p className="studio-error" role="alert">{error} Check audit history before retrying if the connection was interrupted.</p>}
  </div>;
}
