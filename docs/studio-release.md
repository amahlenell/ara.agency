# ARA Studio release checks

Run `npm run studio:doctor` from the project directory to check configuration, local login-page reachability and the Supabase Auth gateway without entering a password. For a hosted deployment, run it with `-- --hosted` and the deployment environment. The final check is signing in through the regular Studio form from the machine or deployment that will run Studio.

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:studio:e2e` and `npm run test:projects:e2e`. The fixture tests exercise the app against disposable records. Run the following browser walkthrough against the intended environment before relying on it for client work.

1. Sign in as staff. Create a test prospect for a website you control, run an audit and reopen its report. Check that the observations match the page and that a failed check tells you what to do next.
2. Create a redesign, upload a reference screenshot, inspect the desktop and mobile views, and approve a revision. Open the approved preview in a signed-out browser, then revoke it and confirm the link stops opening after reload.
3. Save and approve a fictional outreach draft, simulate the manual send in the test record, and check the follow-up in Pipeline. Move the test prospect through the required stages, mark it Won, and create and reopen its client project.
4. Verify sign-out, try to open Studio signed out, and confirm public agency pages still open normally.

## Hosting and maintenance

Use a Next.js server deployment for the private routes. Set `STUDIO_ORIGIN` to the exact hosted HTTPS origin and configure the Supabase project URL and publishable key as server variables. Keep the staff workspace routes private, and use the same hosted origin when generating demo links. Apply the repository's migrations to the selected ARA project before opening Studio there.

Keep a record of the retention decision for prospect files, screenshots, outreach and project history. Archive inactive prospects in Studio. Revoke demo links that should stop working, including before restoring an archived prospect if the links should stay closed. Demo expiry and revocation control access. Database snapshots and stored files still need a separate retention decision. Confirm the backup covers the database and screenshot objects, then rehearse recovery into a separate environment before authorizing a permanent purge.

Check the installed Next.js version against its maintained release notes before hosting. Review the project's Supabase Auth password policy and verify the account can be recovered before changing it. Supabase offers leaked password protection on Pro and higher plans.

Screenshot comparison uses a manually uploaded reference. Browser performance measurements and automated capture require a separate, isolated renderer and are tracked separately from the HTML audit.
