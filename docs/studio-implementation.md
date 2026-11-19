# ARA Studio implementation

## Repository baseline

Next.js 16.4.3 App Router, React 19.3.1, TypeScript, npm, Zod, Lucide and Motion. Public pages render the existing templates in `src/pages.mjs`; preserve those templates and styles. Enquiries already use server-only Supabase REST calls. No staff authentication or configured ARA database exists in this checkout. Hosting documentation targets Next.js on Vercel.

## Incremental plan

1. Secure foundation: private `/studio` pages, Supabase password authentication, server-validated staff membership, database policies, prospect creation/editing/archiving, search/filter/pagination and transactional activity logging. Add setup and provisioning instructions, meaningful security and PostgreSQL integration tests. Keep the public website intact.
2. Audit queue and an isolated browser worker: URL/DNS/redirect/subresource controls, private screenshots and evidence-backed findings, review and rejection. No network audit runs inside ordinary request handlers.
3. Structured Beauty Salon editor, comparison, approval and expiring/revocable private demonstrations.
4. Verified-finding outreach drafts, explicit review, manual sending records, follow-ups and pipeline.
5. Approved prospect-to-client conversion, tested with fictional data.
6. Operational hardening, retention/deletion controls, deployment and end-to-end verification.

## Phase 1 boundaries

Use the existing Supabase integration convention without adding a second application or paid AI API. Access tokens remain in an HTTP-only, same-site cookie, expire within one hour and are validated with Supabase Auth on every server operation. Database policies independently require active staff membership. There is no public registration or development authentication bypass. No prospect website is fetched in this phase.

Use `studio_` table prefixes to keep the internal records separate from existing public enquiries. Prospect writes, lifecycle checks, rate limits and activity entries run in one PostgreSQL transaction through database triggers. Ordinary staff cannot write activity records or change roles. Staff role updates require an administrator and preserve the last active administrator.

The Body Sphere Beauty creation form uses only the supplied business name, website, country and industry. It does not invent contacts or audit results. Auditing, screenshots, redesign publishing, outreach and client conversion remain later phases, not simulated successes.

## Hosted database decision

The connected account currently exposes only the unrelated `our-table` project. The requested ARA project must use another organization selected by the user. Do not apply migrations to `our-table`. Finish the implementation and isolated database verification before requesting the missing organization name or ID.
