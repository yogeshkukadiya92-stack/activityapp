# CFL Live launch checklist

## Infrastructure

- [ ] Choose hosting provider or VPS.
- [ ] Provision PostgreSQL 16+ with automated backups and point-in-time recovery.
- [ ] Provision Redis 7+ with authentication and private networking.
- [ ] Set all values from `.env.example` in the platform secret manager.
- [ ] Set a long, unique `ADMIN_PASSWORD` before the first start.
- [ ] Set the final `ORGANIZATION_NAME` and stable `ORGANIZATION_SLUG` before first start.
- [ ] Run the app with `NODE_ENV=production`.
- [ ] Set `BOOTSTRAP_WORKSHOP=false` after initial bootstrap.
- [ ] Confirm `BOOTSTRAP_DEMO_DATA=false`; production must not contain seeded example audience members.
- [ ] Run `npm run test:config` before deployment.

## Network and domain

- [ ] Add the production domain and DNS record.
- [ ] Configure HTTPS and automatic certificate renewal.
- [ ] Proxy normal HTTP and WebSocket upgrade traffic to port 8787.
- [ ] Set `PUBLIC_ORIGIN` to the exact HTTPS origin.
- [ ] Enable `TRUST_PROXY=true` only behind a trusted proxy.

## Pre-launch verification

- [ ] `GET /api/health` returns HTTP 200.
- [ ] `GET /api/ready` reports PostgreSQL and Redis ready.
- [ ] Run `DEPLOYMENT_URL=https://your-domain npm run test:deploy` successfully.
- [ ] Confirm `/api/health` reports the expected release identifier.
- [ ] Sign in and confirm Home loads real workshop, participant, response and engagement totals.
- [ ] Confirm Home's next-workshop card opens the correct presenter session and copies its join link.
- [ ] Confirm the 30-day participation chart and recent-workshop rows match Reports data.
- [ ] Test Home quick actions for Templates, Invite audience and Reports.
- [ ] Create a blank workshop and confirm its unique join code.
- [ ] Create a workshop from the Wellness check-in template.
- [ ] Open Templates and verify all eight built-in templates, category filters and search.
- [ ] Inspect a template and confirm its ordered activity preview, duration and usage metadata.
- [ ] Use **Use template** and confirm a real workshop with copied activities is created.
- [ ] Use **Edit a copy** and confirm the new workshop opens in the activity editor.
- [ ] Create and delete a custom template, then confirm both actions are authenticated and audited.
- [ ] Import a valid JSON template and safely reject malformed JSON.
- [ ] Add, edit and delete an activity in the workshop builder.
- [ ] Edit poll and multiple-answer options plus all three Activity Studio toggles, reload, and confirm the configuration persists.
- [ ] Submit multiple answers as a participant and confirm live bars update in both presenter and projector views.
- [ ] Exercise ranking, quiz, number-count and Q&A inputs and verify their type-aware live results.
- [ ] Verify the Activity Studio has no horizontal overflow at desktop and 390px mobile viewports.
- [ ] Open the new workshop in presenter mode and confirm its join code.
- [ ] Filter Reports by workshop and date range and confirm KPI/chart updates.
- [ ] Switch the participation chart between Participants and Responses.
- [ ] Export CSV and verify headers, row count and UTF-8 answer text.
- [ ] Confirm report export creates an audit-log entry.
- [ ] Open Team and verify Audience search plus Active/Inactive/Invited filters.
- [ ] Create a reusable group and confirm its member/workshop totals update.
- [ ] Invite multiple email addresses and assign them to a group.
- [ ] Import a `name,email` CSV and verify invalid/duplicate addresses are handled safely.
- [ ] Confirm audience invitations and group creation create audit-log entries.
- [ ] Anonymous presenter control returns HTTP 401.
- [ ] Presenter login, logout and session persistence work.
- [ ] Open Workspace and verify the organization profile persists after reload.
- [ ] Create Admin and Presenter members with unique temporary passwords.
- [ ] Confirm a Presenter cannot add or modify workspace members.
- [ ] Disable a member and confirm all existing sessions are revoked and login is rejected.
- [ ] Confirm the final active Owner cannot disable or demote their own account.
- [ ] Share temporary passwords through a private channel until transactional email is configured.
- [ ] Participant join and response appear in presenter and projector screens.
- [ ] Hidden responses disappear from all public live clients.
- [ ] Test two application instances to confirm Redis Pub/Sub synchronization.
- [ ] Verify mobile flows on Android Chrome and iPhone Safari.
- [ ] Verify Home has no horizontal overflow at a 390px viewport.
- [ ] Confirm database backups can be restored.
- [ ] Store PostgreSQL backups off-server and complete a staging restore drill.

## After launch

- [ ] Disable bootstrap flags.
- [ ] Configure uptime monitoring for `/api/ready`.
- [ ] Configure centralized logs and alerts.
- [ ] Review audit logs and rate-limit events.
- [ ] Run the first real workshop with a small internal audience before a large event.
