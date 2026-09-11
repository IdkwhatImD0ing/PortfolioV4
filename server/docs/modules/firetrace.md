# FireTrace Module

`firetrace.py` records every completed LLM or agent run as one trace at
[tracing.art3m1s.me](https://tracing.art3m1s.me) (project
`a8d360297b0b0c6f853db44b`). Contract: `https://tracing.art3m1s.me/docs/ingestion-api`.

## Where traces are created

| Run | Call site | Trace name | sessionId |
|---|---|---|---|
| Voice turn (Retell `response_required` / `reminder_required`) | `llm.py` `LlmClient.draft_response` | `portfolio_voice_response` | Retell `call_id` |
| Text chat turn (`POST /chat`) | `llm.py` `LlmClient.draft_text_response` | `portfolio_text_response` | `text-<id>` |
| Recruiter summary (`POST /summary`) | `summary.py` `generate_summary` | `portfolio_summary_generation` | none (the request carries no id) |
| Dev CLI turn | `debug_agent.py` `run_agent_debug` | `debug_session` | `debug` |

`userId` is filled only when Retell's `call_details.metadata` carries a
`user_id`; the browser does not send one today.

## Span tree

The Agents SDK emits a span for every step it takes; `FireTraceProcessor`
collects them per trace and maps them:

```
portfolio_agent                      agent
├── guardrail:security_guardrail     custom   (guardrail.rule / reasoning / allowed)
│   └── Security Guardrail           agent
│       └── turn 1                   chain
│           └── gpt-5.6-luna         llm      (usage, input, output)
├── turn 1                           chain    (one agent-loop iteration)
│   ├── gpt-5.6-terra                llm      (asked for a tool call)
│   └── search_projects              tool     (arguments, result)
│       ├── embed-query              embedding (openai / text-embedding-3-large)
│       └── pinecone.query           retriever (index, top_k, ids + scores)
└── turn 2                           chain
    └── gpt-5.6-terra                llm      (final answer)
```

`step()` in `project_search.py` adds the embedding and Pinecone spans the SDK
does not know about; `annotate()` in `guardrail.py` puts the verdict on the
guardrail span. The SDK's `task` wrapper span (it spans exactly the agent span
under it) is collapsed. Trace-level `usage` is the sum over the `llm` spans.
A model call the SDK closed without a response (cancelled when the guardrail
tripped) is `unset`, not `ok`.

## Outcome mapping

| What happened | Trace status | Tag |
|---|---|---|
| Normal completion | `ok` | `voice` / `text` / `summary` |
| Guardrail refused the turn | `ok` | `guardrail-blocked` (span carries `guardrail.tripwire`) |
| Retell sent a newer `response_id` and the stream was dropped | `ok` | `abandoned` (the SDK run keeps going in the background; the trace is sent once its last span ends, or after 120 s, and `run.abandoned_at` records when the client stopped listening) |
| Task cancelled (socket closed) | `ok` | `cancelled` |
| Any other exception, or an SDK span with an error | `error` | metadata `error.type` / `error.message` |

## Sending

One POST per run, after the run, from the `firetrace-export` daemon thread,
with `urllib.request` (no dependency). Retries with backoff only for network
errors, 429 and 5xx (5 attempts); any other 4xx is logged as a warning and not
retried, because it means the payload is wrong. A `201` is logged with the
dashboard link; a `200 duplicate=true` means the same trace id and body were
sent twice. Nothing here can raise into the app. At process exit the queue
gets a 5 s grace with one quick attempt per trace; anything still queued is
logged as not sent.

## Redaction and limits

`redact()` runs over input, output, metadata and attributes: values under
secret-looking keys are dropped; strings lose API keys (FireTrace, OpenAI,
Pinecone, Retell, AWS, GitHub, Slack), bearer tokens, JWTs, private-key
blocks, long opaque tokens (40+ hex, or 40+ mixed-case alphanumerics with
digits), emails, North-American phone numbers, SSNs, Luhn-valid card numbers
and IPv4 addresses. Every rule is linear on hostile input. Known gaps, by
design: names and free-text addresses; non-US phone formats; IPv6; a
standard-base64 secret that contains `/` (the rule skips `/` so GitHub and
demo URLs from project data survive), unless a provider-specific rule catches
it. Strings are capped at 10,000 chars, span content and attributes at 32 KB,
trace content and metadata at 128 KB, spans at 200, and the request at under
2 MiB; truncation is flagged in `firetrace.truncated` / `firetrace.dropped`.

## Configuration

`FIRETRACE_API_KEY` only, read from the environment. FireTrace derives the
environment from the key, so use one key per deployment scope: a development
key in `server/.env`, the production key in Secret Manager (mounted by
`deploy.sh` when the secret exists). The key is never logged; `main.py`'s
startup check prints only whether it is set. Unset means nothing is recorded.

FireTrace rides on the SDK's tracing, so `OPENAI_AGENTS_DISABLE_TRACING=1`
turns it off too; `traced_run` still records a span-less trace in that case.
