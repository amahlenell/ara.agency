import type { Metadata } from 'next';
import './globals.css';
import './visual-refresh.css';
import { AnalyticsConsent } from '@/components/ara/AnalyticsConsent';
const origin=process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL?'https://'+process.env.VERCEL_URL:'http://localhost:4173');
export const metadata:Metadata={metadataBase:new URL(origin),title:{default:'ARA Agency | SEO, GEO & Digital Growth',template:'%s | ARA Agency'},description:'SEO, GEO, websites and digital growth for businesses in South Africa and New Zealand.',robots:{index:process.env.PUBLIC_INDEXING==='true',follow:true},icons:{icon:'/favicon.svg'},verification:{google:process.env.GOOGLE_SITE_VERIFICATION||undefined},alternates:{types:{'application/rss+xml':'/feed.xml'}}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}<AnalyticsConsent measurementId={process.env.NEXT_PUBLIC_GA_ID||''}/></body></html>;}
