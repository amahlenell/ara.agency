import type { Metadata } from 'next';
import './preview.css';
export const metadata: Metadata = { title: 'Private design preview | ARA', description: 'A private, reviewed website concept.', robots: { index: false, follow: false, noarchive: true }, alternates: { canonical: null } };
export const dynamic = 'force-dynamic';
export default function PrivatePreviewLayout({ children }: { children: React.ReactNode }) { return children; }
