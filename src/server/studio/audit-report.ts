import { createRequire } from 'node:module';
import type { PageResponse } from './audit-network.ts';

// Next is pinned in package-lock.json and ships this maintained, non-executing HTML parser.
// Keeping parsing on the server avoids loading the prospect's scripts or remote assets.
type Element = { textContent:string; attributes:Record<string,string>; getAttribute(name:string):string|undefined; querySelector(selector:string):Element|null; querySelectorAll(selector:string):Element[]; closest(selector:string):Element|null; remove():void };
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as {parse(html:string):Element};
export const auditCategories = ['SEO','Mobile setup','Accessibility','Performance','Conversion','Security'] as const;
export type AuditCategory = typeof auditCategories[number];
export type Finding = {id:string;category:AuditCategory;status:'pass'|'warning'|'manual';priority:'high'|'medium'|'low';title:string;evidence:string;recommendation:string};
export type AuditReport = {
  version:1; method:'html-baseline'; analyzedAt:string; finalUrl:string; requestedUrl:string;
  pageTitle:string; description:string; httpStatus:number; htmlBytes:number; responseMs:number;
  checksPassed:number; checksTotal:number; findings:Finding[]; limitations:string[];
};
const clean=(value:string|undefined,max=300)=>(value||'').replace(/\s+/g,' ').trim().slice(0,max);
export function analyzePage(page:PageResponse, requestedUrl:string):AuditReport {
  const doc=parse(page.body); const findings:Finding[]=[];
  const add=(id:string,category:AuditCategory,passed:boolean,title:string,evidence:string,recommendation:string,priority:Finding['priority']='medium')=>{
    findings.push({id,category,status:passed?'pass':'warning',priority,title,evidence:clean(evidence,500),recommendation:passed?'Keep this in place and verify it after website changes.':recommendation});
  };
  const meta=(name:string)=>doc.querySelectorAll('meta').find(el=>el.getAttribute('name')?.toLowerCase()===name)?.getAttribute('content')||'';
  const title=clean(doc.querySelector('title')?.textContent);
  const description=clean(meta('description'));
  add('title','SEO',title.length>=15&&title.length<=65,'Page title',title?`“${title}” (${title.length} characters).`:'No page title was found.','Write a specific, descriptive title, usually around 15–65 characters.');
  add('description','SEO',description.length>=50&&description.length<=170,'Search description',description?`${description.length} characters: ${description}`:'No meta description was found.','Add a concise summary of the business and page, usually around 50–170 characters.');
  const h1=doc.querySelectorAll('h1');
  add('h1','SEO',h1.length===1&&!!clean(h1[0].textContent),'Main page heading',`${h1.length} H1 heading(s) found${h1[0]?': '+clean(h1[0].textContent,160):'.'}`,'Use one clear main heading explaining the page’s purpose.');
  const canonical=doc.querySelectorAll('link').find(el=>el.getAttribute('rel')?.toLowerCase().split(/\s+/).includes('canonical'))?.getAttribute('href');
  let canonicalValid=false;try {const url=new URL(canonical||'',page.url);canonicalValid=!!canonical&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{}
  add('canonical','SEO',canonicalValid,'Canonical URL',canonical?`Declared canonical: ${clean(canonical,200)}`:'No canonical URL was found.','Declare the preferred page URL with a canonical link.');
  const robots=meta('robots')+' '+(page.headers['x-robots-tag']||'');
  add('indexing','SEO',!/(?:^|[\s,:])(noindex|none)(?:[\s,]|$)/i.test(robots),'Indexing directive',robots.trim()?`Indexing directives: ${clean(robots)}`:'No noindex directive was found in HTML or response headers.','Review the noindex directive before expecting this page to appear in search. A deliberate private page may be correctly excluded.','high');
  const viewport=meta('viewport');
  add('viewport','Mobile setup',/width\s*=\s*device-width/i.test(viewport),'Mobile viewport',viewport?`Viewport: ${clean(viewport)}`:'No viewport meta tag was found.','Add a viewport meta tag with width=device-width and initial-scale=1.','high');
  add('zoom','Mobile setup',!/(user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*(0(?:\.\d+)?|1(?:\.0+)?)(?:\s*,|$))/i.test(viewport),'User zoom',viewport?`Viewport checked: ${clean(viewport)}`:'No HTML viewport restriction on zoom was found.','Allow users to zoom; remove user-scalable=no and restrictive maximum-scale values.');
  const lang=doc.querySelector('html')?.getAttribute('lang');
  add('language','Accessibility',!!clean(lang),'Document language',lang?`Document language: ${clean(lang,60)}`:'The HTML element has no language.','Set the HTML lang attribute to the page’s primary language.');
  const images=doc.querySelectorAll('img'),missingAlt=images.filter(el=>el.getAttribute('alt')===undefined);
  add('image-alt','Accessibility',missingAlt.length===0,'Image alternatives',`${missingAlt.length} of ${images.length} image(s) have no alt attribute. Empty alt text is allowed for decorative images.`,'Add useful alt text to informative images and alt="" to decorative images. Review wording manually.');
  const inputs=doc.querySelectorAll('input,select,textarea').filter(el=>!['hidden','submit','button','reset','image'].includes((el.getAttribute('type')||'').toLowerCase()));
  const labels=doc.querySelectorAll('label');
  const unlabeled=inputs.filter(el=>{
    const id=el.getAttribute('id'); const refs=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean);
    const referenced=refs.length>0&&refs.every(ref=>doc.querySelectorAll('[id]').some(node=>node.getAttribute('id')===ref&&!!clean(node.textContent)));
    return !clean(el.getAttribute('aria-label'))&&!referenced&&!el.closest('label')&&!(id&&labels.some(label=>label.getAttribute('for')===id&&!!clean(label.textContent)));
  });
  add('form-labels','Accessibility',unlabeled.length===0,'Form field labels',`${unlabeled.length} of ${inputs.length} input field(s) lack a detectable label.`,'Associate a visible label with each field or provide a meaningful accessible name.','high');
  add('html-response','Performance',page.responseMs<=1000,'HTML response time',`${page.responseMs} ms from the audit server to the first response headers. This is a single sample, not browser load time.`,'Investigate hosting response time, caching and server work. Repeat a browser performance test before drawing conclusions.');
  add('html-size','Performance',page.bytes<=250_000,'HTML document size',`${Math.round(page.bytes/1024)} KiB of HTML received. Scripts, images, fonts and stylesheets are not included.`,'Reduce unnecessary HTML and embedded data; measure the full page in a browser.');
  const scripts=doc.querySelectorAll('script[src]');
  const blocking=scripts.filter(el=>!('async' in el.attributes)&&!('defer' in el.attributes)&&el.getAttribute('type')!=='module');
  add('scripts','Performance',blocking.length<=2,'Potentially blocking scripts',`${blocking.length} external script(s) without async, defer or type=module. Script position and runtime cost need browser review.`,'Defer noncritical scripts and review third-party scripts using a browser trace.');
  const links=doc.querySelectorAll('a');
  const action=links.find(el=>/^(mailto:|tel:)/i.test(el.getAttribute('href')||'')||(/^(https?:|\/|#)/i.test(el.getAttribute('href')||'')&&/\b(contact|book|enquire|enquiry|quote|appointment|get started|buy|shop)\b/i.test(el.textContent)));
  add('contact-action','Conversion',!!action,'Contact or purchase action',action?`Detected link: ${clean(action.textContent||action.getAttribute('href'),120)}`:'No clearly labelled contact, booking or purchase link was detected.','Add an obvious contact, booking, quote or purchase action. Verify it is visible and works on mobile.','high');
  add('https','Security',new URL(page.url).protocol==='https:','HTTPS',`The final page uses ${new URL(page.url).protocol.replace(':','').toUpperCase()}.`,'Serve the page over HTTPS and redirect HTTP visitors to HTTPS.','high');
  const mixed=doc.querySelectorAll('img,script,link,iframe,source,video,audio').filter(el=>/^http:\/\//i.test(el.getAttribute('src')||el.getAttribute('href')||''));
  add('mixed-content','Security',new URL(page.url).protocol!=='https:'||mixed.length===0,'HTTP asset references',`${mixed.length} explicit HTTP asset reference(s) in the page HTML. CSS and runtime requests are not inspected.`,'Replace HTTP assets with HTTPS versions and check the browser console.');
  for(const [id,category,title,evidence,recommendation] of [
    ['visual','Conversion','Visual design and trust','Layout, typography, contrast, visual hierarchy and trust cues have not been visually reviewed.','Review desktop and phone layouts, branding, testimonials and the primary action.'],
    ['mobile-layout','Mobile setup','Rendered mobile layout','Viewport configuration is checked; overflow, tap targets and actual responsive layout are not measured.','Test the page at phone and tablet widths and complete the main customer journey.'],
    ['vitals','Performance','Browser speed and Core Web Vitals','No Lighthouse score, LCP, CLS, INP or real-user performance measurement is included.','Run Lighthouse or PageSpeed Insights and review field data where available.'],
    ['keyboard','Accessibility','Keyboard and contrast review','HTML checks do not establish WCAG compliance. Contrast, keyboard order and screen-reader behavior need testing.','Test the main flow using keyboard navigation, a screen reader and a contrast checker.'],
  ] as const)findings.push({id,category,status:'manual',priority:'medium',title,evidence,recommendation});
  const checked=findings.filter(f=>f.status!=='manual');
  return {version:1,method:'html-baseline',analyzedAt:new Date().toISOString(),finalUrl:page.url,requestedUrl,pageTitle:title,description,httpStatus:page.status,htmlBytes:page.bytes,responseMs:page.responseMs,checksPassed:checked.filter(f=>f.status==='pass').length,checksTotal:checked.length,findings,limitations:[
    'One public page is inspected. This is a baseline HTML audit, not a whole-site crawl, visual redesign or compliance assessment.',
    'JavaScript, remote assets and embedded frames are not executed. Client-rendered content may be missing; absent HTML signals require review.',
    'Response time and HTML size describe this request only. They are not a Lighthouse score or a measurement of full page speed.',
  ]};
}
