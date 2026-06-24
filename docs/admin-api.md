# Admin Panel API

Everything the admin SPA needs to integrate with the AppsZone Mail API: authentication,
API-key management, SMTP email configs, and the read-only observability endpoints
(audit log, sent messages, mailboxes, inbox messages).

| Environment | Base URL                                 |
| ----------- | ---------------------------------------- |
| Local dev   | `http://localhost:4010/api/v1`           |
| Production  | `https://app.mail.appszonebd.com/api/v1` |

> All routes below are written **relative to the base URL** (the global prefix `api/v1`
> is already included). Interactive reference: **`/swagger`** (`/swagger/json` for the
> raw OpenAPI document).

---

## 1. Conventions you must know

### 1.1 Response envelope

-   **`POST` / `PUT` / `PATCH` / `DELETE`** return an envelope:
    ```ts
    { status: "success" | "error" | "warning" | "info" | "queued", message: string, data: T }
    ```
-   **`GET` / `HEAD`** return the **raw payload** — no envelope, no `status`/`message`.
-   **Errors** (any method) return the envelope with `status: "error"`. Validation errors
    put the full issue list in `data.errors`.

Full details: [api-response-convention.md](./api-response-convention.md).

A single fetch wrapper that unwraps the envelope keeps the rest of your code clean:

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem("admin_token");
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init.headers,
        },
    });

    const isJson = res.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await res.json() : null;

    if (!res.ok) {
        // Error envelope: { status:"error", message, data:{ errors?: string[] } }
        const message = body?.message ?? `Request failed (${res.status})`;
        throw Object.assign(new Error(message), { status: res.status, errors: body?.data?.errors });
    }

    // Mutating responses are enveloped; GET returns raw. Unwrap when present.
    if (body && typeof body === "object" && "status" in body && "data" in body) {
        return body.data as T;
    }
    return body as T;
}
```

### 1.2 Authentication

Two independent auth schemes:

| Scheme        | Header                             | Used for                                                 |
| ------------- | ---------------------------------- | -------------------------------------------------------- |
| **Admin JWT** | `Authorization: Bearer <jwt>`      | All `/admin/*` and `/utility/*` routes (the admin panel) |
| **API key**   | `Authorization: Bearer azm_live_…` | `POST /mails/send` only (external/transactional senders) |

The admin panel uses the **JWT** exclusively. Obtain it via `POST /admin/login`
(section 2), store it, and send it on every admin request. On `401` (expired/invalid),
clear it and route back to login.

### 1.3 HTTP status codes

| Code  | Meaning                                                  |
| ----- | -------------------------------------------------------- |
| `200` | OK (GET, login, and mutations that use `@HttpCode(200)`) |
| `201` | Created (most `POST`s)                                   |
| `400` | Validation failed — `data.errors` lists every issue      |
| `401` | Missing / invalid / expired token                        |
| `403` | Authenticated but not allowed                            |
| `404` | Resource not found                                       |
| `409` | Conflict (e.g. duplicate email-config username)          |
| `413` | Payload too large (attachments)                          |
| `500` | Server error                                             |

---

## 2. Authentication — `POST /admin/login`

Authenticate the admin and receive a JWT. There is no username — only a shared password
(matched against the server's `ADMIN_PASSWORD`).

**Request**

```json
{ "password": "12345678" }
```

**Response — `200`**

```json
{
    "status": "success",
    "message": "Logged in",
    "data": { "token": "eyJhbGciOi...", "expiresIn": "24h" }
}
```

On wrong password → `401` with `{ "status":"error", "message":"Invalid password", "data":null }`.

```ts
async function login(password: string) {
    const { token } = await api<{ token: string; expiresIn: string }>("/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
    });
    localStorage.setItem("admin_token", token);
}
```

> The JWT carries no refresh mechanism — when it expires (default 24h), the admin logs in
> again.

---

## 3. API Keys — `/admin/keys`

Manage the keys external apps use to call `POST /mails/send`. **The plaintext secret is
returned only once** (on create and on refresh) — surface a "copy now" UX; it can never be
retrieved again.

### Object shapes

```ts
// Returned by list / update / toggle / delete
interface ApiKeyView {
    id: string;
    name: string;
    keyPrefix: string; // e.g. "azm_live_a1b2c3" — safe to display
    isActive: boolean;
    allowedFrom: string[]; // sender allow-list; [] = unrestricted
    createdAt: string; // ISO 8601
    lastUsedAt: string | null;
}

// Returned by create / refresh — ApiKeyView plus the one-time secret
interface ApiKeySecretView extends ApiKeyView {
    secret: string; // full "azm_live_…" key — shown ONCE
}
```

### Endpoints

| Method & path                         | Purpose                                                          | Body                             |
| ------------------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| `GET /admin/keys`                     | List keys (paginated — see §7)                                   | —                                |
| `POST /admin/keys`                    | Create a key (returns one-time `secret`)                         | `{ name, allowedFrom? }`         |
| `PUT /admin/keys/:id`                 | Update name and/or `allowedFrom`                                 | `{ name?, allowedFrom? }`        |
| `PATCH /admin/keys/:id/toggle-active` | Activate/deactivate                                              | `{ isActive? }` (omit to toggle) |
| `POST /admin/keys/:id/refresh`        | Rotate the secret (returns new one-time secret, invalidates old) | —                                |
| `DELETE /admin/keys/:id`              | Permanently delete                                               | —                                |

**Create body**

| Field         | Type     | Required | Notes                                                                                  |
| ------------- | -------- | -------- | -------------------------------------------------------------------------------------- |
| `name`        | string   | ✅       | Max 120 chars                                                                          |
| `allowedFrom` | string[] | —        | Up to 50 valid emails. If set, key may only send from these. Omit/empty = unrestricted |

**Create — `POST /admin/keys`**

```json
// request
{ "name": "Sales App", "allowedFrom": ["sales@appszonebd.com"] }
```

```json
// response 201
{
    "status": "success",
    "message": "API key created — copy the secret now, it won't be shown again",
    "data": {
        "id": "clx9abc123",
        "name": "Sales App",
        "keyPrefix": "azm_live_a1b2c3",
        "isActive": true,
        "allowedFrom": ["sales@appszonebd.com"],
        "createdAt": "2026-06-24T10:00:00.000Z",
        "lastUsedAt": null,
        "secret": "azm_live_a1b2c3xxxxxxxxxxxxxxxxxxxxxxxx"
    }
}
```

**Toggle active** — pass `{ "isActive": true|false }` to set explicitly, or send an empty
body `{}` to flip the current value. Message reflects the result ("API key activated" /
"API key deactivated").

**Update** — at least one of `name` / `allowedFrom` is required, else `400`. Pass
`allowedFrom: []` to clear sender restrictions.

```ts
const keys = (params = "") => api<Paginated<ApiKeyView>>(`/admin/keys${params}`);
const createKey = (body: { name: string; allowedFrom?: string[] }) =>
    api<ApiKeySecretView>("/admin/keys", { method: "POST", body: JSON.stringify(body) });
const updateKey = (id: string, body: { name?: string; allowedFrom?: string[] }) =>
    api<ApiKeyView>(`/admin/keys/${id}`, { method: "PUT", body: JSON.stringify(body) });
const toggleKey = (id: string, isActive?: boolean) =>
    api<ApiKeyView>(`/admin/keys/${id}/toggle-active`, {
        method: "PATCH",
        body: JSON.stringify(isActive === undefined ? {} : { isActive }),
    });
const refreshKey = (id: string) => api<ApiKeySecretView>(`/admin/keys/${id}/refresh`, { method: "POST" });
const deleteKey = (id: string) => api<ApiKeyView>(`/admin/keys/${id}`, { method: "DELETE" });
```

---

## 4. Email Configs — `/admin/email-configs`

Per-sender SMTP credentials. When `POST /mails/send` runs, the service looks up an
**active** config whose `username` equals the message's `from` address; if found it uses
that config's host/port/credentials, otherwise it falls back to the server's default SMTP
env vars.

### Object shape

```ts
interface EmailConfigView {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string; // also the matched sender address
    // NOTE: password is write-only — never returned
    tls: { rejectUnauthorized?: boolean } | null;
    requireTLS: boolean;
    secure: boolean; // true = implicit TLS (port 465)
    createdAt: string;
    updatedAt: string;
}
```

> The `password` is **never** returned in any response. The `isActive` flag exists on the
> record and is toggled via the endpoint below, but is not included in `EmailConfigView`.

### Endpoints

| Method & path                                  | Purpose                    | Body                             |
| ---------------------------------------------- | -------------------------- | -------------------------------- |
| `GET /admin/email-configs`                     | List (paginated — see §7)  | —                                |
| `GET /admin/email-configs/:id`                 | Get one                    | —                                |
| `POST /admin/email-configs`                    | Create                     | see fields below                 |
| `PUT /admin/email-configs/:id`                 | Update (≥1 field required) | any subset of fields             |
| `DELETE /admin/email-configs/:id`              | Delete                     | —                                |
| `PATCH /admin/email-configs/:id/toggle-active` | Activate/deactivate        | `{ isActive? }` (omit to toggle) |

**Create / update fields**

| Field        | Type    | Required (create) | Notes                                                                         |
| ------------ | ------- | ----------------- | ----------------------------------------------------------------------------- |
| `name`       | string  | ✅                | Max 255                                                                       |
| `host`       | string  | ✅                | Max 255, e.g. `mail.appszonebd.com`                                           |
| `port`       | number  | ✅                | 1–65535 (587 STARTTLS, 465 implicit TLS)                                      |
| `username`   | string  | ✅                | Max 255. **Unique** — duplicate → `409`. Match key against the `from` address |
| `password`   | string  | ✅                | Max 255. Write-only                                                           |
| `tls`        | object  | —                 | `{ rejectUnauthorized?: boolean }`. `false` allows self-signed certs          |
| `requireTLS` | boolean | —                 | Default `false` (force STARTTLS)                                              |
| `secure`     | boolean | —                 | Default `false`. `true` for port 465                                          |

**Create — `POST /admin/email-configs`**

```json
{
    "name": "Mailcow SMTP",
    "host": "mail.appszonebd.com",
    "port": 465,
    "username": "noreply@appszonebd.com",
    "password": "smtp-secret",
    "secure": true,
    "tls": { "rejectUnauthorized": false }
}
```

```json
// response 201 — note: no password field
{
    "status": "success",
    "message": "Email config created successfully",
    "data": {
        "id": "clx9abc123",
        "name": "Mailcow SMTP",
        "host": "mail.appszonebd.com",
        "port": 465,
        "username": "noreply@appszonebd.com",
        "tls": { "rejectUnauthorized": false },
        "requireTLS": false,
        "secure": true,
        "createdAt": "2026-06-24T10:00:00.000Z",
        "updatedAt": "2026-06-24T10:00:00.000Z"
    }
}
```

-   **`PUT`** requires at least one field, else `400 "At least one field must be provided"`.
    To clear TLS options send `tls: null`.
-   Duplicate `username` on create/update → `409 "An email config with this username already exists"`.

---

## 5. Mail — `POST /mails/send`

Queue an email for delivery. **This is the only endpoint that authenticates with an API
key, not the admin JWT** (`Authorization: Bearer azm_live_…`). It is used by external
transactional senders, but documented here for completeness — the admin panel typically
manages keys (§3) rather than calling this directly.

-   **Auth:** `Authorization: Bearer <API key>` (`ApiKeyGuard`).
-   **Content types:** `application/json` (no files) **or** `multipart/form-data` (with attachments).
-   The message is persisted first, then delivery is attempted. If SMTP isn't configured
    the record stays `queued`. Every send (success or failure) writes an audit-log entry.

### Request body

| Field         | Type                             | Required | Notes                                                                 |
| ------------- | -------------------------------- | -------- | --------------------------------------------------------------------- |
| `from`        | string (email)                   | ✅       | Must be allowed by the key's `allowedFrom` (if set), else `403`       |
| `to`          | string[] (email)                 | ✅       | 1–50 recipients. In multipart: repeated fields **or** comma-separated |
| `cc`          | string[] (email)                 | —        | Up to 50. Same multipart encoding as `to`                             |
| `bcc`         | string[] (email)                 | —        | Up to 50. Same multipart encoding as `to`                             |
| `subject`     | string                           | ✅       | 1–2000 chars                                                          |
| `bodyType`    | `"PLAIN_TEXT"` \| `"EMBED_HTML"` | ✅       | `PLAIN_TEXT` → text/plain part; `EMBED_HTML` → text/html part         |
| `body`        | string                           | ✅       | 1–1,000,000 chars; plain text or HTML per `bodyType`                  |
| `attachments` | file[]                           | —        | **multipart only.** ≤10 files, 10 MB/file, 25 MB total                |

### Response — `SentMessageView`

```ts
interface SentMessageView {
    id: string;
    from: string;
    to: string[];
    subject: string;
    status: "queued" | "sent" | "failed";
    error: string | null;
    createdAt: string;
}
```

The envelope `status` reflects the delivery outcome:

| Delivery result                          | HTTP  | Envelope `status` | `data.status`               |
| ---------------------------------------- | ----- | ----------------- | --------------------------- |
| Sent immediately                         | `201` | `success`         | `sent`                      |
| Accepted, not yet sent (no SMTP / async) | `201` | `queued`          | `queued`                    |
| Delivery failed                          | `201` | `warning`         | `failed` (see `data.error`) |

```json
{
    "status": "queued",
    "message": "Email queued for delivery",
    "data": {
        "id": "cmqq...id",
        "from": "sales@appszonebd.com",
        "to": ["jon@gmail.com", "doe@gmail.com"],
        "subject": "Welcome aboard",
        "status": "queued",
        "error": null,
        "createdAt": "2026-06-24T09:34:51.467Z"
    }
}
```

### Errors

| HTTP  | When                                                |
| ----- | --------------------------------------------------- |
| `400` | Validation failed (`data.errors` lists every issue) |
| `401` | Missing / invalid / inactive API key                |
| `403` | `from` not permitted for this key (`allowedFrom`)   |
| `413` | Attachment(s) exceed the per-file / total limits    |

> Full request/response walkthrough with JSON, multipart, Node and cURL examples:
> [send-email.md](./send-email.md).

---

## 6. Observability (read-only) — `/utility/*`

Admin-only `GET` endpoints for dashboards and inspection. All are paginated (see §7) and
return the **raw paginated payload** (no envelope). Each supports `search`, `fromDate`,
`toDate`, and `select`.

| Endpoint                     | Returns          | `search` matches                                     | Date filter on  |
| ---------------------------- | ---------------- | ---------------------------------------------------- | --------------- |
| `GET /utility/audit-log`     | `AuditLog[]`     | action, actorType, entityType, entityId, message     | `createdAt`     |
| `GET /utility/sent-messages` | `SentMessage[]`  | from, to, subject, status, error                     | `createdAt`     |
| `GET /utility/mailboxes`     | `Mailbox[]`      | address, isActive                                    | `createdAt`     |
| `GET /utility/mail-messages` | `MailMessage[]`  | from, to, subject, receivedAt, isRead                | `receivedAt`    |
| `GET /utility/dashboard`     | `DashboardStats` | `period`, `offset`, `fromDate`, `toDate` (see below) | activity fields |

### Dashboard stats

`GET /utility/dashboard` returns a single JSON object (no envelope, no pagination).

**Query params**

| Param      | Type   | Default | Description                                                                                  |
| ---------- | ------ | ------- | -------------------------------------------------------------------------------------------- |
| `period`   | string | `month` | `today` · `week` · `month` · `year` · `all`                                                  |
| `offset`   | int    | `0`     | Shift preset window: `0` = current, `-1` = previous, `+1` = next. Ignored when `period=all`. |
| `fromDate` | string | —       | Custom start `YYYY-MM-DD` (UTC). Requires `toDate`; overrides `period`.                      |
| `toDate`   | string | —       | Custom end `YYYY-MM-DD` (UTC). Requires `fromDate`.                                          |

**Navigation examples**

```bash
# Current month (default)
GET /utility/dashboard

# Previous week / next week
GET /utility/dashboard?period=week&offset=-1
GET /utility/dashboard?period=week&offset=1

# This year / all time
GET /utility/dashboard?period=year
GET /utility/dashboard?period=all

# Custom range
GET /utility/dashboard?fromDate=2026-06-01&toDate=2026-06-30
```

**Response**

```ts
type DashboardPeriod = "today" | "week" | "month" | "year" | "all" | "custom";

interface DashboardStats {
    range: {
        period: DashboardPeriod;
        offset: number;
        from: string | null; // ISO UTC; null when period=all
        to: string; // ISO UTC
    };
    inventory: {
        totalApiKeys: number;
        activeApiKeys: number;
        totalMailboxes: number;
        activeMailboxes: number;
        totalEmailConfigs: number;
        activeEmailConfigs: number;
    };
    activity: {
        mailMessages: number; // receivedAt in range
        sentMessages: number; // createdAt in range
        sent: number;
        sentFailed: number;
        queued: number; // queued sends created in range
        auditLogs: number;
    };
    snapshot: {
        inboxUnread: number; // current unread (live)
        sentQueued: number; // current queue depth (live)
    };
}
```

Week boundaries use **Monday–Sunday** (UTC). Month/year use calendar boundaries (UTC).

### Record shapes

```ts
interface AuditLog {
    id: string;
    action: string; // e.g. "mail.send.success", "mail.send.failed"
    actorType: string; // "admin" | "apikey" | "system"
    actorId: string | null;
    entityType: string | null; // "sentMessage" | "auditLog" | "emailConfig"
    entityId: string | null;
    metadata: unknown | null; // sanitized context — never secrets
    ip: string | null;
    userAgent: string | null;
    message: string | null; // Markdown-formatted summary (renderable)
    createdAt: string;
}

interface SentMessage {
    id: string;
    apiKeyId: string | null;
    from: string;
    to: string[];
    cc: string[] | null;
    bcc: string[] | null;
    subject: string;
    status: "queued" | "sent" | "failed";
    error: string | null;
    createdAt: string;
}

interface Mailbox {
    id: string;
    address: string;
    imapHost: string;
    imapUser: string;
    smtpHost: string;
    smtpUser: string;
    // imapPassword / smtpPassword are encrypted at rest — avoid displaying
    isActive: boolean;
    lastSyncUid: number | null;
    createdAt: string;
    updatedAt: string;
}

interface MailMessage {
    id: string;
    uid: number | null;
    mailboxId: string;
    messageId: string;
    from: string;
    to: string[];
    subject: string;
    snippet: string;
    body: string;
    html: string | null;
    receivedAt: string;
    isRead: boolean;
    syncedAt: string;
}
```

> `audit_logs.message` is rich Markdown (send envelope, recipients, attachments, errors).
> Render it with a Markdown component for a nice activity feed.

---

## 7. Pagination, search & filtering

Every list endpoint (`GET /admin/keys`, `/admin/email-configs`, all `/utility/*`) shares
the same query parameters and response shape.

### Query parameters

| Param      | Type            | Default     | Notes                                                       |
| ---------- | --------------- | ----------- | ----------------------------------------------------------- |
| `page`     | number          | `1`         | 1-based                                                     |
| `limit`    | number          | `10`        | Clamped to **max 100**                                      |
| `orderBy`  | string          | `createdAt` | Any column on the model                                     |
| `order`    | `asc` \| `desc` | `desc`      |                                                             |
| `search`   | string          | —           | Fuzzy, multi-token (AND of per-column OR). `q` is an alias  |
| `fromDate` | string (ISO)    | —           | Lower bound on the endpoint's date column                   |
| `toDate`   | string (ISO)    | —           | Upper bound                                                 |
| `select`   | string          | —           | Comma-separated fields to return (e.g. `id,name,createdAt`) |

### Response shape (Laravel-style)

```ts
interface Paginated<T> {
    data: T[];
    total: number; // total rows matching the query
    perPage: number;
    currentPage: number;
    lastPage: number; // == totalPages
    totalPages: number;
    from: number; // index of first row on this page (1-based; 0 when empty)
    to: number; // index of last row (0 when empty)
    currentTotal: number; // rows on THIS page
    path: string;
    firstPageUrl: string | null;
    lastPageUrl: string | null;
    prevPageUrl: string | null;
    nextPageUrl: string | null;
    links: { url: string | null; label: string; active: boolean }[]; // ready-to-render pager
}
```

```ts
const qs = new URLSearchParams({ page: "1", limit: "20", search: "sales", order: "desc" });
const page = await api<Paginated<ApiKeyView>>(`/admin/keys?${qs}`);
// page.data, page.total, page.currentPage, page.lastPage, page.links …
```

---

## 8. Error handling pattern

```ts
try {
    await createEmailConfig(form);
} catch (e: any) {
    if (e.status === 401) return redirectToLogin();
    if (e.status === 400 && e.errors) return showFieldErrors(e.errors); // string[]
    if (e.status === 409) return toast(e.message); // duplicate username
    toast(e.message ?? "Something went wrong");
}
```

The `errors` array (from `data.errors` on `400`) contains human-readable validation
messages straight from class-validator, e.g. `"name should not be empty"`,
`"each value in allowedFrom must be an email"`.

---

## 9. Health check — `GET /health`

Unauthenticated liveness probe. **Not** under the `api/v1` prefix — call it at the host
root (`http://localhost:4010/health`).

```json
{ "status": "ok", "service": "appszone-mail-server", "time": "2026-06-24T10:00:00.000Z" }
```

---

## Related docs

-   [Send an email](./send-email.md) — the API-key-authenticated `POST /mails/send` flow.
-   [API response convention](./api-response-convention.md) — the envelope rules in full.
    </content>
    </invoke>
