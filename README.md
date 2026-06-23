# AppsZone Universal Mail Platform

Self-hosted mail platform for **appszonebd.com**: Mailcow (SMTP/IMAP) + NestJS API
(in-app workers) + Vite/React/TypeScript static SPA admin dashboard.

See [`.claude/plan/appszone-mail-platform.md`](.claude/plan/appszone-mail-platform.md)
for the full plan and phasing.

## Monorepo

```
apps/api/        NestJS API + in-app workers (Prisma + MySQL)
apps/web/        Vite + React + TS static SPA (Tailwind v4, React Router v6)
packages/shared/ Shared Zod schemas + TypeScript types
docker-compose.yml  Local dev: MySQL
```

## Local dev quick start

```bash
# 1. install (yarn workspaces)
yarn install

# 2. env
cp .env.example apps/api/.env
cp .env.example apps/web/.env   # VITE_API_BASE_URL is the only var web reads

# 3. infra (MySQL)
yarn docker:up

# 4. build shared package once (api/web depend on it)
yarn workspace @appszone/shared build

# 5. prisma
yarn workspace @appszone/api db:generate
yarn workspace @appszone/api migrate:dev --name init

# 6. run (two processes; browse to the API port only)
yarn workspace @appszone/web dev    # Vite dev server on :5173 (HMR source)
yarn workspace @appszone/api dev    # Nest on :3000 — serves API + proxies SPA

# → open http://localhost:3000
#   /health, /admin/*, /v1/* hit Nest; everything else is proxied to Vite.
```

### How the SPA is served (single origin)

The Nest server is the only entry point:

- **Dev** — Nest proxies all non-API routes (and the HMR websocket) to the Vite
  dev server (`WEB_DEV_SERVER_URL`, default `:5173`). You browse `:3000`.
- **Prod** — `ServeStaticModule` serves `apps/web/dist` with `index.html` fallback
  for client routes. API prefixes (`/health`, `/admin`, `/v1`) are excluded.

Because the SPA and API share an origin, the frontend calls the API with relative
paths (`VITE_API_BASE_URL` empty) and CORS isn't needed for it.

## Status

Phase 1 (Foundation scaffold) complete: monorepo, NestJS bootable with `/health` +
Prisma, Vite SPA with router/auth shell/login modal, shared Zod schemas, dev infra.
Mailcow + DNS + VPS provisioning are operational steps done on the server (see plan).

Next: Phase 2 — admin login endpoint, AdminGuard, and wiring the SPA auth flow end to end.
