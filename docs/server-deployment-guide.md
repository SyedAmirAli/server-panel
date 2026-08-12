# Server Deployment Runbook — `manager.krishi.cloud`

> **This document is written to be executed by an agent (Claude Code) on a fresh
> Ubuntu server.** Work through the phases in order. Every phase ends with a
> **Verify** step — if it fails, stop and fix it before moving on rather than
> continuing and debugging three phases later.

## What you are deploying

One Docker container: the NestJS API, its in-app workers, and the pre-built React
SPA, all served on port 4010. Everything else is on the host:

| Component      | Where it runs                                                   |
| -------------- | --------------------------------------------------------------- |
| App            | Docker container from `ghcr.io/syedamirali/server-panel:latest` |
| PostgreSQL     | **Host**, reached from the container via the docker gateway     |
| Nginx          | **Host**, TLS terminator and reverse proxy for the domain       |
| Object storage | Cloudflare R2 (external) — no local volumes to provision        |

There is no Redis and no message broker; the queue is in-app. The container
writes nothing persistent to disk, so there are no volumes to back up.

**Assumptions:** Ubuntu 22.04/24.04, a sudo-capable user, and DNS for
`manager.krishi.cloud` already pointing at this server's public IP.

**What is already on this server:**

- The database dump, at `/tmp/apz_mailserver-20260812.sql.gz` (125 MB).
- A git checkout of the repo at `/srv/projects/server-panel` — **stale**, from
  before the Docker rework. Phase 6 replaces the parts that matter; the source
  tree itself is not used to run anything, since the image is pulled pre-built.

**What you generate yourself** (Phase 3 and Phase 6): the Postgres role password,
`ADMIN_PASSWORD`, and `JWT_SECRET`. Nobody needs to hand you these.

**What you must ask the developer for:** the external-service credentials —
Cloudflare R2, the AI gateway key, Mailcow SMTP — plus `API_KEY_PEPPER` and
`ENCRYPTION_KEY`, which **must match** the values the dump was created under
(Phase 6 explains why), and a GitHub token with `read:packages` to pull the
image (Phase 7).

---

## Phase 1 — Base packages

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg ufw nginx
```

Install Docker Engine + Compose plugin (skip if `docker compose version` works):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"      # log out and back in for this to take effect
```

**Verify:**

```bash
docker compose version && nginx -v
```

---

## Phase 2 — PostgreSQL 18

The dump was produced by **PostgreSQL 18.4**. It must be restored into 18 or
newer: pg_dump 18 emits `\restrict` / `\unrestrict` meta-commands that older
`psql` binaries reject with `invalid command \restrict`. Ubuntu's default
`postgresql` package may be older, so use the PGDG repository.

```bash
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-18
```

**Verify — must print 18.x:**

```bash
psql --version
sudo systemctl status postgresql --no-pager | head -5
```

---

## Phase 3 — Role, database and privileges

**Generate the password here, on the server — do not ask for one and do not
invent one by hand.** The database name and role name are fixed (`apz_mailserver`
/ `appszone`); only the password is new.

Store it in a root-only file first, so every later phase can read it back without
you re-typing it, and so it survives if your shell session ends:

```bash
sudo install -d -m 700 /root/.server-panel
sudo sh -c "openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40 > /root/.server-panel/pg_password"
sudo chmod 600 /root/.server-panel/pg_password
sudo cat /root/.server-panel/pg_password        # note it down; it goes in .env
```

40 alphanumeric characters — deliberately no punctuation, so the value never
needs URL-encoding when it is interpolated into `DATABASE_URL`.

Create the role, the database and its privileges, reading the password from that
file so it is never re-typed:

```bash
PG_APP_PASSWORD="$(sudo cat /root/.server-panel/pg_password)"

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE appszone WITH LOGIN PASSWORD '${PG_APP_PASSWORD}';
CREATE DATABASE apz_mailserver OWNER appszone ENCODING 'UTF8';
SQL

sudo -u postgres psql -v ON_ERROR_STOP=1 -d apz_mailserver <<'SQL'
-- PostgreSQL 15+ no longer grants CREATE on public to everyone, and Prisma
-- needs it. Making appszone own the schema is the cleanest way to grant it.
ALTER SCHEMA public OWNER TO appszone;
GRANT ALL ON SCHEMA public TO appszone;
GRANT ALL PRIVILEGES ON DATABASE apz_mailserver TO appszone;
SQL
```

Note the first heredoc is `<<SQL` (unquoted, so the password expands) while the
second is `<<'SQL'` (quoted, so nothing expands). That difference is deliberate.

**Verify — connects as the app role and reports an empty database:**

```bash
PGPASSWORD="$(sudo cat /root/.server-panel/pg_password)" \
  psql -h 127.0.0.1 -U appszone -d apz_mailserver \
  -c "select current_user, current_database();"
```

---

## Phase 4 — Let the container reach the host database

The container is on a docker bridge network, so `127.0.0.1` inside it is the
container itself. Compose maps `host.docker.internal` to the docker gateway
(`extra_hosts: host-gateway`), and Postgres has to accept connections there.

Edit `/etc/postgresql/18/main/postgresql.conf`:

```conf
listen_addresses = '*'
```

Append to `/etc/postgresql/18/main/pg_hba.conf`:

```conf
# App container, reaching the host through the docker gateway.
host    apz_mailserver    appszone    172.16.0.0/12    scram-sha-256
```

`172.16.0.0/12` covers every default docker bridge subnet (172.17–172.31.x).
`listen_addresses = '*'` is safe **only** with the firewall below, which is why
the two are done together:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo systemctl restart postgresql
```

Port 5432 is never opened — ufw's default-deny covers it, and the docker gateway
traffic is internal so it is not filtered by these rules.

> **Note:** docker's published ports bypass ufw entirely. That is why the compose
> file binds the app to `127.0.0.1:4010` rather than `0.0.0.0:4010` — do not
> "fix" that to make it reachable from outside; nginx is the front door.

**Verify:**

```bash
sudo ss -lntp | grep 5432          # should show 0.0.0.0:5432
sudo ufw status verbose            # 22, 80, 443 allowed; everything else denied
```

---

## Phase 5 — Restore the backup

**The dump is already on this server** at `/tmp/apz_mailserver-20260812.sql.gz`
(125 MB). Confirm it before starting:

```bash
ls -lh /tmp/apz_mailserver-20260812.sql.gz
gzip -t /tmp/apz_mailserver-20260812.sql.gz && echo "archive intact"
```

If it is missing, get it from the developer's machine with
`scp backups/apz_mailserver-20260812.sql.gz USER@SERVER:/tmp/`.

The dump was taken with `--no-owner --no-privileges --clean --if-exists`, so it
drops and recreates every object and lands owned by whoever runs it — restore as
`appszone`, not as `postgres`:

```bash
PGPASSWORD="$(sudo cat /root/.server-panel/pg_password)" \
  sh -c 'gunzip -c /tmp/apz_mailserver-20260812.sql.gz \
    | psql -h 127.0.0.1 -U appszone -d apz_mailserver -v ON_ERROR_STOP=1'
```

It uncompresses to ~936 MB of SQL, so expect this to take a minute or two.

`ON_ERROR_STOP=1` is important: without it psql prints errors and exits 0, and
you get a half-restored database that looks like a success. Expect a few
`NOTICE: ... does not exist, skipping` lines from `--if-exists` on a fresh
database; those are normal.

**Verify — expect 28 tables, 2 API keys and 3 email configs:**

```bash
PGPASSWORD="$(sudo cat /root/.server-panel/pg_password)" \
  psql -h 127.0.0.1 -U appszone -d apz_mailserver <<'SQL'
select count(*) as tables from information_schema.tables where table_schema='public';
select count(*) as applied_migrations from _prisma_migrations where finished_at is not null;
select (select count(*) from api_keys) as api_keys,
       (select count(*) from email_configs) as email_configs;
SQL
```

The dump includes `_prisma_migrations`, so the schema is already at the right
version and `migrate deploy` later will be a no-op. That is expected.

Delete the dump from `/tmp` when the verification passes — it contains
production data.

---

## Phase 6 — Application directory

`/srv/projects/server-panel` already holds a **git checkout of the repo**, and it
is stale — it predates the Docker rework, so it still contains
`docker-entrypoint.sh` and an old `docker-compose.yml`. The source tree there is
not used to run anything (the image is pulled pre-built), but those two files
will actively break this deploy if left in place.

```bash
cd /srv/projects/server-panel
ls -l                      # confirm this is the checkout
git log --oneline -1       # note which commit it is on
```

Treat the compose file below as authoritative and **overwrite** whatever is
there. Do not `git pull` hoping to get it: these changes live on a feature
branch that has not been merged to `master` yet.

```bash
# The old entrypoint ran migrations on every boot. It is gone from the project
# by design — schema sync is a deliberate act now.
rm -f docker-entrypoint.sh
```

Write `docker-compose.yml` with exactly this content:

```yaml
services:
    app:
        image: ghcr.io/syedamirali/server-panel:latest
        container_name: server-panel
        restart: unless-stopped
        init: true

        env_file:
            - path: .env
              required: true

        ports:
            - "127.0.0.1:4010:4010"

        extra_hosts:
            - "host.docker.internal:host-gateway"

        stop_grace_period: 30s

        logging:
            driver: json-file
            options:
                max-size: "10m"
                max-file: "5"
```

> The repo's version also carries a `build:` section. It is omitted here because
> the server only ever pulls a pre-built image; keeping it would let a stray
> `docker compose up --build` try to build from a source tree that is not there.

Now `.env`, in the same directory. This single file configures everything — the
API, the SPA, and the container. Write it with the heredoc below so the database
password is read straight from the file you created in Phase 3 and never
re-typed. Note it is `<<EOF` unquoted, so `$(...)` runs; the `\${...}` escapes
keep `DATABASE_URL`'s references intact for Compose to expand later.

```bash
cd /srv/projects/server-panel
umask 077

cat > .env <<EOF
# ─── API ──────────────────────────────────────────────────────────
API_PORT=4010
API_HOST=0.0.0.0

# ─── Database (host Postgres, via the docker gateway) ─────────────
# PG_HOST is host.docker.internal, NOT 127.0.0.1 — inside the container that
# would be the container itself. This is the only value that differs from the
# developer's copy of this file.
PG_USER=appszone
PG_PASSWORD=$(sudo cat /root/.server-panel/pg_password)
PG_HOST=host.docker.internal
PG_PORT=5432
PG_DATABASE=apz_mailserver
DATABASE_URL="postgresql://\${PG_USER}:\${PG_PASSWORD}@\${PG_HOST}:\${PG_PORT}/\${PG_DATABASE}?schema=public"

# Password Creation by OpenSSL
# $(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)

# ─── Admin auth ───────────────────────────────────────────────────
ADMIN_PASSWORD=55801964
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=24h

# ─── HTTP ─────────────────────────────────────────────────────────
CORS_ORIGIN=https://manager.krishi.cloud

# ─── Filled in by hand below ──────────────────────────────────────
API_KEY_PEPPER=
ENCRYPTION_KEY=
SMTP_HOST=mail.appszonebd.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASSWORD=
SMTP_TLS_REJECT_UNAUTHORIZED=false
AI_BASE_URL=https://omniroute.krishi.cloud/v1
AI_API_KEY=
AI_DEFAULT_MODEL=auto/best-fast
OCR_MODEL=auto/best-fast
CLOUDFLARE_ACCESS_KEY_ID=
CLOUDFLARE_SECRET_ACCESS_KEY=
CLOUDFLARE_S3_API=
CLOUDFLARE_BUCKET_NAME=files
CLOUDFLARE_BUCKET_FOLDER=amir-panel

# Same-origin SPA — leave empty.
VITE_API_BASE_URL=
EOF

chmod 600 .env
grep -E '^(PG_PASSWORD|ADMIN_PASSWORD)=' .env    # note these down for the developer
```

The database password, admin password and JWT secret are now generated and in
place. **The remaining blanks must be copied from the developer's `.env`** — they
are credentials for external services (Cloudflare R2, the AI gateway, Mailcow
SMTP) that cannot be invented here. Ask for them; they are deliberately not
written into this document, because this document is committed to git.

> **Two of those blanks must match the developer's values exactly — do not
> generate new ones.** The restored database contains **2 API keys** and **3 email
> configs**. `API_KEY_PEPPER` is the HMAC pepper those key hashes were computed
> with, and `ENCRYPTION_KEY` decrypts the stored mailbox passwords. Fresh values
> mean every existing API key silently stops authenticating and every stored
> mailbox credential becomes undecryptable. `ADMIN_PASSWORD` and `JWT_SECRET`, by
> contrast, are safe to regenerate — nothing in the dump depends on them.

Fill them in, then confirm nothing was left empty:

```bash
grep -E '^[A-Z_]+=$' .env    # must print nothing
```

**Verify — resolved config shows the right host, and no `${...}` left unexpanded:**

```bash
docker compose config | grep -E "DATABASE_URL|PG_HOST|image:"
```

---

## Phase 7 — Start the container

The GHCR package is private unless it was made public, so authenticate first.
Use a GitHub personal access token with `read:packages`:

```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u SyedAmirAli --password-stdin
docker compose pull
docker compose up -d
```

**Verify:**

```bash
docker compose ps                       # State: running, Health: healthy (allow ~45s)
curl -s http://127.0.0.1:4010/api/v1/health   # {"status":"ok",...}
docker compose logs --tail=50 app
```

If health never goes healthy, it is almost always the database — see
Troubleshooting.

---

## Phase 8 — Nginx reverse proxy

Create `/etc/nginx/sites-available/manager.krishi.cloud`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name manager.krishi.cloud;

    # Attachments and resume uploads pass through the API on their way to R2.
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:4010;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        # The AI Studio chat, job-finder runs and bucket zipping all stream over
        # Server-Sent Events. Buffering here would hold those responses until the
        # stream ended, so the UI would sit blank and then dump everything at once.
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header X-Accel-Buffering no;

        # Long enough for a slow model response or a large zip to finish.
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/manager.krishi.cloud /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

**Verify — from your own machine, not the server:**

```bash
curl -s http://manager.krishi.cloud/api/v1/health
dig +short manager.krishi.cloud        # must be this server's public IP
```

DNS must already resolve here. Certbot's HTTP-01 challenge in the next phase
fails otherwise.

---

## Phase 9 — TLS with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d manager.krishi.cloud --agree-tos -m YOUR_EMAIL --redirect
```

`--redirect` makes certbot add the 80 → 443 redirect and rewrite the server block
in place. Do not hand-edit the TLS block afterwards; re-run certbot instead.

**Verify:**

```bash
curl -sI https://manager.krishi.cloud/api/v1/health | head -3   # HTTP/2 200
curl -sI http://manager.krishi.cloud | head -3                  # 301 to https
sudo certbot renew --dry-run                                    # renewal works
systemctl list-timers | grep certbot                            # auto-renew armed
```

Renewal is handled by the `certbot.timer` systemd unit the package installs.

---

## Phase 10 — Final checks

```bash
# App reachable over TLS
curl -s https://manager.krishi.cloud/api/v1/health

# SPA loads (should return HTML, not JSON)
curl -s https://manager.krishi.cloud/ | head -5

# Swagger
curl -sI https://manager.krishi.cloud/swagger | head -1

# Container survives a reboot
sudo reboot   # then re-check the health endpoint after it comes back
```

Open `https://manager.krishi.cloud` in a browser and log in with
`ADMIN_PASSWORD`. Confirm restored data is visible (mailboxes, sent messages,
API keys), since that proves the restore and the app agree.

Migrations, if a future deploy needs them (the restore already has the schema):

```bash
cd /srv/projects/server-panel && docker compose exec app yarn migrate:deploy
```

---

## Phase 11 — Enable automated deploys (optional)

`.github/workflows/docker-deploy.yml` in the repo builds and pushes `:latest` on
every push to `master`, then SSHes here to pull and restart. To turn it on, add
these repository secrets on GitHub (Settings → Secrets and variables → Actions):

| Secret            | Value                        |
| ----------------- | ---------------------------- |
| `SSH_HOST`        | this server's IP or hostname |
| `SSH_USER`        | a user in the `docker` group |
| `SSH_PRIVATE_KEY` | that user's private key      |
| `SSH_PORT`        | only if SSH is not on 22     |

The workflow expects the compose file at
`/srv/projects/server-panel/docker-compose.yml` — the path used above. It never
writes `.env` or the compose file; both stay server-owned artifacts.

---

## Troubleshooting

**Container unhealthy, logs show `Can't reach database server`**
The container cannot get to host Postgres. Work through it in this order:

```bash
docker compose exec app getent hosts host.docker.internal   # name resolves?
sudo ss -lntp | grep 5432                                   # listening on 0.0.0.0?
sudo tail -50 /var/log/postgresql/postgresql-18-main.log     # rejected connection?
```

A `no pg_hba.conf entry for host "172.x.x.x"` line in that log means the CIDR in
Phase 4 does not cover the gateway — widen it to the address shown and reload.

**`psql: invalid command \restrict` during restore**
The server's psql is older than 18. Recheck Phase 2; do not strip those lines
by hand, the dump is a matched pair with its `pg_dump` version.

**502 Bad Gateway from nginx**
The container is down or not on 4010. `docker compose ps` and
`curl http://127.0.0.1:4010/api/v1/health` on the server itself.

**Certbot fails with "Timeout during connect"**
DNS is not resolving to this server yet, or port 80 is blocked.
`dig +short manager.krishi.cloud` and `sudo ufw status`.

**Login rejects the correct password**
`ADMIN_PASSWORD` differs from the one in `.env`, or `JWT_SECRET` is empty.
Check `docker compose exec app env | grep -E 'ADMIN|JWT'`.

**PDF export fails / "Chromium launched" never appears**
The image ships its own Chromium; nothing is needed on the host. Check container
memory — Chromium needs a few hundred MB free to render.

**Everything is running but the SPA shows stale data after a deploy**
The browser cached `index.html`. It is served `Cache-Control: no-cache`, so a
hard reload settles it; assets are content-hashed and safe to cache.
