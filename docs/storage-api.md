# Storage API — Upload & Manage Files

Upload files to your S3-compatible buckets (AWS S3, Cloudflare R2, MinIO) through the
AppsZone Storage API, and get back a ready-to-use URL plus stored metadata. Your server
never proxies file bytes — after an upload you receive a direct **bucket/CDN URL** (public
objects) or a **presigned URL** (private objects) that the client uses to view, download,
or stream the file straight from the bucket.

-   **Base path:** `/api/v1/storage`
-   **Auth:** `Authorization: Bearer <storage API key>` (keys look like `azs_live_…`)
-   **Upload content type:** `multipart/form-data`

| Environment | Base URL                                     |
| ----------- | -------------------------------------------- |
| Local dev   | `http://localhost:4010/api/v1`               |
| Production  | `https://mailserver.appszonebd.com/api/v1`   |

> All examples below use the production base URL. Replace the key and bucket ID with your own.

---

## 1. Create a storage API key

Storage API keys are created from the **admin panel → Storage → Storage Keys**. Open the
page and click **New key**.

![Storage API Keys list](./assets/storage-images/storage-api-keys-list.jpg)

In the create dialog you can scope the key:

![Create a storage API key](./assets/storage-images/create-api-key-form.jpg)

| Field               | Meaning                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| **Name**            | A label for the key (e.g. “Mobile App Uploader”).                                                 |
| **Allowed buckets** | Bucket IDs this key may use. **Leave empty to allow all buckets.**                                |
| **Default bucket**  | Used when a request omits `bucketId`. Must be one of the allowed buckets (if any are selected).   |
| **Allowed origins** | Browser origins allowed to use the key (matched against the request `Origin`). Empty = any.       |
| **Allowed IPs**     | Client IPs / CIDR ranges allowed to use the key. Empty = any.                                     |
| **Expiry date**     | Optional date after which the key stops working. Empty = never expires.                          |

When the key is created, the **full secret is shown only once** — copy it immediately and
store it in a secret manager or server-side environment variable.

![Storage API key created](./assets/storage-images/successfully-created-the-api-key.jpg)

> **Keep the secret server-side.** Anyone with the key can upload to (and delete from) the
> buckets it is scoped to. See [Using the key from a browser](#9-using-the-key-from-a-browser)
> for the safe patterns when you need direct browser uploads.

---

## 2. Bucket IDs

Every bucket has a **12-character public ID** (uppercase letters + digits, e.g.
`A1B2C3D4E5F6`), shown in the admin **Buckets** list and on the bucket dashboard. This is
the value you pass as `bucketId` in API requests — never the internal database id.

**How the target bucket is resolved on each request:**

1. If you send a `bucketId`, that bucket is used (must be in the key’s allowed buckets).
2. Otherwise the key’s **default bucket** is used.
3. If neither is set, the request fails with `400`.

---

## 3. Upload a file — `POST /storage/upload`

`multipart/form-data`. Only `file` is required.

| Field           | Type            | Default   | Notes                                                                                     |
| --------------- | --------------- | --------- | ----------------------------------------------------------------------------------------- |
| `file`          | file            | —         | **Required.** The file to upload.                                                         |
| `bucketId`      | string          | key default | Target bucket public ID. Omit to use the key’s default bucket.                          |
| `prefix`        | string          | —         | Folder path, e.g. `documents/students`. Leading/trailing slashes are trimmed.             |
| `private`       | boolean         | `true`    | `true` → object is private, response returns a **presigned** URL. `false` → **public** URL. |
| `expiresIn`     | number (sec)    | `3600`    | Lifetime of the presigned URL for private objects. `60`–`604800` (7 days).                |
| `convertToWebp` | boolean         | `false`   | Convert images to WebP (images only).                                                     |
| `compress`      | boolean         | `false`   | Re-encode/compress images (images only).                                                  |
| `quality`       | number `1–100`  | `80`      | Quality used when `convertToWebp` or `compress` is on.                                     |
| `keyPath`       | string          | —         | **Raw mode.** Exact object key, stored verbatim and **overwriting** any existing object. See [§6](#6-raw--folder-uploads). Overrides `prefix` and filename handling. |

### Filename handling (normal mode)

The original filename is **slugified** (lowercased, safe characters) and its extension is
preserved (or changed to `.webp` when `convertToWebp` is on). If an object with that key
already exists, a numeric suffix is added so nothing is overwritten:

```
photo.png  →  photo.png
           →  photo-1.png   (if photo.png exists)
           →  photo-2.png   (and so on)
```

Use [raw mode](#6-raw--folder-uploads) (`keyPath`) if you need exact names and overwrite
behavior instead.

### Example — cURL

```bash
curl -X POST "https://mailserver.appszonebd.com/api/v1/storage/upload" \
  -H "Authorization: Bearer azs_live_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -F "file=@./avatar.png" \
  -F "bucketId=A1B2C3D4E5F6" \
  -F "prefix=users/42/avatars" \
  -F "private=false" \
  -F "convertToWebp=true" \
  -F "quality=82"
```

### Success response — `201 Created`

Mutating endpoints return the standard `{ status, message, data }` envelope.

```json
{
    "status": "success",
    "message": "File uploaded successfully",
    "data": {
        "key": "users/42/avatars/avatar.webp",
        "bucketId": "A1B2C3D4E5F6",
        "url": "https://cdn.appszonebd.com/users/42/avatars/avatar.webp",
        "endpointUrl": "https://<account>.r2.cloudflarestorage.com/assets/users/42/avatars/avatar.webp",
        "presigned": false,
        "expiresIn": null,
        "object": {
            "id": "clx…",
            "bucketId": "clx…",
            "key": "users/42/avatars/avatar.webp",
            "prefix": "users/42/avatars",
            "originalName": "avatar.png",
            "size": 24187,
            "contentType": "image/webp",
            "etag": "\"9a…\"",
            "isPrivate": false,
            "convertedWebp": true,
            "compressed": false,
            "quality": 82,
            "createdAt": "2026-07-21T09:12:44.000Z"
        }
    }
}
```

| Field                | Meaning                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `key`                | Final object key in the bucket (after slugify/uniqueness or your `keyPath`).                          |
| `bucketId`           | **Public** bucket ID the object was stored in.                                                        |
| `url`                | **Use this to serve the file.** Public objects → CDN/custom-domain URL. Private → presigned URL.      |
| `endpointUrl`        | Provider endpoint URL for public objects (e.g. the account/S3 endpoint). `null` for private objects. |
| `presigned`          | `true` if `url` is a temporary presigned URL (private object).                                        |
| `expiresIn`          | Seconds until the presigned URL expires (private only), else `null`.                                  |
| `object`             | The stored metadata record (see next).                                                               |
| `object.id`          | Internal record id.                                                                                  |
| `object.bucketId`    | Internal bucket reference (not the public ID — use the top-level `bucketId` for API calls).           |
| `object.contentType` | Final content type (e.g. `image/webp` after conversion).                                              |
| `object.size`        | Final stored size in bytes (after processing).                                                        |
| `object.isPrivate`   | Whether the object was stored private.                                                                |

> **Serving the file:** always use the returned `url` (or fetch a fresh one — see
> [§7](#7-refresh-a-private-url--storagepresign)). The file is served directly from the
> bucket/CDN; it never passes through this API.

---

## 4. Public vs private objects

-   **Private (`private=true`, the default):** the object is uploaded privately. The response
    `url` is a **presigned URL** that expires after `expiresIn` seconds. When it expires,
    request a fresh one from [`GET /storage/presign`](#7-refresh-a-private-url--storagepresign).
    No bytes ever flow through this server — the presigned URL points straight at the bucket.

-   **Public (`private=false`):** the object is uploaded with public-read intent, and the
    response `url` is a **direct, non-expiring** URL (your bucket’s CDN/custom domain if
    configured, otherwise the provider endpoint).

    > Whether a “public” object is actually world-readable depends on the bucket. On buckets
    > with **ACLs disabled** (e.g. AWS “Bucket owner enforced”, Cloudflare R2), per-object ACLs
    > are ignored — public access is governed by a **bucket policy** or a **public/custom
    > domain** you configure at the provider. The upload still succeeds; configure the bucket
    > for public delivery if you want the URL to open without signing.

---

## 5. Image processing (WebP & compression)

For image uploads you can transform the file at upload time (non-image files are stored
untouched):

-   `convertToWebp=true` → the image is re-encoded to **WebP**; the object extension becomes
    `.webp` and `object.contentType` becomes `image/webp`.
-   `compress=true` → the image is re-encoded in its original format at the given `quality`.
-   `quality=1..100` → applies when either option is on (default `80`).

Processing runs **before** the filename/uniqueness step, so the final `.webp` name is what
gets the uniqueness check. Raw/folder uploads ([§6](#6-raw--folder-uploads)) skip processing
entirely.

---

## 6. Raw / folder uploads

To clone files **verbatim** — exact names, extensions, and nested folders, overwriting any
existing object (like a dashboard “upload folder”) — send `keyPath` with the full object key
and omit the processing options:

```bash
curl -X POST "https://mailserver.appszonebd.com/api/v1/storage/upload" \
  -H "Authorization: Bearer azs_live_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -F "file=@./photos/2026/summer/IMG_0421.HEIC" \
  -F "bucketId=A1B2C3D4E5F6" \
  -F "keyPath=photos/2026/summer/IMG_0421.HEIC" \
  -F "private=false"
```

With `keyPath` set:

-   The key is stored **exactly** as given (slashes cleaned; `.`/`..` segments dropped). No
    slugify, no `-1`/`-2` suffixes.
-   An existing object at that key is **overwritten**.
-   No image processing is applied.

To upload a whole folder, iterate the files client-side and send one request per file, using
each file’s relative path as `keyPath` (see the [folder upload example](#folder-upload)).

---

## 7. Refresh a private URL — `GET /storage/presign`

Presigned URLs expire. To get a fresh one for a private object without proxying bytes:

```bash
curl "https://mailserver.appszonebd.com/api/v1/storage/presign?bucketId=A1B2C3D4E5F6&key=users/42/report.pdf&expiresIn=3600" \
  -H "Authorization: Bearer azs_live_xxxxxxxxxxxxxxxxxxxxxxxx"
```

`GET` responses are **raw** (no envelope):

```json
{ "url": "https://<account>.r2.cloudflarestorage.com/assets/users/42/report.pdf?X-Amz-…", "expiresIn": 3600 }
```

| Query       | Required | Notes                                        |
| ----------- | -------- | -------------------------------------------- |
| `key`       | ✅       | Full object key.                             |
| `bucketId`  | —        | Defaults to the key’s default bucket.        |
| `expiresIn` | —        | `60`–`604800` seconds (default `3600`).      |

`GET /storage/download` behaves the same and additionally echoes the `key`:
`{ "url": "…", "expiresIn": 3600, "key": "users/42/report.pdf" }`.

---

## 8. List files — `GET /storage/objects`

Two listing modes:

-   **`source=db` (default):** files uploaded **through this API**, with full metadata, paginated.
-   **`source=live`:** objects **currently in the bucket** (folders + files), read straight from
    the provider.

| Query       | Applies to | Notes                                                                    |
| ----------- | ---------- | ------------------------------------------------------------------------ |
| `bucketId`  | both       | Defaults to the key’s default bucket.                                     |
| `source`    | both       | `db` (default) or `live`.                                                 |
| `prefix`    | both       | Folder to list under.                                                     |
| `page`      | db         | Page number (default `1`).                                               |
| `limit`     | db / live  | Page size (db, default `10`) / max keys (live, default `100`, max `1000`). |
| `search`    | db         | Matches `key`, `originalName`, `prefix`.                                  |
| `orderBy`   | db         | e.g. `createdAt`.                                                         |
| `order`     | db         | `asc` \| `desc`.                                                          |
| `token`     | live       | Continuation token from a previous live response (for the next page).    |

**DB mode** (`GET …/storage/objects?source=db&prefix=users/42`) returns a paginated list of
metadata records (raw JSON):

```json
{
    "data": [
        {
            "id": "clx…",
            "bucketId": "clx…",
            "key": "users/42/avatars/avatar.webp",
            "prefix": "users/42/avatars",
            "originalName": "avatar.png",
            "size": 24187,
            "contentType": "image/webp",
            "etag": "\"9a…\"",
            "isPrivate": false,
            "convertedWebp": true,
            "compressed": false,
            "quality": 82,
            "createdAt": "2026-07-21T09:12:44.000Z"
        }
    ],
    "total": 1,
    "perPage": 10,
    "currentPage": 1,
    "lastPage": 1,
    "from": 1,
    "to": 1
}
```

**Live mode** (`GET …/storage/objects?source=live&prefix=users/42`) returns folders and files:

```json
{
    "prefix": "users/42",
    "entries": [
        { "type": "folder", "key": "users/42/avatars/", "name": "avatars" },
        {
            "type": "file",
            "key": "users/42/report.pdf",
            "name": "report.pdf",
            "size": 91234,
            "lastModified": "2026-07-20T18:03:11.000Z",
            "etag": "\"77…\""
        }
    ],
    "nextToken": null
}
```

If `nextToken` is non-null, pass it back as `token` to fetch the next page.

---

## 9. Delete files — `DELETE /storage/objects`

Delete one or many objects in a single call (`application/json` body):

```bash
curl -X DELETE "https://mailserver.appszonebd.com/api/v1/storage/objects" \
  -H "Authorization: Bearer azs_live_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{ "bucketId": "A1B2C3D4E5F6", "keys": ["users/42/old.png", "users/42/tmp.txt"] }'
```

| Field      | Type     | Required | Notes                                     |
| ---------- | -------- | -------- | ----------------------------------------- |
| `keys`     | string[] | ✅       | 1–1000 object keys to delete.             |
| `bucketId` | string   | —        | Defaults to the key’s default bucket.     |

Response envelope:

```json
{ "status": "success", "message": "2 object(s) deleted", "data": { "deleted": 2 } }
```

Both the bucket objects and their tracked DB records (if any) are removed.

---

## 10. Endpoint summary

| Method   | Path                     | Purpose                                        | Response |
| -------- | ------------------------ | ---------------------------------------------- | -------- |
| `POST`   | `/storage/upload`        | Upload a file (multipart)                      | Envelope |
| `GET`    | `/storage/objects`       | List files (`source=db` or `live`)             | Raw      |
| `DELETE` | `/storage/objects`       | Delete one or many objects                     | Envelope |
| `GET`    | `/storage/presign`       | Fresh presigned URL for a private object       | Raw      |
| `GET`    | `/storage/download`      | Download URL (presigned) for an object         | Raw      |

> **ZIP downloads** (folder / whole-bucket archives with live progress) are an **admin-panel**
> feature and are not part of the developer API.

---

## 11. Response & error conventions

-   **`POST` / `DELETE`** return the envelope `{ status, message, data }` with
    `status: "success"` on success.
-   **`GET`** returns the **raw** payload (no envelope), as shown above.
-   **Errors** return the envelope with `status: "error"` and a descriptive `message`.
    Validation problems are listed under `data.errors`.

| HTTP  | When                                                                                     |
| ----- | ---------------------------------------------------------------------------------------- |
| `400` | No `bucketId` and no default bucket configured; invalid `keyPath`; validation errors.    |
| `401` | Missing / invalid / **inactive** / **expired** key.                                      |
| `403` | Bucket not in the key’s allowed buckets; request `Origin` or client IP not allowed.      |
| `404` | Bucket not found.                                                                        |
| `502` | The storage provider rejected the operation — the real provider code + message is echoed. |

Provider errors are surfaced verbatim so you can act on them, e.g.:

```json
{
    "status": "error",
    "message": "Storage provider error during upload: AccessControlListNotSupported — The bucket does not allow ACLs",
    "data": null
}
```

---

## 12. Scoping, origins & IPs (important for where you call from)

The key’s allowlists are enforced on **every** request:

-   **Allowed buckets** — a `403` if you target a bucket the key isn’t scoped to.
-   **Allowed origins** — matched against the request `Origin` header (browser calls). **This
    is for browser clients.** A **server-to-server** request usually has *no* `Origin`, so if
    you set an origin allowlist, server calls will be rejected. Leave origins empty for
    backend integrations.
-   **Allowed IPs** — matched against the real client IP (Cloudflare/proxy-aware:
    `CF-Connecting-IP` → `X-Forwarded-For` → `X-Real-IP`). Use this to lock a key to your
    servers.
-   **Expiry** — after the expiry date the key returns `401`.

**Rule of thumb:** backend/server keys → restrict by **IP**, leave origins empty. Browser
keys → restrict by **Origin** (and see the next section).

---

## 13. Using the key from a browser

The storage key is a **secret**. Two safe patterns for browser uploads:

1. **Recommended — proxy through your backend.** Your frontend uploads to *your* server
   (authenticated as your user), and your server forwards to this Storage API with the key
   held server-side. The key is never exposed.

2. **Direct browser upload with a scoped key.** If you must call the Storage API directly
   from the browser, use a key that is **scoped tightly**: restrict `Allowed origins` to your
   web app’s origin, optionally set an expiry, and prefer `private` uploads. Note that a key
   embedded in frontend code is still visible to users — scope it to the minimum buckets and
   treat it as low-trust.

Cross-origin browser calls also require the API’s CORS to allow your origin (configured
server-side via `CORS_ORIGIN`).

---

## 14. Live upload progress in the UI

Byte-level upload progress is measured **on the client** (the browser knows how many bytes
it has sent). Use `XMLHttpRequest`, whose `upload.onprogress` event gives you the percentage
— `fetch()` cannot report upload progress.

### Vanilla JS helper

```js
const API = "https://mailserver.appszonebd.com/api/v1";
const KEY = "azs_live_xxxxxxxxxxxxxxxxxxxxxxxx"; // ideally injected server-side, not hardcoded

function uploadWithProgress(file, opts = {}, onProgress) {
    return new Promise((resolve, reject) => {
        const form = new FormData();
        form.append("file", file);
        if (opts.bucketId) form.append("bucketId", opts.bucketId);
        if (opts.prefix) form.append("prefix", opts.prefix);
        form.append("private", String(opts.private ?? true));
        if (opts.convertToWebp) form.append("convertToWebp", "true");
        if (opts.compress) form.append("compress", "true");
        if (opts.quality) form.append("quality", String(opts.quality));

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API}/storage/upload`);
        xhr.setRequestHeader("Authorization", `Bearer ${KEY}`);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
            let body = null;
            try { body = JSON.parse(xhr.responseText); } catch {}
            if (xhr.status >= 200 && xhr.status < 300) resolve(body.data); // UploadResult
            else reject(new Error(body?.message || `Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(form);
    });
}

// Usage
const result = await uploadWithProgress(
    file,
    { bucketId: "A1B2C3D4E5F6", prefix: "users/42", private: false, convertToWebp: true },
    (pct) => console.log(`Uploading… ${pct}%`)
);
console.log("Public URL:", result.url);
```

### React example with a progress bar

```jsx
import { useState } from "react";

const API = "https://mailserver.appszonebd.com/api/v1";
const KEY = import.meta.env.VITE_STORAGE_KEY; // avoid committing secrets

export function Uploader({ bucketId }) {
    const [pct, setPct] = useState(null);
    const [url, setUrl] = useState(null);
    const [error, setError] = useState(null);

    function onPick(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setError(null);
        setPct(0);

        const form = new FormData();
        form.append("file", file);
        form.append("bucketId", bucketId);
        form.append("private", "false");

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API}/storage/upload`);
        xhr.setRequestHeader("Authorization", `Bearer ${KEY}`);
        xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
            const body = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
                setUrl(body.data.url);
                setPct(100);
            } else {
                setError(body.message);
                setPct(null);
            }
        };
        xhr.onerror = () => { setError("Network error"); setPct(null); };
        xhr.send(form);
    }

    return (
        <div>
            <input type="file" onChange={onPick} />
            {pct !== null && (
                <div style={{ height: 8, background: "#eee", borderRadius: 4, marginTop: 8 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#4f46e5", borderRadius: 4 }} />
                </div>
            )}
            {url && <p>Uploaded: <a href={url} target="_blank" rel="noreferrer">{url}</a></p>}
            {error && <p style={{ color: "crimson" }}>{error}</p>}
        </div>
    );
}
```

### Cancelling an upload

Keep a reference to the `xhr` and call `xhr.abort()`. The promise rejects with an abort error.

---

## 15. Folder upload

There is no single “folder” endpoint — upload each file with its relative path as `keyPath`,
one request at a time, and aggregate progress across files.

```js
async function uploadFolder(files, { bucketId, prefix = "" }, onProgress) {
    const failed = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // In the browser, an <input webkitdirectory> gives file.webkitRelativePath.
        const rel = file.webkitRelativePath || file.name;
        const keyPath = [prefix.trim(), rel].filter(Boolean).join("/");

        const form = new FormData();
        form.append("file", file);
        form.append("keyPath", keyPath); // verbatim, overwrites, no processing
        form.append("private", "false");

        try {
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", `${API}/storage/upload`);
                xhr.setRequestHeader("Authorization", `Bearer ${KEY}`);
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const filePct = e.loaded / e.total;
                        onProgress(Math.round(((i + filePct) / files.length) * 100), rel);
                    }
                };
                xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText)));
                xhr.onerror = () => reject(new Error("network"));
                xhr.send(form);
            });
        } catch (err) {
            failed.push({ path: rel, error: String(err) });
        }
    }
    return { total: files.length, failed };
}

// <input type="file" webkitdirectory multiple onChange={e => uploadFolder([...e.target.files], { bucketId }, cb)} />
```

---

## 16. Server-side upload (Node.js)

No progress bar is needed server-side — just send the multipart request. Example with
`undici`/`fetch` and `FormData`:

```js
import { readFile } from "node:fs/promises";

const res = await fetch("https://mailserver.appszonebd.com/api/v1/storage/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STORAGE_KEY}` },
    body: (() => {
        const form = new FormData();
        const buf = await readFile("./invoice.pdf");
        form.append("file", new Blob([buf], { type: "application/pdf" }), "invoice.pdf");
        form.append("bucketId", "A1B2C3D4E5F6");
        form.append("prefix", "invoices/2026");
        form.append("private", "true");     // returns a presigned URL
        form.append("expiresIn", "86400");   // 24h
        return form;
    })(),
});

const { data } = await res.json();
console.log("Key:", data.key);
console.log("Presigned URL:", data.url, "expires in", data.expiresIn, "s");
```

---

## 17. Quick reference / gotchas

-   Send the key as `Authorization: Bearer azs_live_…`.
-   Omit `bucketId` to use the key’s **default bucket**; otherwise pass the 12-char public ID.
-   `private` defaults to **true** → you get a **presigned** URL. Set `private=false` for a
    direct public URL (requires the bucket to be publicly served).
-   Presigned URLs **expire** — re-fetch with `GET /storage/presign`.
-   Normal uploads **never overwrite** (auto `-1`, `-2` suffixes). Use `keyPath` for exact
    names + overwrite.
-   Image `convertToWebp`/`compress` apply to normal uploads only, not `keyPath` uploads.
-   Upload **progress** is a client-side measurement — use `XMLHttpRequest`, not `fetch`.
-   Server keys → restrict by **IP**, leave **origins empty**. Browser keys → restrict by
    **origin** and prefer a backend proxy.
-   Files are delivered **directly from the bucket/CDN** — this API only returns URLs and
    metadata, never the file bytes (except admin ZIP archiving).

See also: [Response Convention](./api-response-convention.md) · [Admin Panel API](./admin-api.md)
