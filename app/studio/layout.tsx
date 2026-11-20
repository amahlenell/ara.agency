import type { Metadata } from 'next';
import './studio.css';
import './redesigns.css';
import './outreach.css';
export const metadata:Metadata={title:{default:'ARA Studio',template:'%s | ARA Studio'},description:'Private ARA staff workspace.',robots:{index:false,follow:false,noarchive:true},alternates:{canonical:null}};
export const dynamic='force-dynamic';
export default function StudioLayout({children}:{children:React.ReactNode}){return <div className="studio"><noscript><div className="studio-notice">Enable JavaScript to use Studio forms. Forms cannot be saved while JavaScript is unavailable.</div></noscript>{children}</div>;}
