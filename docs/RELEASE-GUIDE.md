# Release Guide

## Branch Strategy

```
develop ─── integration and testing
main     ─── production / live
```

Feature branches branch from `develop`. Hotfixes branch from `main`.

## Flow

```
Feature branch
    ↓  pull request (CI runs for all sub-projects)
develop branch
    ↓  CI build + deploy → Test MCE environment
    ↓  manual validation
main branch
    ↓  CI build + deploy → production environment
```

## Per-Project Environment Variables

Each project uses its framework's convention for env variable naming:

| Project | Env indicator | Framework |
|---------|---------------|-----------|
| `desktop/` | `VITE_APP_ENV` | Vite / Tauri |
| `api/` | `NEXT_PUBLIC_APP_ENV` | Next.js (server) |
| `dashboard/` | `NEXT_PUBLIC_APP_ENV` | Next.js (client) |
| `bible_backend/` | `APP_ENV` | Fastify / Hono |

Each project has:
- `.env` — development defaults (committed, no secrets)
- `.env.production` — production config (committed, placeholder secrets)
- `.env.example` — documented template with all vars

Secrets go only in GitHub Environments — never in committed files.

## Environment Configuration

| Variable | develop | main |
|----------|---------|------|
| `APP_ENV` | `development` | `production` |
| Desktop name | Test MCE | MakeChurchEasy |
| Desktop ID | com.makechurcheasy.desktop.test | com.makechurcheasy.desktop |
| Frontend URL | test.makechurcheasy.com | app.makechurcheasy.com |
| API URL | api-test.makechurcheasy.com | api.makechurcheasy.com |

## Sub-Projects

### `desktop/` — Vite + Tauri
- Env: `VITE_APP_ENV=development` / `production`
- `development` → app title shows "[TEST]", amber banner in shell, different Tauri identity
- `production` → normal branding, no banner
- CI: `scripts/build-env-config.mjs` rewrites `tauri.conf.json` before build

### `api/` — Next.js (backend)
- Env: `NEXT_PUBLIC_APP_ENV=development` / `production`
- Deployed via Vercel (primary) + Netlify (failover)
- Build with: `npm run build` (requires all `NEXT_PUBLIC_*` plus server env vars)

### `dashboard/` — Next.js (frontend)
- Env: `NEXT_PUBLIC_APP_ENV=development` / `production`
- Deployed via Vercel
- Build with: `npm run build`

### `bible_backend/` — Fastify + Hono
- Env: `APP_ENV=development` / `production`
- Dual runtime: Node.js server (`npm run dev`) and Cloudflare Worker (`wrangler dev`)
- Worker deployed with `--env development` / `--env production`

### `api/cloudflare-api-router/` — Cloudflare Worker
- Deployed with `--env development` / `--env production`

## Worker Names

| Worker | Development | Production |
|--------|-------------|------------|
| API Router | mce-api-router-dev | mce-api-router |
| Bible API | versecast-bible-api-dev | versecast-bible-api |

## GitHub Actions Workflows

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `ci.yml` | PR to develop/main | type-check (desktop), build (desktop, api, dashboard), verify-env |
| `deploy-develop.yml` | Push to develop | build all + deploy workers (dev) + smoke test |
| `deploy-main.yml` | Push to main | build all + deploy workers (prod) + smoke test |

## GitHub Environments

- `development` — used by `deploy-develop.yml`
- `production` — used by `deploy-main.yml` (with approval gate)

Store secrets in the appropriate environment. Required secrets per project:

### API (`api/`)
- `DEV_AUTH_SECRET` / `PROD_AUTH_SECRET`
- `DEV_FIREBASE_SERVICE_ACCOUNT_KEY` / `PROD_FIREBASE_SERVICE_ACCOUNT_KEY`
- `DEV_MONGODB_URI` / `PROD_MONGODB_URI`
- `DEV_PAYSTACK_SECRET_KEY` / `PROD_PAYSTACK_SECRET_KEY`
- (all `FIREBASE_API_KEY`, `PROJECT_ID`, etc.)

### Dashboard (`dashboard/`)
- `DEV_API_URL` / `PROD_API_URL`
- `DEV_BACKEND_URL` / `PROD_BACKEND_URL`
- (Firebase and Paystack public keys same as api)

### Workers
- `DEV_CLOUDFLARE_TOKEN` / `PROD_CLOUDFLARE_TOKEN`

## Safeguards

- Pull requests to `main` require passing CI checks.
- The `main` branch is protected — no direct pushes.
- Production deploy workflow uses the `production` GitHub Environment.
- Environment variables are injected by GitHub Actions, never read from env files in CI.
