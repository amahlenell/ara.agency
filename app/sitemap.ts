import type { MetadataRoute } from 'next';
import { publicPaths } from '@/src/pages.mjs';
import { getPosts } from '@/src/posts';
import { site } from '@/src/content.mjs';
export default function sitemap():MetadataRoute.Sitemap{return publicPaths(getPosts()).map((p:string)=>({url:site.origin+p,changeFrequency:p==='/blog'?'weekly':'monthly'}));}
