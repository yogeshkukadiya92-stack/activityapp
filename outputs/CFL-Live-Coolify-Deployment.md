# CFL Live — Coolify deployment runbook

This runbook deploys CFL Live as a private Docker Compose stack behind Coolify's proxy. PostgreSQL and Redis are not exposed on host ports.

## 1. Prepare the source

1. Push the contents of `cfl-live-source.zip` to a private Git repository.
2. In Coolify, create a **Docker Compose** resource from that repository.
3. Select `docker-compose.coolify.yml` as the compose file.
4. Keep **Raw Compose Deployment** disabled.

Coolify treats the compose file as the source of truth and detects required `${VARIABLE:?message}` values before deployment.

## 2. Set the application domain

Assign the domain to the `app` service. Because CFL Live listens on container port 8787, enter:

```text
https://live.your-domain.com:8787
```

Coolify's proxy still serves the public site over normal HTTPS port 443. Create the matching DNS A/AAAA record and wait for Coolify to issue the TLS certificate.

## 3. Required runtime variables

Set these in the Coolify environment-variable screen. Keep passwords runtime-only and masked.

```dotenv
PUBLIC_ORIGIN=https://live.your-domain.com
ADMIN_EMAIL=owner@your-domain.com
ADMIN_PASSWORD=<unique 16+ character password>
ADMIN_NAME=CFL Administrator
ORGANIZATION_NAME=Coach For Life
ORGANIZATION_SLUG=coach-for-life
BOOTSTRAP_WORKSHOP=true
DATABASE_POOL_SIZE=10
```

The compose stack generates stable `SERVICE_PASSWORD_POSTGRES` and `SERVICE_PASSWORD_REDIS` values. Do not replace them on later deployments or the app will lose access to its persisted services.

`BOOTSTRAP_DEMO_DATA` is hard-disabled. The initial workshop and built-in templates are real starter content; fake audience members and fake template popularity are never added to production.

## 4. Deploy and verify

Deploy the resource and wait until the `app`, `postgres`, and `redis` services are healthy. Then verify:

```bash
curl -fsS https://live.your-domain.com/api/health
curl -fsS https://live.your-domain.com/api/ready
DEPLOYMENT_URL=https://live.your-domain.com npm run test:deploy
```

Readiness must report `database.driver=postgresql`, `realtime.driver=redis`, and `realtime.ok=true`. Sign in with `ADMIN_EMAIL`, create one internal test workshop, join from an incognito window, submit an answer, and confirm the presenter/projector update live.

After the first successful deployment, set `BOOTSTRAP_WORKSHOP=false`. Keep the admin variables present: bootstrap inserts are idempotent and do not overwrite the stored account.

## 5. Backups and restore drill

The PostgreSQL volume is persistent, but a volume is not a backup. Schedule a nightly custom-format dump to off-server S3-compatible storage and keep at least 14 daily copies. Use PostgreSQL 16 tools:

```bash
pg_dump --format=custom --no-acl --no-owner --username cfl_live cfl_live
```

At least monthly, restore the newest dump into a separate PostgreSQL 16 database and run `/api/ready` plus the deployment smoke test against a staging CFL Live instance. Redis contains coordination/rate-limit state and can be rebuilt; PostgreSQL is the system of record.

Coolify's own backup does **not** automatically back up application volumes. If you move PostgreSQL to a separate Coolify database resource, use its scheduled database backups and an S3-compatible destination.

## 6. Rollback

1. Roll back the app image/source revision in Coolify.
2. Do not roll back or delete the PostgreSQL/Redis volumes.
3. Confirm `/api/ready` is healthy.
4. Run `DEPLOYMENT_URL=https://live.your-domain.com npm run test:deploy`.
5. If a data restore is required, stop app writes, restore the verified PostgreSQL dump, then restart the app and repeat the smoke checks.

## 7. Monitoring

- Monitor `GET /api/ready` every minute; alert after two consecutive failures.
- Retain application logs and alert on `Request failed`, `Redis ... error`, and repeated HTTP 429 events.
- Monitor disk usage for both persistent volumes.
- Record the active release returned by `/api/health` and `/api/ready`.

Official references: [Docker Compose deployment](https://coolify.io/docs/knowledge-base/docker/compose), [health checks](https://coolify.io/docs/knowledge-base/health-checks), [domains](https://coolify.io/docs/knowledge-base/domains), and [PostgreSQL backups](https://coolify.io/docs/databases/backups).
