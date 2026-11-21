# Phase 4: Outreach, follow-ups and pipeline

## Using outreach

Open `/studio/outreach` or the Outreach section of a prospect. A current, completed website audit is required. Select one to three observed warnings and choose email or another manual channel. The initial copy comes from a deterministic template using the saved business and selected observations. Unknown recipients stay empty. No AI service or sending integration is used.

Edit the recipient, subject and message, save the draft, and submit it for review. An administrator checks the findings on the current site, recipient and message, then approves or requests changes with a note. Saving edits increments the revision and resets approval. A changed prospect website requires a new audit and fresh draft. Only observed warning findings qualify; passing checks, unmeasured browser findings, duplicate IDs and findings from another prospect are rejected independently in SQL.

**Copy approved message** rechecks the current revision and contact preference, then copies its body. Copy the subject separately and send the message in your chosen app. Copying does not mark it sent. After sending, check the manual-action acknowledgement and **Record as sent manually**. The recorded time is the time the record was made, not a delivery receipt. Retries of an already recorded revision return its existing record without adding another contact event or changing the reminder.

A manually sent record is immutable. Create a new follow-up draft linked to it when needed; follow-ups have their own evidence selection and review. Pipeline stages remain explicit manual changes, separate from the message record. Studio does not automatically advance stages, detect replies, confirm delivery or create a client project.

Complete private-preview URLs contain access credentials. Saved outreach fields reject the standard credential-bearing preview URL format. Add private links in your sending app after copying; use approved snapshots from Redesigns. Drafts do not automatically include or retain demo secrets.

## Contact preference and reminders

Any active staff member can pause outreach for a prospect with a reason. Pausing blocks new drafts, edits, review, the copy action and new manual sending records, and clears the current follow-up reminder. Existing records remain readable. Cancellation is available for unsent drafts. Only an administrator can resume, with a reason and acknowledgement that contact can resume.

Record a future follow-up with a manual sending record, or schedule one from the pipeline using your device's local date/time. Leaving it empty when recording sending clears the existing reminder. **Complete / clear follow-up** removes the reminder. Dates are displayed in New Zealand time. Paused, won, lost and archived prospects are excluded from actionable due lists and dashboard due counts. There are no automatic email, push or calendar reminders in this phase.

## Pipeline

Open `/studio/pipeline` for a board or list. Filter by business/domain, owner, priority, stage and due follow-ups. Summary counts cover all matching stages under the other filters; stage selection changes the displayed cards. The board shows up to eight prospects per stage and links to a list capped at 25 per page. Counts are computed from all matching rows, rather than only the visible cards. Archived records are available through the stage filter.

Each card supports explicit stage changes, owner and priority updates, and scheduling/clearing a follow-up. Existing lifecycle transitions and active-assignee checks are retained. Changes patch only the selected operational fields, with an optimistic timestamp guard, so notes and other prospect information are not replaced. Conflicts require reloading. The card shows the latest manually recorded sending time independently of its stage.

## Data and permissions

Migration `20261120103135_studio_outreach.sql` is applied to ARA project `<ara-project-ref>`. It adds `studio_outreach`, `studio_outreach_preferences`, foreign-key/list indexes, guarded commands and a pipeline reader. It updates dashboard due counts to exclude paused contacts. Existing staff, prospects, audits, redesigns, demo links and enquiries are retained. No sample outreach or contact events were inserted into the live project.

Both tables have RLS and active-staff SELECT policies. Anonymous roles have no table or function access. Authenticated staff cannot directly insert, update or delete either table. Mutations use public invoker wrappers around private functions that validate the current Auth session and staff membership. Approval and resumption additionally require an administrator. Search paths are empty and function grants are explicit. The pipeline reader is an invoker function and retains RLS.

Review, pause and manual sending actions lock the prospect row before related records. Draft revisions and prospect timestamps prevent stale writes. Contact actions and reminder updates commit together. History stores operational state and authors without immutable copies of message text, recipients, review notes or preference reasons. Sent records retain their reviewed message and evidence for internal staff reference. Retention/deletion controls remain part of hardening.

## Verification

Typechecking, linting, all 96 regression checks, the isolated outreach/redesign API acceptance run, the existing Studio production fixture run and the production build passed. The suite executes actual PostgreSQL migrations in PGlite. Phase 4 covers evidence provenance, direct-write denial, role escalation, review acknowledgement, stale edits, immutable sent records, idempotent recording, follow-up parent checks, paused contacts, revoked sessions, bounded pipeline pages and counts. The read-only local preview includes fictional outreach and pipeline data and rejects all mutations without contacting Supabase.

`npm run test:outreach:e2e` runs the app on 4204 against temporary Auth/REST/Storage fixtures on 4205, exercising actual handlers and SQL. It creates, edits, reviews, reopens and records a fictional message, schedules follow-ups, tests pipeline conflicts, pause/resume and origin checks, and reruns the redesign workflow. It sends no messages and does not contact live company websites. `npm run test:studio:e2e` retains the production fixture checks for login, prospect CRUD/history, audit persistence and logout. The fixtures now load all Studio migrations.

Use the existing Windows launcher for normal Studio on port 4173. Live staff sign-in remains unverified from the managed session because the previous connectivity check timed out; no successful real sending or live Data API mutation is claimed. Browser layout/interaction acceptance remains unverified following the earlier Chrome timeout. The Next.js security update identified before Phase 4 remains a separate pending dependency task.
