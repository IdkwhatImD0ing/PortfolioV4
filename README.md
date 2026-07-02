<!--
  art3m1s.me — Voice-driven AI Portfolio
  Author: Bill Zhang (@IdkwhatImD0ing)
-->

<a id="top"></a>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,20,24&height=220&section=header&text=art3m1s.me&fontSize=72&fontAlignY=38&desc=A%20voice-driven%20AI%20portfolio%20you%20can%20talk%20to&descAlignY=58&descAlign=50&fontColor=ffffff&animation=fadeIn" alt="header"/>
</p>

<p align="center">
  <a href="https://art3m1s.me">
    <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=22&pause=1000&color=7C3AED&center=true&vCenter=true&width=720&lines=Hi%2C+I'm+Bill+%E2%80%94+AI+Engineer+at+Scale+AI;This+portfolio+is+a+real-time+voice+agent;Click+%E2%80%9CStart+Voice%E2%80%9D+%E2%80%94+then+just+talk;Powered+by+Retell+%2B+OpenAI+%2B+Pinecone" alt="typing"/>
  </a>
</p>

<p align="center">
  <a href="https://art3m1s.me"><img src="https://img.shields.io/badge/Live-art3m1s.me-7C3AED?style=for-the-badge&logo=vercel&logoColor=white" alt="live"/></a>
  <a href="https://github.com/IdkwhatImD0ing/PortfolioV4/actions"><img src="https://img.shields.io/badge/CI-passing-22C55E?style=for-the-badge&logo=githubactions&logoColor=white" alt="ci"/></a>
  <a href="https://github.com/IdkwhatImD0ing/PortfolioV4/stargazers"><img src="https://img.shields.io/github/stars/IdkwhatImD0ing/PortfolioV4?style=for-the-badge&logo=github&color=FFD700&logoColor=white" alt="stars"/></a>
  <a href="https://github.com/IdkwhatImD0ing/PortfolioV4/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-3B82F6?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="license"/></a>
  <img src="https://komarev.com/ghpvc/?username=IdkwhatImD0ing&style=for-the-badge&color=14B8A6&label=PROFILE+VIEWS" alt="views"/>
</p>

<p align="center">
  <a href="https://art3m1s.me"><img src="https://img.shields.io/badge/%F0%9F%8E%99%EF%B8%8F%20Try%20the%20voice%20agent%20%E2%86%92-0a0a0a?style=for-the-badge&labelColor=0a0a0a&color=7C3AED" alt="try-voice"/></a>
</p>

---

## TL;DR

> **`art3m1s.me`** is a portfolio you don't *read* — you **talk to it**.
> Click "Start Voice", and a Retell-powered agent listens, semantic-searches my projects in Pinecone, and **navigates the page for you in real time** while it answers.

<table>
<tr>
<td>

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#7C3AED','primaryTextColor':'#fff','primaryBorderColor':'#7C3AED','lineColor':'#A78BFA','secondaryColor':'#1E1B4B','tertiaryColor':'#0a0a0a'}}}%%
flowchart LR
  U(["🗣️ You"]) -- "speech" --> R{{"Retell AI<br/>(WebRTC)"}}
  R -- "transcript" --> WS(["FastAPI<br/>WebSocket"])
  WS -- "stream" --> A[["OpenAI<br/>Agents SDK"]]
  A <-- "tool: search_projects" --> P[("Pinecone<br/>vector DB")]
  A -- "tool: navigate_to" --> N["Next.js client<br/>(metadata event)"]
  A -- "tokens" --> WS --> R --> U
  N -. "page swap" .-> U
```

</td>
<td>

### What it does
- 🎙️  **Talk** to my portfolio in natural language
- 🧭  Agent **navigates the site** for you (`navigate_to` tool)
- 🔎  **Semantic search** over every project (Pinecone)
- 🛡️  Prompt-injection **guardrails** on the LLM tier
- ⚡  **Streaming** end-to-end — voice in → voice out
- 🌗  Dark-mode-first UI w/ Tailwind v4

</td>
</tr>
</table>

---

## ✨ Tech Stack

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=nextjs,react,typescript,tailwind,fastapi,python,docker,gcp,vercel,vscode&theme=dark" alt="stack"/>
  </a>
</p>

<details>
<summary><b>Full breakdown</b> · click to expand</summary>

| Layer | Tech | Why |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind v4 · Retell SDK | Fast, modern, theme-able, voice-ready |
| **Backend** | FastAPI · Uvicorn · OpenAI Agents SDK · Retell SDK 4.4 · Pydantic | Streaming WebSocket + tool-calling agent |
| **Vector DB** | Pinecone 7 · `text-embedding-3-large` | Semantic search across projects |
| **Infra** | Docker · Cloud Run · Vercel · ngrok (dev) | One-command deploys, edge-friendly |
| **Observability** | Vercel Analytics · Speed Insights · structured logs | Real-user perf + traces |

</details>

---

## 🚀 Quickstart

```bash
git clone https://github.com/IdkwhatImD0ing/PortfolioV4.git
cd PortfolioV4
make install-deps        # uv + pnpm + ngrok

# In one shot — opens server, client, and ngrok in 3 tabs
make tabs
```

<details>
<summary><b>Manual mode</b></summary>

```bash
cd server && uv run uvicorn main:app --reload          # :8000
cd client && pnpm dev                                  # :3000
ngrok http --url=conversational.ngrok.app 8000         # public webhook
```

</details>

### Required env vars

```bash
# server/.env
RETELL_API_KEY=...
OPENAI_API_KEY=...
PINECONE_API_KEY=...

# client/.env.local (see client/.env.local.example for optional dev-agent vars)
RETELLAI_API_KEY=...
NEXT_PUBLIC_RETELL_AGENT_ID=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 📐 Architecture

```text
┌──────────────────────────┐         ┌──────────────────────────┐
│   client/  (Next.js 15)  │  WSS    │  server/  (FastAPI)      │
│   • voice orb (mic)      │ ◀────▶  │  • /webhook (Retell)     │
│   • page.tsx (sections)  │         │  • /ws-* (LLM stream)    │
│   • metadata listener    │         │  • LlmClient + tools     │
└────────────┬─────────────┘         └─────────────┬────────────┘
             │                                     │
             ▼                                     ▼
       Retell WebRTC                        OpenAI Agents SDK
                                                   │
                                                   ▼
                                         Pinecone (project-search)
```

| Module | What lives there |
|---|---|
| [`client/`](./client) | Next.js 15 UI · voice orb · one-page scroll sections · `/api/create-web-call` proxy |
| [`server/`](./server) | FastAPI WebSocket · OpenAI Agents · navigation + search tools · guardrails |
| [`pinecone/`](./pinecone) | One-shot ingestion: `data.json` → embeddings → Pinecone index |
| [`browserless/`](./browserless) | Headless browser sidecar for resume / preview rendering on Cloud Run |

Deeper docs: [`client/docs`](./client/docs) · [`server/docs`](./server/docs) · [`pinecone/docs`](./pinecone/docs)

---

## 🎯 Features that make this not-just-another-portfolio

- **Voice as a first-class router.** The agent emits `navigate_to(page)` tool calls; the client subscribes to Retell metadata events and swaps pages — no buttons required.
- **RAG over me.** Every project + experience is embedded into Pinecone. Ask *"what did you build for emergency dispatch?"* — it pulls **DispatchAI** by meaning, not keywords.
- **Guardrails that actually run.** A small classifier agent checks each user turn for prompt-injection / off-topic before the main LLM sees it.
- **Streaming end-to-end.** Tokens stream from OpenAI → FastAPI → Retell → audio in <600 ms.
- **JSON-LD + `/llms.txt`** so search engines *and* LLMs both index the site cleanly.
- **Edge-grade UX.** Speed Insights, Vercel Analytics, theme-color matched to the dark hero.

---

## 📊 Repo at a glance

<p align="center">
  <a href="https://github.com/IdkwhatImD0ing/PortfolioV4">
    <img height="160" src="https://github-readme-stats.vercel.app/api/pin/?username=IdkwhatImD0ing&repo=PortfolioV4&theme=tokyonight&hide_border=true&bg_color=0a0a0a&title_color=A78BFA&icon_color=7C3AED" alt="repo card"/>
  </a>
  <a href="https://github.com/IdkwhatImD0ing">
    <img height="160" src="https://github-readme-stats.vercel.app/api?username=IdkwhatImD0ing&show_icons=true&theme=tokyonight&hide_border=true&bg_color=0a0a0a&title_color=A78BFA&icon_color=7C3AED&count_private=true" alt="github stats"/>
  </a>
</p>

<p align="center">
  <img src="https://github-readme-activity-graph.vercel.app/graph?username=IdkwhatImD0ing&bg_color=0a0a0a&color=A78BFA&line=7C3AED&point=ffffff&hide_border=true&area=true" alt="activity graph"/>
</p>

---

## 🌟 Featured projects (pulled into the agent)

<p align="center">
  <a href="https://github.com/IdkwhatImD0ing/DispatchAI">
    <img src="https://github-readme-stats.vercel.app/api/pin/?username=IdkwhatImD0ing&repo=DispatchAI&theme=tokyonight&hide_border=true&bg_color=0a0a0a&title_color=A78BFA&icon_color=7C3AED"/>
  </a>
  <a href="https://github.com/aurelisajuan/TalkTuahBank">
    <img src="https://github-readme-stats.vercel.app/api/pin/?username=aurelisajuan&repo=TalkTuahBank&theme=tokyonight&hide_border=true&bg_color=0a0a0a&title_color=A78BFA&icon_color=7C3AED"/>
  </a>
  <a href="https://github.com/IdkwhatImD0ing/SlugLoop">
    <img src="https://github-readme-stats.vercel.app/api/pin/?username=IdkwhatImD0ing&repo=SlugLoop&theme=tokyonight&hide_border=true&bg_color=0a0a0a&title_color=A78BFA&icon_color=7C3AED"/>
  </a>
  <a href="https://github.com/IdkwhatImD0ing/AdaptEd">
    <img src="https://github-readme-stats.vercel.app/api/pin/?username=IdkwhatImD0ing&repo=AdaptEd&theme=tokyonight&hide_border=true&bg_color=0a0a0a&title_color=A78BFA&icon_color=7C3AED"/>
  </a>
</p>

---

## 🤝 Connect

<p align="center">
  <a href="https://art3m1s.me"><img src="https://img.shields.io/badge/Portfolio-art3m1s.me-7C3AED?style=for-the-badge&logo=vercel&logoColor=white"/></a>
  <a href="https://linkedin.com/in/bill-zhang1"><img src="https://img.shields.io/badge/LinkedIn-bill--zhang1-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white"/></a>
  <a href="https://github.com/IdkwhatImD0ing"><img src="https://img.shields.io/badge/GitHub-IdkwhatImD0ing-181717?style=for-the-badge&logo=github&logoColor=white"/></a>
  <a href="https://devpost.com/IdkwhatImD0ing"><img src="https://img.shields.io/badge/Devpost-34%20wins-003E54?style=for-the-badge&logo=devpost&logoColor=white"/></a>
  <a href="mailto:jzhang71@usc.edu"><img src="https://img.shields.io/badge/Email-jzhang71@usc.edu-EA4335?style=for-the-badge&logo=gmail&logoColor=white"/></a>
</p>

---

## ⭐ Star history

<p align="center">
  <a href="https://star-history.com/#IdkwhatImD0ing/PortfolioV4&Date">
    <img src="https://api.star-history.com/svg?repos=IdkwhatImD0ing/PortfolioV4&type=Date&theme=dark" alt="star history" width="720"/>
  </a>
</p>

<p align="center">
  <sub>If this project sparks an idea, drop a ⭐ — it helps a ton.</sub>
</p>

<p align="center">
  <a href="#top">⬆ Back to top</a>
</p>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,20,24&height=120&section=footer" alt="footer"/>
</p>
