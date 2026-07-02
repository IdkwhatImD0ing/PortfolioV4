# Legacy `client/` retirement — handoff

_Last updated: 2026-06-13_

> **Note (2026-07-02):** `client-new/` has since been renamed to `client/`, taking over
> the name of the retired package. Path references below reflect the layout at
> retirement time: `client/` means the deleted legacy frontend, `client-new/` means
> what is now `client/`.

## TL;DR

The old frontend (`client/`) has been deleted and the new frontend (`client-new/`)
is now the only site. Before deleting, we audited `client/` against `client-new/`
to make sure nothing worth keeping was lost. A handful of source-only artifacts
were copied forward, three small regressions in `client-new` were fixed, and a
crash boundary was restored. A few old features were intentionally dropped in the
voice-only redesign and are listed below as open decisions.

Everything in the old `client/` remains recoverable from git history
(`git show <commit>:client/...`) even after the deletion is committed, so nothing
is permanently gone.

## Why this happened

`client/` was the original frontend; `client-new/` is the voice-first redesign and
the active package (see `client-new/CLAUDE.md`). Keeping both was confusing and
`client/` was dead weight. The audit answered one question: _if we delete `client/`,
does `client-new/` still have everything that matters?_ Answer: yes, once the items
below were carried over.

## What was copied from `client/` into `client-new/`

These existed only in the old folder and were worth keeping as editable source:

| Brought over | Location in `client-new/` | Why |
| --- | --- | --- |
| Resume LaTeX source | `public/resume.tex` | `resume.pdf` was already shipped and is byte-identical, but the source was gone — you couldn't edit or regenerate the PDF without it. |
| Resume build scripts | `scripts/compile-resume.mjs`, `scripts/watch-resume.mjs` | Compile/watch the `.tex` into the PDF. `compile-resume.mjs` falls back to the committed PDF when `pdflatex` isn't installed, so it's safe in CI/Vercel. |
| AEO / LLM file | `public/llms.txt` | Hand-written canonical-facts file served at `/llms.txt` for AI crawlers. No equivalent existed in the new site. |
| Hackathon geo dataset | `src/data/hackathon-locations.ts` | 40 curated events with coordinates, cities, host schools, award lists, and linked project ids. Preserved as data only — it is **not** wired to any UI yet (see open decisions). |
| PWA icons | `public/icons/*` | The five icons `manifest.json` referenced. They were missing, leaving the manifest pointing at 404s. |

## Regressions fixed in `client-new/`

These were pre-existing bugs in the new site, surfaced by the audit:

1. **Dangling sitemap.** `public/robots.txt` advertised `https://art3m1s.me/sitemap.xml`
   but no sitemap was generated. Added `src/app/sitemap.ts` (App Router convention),
   so `/sitemap.xml` now builds. Confirmed in the production build route list.
2. **Broken manifest icons.** `public/manifest.json` referenced `/icons/icon-192x192.png`,
   `/icons/icon-512x512.png`, and `/icons/maskable.png`, none of which existed, and the
   manifest itself was never linked. Restored the icons (above) and added
   `manifest: "/manifest.json"` to the metadata in `src/app/layout.tsx`, so the manifest
   is now linked and its references resolve.
3. **Incomplete JSON-LD.** The `Person` structured data in `src/app/layout.tsx` listed
   `alumniOf` but not the current employer. Added `worksFor: { Organization, "Scale AI" }`.

## Crash isolation restored

The old site had a React `ErrorBoundary`. The new site had none. Added
`src/app/error.tsx` (App Router error boundary, dark-themed, "Try again" / "Reload").

## How to update the resume now

The build does **not** auto-compile the resume (kept `build` as plain `next build` so
deploys can't be affected by a missing `pdflatex`). To change the resume:

```bash
# from client-new/
# edit public/resume.tex, then:
pnpm build:resume      # regenerates public/resume.pdf (needs pdflatex locally)
# commit the regenerated public/resume.pdf
```

`pnpm watch:resume` recompiles on save during editing (needs `chokidar`, now a devDep —
run `pnpm install` if you haven't since this change).

There is also a public-safe variant, `public/resume-anonymized.tex`, for sharing resume
content where direct identity should be withheld: it strips contact details, profile
links, school/employer/client names, locations, and identifying project URLs while
keeping role scope, stack, and impact metrics. `pnpm build:resume:anonymized` compiles
it to `public/resume-anonymized.pdf` (gitignored — compiled on demand and shared
out-of-band, never served by the site).

## Open decisions — features intentionally dropped, not restored

The voice-only redesign removed these on purpose. None were auto-restored; each needs a
product call. The old implementations live in git history if you want them back.

- **Text chat mode** — typed Q&A with a voice/text toggle and streaming SSE. The new
  site is voice-only, so visitors without a mic (or in a quiet space) can't interact.
  This is the largest UX gap.
- **"Summarize for Recruiters"** — a dialog that generated a copy-paste AI summary of the
  conversation, aimed at recruiters.
- **Animated US route map** — hackathon-geography visualization. The data is back in
  `src/data/hackathon-locations.ts`, but the `USRouteMap` component and its `dotted-map`
  dependency are not. Wiring the data into the hackathons section would restore it.
- **"Classic Portfolio" fallback link** — floating link to `v2.art3m1s.me`.

Smaller drops (low impact): dynamic per-page `/api/og` images (replaced by one static
card), per-page `generateMetadata`, pause/resume voice control, backend warm-up ping,
tool-progress status indicator, skip-to-main-content a11y link.

## What was confirmed safe / preserved (no action needed)

- `public/data.json` and `public/resume.pdf` are byte-identical between old and new.
- `api/create-web-call/route.ts` and `next.config.ts` are identical; the new site adds
  dev/prod agent resolution and better transcript merging.
- All 52 project records are preserved (`public/data.json` + `src/data/pinecone-projects.json`);
  the browsable grid is a curated subset, the rest reachable by voice/deep-link.
- The work-experience timeline in the new site is a superset of the old content.
- Obsolete dead weight left behind on purpose: `mock.json` (fake fixture data, unused),
  create-next-app boilerplate SVGs, orphaned `world-map.tsx` / `voice-indicator.tsx`,
  `next-themes` (dark is hardcoded now), assistant-message markdown rendering (tied to the
  removed text chat), and docs for removed features.

## Verification

From `client-new/`, all green after the changes:

```
pnpm typecheck   # tsc --noEmit — pass
pnpm lint        # eslint — pass
pnpm build       # next build — pass; /sitemap.xml present in route list
```

## Follow-ups worth tracking

- [ ] Decide on the dropped features above (text chat is the one most likely to matter).
- [ ] If you want the hackathon map back, wire `src/data/hackathon-locations.ts` into the
      hackathons section and re-add a map component.
- [ ] The `manifest.json` `theme_color` (`#A259FF`) differs from the layout viewport
      `themeColor` (`#07060d`) — harmless, but reconcile if you care.
- [ ] Old README at repo root referenced `client/` and its docs; update any lingering
      links now that `client/` is gone.
