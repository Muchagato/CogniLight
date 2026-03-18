#!/bin/bash
# CogniLight — Project Bootstrap Script
# Run this first, then start Claude Code in the cognilight/ directory with the CLAUDE.md

set -e

echo "🏗️  Setting up CogniLight project..."

# Create root directory
mkdir -p cognilight
cd cognilight

# Copy the CLAUDE.md into the project root
cp ../CLAUDE.md ./CLAUDE.md

# ── Angular Frontend ──
echo "📦 Scaffolding Angular frontend..."
npx @angular/cli new frontend --routing --style=scss --standalone --skip-git --skip-install <<< "y"

# ── .NET Backend ──
echo "📦 Scaffolding .NET backend..."
mkdir -p backend
cd backend
dotnet new webapi -n CogniLight.Api --use-minimal-apis
cd CogniLight.Api
dotnet add package Microsoft.EntityFrameworkCore.Sqlite
dotnet add package Microsoft.EntityFrameworkCore.Design
dotnet add package Microsoft.AspNetCore.SignalR
cd ../..

# ── Python AI Service ──
echo "📦 Scaffolding Python AI service..."
mkdir -p ai-service
cat > ai-service/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.0
sentence-transformers==3.0.0
faiss-cpu==1.8.0
sqlalchemy==2.0.30
aiosqlite==0.20.0
httpx==0.27.0
python-dotenv==1.0.1
pydantic==2.8.0
EOF

cat > ai-service/main.py << 'PYEOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CogniLight AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service"}


# TODO: RAG endpoints, anomaly detection endpoints
PYEOF

# ── Docker Compose ──
echo "📦 Creating Docker Compose..."
cat > docker-compose.yml << 'EOF'
version: "3.8"

services:
  frontend:
    build: ./frontend
    ports:
      - "4200:4200"
    depends_on:
      - backend

  backend:
    build: ./backend/CogniLight.Api
    ports:
      - "5000:5000"
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - ConnectionStrings__Default=Data Source=/data/cognilight.db
    volumes:
      - db-data:/data

  ai-service:
    build: ./ai-service
    ports:
      - "8000:8000"
    environment:
      - DATABASE_PATH=/data/cognilight.db
      - LLM_API_KEY=${LLM_API_KEY:-}
    volumes:
      - db-data:/data

volumes:
  db-data:
EOF

# ── Git init ──
git init
cat > .gitignore << 'EOF'
node_modules/
dist/
bin/
obj/
__pycache__/
*.pyc
.env
*.db
.angular/
EOF

git add -A
git commit -m "chore: initial project scaffold"

echo ""
echo "✅ CogniLight scaffolded successfully!"
echo ""
echo "Next steps:"
echo "  cd cognilight"
echo "  Open Claude Code and start working through the phases in CLAUDE.md"
echo ""