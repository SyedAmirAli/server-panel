# AppsZone Mail — Project Guide

Self-hosted mail platform: NestJS API + workers (`apps/api`), Vite/React/TS static SPA
(`apps/web`), shared types (`packages/shared`). Mailcow handles SMTP/IMAP. MySQL + Prisma.
See `.claude/plan/appszone-mail-platform.md` for the full plan and `docs/` for API guides.

## Conventions (follow these when writing code)

### API response envelope (IMPORTANT)
- **`POST`/`PUT`/`PATCH`/`DELETE`** return `{ status, message, data }` where
  `status ∈ "success" | "error" | "warning" | "info" | "queued"`.
- **`GET`/`HEAD`** return the **raw payload** — no envelope.
- **Errors/exceptions** return the envelope with `status: "error"` (validation issues
  go in `data.errors`).
- Implemented globally via `ResponseEnvelopeInterceptor` + `AllExceptionsFilter` (see
  `apps/api/src/common/`). In handlers, return `ApiResponse.success(data, msg)` /
  `.queued()` / `.warning()` etc. to set status+message; or return raw data for a
  generic success wrap. Full details: `docs/api-response-convention.md`.

### Other conventions
- **Validation:** class-validator DTOs (not Zod). DTOs live in each module's `dto/`,
  implement the matching interface from `@appszone/shared`. Global `ValidationPipe`
  (`transform + whitelist`) is on.
- **Imports:** use the `@/` path alias (→ `src/`), not relative `../../`.
- **Routes:** global prefix `api/v1` (e.g. `POST /api/v1/mails/send`). Swagger at
  `/swagger`.
- **Shared package:** types + constants only (no runtime validation libs). Build it
  (`yarn workspace @appszone/shared build`) after changing it.
- **Auth:** admin JWT (`AdminGuard`) for `/admin/*`; API key HMAC (`ApiKeyGuard`) for
  external routes. API keys hashed with HMAC-SHA256; admin password with argon2.
- **DB:** MySQL native on the VM (no Docker required). `String[]` isn't supported →
  use `Json`. Scripts: `yarn db:generate`, `db:push`, `db:pull`, `migrate:dev`,
  `migrate:deploy` (root or `@appszone/api`).
- **Queue:** in-app (no RabbitMQ/Redis). DB-backed outbox planned.

## Dev
- MySQL runs natively (`appszone` / `12345678`, db `appszone_mail`).
- `yarn workspace @appszone/web dev` (Vite :5173) + `yarn workspace @appszone/api dev`
  (Nest :3000, serves API + proxies SPA). **Browse `http://localhost:3000`.**
- `migrate:dev` needs a TTY; in non-interactive shells use `migrate diff` → write SQL →
  `migrate deploy`.
