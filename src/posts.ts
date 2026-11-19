import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { BlogPost } from './types';
const postSchema=z.object({slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),title:z.string().min(5),category:z.string(),summary:z.string().min(20),date:z.iso.date(),author:z.string(),status:z.enum(['published','draft']),theme:z.enum(['lilac','blue','peach']),readTime:z.string(),answer:z.string(),sections:z.array(z.object({heading:z.string(),paragraphs:z.array(z.string())})).min(1),sources:z.array(z.object({title:z.string(),url:z.url()})),relatedService:z.string()});
export function getPosts():BlogPost[]{const directory=path.join(process.cwd(),'content/posts');const all=fs.readdirSync(directory).filter(n=>n.endsWith('.json')).map(n=>postSchema.parse(JSON.parse(fs.readFileSync(path.join(directory,n),'utf8'))));const slugs=new Set<string>();for(const p of all){if(slugs.has(p.slug))throw new Error('Duplicate blog slug: '+p.slug);slugs.add(p.slug);}return all.filter(p=>p.status==='published').sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title));}
