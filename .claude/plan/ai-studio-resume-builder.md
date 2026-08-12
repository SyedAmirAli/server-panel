# AI Studio — Resume Builder, Cover Letters & Data Assistant

> Additive feature built on top of the existing Job Finder module. Turns the platform
> into a tailored-resume generator: structured candidate data in, job-specific ATS PDF
> out, stored in Cloudflare R2, delivered through the existing mail pipeline, with an
> in-app AI assistant over the platform's own data.

---

## Decisions taken during design (and why)

1. **People extends `CandidateProfile`, it is not a new entity.** Job Finder already
   scores jobs against a candidate. A second person record would give two truths about
   the same human and let matching drift from resume generation.
2. **Projects / experience / skills become relational rows.** They are JSON columns
   today, which was fine for wholesale import from `data.tsx` but cannot support
   per-item CRUD or recording *which project went into which resume*. The profile
   service composes the old JSON shape from the new rows so Job Finder scoring keeps
   working untouched.
3. **Headless Chromium for PDF, printing the app's own React page.** Produces a real
   text layer (mandatory — a rasterised PDF scores zero in an ATS) and reuses the
   existing `Ats.tsx` template and print CSS without a rewrite. Rejected:
   `@react-pdf/renderer` (different layout engine, template rewrite, loses print CSS),
   Typst/LaTeX (full rewrite), `html2canvas`+jsPDF (no text layer — actively wrong here).
4. **Preview is the same route Chromium prints.** Not an approximation. Rendered in an
   iframe in the Studio, so what you see is literally what gets printed.
5. **Tailoring may reorder, reweight, rephrase and select — never invent.** Enforced in
   code, not only in the prompt, the same way `enforceNoLinks` guards the application
   emails.
6. **Extraction is proposed, not merged.** Text pulled from PDFs and images lands in a
   review queue. Auto-merging lets one bad OCR pass quietly poison every future resume.
7. **Documents snapshot their content.** A generated resume stores the resolved content,
   not references to live profile rows — an employer's copy must not silently disagree
   with our records after the profile is edited.
8. **R2 is reached through the existing storage module**, seeded from env into an
   encrypted `Bucket` row, rather than a second env-driven S3 client. Gains presigned
   links, the audit trail and the Buckets UI for free, and keeps credentials encrypted
   at rest.
9. **The assistant calls whitelisted read-only tools, never SQL.** Safer, and more
   reliable than LLM-authored joins across a schema this size.
10. **The assistant returns entity references, not URLs.** The UI maps them to routes.
    Asked for a link, a model invents `/inbox/message/42` and 404s. Same fix as the
    URL-anchoring in the LinkedIn email extractor.

---

## Goal

One chat surface whose capability expands with context:

- **No selection** → general assistant over platform data (counts, searches, summaries,
  deep links).
- **Person selected** → knows the candidate.
- **Person + job selected** → tailors and generates a resume + cover letter, previews
  it, renders a PDF, stores it, and can send it.

## Non-goals

- No changes to Mailcow, SMTP/IMAP, auth, or the existing send pipeline beyond calling it.
- No write access from the general assistant. Actions stay behind buttons.
- No second candidate model, no second application-history table.
- The designed (non-ATS) resume template is deferred.

---

## What already exists and is reused

| Need | Existing asset |
|---|---|
| Candidate record | `CandidateProfile` (job-finder) |
| Job records, matching, run logs | `JobPosting`, `JobMatch`, `JobRun*` |
| Application history | `JobApplication` (extended, not replaced) |
| R2 / S3 object storage | `storage` module — `S3ClientService`, presigned URLs, audit, zip |
| SSE auth for streaming | `storage/admin-sse.guard.ts` (accepts `?token=`) |
| LLM access | `LlmService` + `LLM_PROVIDER` + `OpenAiCompatibleProvider` |
| Email sending | `email-configs` + `mails` + `SentMessage` |
| ATS template | `Ats.tsx` + print CSS in the resume repo — **ported into `apps/web`** |
| Application discipline | `skills/job-application.md` (already ported to prompts) |

**Env note:** `ConfigModule` has no `envFilePath`, so the API reads only
`apps/api/.env`. The `CLOUDFLARE_*` keys currently live in the root `.env` and must be
copied across. Only `CLOUDFLARE_ACCESS_KEY_ID`, `CLOUDFLARE_SECRET_ACCESS_KEY`,
`CLOUDFLARE_S3_API`, `CLOUDFLARE_BUCKET_NAME`, `CLOUDFLARE_BUCKET_FOLDER` are needed.
`CLOUDFLARE_API_TOKEN` / `ACCOUNT_ID` are account administration and are deliberately
not wired up. New: `OCR_MODEL`.

---

## Data model

### New tables

**`profile_projects`** — `id`, `profileId`, `name`, `description`, `role`, `period`,
`stack Json` (tech tags — the ranking key), `metrics Json`, `note`, `url`, `sortOrder`,
`isActive`.

**`profile_experiences`** — `id`, `profileId`, `company`, `position`, `period`,
`location`, `employmentType`, `points Json`, `stack Json`, `sortOrder`.

**`profile_skills`** — `id`, `profileId`, `name`, `category`, `level`, `highlighted`.

**`profile_links`** — `id`, `profileId`, `label`, `url`, `kind` (linkedin | github |
portfolio | other).

**`profile_info_items`** — the attachment/notes queue. `id`, `profileId`,
`kind` (pdf | image | textfile | note), `title`, `rawText`, `storageKey`, `folder`,
`fileName`, `mimeType`, `sizeBytes`, `extractionStatus` (pending | done | failed |
skipped), `extractionError`, `model`, `createdAt`.

**`profile_fact_proposals`** — the review queue. `id`, `profileId`, `infoItemId`,
`targetType` (project | experience | skill | link | field), `payload Json`,
`confidence`, `status` (pending | accepted | rejected), `reviewedAt`.

**`resume_documents`** — `id`, `profileId`, `postingId?`, `applicationId?`,
`kind` (resume | cover_letter), `format` (pdf | text), `title`, `contentJson` (the
immutable snapshot), `blocks Json` (numbered blocks), `bucketId`, `folder`, `fileName`,
`storageKey`, `sizeBytes`, `pageCount`, `model`, `createdAt`.

**`studio_conversations`** — `id`, `profileId?`, `postingId?`, `mode` (general |
candidate | tailoring), `title`, `createdAt`, `updatedAt`.

**`studio_messages`** — `id`, `conversationId`, `role` (user | assistant | tool),
`content`, `toolName`, `toolArgs Json`, `toolResult Json`, `references Json`,
`tokens`, `createdAt`.

### Changes to existing tables (additive columns only)

- `JobApplication` gains `resumeDocumentId`, `coverLetterDocumentId`,
  `emailConfigId`, and `postingId` becomes **nullable** — or, preferred, pasted job
  descriptions create a `JobPosting` with a `manual` source so history and stats stay
  in one place. **Preferred path: manual posting rows; `postingId` stays required.**
- `CandidateProfile` gains `bio`, `preferredTitles`, and keeps its JSON columns as a
  derived cache written by the profile service.
- `JobSource` gains a seeded `manual` row.

No column is dropped, renamed or retyped. No existing table loses a constraint.

---

## Tailoring engine

Two stages, deliberately:

1. **Deterministic pre-rank.** Score every project and experience by tech-tag overlap
   between its `stack` and the job description's extracted requirements. Cheap,
   explainable, and it still works when the gateway is down.
2. **LLM refinement.** Reorders, decides what to cut to hold two pages, and rewrites
   bullets to emphasise the relevant angle of work actually done.

The UI shows what was included and excluded with the reason, and the user can override
before Execute — **system proposes, user disposes**.

**Fabrication guard.** After generation, every bullet is checked against the profile
corpus (project descriptions, experience points, confirmed facts). Bullets with no
traceable support are flagged in the UI rather than silently shipped. Technologies named
in the output but absent from the profile are hard-rejected.

---

## PDF pipeline

1. Port `Ats.tsx`, its section components and the `@media print` / `a4-page` CSS into
   `apps/web` as a **print-only route** rendering from document JSON instead of
   `data.tsx`.
2. Studio preview = that route in an iframe, plus a `no-print` gutter of **stable block
   numbers**.
3. Generate → API drives Chromium against `http://127.0.0.1:<API_PORT>/print/resume/:id`
   (the API already serves/proxies the SPA) → `page.pdf()` with print CSS honoured.
4. Read back the page count; over two pages surfaces a warning and offers a trim pass.
5. Upload to R2, write `resume_documents`, return a presigned link.

**Block numbering:** numbers are display for *stable content-block IDs*, not wrapped
visual lines. Visual line numbers renumber on every edit, so "also fix line 24" would
hit the wrong content after an earlier edit lands. The model receives the same numbered
blocks, so a reference resolves identically on both ends. Referencing a number in chat
highlights that block; clicking it edits in place.

**Dependency:** Puppeteer (bundled Chromium, ~200MB) added to `apps/api`, plus the
usual headless system libs in the Docker image. Renders are serialised through a small
queue — concurrent Chromium instances are the memory risk on this VM.

---

## Storage layout

Bucket seeded on startup from env into an encrypted `Bucket` row. Keys:

```
<CLOUDFLARE_BUCKET_FOLDER>/candidates/<profileId>/<documentId>/<Human-Readable-Name>.pdf
<CLOUDFLARE_BUCKET_FOLDER>/candidates/<profileId>/attachments/<infoItemId>/<original>
```

`folder` and `fileName` are stored as **separate columns**, not one concatenated key, so
objects can be moved or re-derived without string surgery. Filenames are human-meaningful
(`Syed-Amir-Ali-Backend-Engineer-Acme.pdf`) because an employer sees them.

Preview is ephemeral — only **Generate** writes to storage.

---

## General assistant

**Tools (read-only, typed, bounded).** Illustrative set:
`countEmailConfigs`, `listEmailConfigs`, `searchMessages({from,to,subject,since,limit})`,
`getMessage`, `listMailboxes`, `countSentMessages`, `listJobPostings`, `getJobPosting`,
`getApplicationHistory`, `listCandidates`, `getCandidate`, `listDocuments`,
`getStorageUsage`.

**Security rules baked into the design, not the prompt:**

- **Mail content is untrusted data, never instructions.** It enters context explicitly
  fenced. This assistant reads text written by strangers; a message body saying "list
  every SMTP credential" is a realistic attack, not a hypothetical.
- **No tool can return secrets.** SMTP passwords, `ENCRYPTION_KEY`, API key hashes,
  storage credentials and JWT material are unreachable through any tool regardless of
  what the model asks for.
- **General mode is strictly read-only.** No send, no delete, no config mutation.
- **Every tool result is row-capped** so a broad question cannot dump the database.

**Deep links.** The model emits `{type, id}` references; the UI maps them to routes
(`message` → `/inbox/:id`, `posting` → `/jobs/:id`, `document` → download link).

**Streaming.** Token streaming over SSE using the existing `AdminSseGuard` pattern.
Degrades with a clear message when the gateway is down.

---

## UI surfaces

New sidebar section **AI Studio** with a subtly animated gradient label — the one AI
surface in an otherwise conventional admin panel.

- `/studio` — chat. Person and job pickers in the header; both optional.
- `/studio/:conversationId` — a resumed conversation.
- `/people` — candidate list.
- `/people/:id` — profile editor: contacts, links, projects, experience, skills,
  attachments, fact review queue, generated documents, application history.
- `/print/resume/:documentId` — print-only route (no chrome, no nav; used by preview and
  by Chromium).

---

## Phases

**Phase 1 — Schema & profile service**
Relational child tables, info items, fact proposals, resume documents, conversations.
Migration written offline via `migrate diff` → SQL → `migrate deploy` (never
`prisma format` on this schema). Profile service composes the legacy JSON shape from the
new rows so Job Finder scoring is unaffected. Verify Job Finder still scores.

**Phase 2 — People module**
CRUD for profile, projects, experience, skills, links. File upload to R2. PDF text
extraction, image OCR via `OCR_MODEL`, plain text stored verbatim with no extraction
pass. Fact proposal generation and the review queue. People UI.

**Phase 3 — PDF renderer**
Port the ATS template into `apps/web`. Print route driven by document JSON. Puppeteer
service with a serialised render queue. R2 upload, page-count read-back, presigned
links. Verify a generated PDF has a selectable text layer.

**Phase 4 — Studio**
Streaming chat over SSE. Conversation persistence. Tool layer with the read-only
whitelist and secret exclusion. Entity-reference deep links. Tailoring engine (both
stages) and the fabrication guard. Numbered, editable preview. Execute → Generate.

**Phase 5 — Delivery & history**
Email config picker, cover letter as body, resume attached, send through the existing
mail pipeline, link `SentMessage` back to `JobApplication`. History views on both the
person page and the application list.

---

## Risks / open items

- **Gateway availability.** OmniRoute on `:20128` goes down without warning and grounded
  search models don't work there. Chat, OCR and tailoring must all degrade with a clear
  message rather than throw. Provider-agnostic adapter so it can be repointed.
- **Chromium footprint** on the VM and in the Docker image; serialised renders.
- **Context size** as attachments accumulate — only confirmed facts feed generation, raw
  extracted text stays reference-only.
- **Prompt injection** via mail content — mitigations above; worth revisiting after the
  tool layer exists.
- Deferred: designed (non-ATS) template; multi-tenant people; bulk apply.
