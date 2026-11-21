# Phase 3: Redesigns

ARA Studio reads the prospect’s saved website page to create an editable concept. It also supports screenshot comparison, administrator review and private demo links.

## Using the workspace

1. Open `/studio/redesigns` or the Redesigns section of a prospect workspace. Choose **New redesign**, select a saved prospect and choose **Read website and create draft**.
2. Edit the identity, introduction, services, about copy, contact details and page metadata. Choose Sage, Rose or Midnight colours. Abstract artwork applies to earlier Beauty Salon drafts. The canvas updates immediately; **Save draft** persists a numbered revision. Open the saved preview to inspect persisted content without the sidebar.
3. Upload an original screenshot for before/after comparison. PNG, JPEG and WebP are accepted, up to 5 MB. Capture is manual; no automatic screenshot worker is claimed. The reference remains private to active staff and is excluded from shared demos.
4. Save edits and **Submit for review**. A site-based draft needs an introduction and a verified contact method. Earlier Beauty Salon drafts also require an about section and at least one named service. An administrator reviews the content and contact links, then approves or requests changes with a note.
5. An administrator can create a private link for one, three or seven days. Copy the complete link when created: its secret is displayed only once. Revoke it from the editor when needed. Each redesign allows at most ten active links.

The import uses the saved page’s readable HTML. It matches headings, introduction, offerings and about sections, declared theme colour, and contact links when present. For services, headings inside a recognised offerings section work best. The layout changes depending on how many offerings are available. Missing details can be added in the editor. Check imported wording and contact destinations before approval.

The importer reads one page and does not render JavaScript, crawl linked pages or import original imagery. If a page returns too little readable content, try a public page on that site that contains the business information. Earlier Beauty Salon drafts and approved snapshots still use their original renderer.

## Revisions and review

Editors and administrators may create, edit and submit. Only administrators may approve, request changes or create/revoke links. Saved edits and reference replacements increment the revision and reset approval. Stale revision writes return a conflict rather than overwrite another staff member's work.

A demo contains a fixed approved snapshot. Editing another draft does not change an existing demo. New links require the current revision to be approved. Actions are recorded in the prospect's transactional history; free-text copy, contact values, review notes and raw tokens are excluded from log snapshots.

Archiving a prospect blocks edits, new approvals and new public access. Restoring can make otherwise valid links accessible again. Revoke links explicitly when access must stay disabled after restoration.

## Private links

Links look like `/preview/<link-id>#<secret>`. A random 256-bit secret stays in the fragment, outside HTTP request URLs and referrers. The browser exchanges it in a same-origin bounded POST; only its SHA-256 digest is sent to Supabase and stored. Section navigation preserves the fragment. The initial HTML contains no prospect content.

The narrow anonymous RPC checks ID, hash, expiry, revocation and prospect archive state before returning only approved content, template, revision and expiry. It excludes staff, draft copy, audits and original screenshots. Anonymous clients have no table access. Responses are no-store, noindex and no-referrer; analytics excludes `/preview` and `/studio`.

Expiry and revocation block subsequent requests. They cannot remove screenshots or content already viewed. An open preview hides itself at expiry; revocation is checked when reopened or reloaded.

Local links at `http://127.0.0.1:4173` work on this laptop. Another device needs a hosted HTTPS Studio origin. Production link creation requires HTTPS `STUDIO_ORIGIN`.

## Supabase

Applied to the selected ARA project `<ara-project-ref>` with migration `20261120092551_studio_redesigns.sql` and follow-up foreign-key indexes in `20261120093816_studio_redesign_indexes.sql`:

- `studio_redesigns` and `studio_redesign_demos`, RLS, staff reads and guarded command RPCs. Staff cannot directly insert, update or delete the tables.
- Private bucket `studio-redesign-references`, 5 MB, three image types and policies tied to a real redesign. Image signatures are checked; authenticated reads bypass public image optimization. Replaced images are cleaned up on a best-effort basis. Referenced images cannot be deleted through the cleanup policy.
- Deliberate public `SECURITY DEFINER` reader `studio_read_redesign_demo`, with empty search path, explicit grants and capability checks. [Supabase function advisors](https://supabase.com/docs/guides/database/database-linter) flag its anonymous/authenticated EXECUTE by design. Other public commands are invoker wrappers around guarded private functions. No service-role key is needed.

Existing staff, prospects, audits and enquiries were retained. No fictional live records or public demo links were seeded.

## Verification

`tests/studio-redesign.test.ts` covers content, safe contact links, readiness, hashing, origins and upload bounds. `tests/studio-redesign-database.test.ts` executes the actual SQL in PGlite with Auth/Storage fixtures, covering permissions, stale writes, review, snapshots, private files, expiry, revocation, archive state and revoked sessions.

`npm run test:redesigns:e2e` starts a disposable provider/database on 4195 and isolated Next server on 4194. It exercises route handlers with fixture Auth/REST/Storage and the real migrations, without changing live records. `-- --browser` adds optional Chrome acceptance for editing, comparison, responsive layouts and private navigation. Test build output is isolated under `work/redesign-e2e-build` using `STUDIO_E2E=true`. Normal Studio uses 4173 and its normal build directory.

Typechecking, linting, all 82 automated checks, the isolated request acceptance workflow and a complete production build passed. The optional Chrome walkthrough timed out while enabling the browser page, before visual inspection; desktop/mobile screenshots and interactive browser behavior remain unverified. Test processes set telemetry opt-outs. Live Supabase schema, private bucket and grants were inspected, without modifying real prospects.

The normal app started on port 4173 and returned the new private preview page with noindex headers. Its live sign-in connectivity check returned 503 after Supabase Auth timed out; successful real staff sign-in and live redesign writes are therefore not claimed. The temporary server was stopped so `Start-Studio.cmd` can be launched from the user's normal Windows session without occupying its port. Isolated build/browser caches were removed after verification. The source and normal Studio cache are retained.
