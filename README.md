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

# 4. build (shared + prisma generate + api + web) — or run dev steps below
yarn build

# 5. prisma migrations (first time only)
yarn migrate:dev --name init

# 6. run (two processes; browse to the API port only)
yarn workspace @appszone/web dev    # Vite dev server on :5173 (HMR source)
yarn workspace @appszone/api dev    # Nest on :4010 — serves API + proxies SPA

# → open http://localhost:4010
#   /health, /admin/*, /v1/* hit Nest; everything else is proxied to Vite.
```

### How the SPA is served (single origin)

The Nest server is the only entry point:

- **Dev** — Nest proxies all non-API routes (and the HMR websocket) to the Vite
  dev server (`WEB_DEV_SERVER_URL`, default `:5173`). You browse `:4010`.
- **Prod** — `ServeStaticModule` serves `apps/web/dist` with `index.html` fallback
  for client routes. API prefixes (`/health`, `/admin`, `/v1`) are excluded.

Because the SPA and API share an origin, the frontend calls the API with relative
paths (`VITE_API_BASE_URL` empty) and CORS isn't needed for it.

## Production build & run

```bash
# 1. install
yarn install

# 2. env (required before build/run)
cp .env.example apps/api/.env
# edit DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, etc.

# 3. build everything (shared → prisma generate → api + web)
yarn build
#   @appszone/shared   tsc
#   @appszone/api      prisma generate + nest build
#   @appszone/web      tsc + vite build → apps/web/dist

# 4. apply database migrations (needs a running MySQL)
yarn migrate:deploy

# 5. start the API (serves /api/v1 + static SPA from apps/web/dist)
yarn start:prod
# → http://localhost:4010
```

`yarn build` is all you need to compile the app. Migrations are separate because they
require a live database connection at deploy time.

## Status

Phase 1 (Foundation scaffold) complete: monorepo, NestJS bootable with `/health` +
Prisma, Vite SPA with router/auth shell/login modal, shared Zod schemas, dev infra.
Mailcow + DNS + VPS provisioning are operational steps done on the server (see plan).

Next: Phase 2 — admin login endpoint, AdminGuard, and wiring the SPA auth flow end to end.
