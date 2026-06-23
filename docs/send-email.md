# Send an Email

Send transactional email through the AppsZone Mail API using your project API key.

-   **Endpoint:** `POST /api/v1/mails/send`
-   **Auth:** `Authorization: Bearer <API key>`
-   **Content types:** `application/json` (no files) or `multipart/form-data` (with attachments)

| Environment | Base URL                                 |
| ----------- | ---------------------------------------- |
| Local dev   | `http://localhost:4010/api/v1`           |
| Production  | `https://app.mail.appszonebd.com/api/v1` |

---

## 1. Get an API key

API keys are created from the admin panel (or `POST /api/v1/admin/keys`). A key looks
like `azm_live_xxxxxxxxxxxxxxxxxxxxxxxx` and is shown **only once** at creation — store
it securely (server-side env var, secret manager). Never ship it in frontend code.

If a key has an `allowedFrom` list, it may only send from those addresses; otherwise it
can send from any verified domain sender.

---

## 2. Request body

| Field         | Type                             | Required | Notes                                                              |
| ------------- | -------------------------------- | -------- | ------------------------------------------------------------------ |
| `from`        | string (email)                   | ✅       | Must be allowed by the key's `allowedFrom` (if set)                |
| `to`          | string[]                         | ✅       | 1–50 recipients. In multipart, a comma-separated string also works |
| `cc`          | string[]                         | —        | Up to 50                                                           |
| `bcc`         | string[]                         | —        | Up to 50                                                           |
| `subject`     | string                           | ✅       | Max 2000 chars                                                     |
| `bodyType`    | `"PLAIN_TEXT"` \| `"EMBED_HTML"` | ✅       | How `body` is interpreted                                          |
| `body`        | string                           | ✅       | Plain text or an HTML document, per `bodyType`. Max ~1 MB          |
| `attachments` | file[]                           | —        | **multipart only.** Up to 10 files, 10 MB each, 25 MB total        |

### Success response — `201 Created`

All mutating endpoints return the standard envelope `{ status, message, data }`:

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
        "createdAt": "2026-06-23T09:34:51.467Z"
    }
}
```

- Envelope `status`: `"queued"` (accepted, awaiting delivery), `"success"` (sent), or
  `"warning"` (delivery failed — see `data.error`).
- `data.status` (the message's own state) is `queued` → `sent` / `failed`. Use
  `data.id` to track the message.

### Error responses

Errors use the same envelope with `status: "error"`:

```json
{
    "status": "error",
    "message": "each value in to must be an email",
    "data": { "errors": ["each value in to must be an email", "subject should not be empty"] }
}
```

| HTTP  | When                                                          |
| ----- | ------------------------------------------------------------- |
| `400` | Validation failed (`data.errors` lists every issue)           |
| `401` | Missing or invalid/inactive API key                           |
| `403` | `from` not permitted for this key (`allowedFrom`)             |
| `413` | Attachment(s) exceed the size/count limits                    |

---

## 3. JavaScript examples

### a) Browser / Node 18+ — JSON (no attachments)

```js
const API_BASE = "https://app.mail.appszonebd.com/api/v1";
const API_KEY = process.env.APPSZONE_MAIL_KEY; // keep this server-side

async function sendEmail() {
    const res = await fetch(`${API_BASE}/mails/send`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
            from: "sales@appszonebd.com",
            to: ["syedamirali473@gmail.com"],
            cc: ["boss@appszonebd.com"],
            subject: "Welcome aboard 🎉",
            bodyType: "EMBED_HTML",
            body: "<h1>Hi there</h1><p>Thanks for signing up.</p>",
        }),
    });

    const body = await res.json(); // { status, message, data }
    if (!res.ok) {
        throw new Error(`Send failed (${res.status}): ${body.message}`);
    }

    console.log(body.status, "—", body.message, "· id:", body.data.id);
    return body.data;
}

sendEmail().catch(console.error);
```

### b) Browser / Node 18+ — `multipart/form-data` with attachments

Use `FormData`. **Do not** set `Content-Type` manually — the runtime adds the multipart
boundary for you. Repeat the field name for arrays and multiple files.

```js
const API_BASE = "https://app.mail.appszonebd.com/api/v1";
const API_KEY = process.env.APPSZONE_MAIL_KEY;

async function sendWithAttachment(file /* a File/Blob (browser) */) {
    const form = new FormData();
    form.append("from", "sales@appszonebd.com");
    // arrays: repeat the field (or send a single comma-separated string)
    form.append("to", "jon@gmail.com");
    form.append("to", "doe@gmail.com");
    form.append("subject", "Your invoice");
    form.append("bodyType", "PLAIN_TEXT");
    form.append("body", "Invoice attached. Thanks!");
    form.append("attachments", file, "invoice.pdf");

    const res = await fetch(`${API_BASE}/mails/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}` }, // no Content-Type here
        body: form,
    });

    if (!res.ok) throw new Error(`Send failed (${res.status})`);
    return res.json();
}
```

### c) Node.js — attach a file from disk

Node 20+ has `fetch`, `FormData`, and `Blob` built in.

```js
import { readFile } from "node:fs/promises";

const API_BASE = "http://localhost:4010/api/v1";
const API_KEY = process.env.APPSZONE_MAIL_KEY;

const buffer = await readFile("./invoice.pdf");

const form = new FormData();
form.append("from", "sales@appszonebd.com");
form.append("to", "jon@gmail.com, doe@gmail.com"); // comma-separated is fine
form.append("subject", "Your invoice");
form.append("bodyType", "PLAIN_TEXT");
form.append("body", "Invoice attached.");
form.append("attachments", new Blob([buffer], { type: "application/pdf" }), "invoice.pdf");

const res = await fetch(`${API_BASE}/mails/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
});

console.log(res.status, await res.json());
```

---

## 4. cURL (quick test)

```bash
curl -X POST "http://localhost:4010/api/v1/mails/send" \
  -H "Authorization: Bearer $APPSZONE_MAIL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "sales@appszonebd.com",
    "to": ["jon@gmail.com"],
    "subject": "Hello",
    "bodyType": "PLAIN_TEXT",
    "body": "Hi from AppsZone Mail"
  }'
```

---

## Tips

-   **Keep the API key server-side.** Calling this endpoint from browser code exposes the
    key — proxy the call through your own backend instead.
-   **Arrays in multipart:** repeat the field name (`to` twice) **or** send one
    comma-separated string — both normalize to a list.
-   **`bodyType` matters:** `PLAIN_TEXT` sends a `text/plain` part; `EMBED_HTML` sends a
    single `text/html` part. Pick one and format `body` accordingly.
-   **Check `status`:** a `201` means the message was accepted/queued, not necessarily
    delivered. Poll or watch for `sent` / `failed`.
