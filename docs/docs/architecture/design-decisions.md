# Design Decisions

Every project involves trade-offs. This page documents the key decisions made in CogniLight, the alternatives considered, and why the chosen approach won.

---

## SQLite vs. PostgreSQL

**Decision:** Use SQLite as the sole database for all three services.

**Why:**

- The entire dataset fits comfortably in memory — 12 poles × 1 reading/sec × 3 days ≈ 3 million rows, roughly 500 MB
- SQLite eliminates an infrastructure dependency (no database server to configure, back up, or maintain)
- Deployable anywhere — the database is just a file on a Docker volume
- WAL mode handles the concurrent access pattern (one writer, multiple readers) safely

**Trade-off:** No concurrent writes. This is fine because only the .NET backend writes — the AI service is read-only. In a production system with multiple writer services, you'd need PostgreSQL or a similar server database.

**The EnsureCreated() gotcha:** EF Core's `EnsureCreated()` only creates the database if it doesn't exist. It won't add new tables to an existing database. This bit us when adding the `IncidentLogs` table — we had to add a manual `CREATE TABLE IF NOT EXISTS` in `Program.cs`. See [Lessons Learned](../lessons-learned.md) for details.

---

## BYOK vs. Server-Side API Key

**Decision:** The AI service uses a Bring-Your-Own-Key model — the user provides their LLM API key in the browser, and it's sent per-request via HTTP headers.

**Why:**

- No server-side secret management needed
- Users control their own costs and provider choice
- The key never touches the server's filesystem or environment — it passes through the Python service to the LLM API in a single request
- Supports both Anthropic and OpenAI-compatible providers

**Trade-off:** The API key is stored in the browser's `localStorage`, which is accessible to any JavaScript on the page. In a production SaaS app, you'd use an encrypted session or OAuth flow. For a portfolio demo, BYOK is the right balance of simplicity and functionality.

**Implementation:**

```
Browser localStorage → HTTP headers (X-LLM-API-Key, X-LLM-Provider, X-LLM-Model)
  → Python FastAPI → httpx call to LLM API
```

---

## SignalR vs. Polling vs. Raw WebSocket

**Decision:** Use SignalR for real-time telemetry push from the .NET backend.

**Why:**

- SignalR provides automatic reconnection, transport fallback (WebSocket → Server-Sent Events → Long Polling), and message framing — all things you'd have to build yourself with raw WebSocket
- The Angular SignalR client (`@microsoft/signalr`) integrates naturally with RxJS
- The backend only has one hub (`TelemetryHub`) with no server-side methods — clients just subscribe to events. The hub class is literally empty:

```csharp
public class TelemetryHub : Hub { }
```

All broadcasting is done via `IHubContext<TelemetryHub>` from the `SimulationEngine` and `IncidentLogGenerator` services.

**Trade-off:** SignalR adds a dependency and some protocol overhead. For a simpler project, raw WebSocket would suffice. But SignalR's reconnection handling is worth it when your simulation runs 24/7.

---

## Monorepo vs. Multi-Repo

**Decision:** All three services live in a single repository.

**Why:**

- Single `docker compose up` to run everything
- Shared documentation and CI/CD pipeline
- Atomic commits when changes span services (e.g., adding a new telemetry field)
- Simpler for a portfolio project — one URL to share

**Trade-off:** In a team setting with independent deployment cadences, separate repos with their own CI would be better. But for a project built by one developer, the monorepo removes friction.

---

## Hybrid SQL + RAG vs. Pure RAG

**Decision:** The AI chat uses both direct SQL queries and RAG over incident logs, not just one or the other.

**Why pure RAG wouldn't work:**

The LLM needs to know *current* network state — "which poles are consuming the most energy right now?" This is a precise, structured question that needs exact numbers from the database. Embedding telemetry readings into a vector store and doing semantic search would lose precision and freshness.

**Why pure SQL wouldn't work:**

Incident logs are free-text narratives ("Found corroded wiring at junction box. Applied temporary fix..."). SQL can fetch them, but the user's question might be "have there been any recurring sensor problems?" — that's a semantic query that needs similarity matching, not `WHERE text LIKE '%sensor%'`.

**The hybrid approach:**

1. **Every query** gets fresh SQL context: current readings per pole, rankings, recent anomalies
2. **Maintenance/incident queries** (detected by keyword regex) additionally get semantically relevant incident logs from FAISS

The query router (`_needs_rag()`) is deliberately simple — a regex over keywords like "maintenance", "repair", "incident", "technician", etc. A more sophisticated approach would use the LLM itself to classify queries, but that would add a round-trip to every chat message.

---

## Canvas Rendering vs. SVG vs. WebGL

**Decision:** Use HTML5 Canvas 2D for the street simulation.

**Why:**

- 12 poles + up to ~100 animated entities per frame — Canvas 2D handles this easily at 60fps
- Fine-grained control over the rendering pipeline (layered drawing: ground → buildings → entities → poles → overlays)
- No DOM nodes per entity — better performance than SVG for dynamic scenes
- Simpler than WebGL for 2D rendering

**Trade-off:** Canvas doesn't support event delegation on individual drawn shapes. Pole click detection is implemented via hit-testing (checking if the click coordinates fall within a pole's radius), which is straightforward but manual.

---

## ECharts vs. Chart.js vs. D3

**Decision:** Use Apache ECharts (via `ngx-echarts`) for dashboard charts.

**Why:**

- Built-in streaming support — `appendData()` and incremental updates without redrawing the entire chart
- Rich out-of-the-box chart types including radar charts for per-pole detail
- Declarative options API that works well with Angular's change detection
- Better performance with large datasets than Chart.js

**Trade-off:** ECharts is a large library (~800KB minified). For a project with only 2-3 simple charts, Chart.js would be lighter. But CogniLight has 4+ real-time charts with tooltips, legends, and multi-axis — ECharts' feature set justifies the bundle size.

---

## Three-File Theme System

**Decision:** Theme colors are defined in three separate files rather than one centralized source.

The three files:

1. **`theme.scss`** — CSS custom properties for all SCSS-based components
2. **`renderer/theme.ts`** — TypeScript constants for the Canvas renderer
3. **`shared/chart-theme.ts`** — TypeScript constants for ECharts options

**Why not one file?**

Canvas 2D can't read CSS custom properties at render time (you'd need `getComputedStyle()` every frame, which is slow). ECharts options are JavaScript objects, not DOM elements, so they can't use `var(--cl-amber)` either.

The three files are kept in sync manually. Each file has a header comment explaining the relationship:

```typescript
// Canvas 2D context can't read CSS variables, so renderer colors live here.
// Keep in sync with /app/theme.scss when changing themes.
```

**Trade-off:** If you change the amber accent color, you need to update it in three places. A build-time extraction tool could automate this, but for 30-40 color values it's not worth the tooling overhead.

---

## SSE vs. WebSocket for Chat Streaming

**Decision:** Use Server-Sent Events (SSE) for AI chat responses, not WebSocket.

**Why:**

- Chat is inherently unidirectional during a response — the server streams tokens to the client
- SSE is simpler to implement: standard HTTP, automatic reconnection, native `EventSource` API
- The frontend already has a WebSocket connection for telemetry (SignalR) — using SSE for chat avoids multiplexing two protocols over one connection
- SSE supports named events (`sql_context`, `sources`, `token`, `done`), which map naturally to the different phases of the response

**Implementation detail:** The frontend doesn't use the `EventSource` API directly because it needs to send a POST body (the chat message) and custom headers (API key). Instead, it uses `fetch()` with a `ReadableStream` reader, manually parsing SSE events from the byte stream.

---

## Demo Mode for Embeddings

**Decision:** When `DEMO_MODE=true` (the default), the AI service uses deterministic pseudo-embeddings instead of loading the `all-MiniLM-L6-v2` model.

**Why:**

- The sentence-transformers model is ~80MB and takes several seconds to load
- For local development without an LLM key, the RAG pipeline still works (the vector search returns results, just not semantically meaningful ones)
- Reduces Docker image size and startup time

**Implementation:**

```python
def embed_texts(texts: list[str]) -> NDArray[np.float32]:
    model = _get_model()
    if model is None:
        # Demo mode: deterministic pseudo-embeddings
        rng = np.random.RandomState(42)
        vecs = np.array([rng.randn(384).astype(np.float32) for _ in texts])
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        return vecs / np.maximum(norms, 1e-8)
    return model.encode(texts, normalize_embeddings=True)
```

The pseudo-embeddings use a fixed random seed (42), so they're deterministic — the same text always gets the same vector. The vectors are normalized to unit length (matching what the real model produces) so FAISS inner-product search works correctly.
