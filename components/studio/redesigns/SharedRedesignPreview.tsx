'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SharedRedesign } from '@/src/server/studio/redesign-content';
import { BeautySalonSite } from './BeautySalonSite';
const subscribe = (listener: () => void) => { window.addEventListener('hashchange', listener); return () => window.removeEventListener('hashchange', listener); };
const snapshot = () => window.location.hash.slice(1);
export function SharedRedesignPreview({ id }: { id: string }) {
  const token = useSyncExternalStore(subscribe, snapshot, () => null);
  const [state, setState] = useState<{ token: string; data?: SharedRedesign; error?: string } | null>(null);
  const valid = token !== null && /^[A-Za-z0-9_-]{43}$/.test(token);
  useEffect(() => {
    if (!valid || !token) return;
    const controller = new AbortController();
    fetch('/preview/' + id + '/access', { method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async response => { if (!response.ok) throw new Error(response.status === 503 ? 'This preview is temporarily unavailable. Please try again shortly.' : 'This preview has expired, was revoked, or the link is incomplete.'); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setState({ token, data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ token, error: error instanceof Error ? error.message : 'This preview could not be opened.' }); });
    return () => controller.abort();
  }, [id, token, valid]);
  useEffect(() => {
    if (!state?.data || state.token !== token) return;
    const timer = setTimeout(() => setState({ token: state.token, error: 'This preview has expired. Ask the person who shared it for a new link.' }), Math.max(0, Date.parse(state.data.expires_at) - Date.now()));
    return () => clearTimeout(timer);
  }, [state, token]);
  const error = token !== null && !valid ? 'Open the complete private preview link, including the part after #.' : state?.token === token ? state?.error : null;
  const data = state?.token === token ? state?.data : null;
  useEffect(() => {
    const title = document.title; const description = document.querySelector('meta[name="description"]'); const previous = description?.getAttribute('content');
    if (data) { document.title = data.content.seo.title; description?.setAttribute('content', data.content.seo.description); }
    return () => { document.title = title; if (previous !== null && previous !== undefined) description?.setAttribute('content', previous); };
  }, [data]);
  if (error) return <main id="main" className="shared-preview-message"><span>ARA / Private design preview</span><h1>This preview is unavailable.</h1><p>{error}</p><p>Contact the person who shared the link for access.</p></main>;
  if (!data) return <main id="main" className="shared-preview-message" role="status"><span>ARA / Private design preview</span><h1>Opening your design preview…</h1><p>Please wait while the private link is checked.</p><noscript>Enable JavaScript to open this private preview.</noscript></main>;
  return <main id="main" onClick={event => {
    // Section navigation must preserve the private credential in the URL fragment.
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#beauty-"]') : null;
    const section = anchor?.getAttribute('href');
    if (section && /^#beauty-[a-z-]+$/.test(section)) { event.preventDefault(); event.currentTarget.querySelector(section)?.scrollIntoView({ behavior: 'smooth' }); }
  }}><aside className="shared-preview-banner"><strong>ARA / Design concept</strong><span>Approved revision {data.revision} · Available until {new Date(data.expires_at).toLocaleString()}</span></aside><BeautySalonSite content={data.content}/></main>;
}
