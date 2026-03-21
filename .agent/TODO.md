# TODO — Codebase Fixes

> Source: `.agent/GAP_ANALYSIS.md`
> Generated: 2026-03-20 12:55

## Execution Order

Issues ordered by severity, then dependency chain. Independent fixes batched together.

---

### Batch 1 — Critical: Security, Thread Safety, Database Correctness

- [x] **[C-001]** Fix MarkdownPipe XSS vulnerability — sanitize HTML before bypassing Angular security
  - **Fix**: Installed DOMPurify, applied `DOMPurify.sanitize()` to marked output before `bypassSecurityTrustHtml`.
  - **Status**: Done — 2026-03-20
  - **Commit**: `f3954d4`

- [x] **[C-002]** Replace `Queue<T>` with `ConcurrentQueue<T>` in IncidentLogGenerator
  - **Fix**: Replaced `Queue` with `ConcurrentQueue`, updated `Peek`/`Dequeue` to `TryPeek`/`TryDequeue`.
  - **Status**: Done — 2026-03-20
  - **Commit**: `f3954d4`

- [x] **[C-003]** Enable SQLite WAL mode on both backend and AI service connections
  - **Fix**: Backend: `PRAGMA journal_mode=WAL;` after `EnsureCreated()`. AI service: SQLAlchemy `connect` event listener sets WAL pragma.
  - **Status**: Done — 2026-03-20
  - **Commit**: `f3954d4`

### Batch 2 — Major: Error Handling, CORS, API Quality

- [x] **[M-001]** Add response status checks to frontend REST fetch calls
  - **Fix**: Added `fetchJson<T>` helper that checks `resp.ok` before parsing. All 5 REST methods now use it.
  - **Status**: Done — 2026-03-20
  - **Commit**: `ae132da`

- [x] **[M-002]** Align AI service CORS fallback with backend (use `localhost:4200` not `*`)
  - **Fix**: Changed default from `["*"]` to `["http://localhost:4200"]`.
  - **Status**: Done — 2026-03-20
  - **Commit**: `ae132da`

- [x] **[M-003]** Increase LLM max_tokens and centralize as a constant
  - **Fix**: Created `MAX_LLM_TOKENS = 2048` constant, replaced all 4 hardcoded `500` references.
  - **Status**: Done — 2026-03-20
  - **Commit**: `ae132da`

- [x] **[M-004]** Replace N+1 query in GetLatestReadingsAsync with single GROUP BY
  - **Fix**: Single LINQ query using `GroupBy(PoleId).Select(Max(Id))` subquery.
  - **Status**: Done — 2026-03-20
  - **Commit**: `ae132da`

- [x] **[M-005]** Add `/health` endpoint to backend
  - **Fix**: Added `app.MapGet("/health", ...)` outside the rate-limited API group.
  - **Status**: Done — 2026-03-20
  - **Commit**: `ae132da`

### Batch 3 — Documentation

- [x] **[D-001]** Update deployment docs to reflect actual health check state
  - **Fix**: Updated monitoring section with both backend and AI service health endpoints.
  - **Status**: Done — 2026-03-20
  - **Commit**: `8333556`

- ~~**[D-002]**~~ Fix MkDocs extension configs
  - **Status**: RETRACTED — config was already correct. Initial analysis was based on incomplete summary.

### Batch 4 — Minor: Build Warnings, Social Meta, Cleanup

- [x] **[m-001]** Raise Angular component style budget for chat component
  - **Fix**: Increased `anyComponentStyle` budget from 12kB/16kB to 16kB/24kB.
  - **Status**: Done — 2026-03-20
  - **Commit**: `ea878cd`

- [x] **[m-002]** Fix Twitter Card meta tag to `summary_large_image`
  - **Fix**: Changed `content="summary"` to `content="summary_large_image"`.
  - **Status**: Done — 2026-03-20
  - **Commit**: `ea878cd`

- [x] **[m-006]** Delete stale `bootstrap.sh`
  - **Fix**: Deleted file.
  - **Status**: Done — 2026-03-20
  - **Commit**: `ea878cd`

- ~~**[m-003, m-004, m-005]**~~ MkDocs extension configs
  - **Status**: RETRACTED — already correct.

---

## Deferred / Out of Scope

- **[I-001]** Docker health checks — can add to compose files now that both services have /health. Left for next pass.
- **[I-003]** CORS rate limit headers — reviewed and found not actionable.
- **Test coverage** — gap identified but not addressed in this pass.
- **Hardcoded 12-pole count** — not worth refactoring for a fixed-scope portfolio project.
