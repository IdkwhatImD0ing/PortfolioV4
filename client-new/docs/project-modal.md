# Project Modal Data

Project cards and modals are driven by `src/lib/portfolio-data.ts`.

- Use each project's GitHub README as the source of truth for `summary`, `long`, `stack`, and external links.
- Put YouTube demos in `videoUrl`. The modal always prefers `videoUrl` and renders it as an embedded iframe.
- Put generated card stills in `poster`. Posters live in `public/project-posters/` and are rendered in the horizontal project cards.
- Keep `demo` for non-YouTube media, such as Devpost gallery images or static preview assets.
- Keep `projectUrl` for live sites, Devpost pages, or project walkthrough pages that are not the primary video.

The modal in `src/components/sections/projects.tsx` falls back from YouTube embed to image preview to a branded placeholder.

The project rail defaults to a curated six-project set of awarded projects. The full `PROJECTS` array should still include the broader archive because voice commands, filters, and direct project opens can surface non-curated projects on demand.

Only put a project in the `winner` tag or show an `award` badge when the award is publicly verified or owner-confirmed. Unverified hackathon recognitions should stay as normal project context, not award labels.
