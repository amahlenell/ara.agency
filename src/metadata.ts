import type { Metadata } from 'next';
import { render } from './pages.mjs';
import { getPosts } from './posts';
import { site } from './content.mjs';
export function metadataFor(path:string):Metadata {const p=render(path,getPosts());return {title:p.title,description:p.description,alternates:{canonical:path},robots:{index:process.env.PUBLIC_INDEXING==='true'&&p.status!==404,follow:true},openGraph:{title:p.title,description:p.description,url:site.origin+path,type:path.startsWith('/blog/')?'article':'website',images:[{url:'/opengraph-image',width:1200,height:630}]},twitter:{card:'summary_large_image',title:p.title,description:p.description,images:['/opengraph-image']}};}
