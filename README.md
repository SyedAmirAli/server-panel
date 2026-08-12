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

Compose hands the container the repo's single root `.env` — the very same file the
API and the SPA read when run natively. Nothing is duplicated in
`docker-compose.yml` and no configuration is baked into the image, so an `.env`
edit plus a restart is the whole change:

```bash
yarn docker:up   # docker compose up -d
```

Check what the container will actually see:

```bash
docker compose config
```

**Postgres is not containerised** — it runs on the host, and the container reaches
it through the docker gateway (`extra_hosts: host.docker.internal:host-gateway`).
Port 4010 is published normally.

That makes `PG_HOST` the one value that genuinely differs per environment: `.env`
here keeps `127.0.0.1` so native runs (`yarn dev`, the Prisma CLI) work, while the
`.env` deployed next to the server's compose file sets `host.docker.internal`.
For that to connect, Postgres on the server must accept the gateway interface —
`listen_addresses` covering it in `postgresql.conf`, plus a `pg_hba.conf` line for
the docker subnet (typically `172.16.0.0/12`), and the port closed to the outside
world at the firewall.

(No Redis: this project's queue is in-app, so there is nothing else to reach.)

### Build and run

The image is named `ghcr.io/syedamirali/server-panel:latest` in `docker-compose.yml`,
so the build tags it for GitHub Container Registry directly — no separate
`docker tag` step. The path is lowercase because Docker rejects uppercase in an
image reference; GHCR resolves it to the same package as `github.com/SyedAmirAli`.

There is **one tag, `latest`**, by design — every build overwrites it and every push
replaces it in the registry. No version tags to maintain.

```bash
yarn docker:build   # docker compose build (tags ghcr.io/syedamirali/server-panel:latest)
yarn docker:up      # start detached
yarn docker:logs    # follow logs
yarn docker:down    # stop and remove
```

Release, from this machine (one-time auth:
`gh auth refresh -s write:packages,read:packages` then
`gh auth token | docker login ghcr.io -u SyedAmirAli --password-stdin`):

```bash
yarn docker:release    # build + push :latest
```

On the server — a plain `up -d` will keep running the old image, because the tag
name did not change. Pull first:

```bash
yarn docker:redeploy   # docker compose pull && docker compose up -d
docker image prune -f  # optional: drop the <none> images the new build orphaned
```

### Migrations

The container has **no entrypoint script** — it starts the server and nothing
else, so a restart never touches the schema. Apply migrations deliberately:

```bash
yarn docker:db:migrate   # prisma migrate deploy inside the container
yarn docker:db:push      # prisma db push (dev/rescue only)
```

### CI/CD

`.github/workflows/docker-deploy.yml` builds and pushes `:latest` to GHCR on every
push to `master` (or via *Run workflow*), then SSHes to the server to pull and
restart. Migrations are **not** run automatically — same reasoning as the missing
entrypoint script; uncomment the one line in the deploy step if you want them.

Repository secrets to add (Settings → Secrets and variables → Actions):

| Secret            | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `SSH_HOST`        | server hostname or IP                          |
| `SSH_USER`        | SSH user, must be in the `docker` group        |
| `SSH_PRIVATE_KEY` | private key for that user                      |
| `SSH_PORT`        | optional, defaults to `22`                     |

`GITHUB_TOKEN` is provided automatically and needs no setup.

One-time server preparation — the workflow only pulls and restarts, it never
writes these:

```
/srv/projects/server-panel/
├── docker-compose.yml   # copy of this repo's file
└── .env                 # copy of .env.example, filled in, PG_HOST=host.docker.internal
```

Change `DEPLOY_COMPOSE_FILE` at the top of the workflow if you put it elsewhere.

### Notes

- Secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, `API_KEY_PEPPER`, `ADMIN_PASSWORD`,
  SMTP and R2 credentials) live only in `.env`, never in a layer. Rotate
  the committed development values before exposing the service publicly.
- URL-encode special characters in database passwords (e.g. `@` → `%40`).
- The image ships headless Chromium for the AI Studio PDF renderer; the container
  runs as the unprivileged `node` user.

## Local dev quick start

```bash
# 1. install (yarn workspaces)
yarn install

# 2. env — ONE file at the repo root, shared by api, web and docker
cp .env.example .env

# 3. database (native PostgreSQL on the host, or any reachable instance)
#    configure PG_* / DATABASE_URL in .env

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
cp .env.example .env
# edit DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, etc.

# 3. build everything (shared → prisma generate → api + web)
yarn build
#   @appszone/shared   tsc
#   @appszone/api      prisma generate + nest build
#   @appszone/web      tsc + vite build → apps/web/dist

# 4. apply database migrations (needs a running PostgreSQL)
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
