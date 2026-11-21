import type { MetadataRoute } from 'next';
import { site } from '@/src/content.mjs';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',...(process.env.PUBLIC_INDEXING==='true'?{allow:'/',disallow:['/api/','/studio','/preview']}:{disallow:'/'})},sitemap:site.origin+'/sitemap.xml'};}
