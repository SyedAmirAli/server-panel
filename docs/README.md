# AppsZone Mail — API Docs

Guides for integrating with the AppsZone Mail API.

| Guide | What it covers |
|-------|----------------|
| [Admin Panel API](./admin-api.md) | Full frontend-integration guide: admin login, API keys, email configs, observability (audit log / sent messages / mailboxes / inbox), pagination & error handling |
| [Send an email](./send-email.md) | Authenticate with an API key and send mail (JSON + attachments), with JS examples |
| [Storage API](./storage-api.md) | Upload files to your buckets, get CDN/presigned URLs + metadata, list/delete, image WebP/compress, folder uploads, and live upload-progress UI examples |
| [API response convention](./api-response-convention.md) | The `{ status, message, data }` envelope rules (mutations enveloped, GET raw, errors enveloped) |

> Interactive reference (OpenAPI / Swagger UI) is served by the API at **`/swagger`**
> (e.g. `http://localhost:4010/swagger` in local dev).
