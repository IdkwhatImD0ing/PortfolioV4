---
name: ingest-pinecone
description: Refresh the agent's project knowledge by re-embedding pinecone/data.json into the Pinecone "portfolio" index, and keep the frontend/agent project data in sync. Use when projects are added/edited and the voice agent's semantic search needs to reflect them.
disable-model-invocation: true
---

# Re-ingest project data into Pinecone

The voice agent answers "what did you build for X?" by semantic-searching a
Pinecone index, not the frontend content. When projects change, the index is
**stale until re-ingested**. This skill runs the one-shot ingestion and keeps the
related project-data files aligned.

## The data sources that must agree

- **`pinecone/data.json`** — the source of truth for ingestion. Each entry needs
  `id`, `name`, `summary`, `details`, and optional `github` / `demo`. The `id` is
  what the agent passes to `display_project` / `get_project_details`.
- **`client/src/data/pinecone-projects.json`** — the agent-side project data
  used by the frontend.
- **`client/src/lib/portfolio-data.ts`** — typed UI content. Projects resolve
  by `id` or `aliases` via `findProject(idOrAlias)`, so a Pinecone `id` must map
  to a local project (directly or through an alias) or the agent can search a
  project it can't then display.

Before ingesting, if the user added/renamed a project, confirm its `id` exists
consistently across these three so search results resolve to a displayable
section. Flag any Pinecone `id` with no matching `portfolio-data.ts` id/alias.

## Procedure

1. **Edit `pinecone/data.json`** with the new/updated project(s).
2. **Run the ingestion** from `pinecone/` (needs `PINECONE_API_KEY` and
   `OPENAI_API_KEY` — pull via `make pull-secrets` if not set locally):

   ```bash
   cd pinecone && uv run python load_data.py
   ```

   `load_data.py` batch-embeds every entry with `text-embedding-3-large`
   (3072-dim) and **upserts** into index `portfolio`. Upsert is by `id`, so
   re-running is safe and idempotent for existing ids. It prints index stats
   before/after and runs a sample query so you can eyeball that retrieval works.

   > Deletions are NOT automatic: removing an entry from `data.json` leaves its
   > vector in the index. If a project was removed, delete its vector by id
   > explicitly (or recreate the index) — call this out to the user.

3. **Sync the frontend copy** if it drifted: update
   `client/src/data/pinecone-projects.json` and any `portfolio-data.ts`
   entry/alias so the UI can display what search now returns.

## Verify

```bash
# Confirm retrieval returns the expected project (server/ — uses uv)
cd server && uv run pytest tests/ -k "search or project" -v --tb=short
```

Or eyeball the sample-query output `load_data.py` prints at the end — the new or
edited project should appear for a query that describes it. If a search-result
`id` doesn't resolve in the frontend, fix the `portfolio-data.ts` id/alias rather
than reshaping the Pinecone data.
