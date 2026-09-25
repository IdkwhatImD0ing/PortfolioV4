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
| `FIRETRACE_API_KEY` | Optional. [FireTrace](https://tracing.art3m1s.me) ingest key; one key per environment (see below) |
| `PUSHER_SECRET` | Optional, but voice calls need it to move the page and show captions (`voice_events.py`). The app id, key and cluster aren't secret and default in code |

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

## Tracing (FireTrace)

Every completed LLM or agent run is recorded as one trace at
[tracing.art3m1s.me](https://tracing.art3m1s.me): each voice turn, each `/chat`
turn, each `/summary`, and each `debug_agent.py` turn. `firetrace.py` builds the
trace from the Agents SDK's own spans (agent, model calls with token usage,
guardrail, tools, embedding, Pinecone query) and POSTs it once, after the run,
from a background thread. Secrets and personal data are redacted before the
send; a failed send is a log warning, never an error for the visitor.

The key decides the environment. FireTrace stamps `production`, `preview` or
`development` on each trace from the key that recorded it, so:

- **Local dev** uses a *development* key you add to `server/.env` by hand.
  `make pull-secrets` never pulls a FireTrace key from Secret Manager; it
  carries over the line already in `.env`, so a re-pull cannot swap your
  development key for the production one.
- **Cloud Run** uses the *production* key from the `FIRETRACE_API_KEY` secret
  in Secret Manager. `deploy.sh` mounts it when that secret exists, and stops
  (rather than guessing) if the secret cannot be read for any other reason,
  since redeploying without it would silently turn tracing off; pass
  `FIRETRACE=off` to deploy without tracing on purpose.

Never reuse one key across environments, and never commit one. When the
variable is unset the server runs exactly as before and records nothing. See
[`docs/modules/firetrace.md`](docs/modules/firetrace.md).

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

`deploy.sh` builds from source via Cloud Build, deploys to Cloud Run (`us-west1`, service `fastapi-ws`), wipes any plain env vars from the prior revision, and mounts the secrets above (`FIRETRACE_API_KEY` only when it exists; `PUSHER_SECRET` is required unless you pass `PUSHER=off`). Domain mapping at `portfolio-ws.art3m1s.me` is created on first deploy. `deploy.ps1` never changes secret mounts, so use `deploy.sh` whenever a secret is added.

## Voice events (Pusher)

Retell's v3 web calls don't forward the backend's `metadata` events or live
transcript to the browser, so `voice_events.py` publishes each call's page moves
and captions to a Pusher channel the browser named (`voice-<uuid>`, sent as
`metadata.events_channel` when the call is created). The app id, key and cluster
aren't secret and default in code. `PUSHER_SECRET` is: anyone holding it can list
the open voice channels and read or forge their events. Keep it in Secret
Manager and `server/.env` only.

Roll out the server before the client. The new server is safe with the old
client (no `events_channel`, so nothing is published, and Retell still gets
the metadata), but the new client depends on the new server:

1. Create `PUSHER_SECRET` and grant `deploy-sa` access ("Add a new secret" above).
2. From this branch, run `bash deploy.sh` and check it prints `PUSHER_SECRET found`.
3. Merge, so Vercel ships the client.
4. On the first real call, the server log shows `Voice events on for <call_id>`.
