# Infrastructure

CogniLight runs as three Docker containers orchestrated by Docker Compose. The CI/CD pipeline builds images on push to `main`, publishes them to GitHub Container Registry, and a Watchtower instance on the deployment target (a Synology NAS) automatically pulls updates.

---

## Overview

```mermaid
graph LR
    DEV[Developer] -->|git push| GH[GitHub]
    GH -->|CI: Build & Push| GHCR[GitHub Container<br/>Registry]
    GHCR -->|Watchtower pulls| NAS[Synology NAS]
    NAS --> FE[Frontend<br/>:4200]
    NAS --> BE[Backend<br/>:5000]
    NAS --> AI[AI Service<br/>:8000]
    NAS --> WT[Watchtower]
    NAS --> RP[Nginx Proxy<br/>Manager]
    RP -->|HTTPS| INET[Internet]
```

---

## What's Next

- [Docker Setup](docker.md) — container definitions and multi-stage builds
- [CI/CD Pipeline](ci-cd.md) — GitHub Actions workflow
- [NAS Deployment](deployment.md) — production deployment on Synology
