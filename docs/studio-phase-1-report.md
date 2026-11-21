# ARA Studio — Phase 1 report

Status: implementation and isolated verification complete; live Supabase provisioning pending the requested different organization.

## Completed behavior

Private `/studio` login and staff workspace; admin/editor roles; secure cookie sessions validated with Supabase Auth and database session/membership checks; server-side authorization on each read/write; prospect creation, editing, archiving and restore; explicit lifecycle changes; domain duplicate protection; assignment, priority, follow-ups, search, filtering, sorting and pagination; administrator staff access management with final-admin protection; transactional append-only operational history; no public Studio navigation, indexing or analytics.

All forms use POST before hydration; authenticated mutations require same-origin JSON and bounded bodies. Existing public pages, branding, image placements, enquiry integrations and their tables remain intact. No new production dependency or paid AI service was introduced. PGlite is an exact-pinned development dependency for PostgreSQL verification.

## Database changes

Migration `supabase/migrations/20261119034827_studio_foundation.sql` creates `studio_users`, `studio_prospects`, `studio_activity_log` and an unexposed private schema for role checks, write limits and guarded staff changes. RLS is enabled, explicit grants exclude anonymous users, and ordinary staff cannot edit/delete history or directly alter staff roles. Prospect validation and history run atomically in database triggers. The migration has been executed against isolated PostgreSQL fixtures, not against the unrelated connected hosted project.

## Verification

- `npm test`: 41 tests passed, including all 13 existing enquiry tests and PostgreSQL security/transaction tests.
- `npm run typecheck`: passed; the production build also performs TypeScript verification.
- `npm run build`: passed, with Studio dynamic routes alongside the original public routes.
- `npm run test:studio:e2e -- --browser`: passed against an isolated Auth/REST fixture provider and the actual migration in PGlite. Verified real browser sign-in and creation forms, persisted prospect workspace/history, secure cookies, duplicate/stale writes, CSRF, private headers, logout/revoked access and desktop/390-pixel mobile layouts.
- Existing production page checker: all 23 public pages passed unique title, metadata, single-H1, structured-data, internal-link, sitemap/robots/RSS/social-image and 404 checks.
- Private response verification: `X-Robots-Tag: noindex, nofollow, noarchive`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`.
- `git diff --check`: passed.

The Auth/REST services used for deterministic tests are fixtures. No real hosted staff account has signed in yet, and no prospect website or external messaging service was contacted.

## Body Sphere Beauty

Its supplied name, website, country and industry are available in the first-prospect creation form. No contact information, findings, screenshots, redesign, demo, outreach or client agreement has been invented. The actual prospect record still needs to be saved after the live database and staff account are provisioned.

## Remaining blocker and next phase

The founders selected another Supabase organization; its name or ID is still needed. The connector currently exposes only `our-table`, which has not been modified. After selecting/connecting the intended organization, create a separate ARA project, apply/review the migration, provision staff and verify actual Auth/Data API/RLS behavior. Setup instructions are in `docs/studio-setup.md`.

Next: Phase 2, the persistent audit queue, isolated Playwright worker, URL/DNS/redirect/subresource restrictions, private screenshots and evidence review. Later phases cover the Beauty Salon editor, approved private demos, outreach drafts, client conversion and production hardening/retention controls. These are not claimed as completed features.

## Files created or modified

- `.env.example`
- `.gitignore`
- `README.md`
- `app/robots.ts`
- `components/ara/AnalyticsConsent.tsx`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `tsconfig.json`
- `AGENTS.md`
- `app/studio/(workspace)/error.tsx`
- `app/studio/(workspace)/layout.tsx`
- `app/studio/(workspace)/page.tsx`
- `app/studio/(workspace)/prospects/[id]/page.tsx`
- `app/studio/(workspace)/prospects/new/page.tsx`
- `app/studio/(workspace)/prospects/page.tsx`
- `app/studio/(workspace)/settings/page.tsx`
- `app/studio/api/prospects/[id]/route.ts`
- `app/studio/api/prospects/route.ts`
- `app/studio/api/staff/[id]/route.ts`
- `app/studio/auth/login/route.ts`
- `app/studio/auth/logout/route.ts`
- `app/studio/layout.tsx`
- `app/studio/login/page.tsx`
- `app/studio/studio.css`
- `components/studio/Activity.tsx`
- `components/studio/Forms.tsx`
- `docs/studio-implementation.md`
- `docs/studio-setup.md`
- `scripts/studio-browser-check.mjs`
- `scripts/test-studio.mjs`
- `src/server/studio/context.ts`
- `src/server/studio/domain.ts`
- `src/server/studio/http.ts`
- `src/server/studio/transport.ts`
- `supabase/migrations/20261119034827_studio_foundation.sql`
- `tests/studio-auth.test.ts`
- `tests/studio-database.test.ts`
- `tests/studio-domain.test.ts`
- `docs/studio-phase-1-report.md`
