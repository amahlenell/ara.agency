'use client';
import { RefreshCw } from 'lucide-react';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="wrap error-page"><span className="eyebrow">A little interruption</span><h1>Something went wrong.</h1><p>Please try again. If you were sending an enquiry, keep the page open and retry so we can check the same request.</p><button className="button primary" onClick={reset}><RefreshCw size={18}/>Try again</button></main>;}
