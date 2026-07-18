# CFL Live Production-ready Application

CFL Live is a standalone React/Vite prototype for live workshops and audience engagement.

## Included

- Separate persistent SQLite database at `data/cfl-live.sqlite`
- PostgreSQL production adapter selected automatically through `DATABASE_URL`
- Redis Pub/Sub and distributed rate limiting through `REDIS_URL`
- REST API and WebSocket real-time service
- Presenter authentication with scrypt password hashing and expiring tokens
- Organization workspace with owner, admin and presenter memberships
- Database-backed member creation, role changes, disable/reactivate and safe removal
- Last-owner/self-lockout safeguards and immediate session revocation for disabled members
- Organization profile, website and default sender settings persisted in SQLite and PostgreSQL
- Admin/presenter role checks on control and moderation APIs
- Login, join and response rate limiting
- Response moderation and audit logging
- Real-data Home command center combining workshop, participant, response and audience KPIs
- Next-workshop launcher with live status, join-link copy and presenter access
- 30-day participation timeline, recent workshop performance and connected quick actions
- Workshop management dashboard with search, status, join codes and participant totals
- Workshop creation from blank, wellness, team pulse and learning-review templates
- Dedicated template library with search, category filters and popularity sorting
- Eight production-ready workshop templates with complete activity previews
- Custom template creation and JSON template import
- One-click **Use template** and **Edit a copy** flows that create real workshops
- Protected and audited template create/use/delete APIs across SQLite and PostgreSQL
- Full-screen Activity Studio with create, edit, delete and live participant preview across eight activity types
- Per-activity options and settings persisted in both SQLite and PostgreSQL
- Type-aware participant inputs for polls, multiple answers, ranking, quizzes, number counts, word clouds and Q&A
- Live type-aware presenter/projector results including option bars, number averages, word clouds and Q&A cards
- Dynamic presenter/projector routing for every workshop join code
- Reports dashboard with workshop and date-range filters
- Live participation trend, activity mix and activity-performance analytics
- Top visible-response analysis and workshop detail drilldown
- Authenticated CSV export with audit logging
- Audience directory with search and active/inactive/invited filters
- Reusable participant groups with live membership and workshop-history totals
- Bulk email invitations and `name,email` CSV import with optional group assignment
- Audited audience invitations and group creation across SQLite and PostgreSQL
- Presenter control room with five activity types
- Working activity switching and previous/next navigation
- Shared start/pause state, server countdown timer and results visibility
- Participant join flow with workshop code, name and answer submission
- Dedicated projector view
- Responsive desktop and mobile layouts
- Live participant/answer counts shared across browser clients
- Responses persisted across reloads
- Production build with no audit vulnerabilities
- Fail-fast production configuration validation for HTTPS, PostgreSQL, Redis, owner credentials and workspace slug
- Dependency-aware readiness with HTTP 503 during PostgreSQL/Redis outages
- Coolify-specific private service stack with generated database/cache passwords and graceful shutdown
- Production bootstrap that excludes all fake audience members and fake template usage metrics

## Run locally

For local development, one command starts both the web client and SQLite-backed API:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`. The API and WebSocket service run on port `8787`.

## Local production build

```bash
npm run build
```

For a single production process:

```bash
npm run build
npm start
```

Then open `http://localhost:8787/`.

After signing in, the app opens the **Workshops** workspace. Create a blank workshop or select a template, edit its activities, then use **Open presenter** to launch its live control room. Every workshop receives its own six-character join code.

The default signed-in landing page is **Home**. It combines the authenticated 30-day report, audience summary and current workshop state into one operational command center. Open the next presenter session, copy its join link, review recent workshops, browse templates, invite audience members or jump to Reports directly from the dashboard.

Open **Reports** from the main navigation to filter analytics by workshop and date range, compare participants with responses, review activity performance, and export the underlying response data as CSV.

Open **Team** to manage the reusable **Audience** directory. Search or filter people, inspect engagement and workshop history, create groups, invite multiple email addresses, or import a CSV with `name,email` columns. Every invitation and group creation is authenticated and written to the audit log.

Open **Templates** to browse the seeded workshop library by category, inspect the full activity sequence, or turn a template into a working workshop. **Create template** saves a reusable custom template; **Import template** accepts a JSON template file. Custom templates can be deleted through the authenticated API, while built-in templates remain protected.

Open a workshop and select **Edit workshop** to launch the **Activity Studio**. The left rail switches activities, the center editor manages questions, answer options and visibility settings, and the right phone preview shows the participant experience before presenting. Multiple-answer activities accept more than one choice; number counts enforce their configured range; all settings survive a reload and feed the live presenter and projector results.

Open **Workspace** to manage the organization profile and presenter access. Owners and admins can add members with a temporary password, assign Admin or Presenter access, disable accounts, and reactivate them. Owners are protected from accidental self-lockout, and disabling a member immediately revokes active sessions. Until an email provider is configured, temporary passwords must be shared through a separate private channel.

SQLite is intentionally blocked when `NODE_ENV=production`. Production deployments must provide `DATABASE_URL`, preventing accidental single-instance data storage.

## Local presenter login

- Email: `admin@cfl.live`
- Password: `CFLive@2026`

For any shared or deployed environment, use `.env.example` and set new `ADMIN_EMAIL` and `ADMIN_PASSWORD` values before the database is initialized. Do not use the local default password in production.

## Docker deployment

1. Copy `.env.example` to `.env` outside source control.
2. Set `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `PUBLIC_ORIGIN`.
3. Run `docker compose up -d --build`.
4. Check `https://your-domain/api/ready` after configuring the reverse proxy and TLS.

The compose stack includes the app, PostgreSQL 16 and Redis 7 with persistent volumes and health checks.

For Coolify, use `docker-compose.coolify.yml` and follow `CFL-Live-Coolify-Deployment.md`. The Coolify stack exposes only the application to the proxy; PostgreSQL and Redis remain private. It also uses authenticated Redis and Coolify-generated stable service passwords.

## Required production environment variables

- `NODE_ENV=production`
- `PUBLIC_ORIGIN=https://your-domain`
- `DATABASE_URL=postgresql://...`
- `REDIS_URL=redis://...`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ORGANIZATION_NAME`
- `ORGANIZATION_SLUG`
- `BOOTSTRAP_WORKSHOP=true` for the first deployment only
- `BOOTSTRAP_DEMO_DATA=false` in every production environment

Run `npm run test:config` before packaging. After deployment, run `DEPLOYMENT_URL=https://your-domain npm run test:deploy`; it rejects non-HTTPS targets and verifies PostgreSQL plus Redis readiness.

Set `TRUST_PROXY=true` only when a trusted reverse proxy overwrites `X-Forwarded-For`.

Cloud deployment still requires a selected hosting provider, provisioned PostgreSQL/Redis services, DNS access and TLS configuration.
