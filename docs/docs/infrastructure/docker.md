# Docker Setup

Each service has its own Dockerfile and the project uses two Docker Compose files: one for development and one for production.

---

## Dockerfiles

### Frontend

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

FROM nginx:alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 4200
```

**Multi-stage build:**

1. **Build stage** — installs dependencies and builds the Angular app
2. **Runtime stage** — serves static files via Nginx, which also acts as a reverse proxy

The Nginx config routes API requests to the appropriate backend service (see [Architecture > Nginx as API Gateway](../architecture/index.md#nginx-as-api-gateway)).

### Backend

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY *.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000
ENTRYPOINT ["dotnet", "CogniLight.Api.dll"]
```

**Multi-stage build:**

1. **Build stage** — restores NuGet packages and publishes a release build
2. **Runtime stage** — runs on the slim ASP.NET runtime image

The `ASPNETCORE_URLS` env var binds to all interfaces on port 5000.

### AI Service

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Single-stage build** — Python doesn't benefit from multi-stage as much. The `--no-cache-dir` flag keeps the image smaller.

---

## Docker Compose (Development)

```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "4200:4200"
    depends_on:
      - backend
      - ai-service

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
    depends_on:
      - backend
    environment:
      - DATABASE_PATH=/data/cognilight.db
    volumes:
      - db-data:/data

volumes:
  db-data:
```

**Key points:**

- The `db-data` volume is shared between `backend` and `ai-service` — this is how the AI service reads the SQLite database created by the backend
- Ports are exposed to the host for direct access during development
- `depends_on` ensures the backend starts before the AI service (it needs the DB to exist)

---

## Docker Compose (Production)

```yaml
services:
  frontend:
    image: ${IMAGE_PREFIX}/frontend:latest
    container_name: cognilight-frontend
    restart: unless-stopped
    depends_on:
      - backend
      - ai-service
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    networks:
      - nginx_internal_network

  backend:
    image: ${IMAGE_PREFIX}/backend:latest
    container_name: cognilight-backend
    restart: unless-stopped
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - ConnectionStrings__Default=Data Source=/data/cognilight.db
      - CORS_ORIGINS=${CORS_ORIGINS:-}
    volumes:
      - /volume2/docker/cognilight/data:/data
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    networks:
      - nginx_internal_network

  ai-service:
    image: ${IMAGE_PREFIX}/ai-service:latest
    container_name: cognilight-ai
    restart: unless-stopped
    depends_on:
      - backend
    environment:
      - DATABASE_PATH=/data/cognilight.db
    volumes:
      - /volume2/docker/cognilight/data:/data
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    networks:
      - nginx_internal_network

networks:
  nginx_internal_network:
    external: true
```

**Differences from development:**

| Aspect | Development | Production |
|--------|-------------|------------|
| Image source | Built locally | Pre-built from GHCR |
| Ports | Exposed to host | Internal network only |
| Volumes | Named Docker volume | Host path on NAS (`/volume2/docker/...`) |
| Restart policy | None | `unless-stopped` |
| Watchtower | None | Enabled via labels |
| Network | Default bridge | External `nginx_internal_network` |
| CORS | localhost:4200 | Configured via env var |

---

## The Shared Volume

Both compose files share the SQLite database between the backend and AI service via a volume mounted at `/data`. The backend writes to `/data/cognilight.db` and the AI service reads from the same path.

!!! tip "SQLite Concurrency"
    SQLite with WAL (Write-Ahead Logging) mode supports one writer and multiple readers concurrently. The backend is the sole writer; the AI service only reads. This is safe and performant for this use case.

---

## Environment Variables

Defined in `.env.prod.example`:

```bash
# GHCR image prefix
IMAGE_PREFIX=ghcr.io/OWNER/cognilight

# Allowed CORS origins
CORS_ORIGINS=https://cognilight.muchagato.dev
```

Copy to `.env` and fill in the real values for deployment.
