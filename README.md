# AppsZone Universal Mail Platform

Self-hosted mail platform for **appszonebd.com**: Mailcow (SMTP/IMAP) + NestJS API
(in-app workers) + Vite/React/TypeScript static SPA admin dashboard.

See [`.claude/plan/appszone-mail-platform.md`](.claude/plan/appszone-mail-platform.md)
for the full plan and phasing.

## Monorepo

```
apps/api/        NestJS API + in-app workers (Prisma + PostgreSQL)
apps/web/        Vite + React + TS static SPA (Tailwind v4, React Router v6)
packages/shared/ Shared TypeScript types + constants
docker-compose.yml  Production app container (external PostgreSQL)
```

## Docker

One image: the API, its in-app workers, and the built SPA, served on `API_PORT`.
The database is **external** (Postgres running natively on the host).

### Configuration

Compose hands the container two files, in order — `.env`, then `apps/api/.env` on
top of it (the same file the API reads natively, and the superset: AI gateway, Job
Finder, R2). Nothing is duplicated in `docker-compose.yml` and no configuration is
baked into the image, so an `.env` edit plus a restart is the whole change:

```bash
yarn docker:up   # docker compose up -d
```

Check what the container will actually see:

```bash
docker compose config
```

The service uses `network_mode: host`, so `127.0.0.1` means the same thing inside
the container as outside and the env files work unchanged for native and
containerised runs. The API binds `API_HOST:API_PORT` directly on the host — with
host networking there are no published ports to map. To run on a bridge network
instead, see the commented alternative in `docker-compose.yml`.

### Build and run

```bash
yarn docker:build   # docker compose build
yarn docker:up      # start detached
yarn docker:logs    # follow logs
yarn docker:down    # stop and remove
```

### Migrations

The container has **no entrypoint script** — it starts the server and nothing
else, so a restart never touches the schema. Apply migrations deliberately:

```bash
yarn docker:db:migrate   # prisma migrate deploy inside the container
yarn docker:db:push      # prisma db push (dev/rescue only)
```

### Notes

- Secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, `API_KEY_PEPPER`, `ADMIN_PASSWORD`,
  SMTP and R2 credentials) live only in the env files, never in a layer. Rotate
  the committed development values before exposing the service publicly.
- URL-encode special characters in database passwords (e.g. `@` → `%40`).
- The image ships headless Chromium for the AI Studio PDF renderer; the container
  runs as the unprivileged `node` user.

## Local dev quick start

```bash
# 1. install (yarn workspaces)
yarn install

# 2. env
cp .env.example apps/api/.env
cp .env.example apps/web/.env   # VITE_API_BASE_URL is the only var web reads

# 3. database (native MySQL on the host, or any reachable instance)
#    configure DATABASE_URL in apps/api/.env

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

```sql
CREATE DATABASE test_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER 'test_user'@'localhost' IDENTIFIED BY 'test_123456'; CREATE USER 'test_user'@'%' IDENTIFIED BY 'test_123456'; GRANT ALL PRIVILEGES ON test_db.* TO 'test_user'@'localhost'; GRANT ALL PRIVILEGES ON test_db.* TO 'test_user'@'%'; FLUSH PRIVILEGES;
```

```sql
CREATE DATABASE test_toast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER 'test_toast'@'localhost' IDENTIFIED BY 'test_123456'; CREATE USER 'test_toast'@'%' IDENTIFIED BY 'test_123456'; GRANT ALL PRIVILEGES ON test_db.* TO 'test_toast'@'localhost'; GRANT ALL PRIVILEGES ON test_db.* TO 'test_toast'@'%'; FLUSH PRIVILEGES;
```

```sql
CREATE DATABASE mail_appszonemail_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; ALTER USER 'mail_appszonemail'@'localhost' IDENTIFIED BY 'Siyamcse@30'; ALTER USER 'mail_appszonemail'@'%' IDENTIFIED BY 'Siyamcse@30'; GRANT ALL PRIVILEGES ON mail_appszonemail_shadow.* TO 'mail_appszonemail'@'localhost'; GRANT ALL PRIVILEGES ON mail_appszonemail_shadow.* TO 'mail_appszonemail'@'%'; FLUSH PRIVILEGES;
```

docker rm -f appszone-mail-server 2>/dev/null || true

docker run --name appszone-mail-server \
 --restart unless-stopped \
 -p 4010:4010 \
 -e DATABASE_URL="mysql://root:12345678@localhost:3306/apz_mailserver" \
 appszone-mail-server

docker run --name appszone-mail-server \
 --restart unless-stopped \
 -p 4010:4010 \
 -e DATABASE_URL="mysql://appszone:12345678@localhost:3306/appszone_mail" \
 -e SHADOW_DATABASE_URL="mysql://appszone:12345678@localhost:3306/appszone_mail_shadow" \
 appszone-mail-server

```sql
CREATE DATABASE IF NOT EXISTS appszone_lms
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'appszone_lms'@'localhost'
IDENTIFIED BY 'appszone_lms987';

CREATE USER IF NOT EXISTS 'appszone_lms'@'%'
IDENTIFIED BY 'appszone_lms987';

GRANT ALL PRIVILEGES ON appszone_lms.* TO 'appszone_lms'@'localhost';
GRANT ALL PRIVILEGES ON appszone_lms.* TO 'appszone_lms'@'%';

FLUSH PRIVILEGES;
```
