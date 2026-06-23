# AppsZone Universal Mail Platform — Implementation Plan

> Self-hosted mail platform on **appszonebd.com**: Mailcow (SMTP/IMAP) + NestJS API
> (RabbitMQ workers) + Vite/React/TypeScript static SPA admin dashboard.

---

## Review notes / improvements over original plan (applied)

1. **API key hashing → HMAC-SHA256, not argon2.** Argon2 salts each hash uniquely, so
   keys can't be looked up by hash (would force an O(n) verify-all on every `/v1/send`)
   and is deliberately slow. API keys are high-entropy, so use
   `HMAC-SHA256(key, API_KEY_PEPPER)` stored in an **indexed** column for O(1) lookup.
   Keep **argon2 only for the admin password**.
2. **Single front reverse proxy (Caddy).** Mailcow ships its own nginx + Let's Encrypt
   wanting 80/443. Run one Caddy owning 80/443; bind Mailcow's nginx to internal ports.
   Avoids port collisions for `app.` / `api.` / `mail.`.
3. **`MailMessage` Prisma model reconstructed** (original plan snippet was corrupted).
4. **JWT in localStorage** is XSS-exposed — acceptable for internal admin tool; httpOnly
   cookie is a v1.1 hardening option.

---

## Goal

Production mail platform for **appszonebd.com** serving AppsZone agency + internal
projects: self-hosted real inboxes (send + receive), a NestJS REST API (admin auth,
send, read, key management, queue workers), and a pure-static Vite SPA admin dashboard.
External API keys (multiple per project, activate/deactivate, refresh). **No
user-management system.**

## Architecture

- **Mailcow** owns mail delivery + mailbox storage (Postfix + Dovecot + Rspamd).
- **NestJS API** owns product logic (API keys, queue orchestration, admin auth).
- **Vite SPA** is a pure static client (HTML/CSS/JS after `vite build`).
- **RabbitMQ** for job queues (send worker, IMAP sync worker; future: notifications,
  campaigns, analytics, ai.events).
- **MySQL + Prisma** for app data.

## Infrastructure

- 1 VPS (4 GB RAM, 2 vCPU, 80+ GB SSD) for v1; split to mail node + app node later.
- DNS on `appszonebd.com`: A `mail.`, MX → mail, SPF `v=spf1 mx -all`, DKIM (from
  Mailcow), DMARC `p=quarantine`, A `api.mail.`, A `app.mail.`, **PTR** matching
  `mail.appszonebd.com`.
- Initial mailboxes: `hello@`, `support@`, `noreply@`, `internal@`, per-project aliases.

## Monorepo (yarn workspaces + Turborepo)

```
appszone-mail/
├── apps/api/        # NestJS API + workers
├── apps/web/        # Vite + React + TS static SPA
├── packages/shared/ # Shared DTOs, Zod schemas, TS types
├── docker-compose.yml
├── package.json
└── turbo.json
```

## Frontend stack (strict)

Vite · React 18+ · TypeScript · Tailwind (latest) · React Router v6 ·
**Context API only** (no Redux/Zustand/React Query) · **native `fetch()` only** (no Axios)
· static output only · no Node server / SSR / file-based routing.

Routes: `/` Dashboard, `/send`, `/inbox`, `/inbox/:id`, `/keys`, `/docs`,
`/settings/mailboxes`. SPA fallback to `index.html` on the static host.

## Auth flow

SPA reads token from storage → if missing, LoginModal → `POST /admin/login { password }`
→ API verifies `ADMIN_PASSWORD` (argon2) → returns signed JWT → stored → sent as
`Authorization: Bearer`. On 401: clear storage, reopen LoginModal. `ADMIN_PASSWORD` lives
**only** in backend `.env`.

## Data model (Prisma)

`ApiKey` (name, keyHash [HMAC-SHA256, indexed/unique], keyPrefix, isActive, allowedFrom[],
timestamps, lastUsedAt), `Mailbox` (address, imap/smtp host+user+password [AES-256-GCM],
isActive, lastSyncUid), `MailMessage` (mailboxId, messageId, from, to, subject, snippet,
body, receivedAt, isRead, syncedAt; unique [mailboxId, messageId]), `SentMessage`
(apiKeyId?, from, to[], subject, status [queued|sent|failed], error?, createdAt).

## API design (base `https://api.mail.appszonebd.com`)

- Public: `GET /health`
- External (`/v1`, API-key auth): `POST /v1/send`. Guard: HMAC-hash key → indexed lookup
  → reject if inactive → update `lastUsedAt` → enforce `allowedFrom` → rate limit.
- Admin (`/admin`, JWT): `POST /login`, `GET/POST /keys`, `PATCH /keys/:id`,
  `POST /keys/:id/refresh`, `GET/POST/PATCH /mailboxes`, `GET /messages`,
  `GET /messages/:id`, `POST /send`, `POST /sync`, `GET /stats`.

## RabbitMQ queues (v1)

`mail.send` (→ nodemailer → Mailcow SMTP), `mail.imap.sync` (→ imapflow). Cron via
`@nestjs/schedule` publishes sync jobs every 2–5 min per active mailbox.

## Security checklist

`ADMIN_PASSWORD` backend-only; admin JWT short expiry signed with `JWT_SECRET`; API keys
stored as HMAC-SHA256 hashes (plaintext shown once); mailbox creds AES-256-GCM at rest;
TLS everywhere; Mailcow admin not public (firewall/VPN/allowlist); rate limit `/v1/send`
and `/admin/login`; Zod validation; CORS only `app.mail.appszonebd.com` (+ localhost dev).

## Phases

1. **Foundation** — VPS + Mailcow + DNS; mailboxes; scaffold monorepo, NestJS+Prisma,
   Vite+React+TS+Tailwind; docker-compose MySQL + RabbitMQ. *(scaffolding in progress)*
2. **Auth + SPA shell** — `/admin/login`, AdminGuard, AuthContext, LoginModal, typed
   `fetch` helper, AppShell + sidebar + router (empty page shells).
3. **API keys + send** — ApiKey/SentMessage migrations, key CRUD + refresh, ApiKeyGuard,
   `mail.send` queue + worker, Send Mail UI, API Keys UI.
4. **IMAP sync + inbox** — Mailbox/MailMessage migrations, encrypted mailbox CRUD,
   `mail.imap.sync` worker, message list/detail/sync endpoints, Inbox/Detail/Settings UI.
5. **Dashboard + hardening features** — stats endpoint + Dashboard UI, API Docs, rate
   limits, encryption at rest, deliverability smoke tests.
6. **Production** — Caddy + TLS, firewall (80/443 + 25/587/993), Mailcow lockdown,
   monitoring/logs, backups, SPA fallback config.

## v1 out of scope

Next.js/SSR; Redux/Zustand/React Query/Axios; RBAC/multi-user; threading/labels/advanced
search; campaign builder; inbound webhooks; multi-domain IP pool; attachments (v1.1);
mobile app.

## Success criteria

1. `vite build` → deployable static HTML/CSS/JS. 2. Client routes work with `index.html`
fallback. 3. Admin logs in via modal; password never in bundle. 4. Sent mail lands in
external inbox (not spam). 5. Inbound mail appears in Inbox within sync interval. 6.
External project sends via `POST /v1/send`. 7. Key refresh invalidates old key
immediately; deactivated key → 401. 8. Send worker processes queue reliably.
