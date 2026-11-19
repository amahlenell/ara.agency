import { render } from '@/src/pages.mjs';
import { getPosts } from '@/src/posts';
import Script from 'next/script';
import { PageEntrance } from './PageEntrance';
export function MarketingPage({path}:{path:string}) {
 const result=render(path,getPosts());
 let body=(result.html.match(/<body>([\s\S]*)<\/body>/)?.[1] || '').replace(/<a class="skip-link"[^>]*>[\s\S]*?<\/a>/g,'');
 const schema=result.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] || '{}';
 const siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
 if(siteKey)body=body.replace('<div class="form-status"',`<div class="cf-turnstile" data-sitekey="${siteKey.replace(/[^a-zA-Z0-9_-]/g,'')}" data-action="enquiry"></div><div class="form-status"`);
 if(process.env.LOCAL_FORM_MODE==='true'&&process.env.NODE_ENV==='development')body=body.replace('<form class="form-card', '<p class="notice">Development preview: enquiries are saved on this computer. No emails are sent.</p><form class="form-card');
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:schema}}/><PageEntrance><div dangerouslySetInnerHTML={{__html:body}} /></PageEntrance><Script src="/client.js" strategy="afterInteractive" />{siteKey&&<Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive"/>}</>;
}
