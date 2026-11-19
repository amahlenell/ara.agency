import {notFound} from 'next/navigation';
import {MarketingPage} from '@/components/ara/MarketingPage';
import {metadataFor} from '@/src/metadata';
import {getPosts} from '@/src/posts';
const entries=()=>getPosts();
export const dynamicParams=false;
type Props={params:Promise<{slug:string}>};
export const generateStaticParams=()=>entries().map((entry:{slug:string})=>({slug:entry.slug}));
export async function generateMetadata({params}:Props){const {slug}=await params;if(!entries().some((entry:{slug:string})=>entry.slug===slug))notFound();return metadataFor('/blog/'+slug);}
export default async function Page({params}:Props){const {slug}=await params;if(!entries().some((entry:{slug:string})=>entry.slug===slug))notFound();return <MarketingPage path={'/blog/'+slug}/>;}
