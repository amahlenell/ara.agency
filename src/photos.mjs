import { esc } from './ui.mjs';

// Supplied editorial photographs; these do not identify ARA staff or offices.
const photos = {
  team: { alt: 'Four businesswomen reviewing documents together around a desk', width: 1200, height: 1800 },
  collaboration: { alt: 'An overhead view of people collaborating with laptops and notebooks around a table', width: 1200, height: 1800 },
  creative: { alt: 'A photograph being edited on a tablet beside camera lenses and a graphics tablet', width: 1200, height: 800 },
  partnership: { alt: 'Two people shaking hands in front of a marketing planning board', width: 1200, height: 1800 },
  architecture: { alt: 'A contemporary glass building alongside a traditional building facade', width: 1200, height: 1928 },
};

export function photo(key, { className = '', sizes = '(max-width: 620px) calc(100vw - 36px), (max-width: 850px) calc(100vw - 48px), 50vw', eager = false } = {}) {
  const image = photos[key];
  if (!image) throw new Error(`Unknown photograph: ${key}`);
  return `<picture class="editorial-photo photo-${key} ${esc(className)}"><img src="/images/${key}-800.webp" srcset="/images/${key}-480.webp 480w, /images/${key}-800.webp 800w, /images/${key}-1200.webp 1200w" sizes="${esc(sizes)}" width="${image.width}" height="${image.height}" alt="${esc(image.alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''}></picture>`;
}

export const servicePhotos = {
  seo: 'partnership',
  geo: 'collaboration',
  'web-design': 'creative',
  'social-media': 'creative',
  automation: 'collaboration',
  branding: 'creative',
  maintenance: 'collaboration',
};
