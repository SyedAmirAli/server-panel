---
name: Docker run DB override
overview: To start `appszone-mail-server` with an external database, pass `DATABASE_URL` at runtime (not just `MYSQL_*` vars). The image bakes `DATABASE_URL` at build time, so component env vars alone will not change the connection string.
todos: []
isProject: false
---

# Docker run with external DB credentials

## Critical detail

In [`Dockerfile`](Dockerfile), `DATABASE_URL` is resolved **at image build time**:

```dockerfile
ENV DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}
```

So at runtime, overriding only `MYSQL_USER`, `MYSQL_HOST`, etc. **does not** update `DATABASE_URL`. You must pass `-e DATABASE_URL=...` explicitly.

The entrypoint ([`docker-entrypoint.sh`](docker-entrypoint.sh)) uses Prisma with whatever `DATABASE_URL` is in the environment — it waits for DB, then runs `migrate deploy` / `db push` per `DOCKER_DB_SYNC`.

## Recommended `docker run` command

Replace placeholders with your external DB values:

```bash
docker run -d \
  --name appszone-mail-server \
  --restart unless-stopped \
  -p 4010:4010 \
  -e DATABASE_URL="mysql://YOUR_USER:YOUR_PASSWORD@YOUR_DB_HOST:3306/YOUR_DATABASE" \
  appszone-mail-server
```

**Example** (remote DB on `db.example.com`):

```bash
docker run -d \
  --name appszone-mail-server \
  --restart unless-stopped \
  -p 4010:4010 \
  -e DATABASE_URL="mysql://appszone:secret@db.example.com:3306/apz_mailserver" \
  appszone-mail-server
```

## If the DB runs on the same machine as Docker (Linux)

Containers cannot reach host `localhost`. Use one of:

- **Host gateway** (recommended on Linux):

```bash
docker run -d \
  --name appszone-mail-server \
  --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 4010:4010 \
  -e DATABASE_URL="mysql://appszone:secret@host.docker.internal:3306/apz_mailserver" \
  appszone-mail-server
```

- **Host IP** — use the server's LAN/public IP instead of `localhost`.

## Optional env vars

| Variable                                                           | When needed                                                                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                     | **Required** for external DB                                                                         |
| `SHADOW_DATABASE_URL`                                              | Only for `prisma migrate dev` (not needed for container startup; entrypoint uses `migrate deploy`)   |
| `DOCKER_DB_SYNC`                                                   | Default `migrate,push`; set to `migrate` if you only want migrations, or `push` for schema push only |
| `JWT_SECRET`, `ENCRYPTION_KEY`, `API_KEY_PEPPER`, `ADMIN_PASSWORD` | Override in production instead of using Dockerfile defaults                                          |

## Password special characters

If the DB password contains `@`, `#`, `/`, etc., URL-encode it in `DATABASE_URL` (e.g. `@` → `%40`).

## Build first (if image not built yet)

```bash
docker build -t appszone-mail-server .
# or
docker compose build
```

## Equivalent via docker compose

Add to [`docker-compose.yml`](docker-compose.yml):

```yaml
services:
    app:
        # ...existing config...
        environment:
            DATABASE_URL: mysql://YOUR_USER:YOUR_PASSWORD@YOUR_DB_HOST:3306/YOUR_DATABASE
```

Then: `docker compose up -d`

```mermaid
flowchart LR
  dockerRun["docker run -e DATABASE_URL"]
  entrypoint["docker-entrypoint.sh"]
  prisma["Prisma migrate deploy / db push"]
  externalDb["External MySQL"]
  dockerRun --> entrypoint
  entrypoint --> prisma
  prisma --> externalDb
```
