# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`art3m1s.me` — a voice-driven AI portfolio. Instead of clicking, you talk to it: a Retell-powered voice agent listens, semantic-searches projects in Pinecone, and **navigates the page in real time** by emitting tool calls that the frontend turns into scroll/filter commands.

This directory (`client/`) is the frontend. It was the `client-new/` redesign until the original frontend was retired (June 2026, see `docs/legacy-client-retirement.md`) and this package was renamed to `client/`.

## Monorepo layout (paths relative to repo root, one level up)

- `client/` — **this package.** Next.js 15 (App Router) · React 19 · TS 5 · Tailwind v4. Vitest tests. Package manager is **pnpm**.
- `server/` — FastAPI WebSocket backend. The voice agent (OpenAI Agents SDK), navigation + project-search tools, and prompt-injection guardrails live here. Managed with **uv**.
- `pinecone/` — one-shot ingestion: `data.json` → embeddings → Pinecone index.
- `browserless/` — headless browser sidecar (resume/preview rendering on Cloud Run).
- `Makefile` (root) — orchestrates all services together (server + client + ngrok).

## Commands

Run from `client/`:

```bash
pnpm dev          # next dev --turbopack (:3000)
pnpm build        # next build
pnpm lint         # eslint (next lint)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (one-shot, what CI runs)
pnpm test:watch   # vitest watch
```

Run a single frontend test file or by name:

```bash
pnpm exec vitest run src/lib/voice-bus.test.ts
pnpm exec vitest run -t "metaToNavigationAction"
```

CI for `client` runs `lint` → `typecheck` → `test` (see `.github/workflows/test.yml`). All three must pass.

Backend (run from repo root `server/`):

```bash
uv run uvicorn main:app --reload                 # :8000
uv run pytest tests/ -v --tb=short               # all backend tests
uv run pytest tests/test_main.py::test_name -v   # single test
```

Whole-system, from repo root (these target macOS/tmux/Apple Terminal — on Windows run the services manually):

```bash
make dev      # server + client side-by-side (tmux if available)
make test     # backend + frontend (lint + typecheck + vitest, matching CI)
make pull-secrets   # pulls server/.env from GCP Secret Manager (needs gcloud auth)
```

## Architecture: the voice → navigation pipeline

The non-obvious core of this project is a contract that spans the browser, the backend, and Retell's metadata channel. Reading any one file in isolation won't show it.

1. **Browser starts a call.** `src/components/voice-orb/` is the only stateful client component. It lazy-imports `retell-client-js-sdk`, POSTs to `src/app/api/create-web-call/route.ts` (a thin server-side proxy that injects `RETELLAI_API_KEY` and calls Retell's `create-web-call`), then opens the WebRTC call with the returned access token.

2. **Server agent runs the conversation.** Retell bridges audio to the FastAPI WebSocket in `server/main.py` (`/{OBFUSCATED_WS_PATH}/{call_id}`). `server/llm.py` runs an OpenAI Agents SDK agent with an input guardrail (`guardrail_agent`) that screens each user turn for jailbreak/off-topic before the main LLM sees it. Project lookups go through `server/project_search.py` (Pinecone).

3. **Agent navigates by calling tools.** When the agent calls a display tool (`display_homepage`, `display_project`, etc.), `server/navigation.py:tool_call_to_metadata()` converts it into a navigation metadata dict `{type: "navigation", page, project_id?}`. This is sent back through Retell's **metadata event** to the browser.

4. **Browser turns metadata into motion.** The voice orb's `metadata` listener passes the payload to `metaToNavigationAction()` in `src/lib/voice-bus.ts`, which maps the server's `page` value to a DOM section id (`PAGE_TO_SECTION`) and a `VoiceBus` command. `VoiceBus` is a tiny pub/sub; sections subscribe via `VoiceBus.on(...)` and the page scrolls.

### The wire contract — keep these in sync

`server/navigation.py` and `client/src/lib/voice-bus.ts` are two halves of one contract:

- Every `page` value `navigation.py` can emit **must** exist as a key in `PAGE_TO_SECTION` in `voice-bus.ts`, and that section id must exist as a DOM `id` rendered by `src/app/page.tsx`'s sections.
- `navigation.py`'s `NAVIGATION_PAGES` frozenset exists for parity testing.

Changing a navigable destination means editing all three: the tool/page mapping in `navigation.py`, the `PAGE_TO_SECTION` + `NavigationMeta` types in `voice-bus.ts`, and the section in `page.tsx`.

## Frontend conventions

- **`page.tsx` is a server component** that just composes section components in scroll order. There is one long-scroll page, not a router — "navigation" means scrolling to a section id, not changing routes.
- **Pure logic is extracted from components and unit-tested** in `src/lib/` (`voice-bus.ts`, `transcript.ts`, `portfolio-data/`, `project-fallback.ts`). When adding behavior, prefer putting the pure part in `src/lib` with a `.test.ts` rather than inlining it in a component.
- **Portfolio content lives in `src/lib/portfolio-data/`** (typed `Project`, `Hackathon`, `Education`, etc.). Projects can be addressed by `id` or `aliases` — use `findProject(idOrAlias)` so the agent's Pinecone/Devpost slug resolves to the local project. `src/data/pinecone-projects.json` is the agent-side project data.
- **Styling is Tailwind v4** with CSS custom properties (e.g. `var(--grad)`, `border-line-soft`, `text-magenta`) defined in `src/app/globals.css`. Match the existing arbitrary-value + custom-property idiom rather than introducing new color literals.

## Environment

`client` env vars (see `.env.local.example`):

```bash
RETELLAI_API_KEY=...              # server-only, used by the create-web-call proxy
NEXT_PUBLIC_RETELL_AGENT_ID=...   # the Retell agent the browser dials
NEXT_PUBLIC_APP_URL=...           # locks the proxy's CORS origin in prod
```

The backend (`server/.env`) needs `RETELL_API_KEY`, `OPENAI_API_KEY`, `PINECONE_API_KEY` (validated at startup in `main.py`), plus optional `OBFUSCATED_WS_PATH` and `LLM_DEBUG`.
