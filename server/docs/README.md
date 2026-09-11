# Server Documentation

AI agent documentation for the FastAPI backend of Bill Zhang's voice portfolio.

## Overview

This is a FastAPI WebSocket server that bridges Retell's voice platform with OpenAI's LLM. It handles real-time voice conversations, executes navigation tools, and performs semantic search via Pinecone.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| FastAPI | 0.116.1 | Web framework |
| Uvicorn | 0.32.0 | ASGI server |
| OpenAI Agents | 0.2.7 | LLM integration |
| Pinecone | 7.3.0 | Vector database |
| Retell SDK | 4.40.0 | Webhook verification |
| Python | 3.11 | Runtime |

## Architecture

```
server/
├── main.py              # FastAPI app, endpoints, WebSocket
├── llm.py               # LLM client, tools, guardrails
├── firetrace.py         # FireTrace exporter: one trace per completed run
├── project_search.py    # Pinecone search functions
├── prompts.py           # System prompt and persona
├── custom_types.py      # Pydantic type definitions
├── socket_manager.py    # WebSocket connection manager
├── Dockerfile           # Container configuration
└── deploy.sh            # Cloud Run deployment
```

## Request Flow

```
User Speech → Retell Platform → WebSocket → main.py
    → LlmClient.draft_response() → OpenAI Agents SDK
    → Tool calls → Pinecone (if search)
    → Streaming response → WebSocket → Retell → Voice
```

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `RETELL_API_KEY` | Yes | - | Retell webhook verification |
| `OPENAI_API_KEY` | Yes | - | LLM and embeddings |
| `PINECONE_API_KEY` | Yes | - | Vector database |
| `OBFUSCATED_WS_PATH` | No | `ws-default` | WebSocket path |
| `LLM_DEBUG` | No | `0` | Debug logging |
| `FIRETRACE_API_KEY` | No | - | Records every run at tracing.art3m1s.me; one key per environment |

## Development Commands

```bash
cd server
pip install -r requirements.txt    # Install dependencies
uvicorn main:app --reload          # Start dev server
python run_integration_tests.py    # Run tests
```

## Documentation Index

### Endpoints
- [endpoints/ping.md](endpoints/ping.md) - Health check
- [endpoints/webhook.md](endpoints/webhook.md) - Retell webhook
- [endpoints/websocket.md](endpoints/websocket.md) - WebSocket handler

### Tools
- [tools/navigation.md](tools/navigation.md) - Page navigation tools
- [tools/search.md](tools/search.md) - Project search tools

### Modules
- [modules/llm.md](modules/llm.md) - LLM client class
- [modules/guardrail.md](modules/guardrail.md) - Security guardrail
- [modules/firetrace.md](modules/firetrace.md) - FireTrace tracing exporter
- [modules/prompts.md](modules/prompts.md) - System prompt

### Deployment
- [deployment/docker.md](deployment/docker.md) - Docker and Cloud Run

## Related Documentation

- [../client/docs/README.md](../../client/docs/README.md) - Frontend documentation
- [../pinecone/docs/README.md](../../pinecone/docs/README.md) - Vector database documentation
