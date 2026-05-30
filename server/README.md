# Server

FastAPI WebSocket backend for art3m1s.me. Handles Retell webhooks, runs the OpenAI Agents loop, and proxies semantic search to Pinecone.

## First-time setup

```bash
gcloud auth login                              # only once per machine
make setup                                     # from repo root: installs deps + pulls secrets
```

`make setup` runs `install-deps` and then `pull-secrets`, which writes `server/.env` from GCP Secret Manager. After that, `make tabs` (or `make server`) just works.

## Secrets

Runtime secrets live in **GCP Secret Manager** in project `spiritual-storm-469704-n2`:

| Secret | Used by |
|---|---|
| `OPENAI_API_KEY` | Agents SDK + embeddings |
| `RETELL_API_KEY` | Voice webhook + WebRTC |
| `PINECONE_API_KEY` | Vector search |
| `OBFUSCATED_WS_PATH` | Hardens the public WebSocket route |

### How they get loaded

| Environment | Mechanism |
|---|---|
| **Local dev** | `make pull-secrets` writes `server/.env`; `main.py` calls `load_dotenv()` |
| **Cloud Run** | `deploy.sh` passes `--set-secrets` so each one is mounted as an env var by the platform — no `.env` in the container |

The runtime SA `deploy-sa@spiritual-storm-469704-n2.iam.gserviceaccount.com` has `roles/secretmanager.secretAccessor` per-secret.

### Re-pull secrets

```bash
make pull-secrets
```

Idempotent. Backs up any existing `server/.env` to `server/.env.bak` before overwriting.

### Use a different project

```bash
GCP_PROJECT=my-other-project make pull-secrets
```

### Add a new secret

```bash
# 1. Create + seed via stdin (value never on the command line)
printf '%s' "$VALUE" | gcloud secrets create NEW_SECRET \
  --project spiritual-storm-469704-n2 \
  --replication-policy=automatic \
  --data-file=-

# 2. Grant the runtime SA
gcloud secrets add-iam-policy-binding NEW_SECRET \
  --project spiritual-storm-469704-n2 \
  --member serviceAccount:deploy-sa@spiritual-storm-469704-n2.iam.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor

# 3. Register it in both places:
#    - SECRETS=(...) in server/scripts/pull-secrets.sh
#    - SECRETS="..." in server/deploy.sh
```

### Rotate a secret

```bash
printf '%s' "$NEW_VALUE" | gcloud secrets versions add SECRET_NAME \
  --project spiritual-storm-469704-n2 \
  --data-file=-

make pull-secrets    # refresh local .env
bash deploy.sh       # refresh Cloud Run (mount is :latest, resolved at deploy time)
```

## Run

```bash
make server                                   # uvicorn :8000
# or
uv run uvicorn main:app --reload --port 8000
```

## Deploy

```bash
cd server
bash deploy.sh
```

`deploy.sh` builds from source via Cloud Build, deploys to Cloud Run (`us-west1`, service `fastapi-ws`), wipes any plain env vars from the prior revision, and mounts the four secrets above. Domain mapping at `portfolio-ws.art3m1s.me` is created on first deploy.
