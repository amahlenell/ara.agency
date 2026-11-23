import type { CSSProperties } from 'react';
import { redesignPalettes, safeBookingLink } from '@/src/server/studio/redesign-content';
import type { RedesignContent } from '@/src/server/studio/redesign-content';
import './source-website.css';

export function SourceWebsite({ content, draft }: { content: RedesignContent; draft: boolean }) {
  const { brand, hero, services, about, contact } = content;
  const palette = redesignPalettes[brand.palette];
  const style = { '--source-ink': palette.ink, '--source-paper': palette.paper, '--source-soft': palette.soft } as CSSProperties;
  const contactLink = safeBookingLink(contact.bookingUrl);
  const emailLink = contact.email && 'mailto:' + encodeURIComponent(contact.email);
  const phoneLink = contact.phone && 'tel:' + contact.phone.replace(/[^\d+]/g, '');
  const exploreOfferings = services.length > 0 && /^explore\b/i.test(hero.cta);
  const primaryLink = exploreOfferings ? '#beauty-services' : contactLink || '#beauty-contact';
  const offerFirst = exploreOfferings && services.length >= 2;

  return <div className="source-canvas"><article className="source-site" style={style}>
    <header className="source-nav"><a href="#beauty-top">{brand.name}</a><nav aria-label="Concept navigation">
      {services.length > 0 && <a href="#beauty-services">What we offer</a>}
      {about.body && <a href="#beauty-about">About</a>}
      <a href="#beauty-contact">Contact</a>
    </nav></header>
    <section className={'source-hero' + (offerFirst ? ' source-offer-first' : '')} id="beauty-top">
      <div>{hero.eyebrow && <p className="source-eyebrow">{hero.eyebrow}</p>}<h1>{hero.heading}</h1></div>
      <div>{hero.body && <p>{hero.body}</p>}{brand.tagline && <p>{brand.tagline}</p>}
        <a className="source-button" href={primaryLink} rel={contactLink && primaryLink === contactLink ? 'noreferrer' : undefined}>{hero.cta}</a></div>
    </section>
    {services.length > 0 && <section className="source-section" id="beauty-services">
      <h2>What we offer</h2><div className="source-offers">
        {services.map((item, index) => <div key={index}><h3>{item.name}</h3>
          {item.description && <p>{item.description}</p>}{item.price && <p>{item.price}</p>}
        </div>)}
      </div>
    </section>}
    {about.body && <section className="source-section source-about" id="beauty-about"><h2>{about.heading}</h2><p>{about.body}</p></section>}
    <section className="source-section source-contact" id="beauty-contact">
      <h2>Contact {brand.name}</h2>
      {contactLink && <p><a href={contactLink} rel="noreferrer">Visit the business contact page</a></p>}
      {emailLink && <p><a href={emailLink}>{contact.email}</a></p>}
      {phoneLink && <p><a href={phoneLink}>{contact.phone}</a></p>}
      {contact.address && <p>{contact.address}</p>}
      {contact.hours && <p>{contact.hours}</p>}
      {draft && !(contactLink || emailLink || phoneLink) && <p>Add a verified contact method before sharing.</p>}
    </section>
    <footer>Website concept for {brand.name}</footer>
  </article></div>;
}
