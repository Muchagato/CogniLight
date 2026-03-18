from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="CogniLight AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-service"}


# --- RAG endpoints (Phase 4) ---


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    sources: list[str] = []


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    return ChatResponse(
        reply="AI chat will be available in Phase 4. "
              f"You asked: {request.message}",
        sources=[],
    )


# --- Anomaly detection endpoints (Phase 4) ---


@app.get("/api/anomalies/summary")
async def anomaly_summary() -> dict[str, str]:
    return {"summary": "Anomaly detection will be available in Phase 4."}
