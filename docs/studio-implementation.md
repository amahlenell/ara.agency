# ARA Studio implementation

## Repository baseline

Next.js 16.4.3 App Router, React 19.3.1, TypeScript, npm, Zod, Lucide and Motion. Public pages render the existing templates in `src/pages.mjs`; preserve those templates and styles. The private Studio now includes staff authentication, prospects, activity history, baseline HTML audits and Phase 3 Redesigns. Supabase is connected to the selected ARA project. Hosting documentation targets Next.js on Vercel.

## Incremental plan

1. Secure foundation: private `/studio` pages, Supabase password authentication, server-validated staff membership, database policies, prospect creation/editing/archiving, search/filter/pagination and transactional activity logging. Add setup and provisioning instructions, meaningful security and PostgreSQL integration tests. Keep the public website intact.
2. Baseline audits are built: bounded HTML fetching with URL/DNS/redirect/robots controls, persisted findings and reports. These are HTML checks, not browser speed tests or a completed isolated browser worker. Automatic screenshots and visual review remain future work.
3. Redesigns are built: structured Beauty Salon editor, desktop/mobile canvas, manual screenshot comparison, administrator review and approved expiring/revocable snapshots. See [Redesigns](studio-redesigns.md) for behavior and verification.
4. Implemented: drafts from observed audit findings, administrator review, manual sending records, linked follow-ups, contact pause/resume and a filtered pipeline board/list. See [Phase 4](studio-outreach.md).
5. Client Projects. An administrator can convert a won prospect after confirming the agreed scope. Staff can update the owner, target date, delivery status and next step.
6. Operational hardening, retention/deletion controls, deployment and end-to-end verification.

## Phase 1 boundaries

Use the existing Supabase integration convention without adding a second application or paid AI API. Access tokens remain in an HTTP-only, same-site cookie, expire within one hour and are validated with Supabase Auth on server operations. Database policies independently require active staff membership and an active Auth session. There is no public registration. A separate read-only, loopback-only development preview uses fictional records and rejects mutations. Website fetching was added after Phase 1.

Use `studio_` table prefixes to keep the internal records separate from existing public enquiries. Prospect writes, lifecycle checks, rate limits and activity entries run in one PostgreSQL transaction through database triggers. Ordinary staff cannot write activity records or change roles. Staff role updates require an administrator and preserve the last active administrator.

The Body Sphere Beauty creation form uses only supplied details. Unknown services, prices, contacts and testimonials are not invented. Creating a draft or demo link sends no message and establishes no client agreement. Automatic screenshot capture remains planned. Outreach is reviewed and sent manually outside Studio.

## Hosted database decision

The selected ARA project is `<ara-project-ref>`; foundation, audit, redesign, outreach and client project migrations have been applied there. Do not use another application's database. Redesign mutations use guarded commands. Anonymous access is limited to the explicit approved-snapshot reader, without anonymous table grants.

See [setup](studio-setup.md) and [Redesigns](studio-redesigns.md) for local use and verification. The Next.js security update flagged in earlier checks is a separate pending dependency task; this phase does not claim to upgrade it.
