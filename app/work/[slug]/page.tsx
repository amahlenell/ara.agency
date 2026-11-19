import {notFound} from 'next/navigation';
import {MarketingPage} from '@/components/ara/MarketingPage';
import {metadataFor} from '@/src/metadata';
import {projects} from '@/src/content.mjs';
const entries=()=>projects;
export const dynamicParams=false;
type Props={params:Promise<{slug:string}>};
export const generateStaticParams=()=>entries().map((entry:{slug:string})=>({slug:entry.slug}));
export async function generateMetadata({params}:Props){const {slug}=await params;if(!entries().some((entry:{slug:string})=>entry.slug===slug))notFound();return metadataFor('/work/'+slug);}
export default async function Page({params}:Props){const {slug}=await params;if(!entries().some((entry:{slug:string})=>entry.slug===slug))notFound();return <MarketingPage path={'/work/'+slug}/>;}
