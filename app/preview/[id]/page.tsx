import { notFound } from 'next/navigation';
import { z } from 'zod';
import { SharedRedesignPreview } from '@/components/studio/redesigns/SharedRedesignPreview';
export default async function PrivatePreview({ params }: { params: Promise<{id:string}> }) { const { id } = await params; if (!z.uuid().safeParse(id).success) notFound(); return <SharedRedesignPreview id={id}/>; }
