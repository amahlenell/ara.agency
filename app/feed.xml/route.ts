import { getPosts } from '@/src/posts';
import { site } from '@/src/content.mjs';
import { esc } from '@/src/ui.mjs';
export const dynamic='force-static';
export function GET(){const xml=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>The ARA Blog</title><link>${site.origin}/blog</link><description>SEO, GEO and digital growth insights.</description>${getPosts().map(p=>`<item><title>${esc(p.title)}</title><link>${site.origin}/blog/${p.slug}</link><guid>${site.origin}/blog/${p.slug}</guid><description>${esc(p.summary)}</description><pubDate>${new Date(p.date+'T12:00:00Z').toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;return new Response(xml,{headers:{'Content-Type':'application/rss+xml; charset=utf-8'}});}
