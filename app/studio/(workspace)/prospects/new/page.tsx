import { requireStudio } from '@/src/server/studio/context';
import { staffList } from '@/src/server/studio/transport';
import { bodySphere } from '@/src/server/studio/domain';
import { ProspectForm } from '@/components/studio/Forms';
export default async function NewProspect({searchParams}:{searchParams:Promise<{first?:string}>}){const session=await requireStudio();const staff=await staffList(session);const params=await searchParams;return <><a className="studio-text-link" href="/studio/prospects">All prospects</a><div className="studio-page-heading"><div><span className="studio-kicker">A practical starting point</span><h1>Get to know the business.</h1><p>One record for the details, conversations and next steps.</p></div></div><ProspectForm prospect={params.first==='body-sphere'?bodySphere:{}} staff={staff} allowedStages={['discovered']}/></>;}
