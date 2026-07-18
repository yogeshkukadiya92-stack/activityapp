# CFL Live

CFL Live is a standalone live-workshop and audience-engagement application for interactive polls, word clouds, rankings, quizzes, Q&A, number activities and multi-answer activities.

## Stack

- React + Vite frontend
- Node.js REST and WebSocket server
- PostgreSQL production database
- Redis Pub/Sub and distributed rate limiting
- Docker Compose deployment for Coolify

## Local development

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and the API on `http://localhost:8787`.

## Production checks

```bash
npm run build
npm run test:config
npm run test:security
```

For Coolify deployment, use `docker-compose.coolify.yml` and follow [the deployment runbook](outputs/CFL-Live-Coolify-Deployment.md). The full production feature guide is in [CFL Live README](outputs/CFL-Live-README.md), and launch verification is in the [launch checklist](outputs/CFL-Live-Launch-Checklist.md).
