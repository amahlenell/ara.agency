# ARA Agency

An agency website for SEO and generative engine optimisation services in South Africa and New Zealand.

## Stack and layout

Next.js App Router, React, TypeScript, Tailwind CSS, Motion, Lucide and Zod. Page content is server-rendered and prebuilt from shared presentation templates. Shared templates live in `src/pages.mjs`, `src/ui.mjs` and `src/content.mjs`. Next.js handles routing, metadata, image generation and enquiries. Browser demos use a small progressive enhancement script in `public/client.js`. The server uses Supabase's REST API with a server-only service-role key. No paid AI APIs are used.

## Run

Use Node 22.13 or newer, install dependencies with `npm ci`, and copy `.env.example` to `.env.local`. Run `npm run dev`, then open http://127.0.0.1:4173. Run `npm run build` and `npm start` to check production behaviour.

`npm run typecheck`, `npm run lint` and `npm test` check application types, lint and the enquiry handler. Tests mock external providers; they do not prove live email delivery, Supabase connectivity or search indexing.

## Enquiries

Create or select an ARA Supabase project. Do not apply these tables to another application's project without reviewing that choice. Apply `supabase/migrations/202611190001_ara_leads.sql` through Supabase migrations or SQL Editor. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and a random `RATE_LIMIT_SECRET` to the server environment.

Set up a Cloudflare Turnstile widget for the actual domains. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. The widget action is `enquiry`; the server validates the action and hostname. Contact and review forms require server-side validation, same-origin submission, a honeypot, Turnstile and a database-backed rate limit. A production form fails clearly if required configuration is missing.

Set `RESEND_API_KEY`, a verified `EMAIL_FROM` and `AGENCY_NOTIFICATION_EMAIL` for notifications and prospect confirmations. Storage happens before email. Email failures do not discard a saved enquiry. Delivery states are stored in `notification_status` and `confirmation_status`; use the original submission key when retrying a failed request. Resend idempotency keys prevent immediate duplicate sends. There is no background retry scheduler in this release; review failed delivery states in Supabase.

`LOCAL_FORM_MODE=true` works only with development mode on a loopback URL. It writes test enquiries to ignored `.data/leads.ndjson`, labels the result as local, and sends no emails. It is disabled in production even when accidentally set. Use fictional test data, then remove the local test file when no longer needed. Do not upload `.data` or `.env.local`.

## Manage leads

Authorised founders can use Supabase Dashboard's Table Editor for `ara_leads`. Sort by `created_at`, filter by `status`, update `notes`, and use the supported statuses: New, Contacted, Qualified, Proposal Sent, Won and Lost. Dashboard access is controlled through Supabase project membership. Public and authenticated browser roles have no table access; there is no public lead-list endpoint. Keep the service-role key server-side.

Before public launch agree a retention period, responsible owner and privacy request contact. Review and delete expired records through the authorised dashboard according to that policy; no retention period is assumed by this build.

## Blog publishing

Run `npm run post:new -- "Your article title"`. This creates a JSON draft in `content/posts`. Complete the summary, introduction, sections and sources, verify claims and dates, then change `status` to `published`. Drafts are excluded from all public pages, the sitemap and RSS feed. Rebuild and deploy to publish. The content loader validates each file and rejects duplicate slugs. Blog publishing is file-based; a browser CMS has not been added.

Update package pricing and portfolio concepts in `src/content.mjs`. The current examples are fictional concepts with no measured outcomes or testimonials. Replace them with verified work only when permission and assets are available. Avoid unsupported performance claims.

## Search, analytics and contact configuration

Set `NEXT_PUBLIC_SITE_URL` to the actual deployment or custom domain. Previews default to `noindex` and disallow crawling. Set `PUBLIC_INDEXING=true` only on the final public site. Sitemap, robots, RSS, canonical URLs, social cards and Organization/Service/BlogPosting/Breadcrumb structured data are supplied. The social card is generated as PNG through Next ImageResponse.

Set `GOOGLE_SITE_VERIFICATION` to the Search Console verification token. Submit `/sitemap.xml` after domain verification. This build does not claim indexing or AI citations.

Set a valid `NEXT_PUBLIC_GA_ID` to enable the analytics consent controls. No analytics is requested before acceptance. Events exclude enquiry content and contact information. Events: `contact_submission`, `website_review_submission`, `quote_click`, `portfolio_interaction`, `whatsapp_click`. No WhatsApp link is shown unless a verified contact number is configured. Supplied privacy and terms pages remain drafts requiring final business details and review.

## Photography

The supplied photographs are used as editorial imagery across the home, about, services and contact pages. They do not identify ARA employees, clients or offices. Responsive WebP files in `public/images` are served at 480, 800 and 1200 pixels wide; `src/photos.mjs` defines descriptions, dimensions and service placements.

Original Pexels filenames: Gustavo Fring (`pexels-gustavo-fring-7446597.jpg`, businesswomen), Canva Studio (`pexels-canvastudio-3194519.jpg`, collaboration), Jakub Zerdzicki (`pexels-jakubzerdzicki-31313716.jpg`, creative editing), Alena Darmel (`pexels-a-darmel-7710082.jpg`, marketing partnership), and Artem Stoliar (`pexels-artem-stoliar-1550128219-37557082.jpg`, architecture).

## Vercel

Import this project using the Next.js preset; use the repository root as the root directory. The install command is `npm ci`, build command is `npm run build`, and the output directory uses Next's default. Use Node 22 or 24. Configure preview and production variables separately. Keep indexing disabled in previews. Do not commit secrets or replace an existing production project without checking its ownership and scope. There is no purchased domain assumed.

Live Supabase, Turnstile, Resend and analytics configuration require verification before a public launch.
