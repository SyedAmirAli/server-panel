# API Response Convention

A single, predictable response shape across the whole API.

## Rules

1. **Mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`)** return an envelope:

   ```ts
   {
     status: "success" | "error" | "warning" | "info" | "queued",
     message: string,
     data: any
   }
   ```

2. **Read methods (`GET`, `HEAD`)** return the **raw payload** — no envelope, no
   `status`/`message`.

3. **Errors / thrown exceptions** (any method) return the envelope with
   `status: "error"`. Validation errors put the full issue list in `data.errors`.

## How it works (implementation)

- `apps/api/src/common/response-envelope.interceptor.ts` — global interceptor that
  wraps mutating responses. `GET`/`HEAD` pass through untouched.
- `apps/api/src/common/all-exceptions.filter.ts` — global filter that maps every
  thrown error (incl. `HttpException`, `MulterError`) to the error envelope.
- `apps/api/src/common/api-response.ts` — `ApiResponse` helper. Return one from a
  handler to set `status`/`message` explicitly; otherwise the interceptor wraps the
  raw value as a generic `success`.
- Both are registered globally in `apps/api/src/main.ts`.

## Writing a handler

```ts
// Explicit status + message (recommended for clarity):
@Post()
async create(@Body() dto: CreateThingDto) {
  const thing = await this.service.create(dto);
  return ApiResponse.success(thing, "Thing created");
}

// Or return raw data — the interceptor wraps it as { status:"success", message:"Created", data }:
@Post()
create(@Body() dto: CreateThingDto) {
  return this.service.create(dto);
}

// GET: return data directly — never wrapped.
@Get()
list() {
  return this.service.list();
}
```

Status meanings: `success` (done), `queued` (accepted, async work pending),
`warning` (completed but with a caveat, e.g. delivery failed), `info`
(informational), `error` (failure — set by the exception filter).

## Frontend

`apps/web/src/lib/api.ts` auto-unwraps the envelope: if the response has
`status`+`message`+`data`, it returns `data`; otherwise it returns the raw body. So
callers always receive the payload regardless of method.
