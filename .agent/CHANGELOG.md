# Changelog

> Tracks all changes made during iterative fix passes.

## [Session 2026-03-20]

### Fixed
- **[C-001]** Sanitized LLM markdown output with DOMPurify to prevent XSS (commit `f3954d4`)
- **[C-002]** Replaced `Queue<T>` with `ConcurrentQueue<T>` in IncidentLogGenerator for thread safety (commit `f3954d4`)
- **[C-003]** Enabled SQLite WAL mode on both backend and AI service for concurrent read/write (commit `f3954d4`)
- **[M-001]** Added response status checks to all frontend REST fetch calls via `fetchJson` helper (commit `ae132da`)
- **[M-002]** Aligned AI service CORS fallback to `localhost:4200` instead of wildcard `*` (commit `ae132da`)
- **[M-003]** Increased LLM max_tokens from 500 to 2048, centralized as `MAX_LLM_TOKENS` constant (commit `ae132da`)
- **[M-004]** Replaced N+1 query in `GetLatestReadingsAsync` with single GROUP BY (commit `ae132da`)
- **[M-005]** Added `/health` endpoint to backend for monitoring (commit `ae132da`)

### Docs
- **[D-001]** Updated deployment monitoring section with both backend and AI service health endpoints (commit `8333556`)

### Refactored
- **[m-001]** Raised Angular component style budget from 12kB to 16kB — eliminated build warning (commit `ea878cd`)
- **[m-002]** Fixed Twitter Card type from `summary` to `summary_large_image` for 1200x630 OG image (commit `ea878cd`)
- **[m-006]** Deleted stale `bootstrap.sh` that referenced outdated patterns (commit `ea878cd`)

### Retracted
- **[D-002, m-003, m-004, m-005]** MkDocs extension configs were already correct. Initial analysis based on incomplete summary.
