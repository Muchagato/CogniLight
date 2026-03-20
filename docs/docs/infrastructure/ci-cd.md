# CI/CD Pipeline

CogniLight uses a single GitHub Actions workflow to build and push all three service images to GitHub Container Registry (GHCR) on every push to `main`.

---

## Workflow: `.github/workflows/ci.yml`

```yaml
name: Build and Push

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push frontend
        uses: docker/build-push-action@v6
        with:
          context: ./frontend
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/frontend:latest
            ghcr.io/${{ github.repository }}/frontend:${{ github.sha }}

      - name: Build and push backend
        uses: docker/build-push-action@v6
        with:
          context: ./backend/CogniLight.Api
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/backend:latest
            ghcr.io/${{ github.repository }}/backend:${{ github.sha }}

      - name: Build and push ai-service
        uses: docker/build-push-action@v6
        with:
          context: ./ai-service
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/ai-service:latest
            ghcr.io/${{ github.repository }}/ai-service:${{ github.sha }}
```

---

## How It Works

### Trigger

The workflow runs on every push to the `main` branch. Feature branches don't trigger builds — this keeps GHCR clean and avoids unnecessary image churn.

### Authentication

Uses `GITHUB_TOKEN` (automatically provided by GitHub Actions) to authenticate with GHCR. No manual secret configuration needed. The `packages: write` permission is required to push images.

### Image Tagging

Each service gets two tags:

| Tag | Purpose |
|-----|---------|
| `:latest` | Always points to the most recent build. Used by Watchtower for auto-updates. |
| `:${{ github.sha }}` | Immutable tag for rollbacks. Each commit produces a unique, traceable image. |

### Build Contexts

Each service is built with its own context directory:

- `./frontend` → includes `Dockerfile`, `package.json`, `src/`, `nginx.conf`
- `./backend/CogniLight.Api` → includes `Dockerfile`, `.csproj`, `Program.cs`, etc.
- `./ai-service` → includes `Dockerfile`, `requirements.txt`, `main.py`, etc.

### Sequential Builds

The three build steps run sequentially within a single job. Parallel jobs would be faster but would triple the runner usage. For a portfolio project, sequential builds are fine — the total pipeline takes ~5 minutes.

---

## What's Not Included (Yet)

The current pipeline is build-only. In a production project, you'd typically add:

| Step | Purpose | Why Not Yet |
|------|---------|-------------|
| Unit tests | Catch regressions before deploy | Test suites not yet written |
| Linting | Enforce code style | Handled by IDE/editor |
| Integration tests | Verify service interactions | Would need a test compose setup |
| Image scanning | Find CVEs in dependencies | Low priority for a demo |
| Deployment notification | Slack/email on deploy | Watchtower handles updates silently |

---

## Resulting Image URLs

After a successful build, images are available at:

```
ghcr.io/{owner}/cognilight/frontend:latest
ghcr.io/{owner}/cognilight/backend:latest
ghcr.io/{owner}/cognilight/ai-service:latest
```

These are the values referenced by `${IMAGE_PREFIX}` in `docker-compose.prod.yml`.
