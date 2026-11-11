# Knowledge Explorer

A local-first, document-first learning workspace. The source of truth for behaviour is `docs/knowledge_explorer_prd.md` (PRD), plus `docs/design/` (UX: `DESIGN.md`, page mockups `01-06*.html`, and `07-interaction-spec.html`). Only the PRD's **MVP scope** is implemented. `README.md` covers running the app and how it works.

## Layout

- `shared/` is the domain layer, used by both client and server. It contains no UI, storage, or provider code.
  - `model.ts`: types.
  - `ops.ts`: pure ops (`ink`, `moveBlock`, `deleteBlock`, `createLink`, `cleanup`, `validate`, …).
  - `context.ts`: what gets sent to the model: the path with bodies, plus a titles-only page outline.
  - `export.ts`: Markdown and JSON export, and JSON import.
- `server/` is the Express API, bound to 127.0.0.1.
  - `store.ts`: one JSON file per doc in `data/docs/`, written atomically.
  - `cache.ts`: Generated content and background prefetch.
  - `profile.ts`: the learner profile, read from `learner_profile.md` in the data folder.
  - `ai/`: `prompts.ts` (all prompt text, plus a generic `DEFAULT_LEARNER_PROFILE`), `anthropic.ts`, and `demo.ts`.
- `src/` is the React 19 UI.
  - `DocPage.tsx` owns document state and every action; saves are debounced by 300ms.
  - `components/Block.tsx` renders the block tree.
  - `Dialogs.tsx` and `SidePeek.tsx`.
  - `markdown.ts`: marked + KaTeX + DOMPurify.
  - `styles.css`: design tokens.
- `tests/` holds the vitest tests (domain, API, context).

## Product rules

The PRD is the single source of truth for product behaviour; this file doesn't restate it. Before changing behaviour, read the relevant PRD sections, especially §5 (core product model: blocks, tree, side links, lifecycle), §6 (generation, caching, latency), §7 (editing and curation), and §11 (MVP acceptance criteria).

## Code conventions

- All document changes go through the pure ops in `shared/ops.ts`. The UI never mutates a `Doc` by hand.
- The server re-runs `validate()` on every save and rejects invalid docs with 422. New invariants belong in `validate()`.
- Generated content lives only in the server cache (`server/cache.ts`) and never enters a `Doc`. Edits, moves, and deletes invalidate unseen cache entries under the affected block.
- AI rewrites reach a document only through the version compare dialog.

## Prompts

- `server/ai/prompts.ts` contains everything sent to the model.
- The learner profile (who the learner is, including their language preferences) lives in `<data folder>/learner_profile.md`, not in code. It's re-read on every generation, so edits apply without a restart. The file is created from `DEFAULT_LEARNER_PROFILE` if missing. Keep the rest of the prompt language-neutral and have it defer to the profile.
- Section bodies are summary tables, and Explore suggestions are the table's rows.
- Comparisons between two items belong in side links, not in child blocks.

## Commands

- `npm test` runs vitest. `npm run typecheck` runs `tsc --noEmit`. Run both before you report a change as done.
- `npm run dev` starts the API on :5175 and Vite on :5173, which proxies `/api`. `npm start` builds and then serves on :5175.
- Environment variables:
  - `KE_PROVIDER=demo` uses offline placeholder content, so no API key is needed.
  - `KE_DATA_DIR` sets the data folder.
  - `KE_PORT` sets the API port; Vite's proxy follows it.
  - `KE_MODEL` and `KE_EFFORT` set the Claude model and effort level.

## Test instance

- Test against an isolated instance, never the default port (:5175) or `./data/`: a developer's own server and real notes may be there. Run the API and Vite on separate ports with a scratch data folder:
  ```bash
  KE_PROVIDER=demo KE_PORT=5185 KE_DATA_DIR=<scratch>/data npx tsx server/index.ts
  KE_PORT=5185 npx vite --port 5183 --strictPort
  ```
- Stop only the processes you started.
- After changing prompts, a running server must be restarted. Old prefetched content stays in `data/cache/` until it's deleted.

Machine- or person-specific notes go in `CLAUDE.local.md` (gitignored), not here.

## Verifying UI changes

Typecheck and tests don't prove the UI works. Open the isolated instance in a browser and actually use the changed feature. You can do this with the Chrome extension, or with Playwright (`playwright-core` with `channel: "chrome"`, installed in a scratch directory and not added as a project dependency). Take screenshots and check the console for errors.

## Keeping docs in sync

When a change alters UI behaviour, interaction, or scope, update the matching docs **on the same branch**, so code and docs merge in one PR:
- `docs/knowledge_explorer_prd.md` for requirements, scope, and acceptance criteria;
- `docs/design/DESIGN.md` and `07-interaction-spec.html` for interaction rules;
- the affected page mockup (`01-06*.html`) when a page's layout changes;
- `README.md` when running instructions or "How it works" change.

Base doc updates on the code diff and on the running page, not on memory.

## Git

- Work on a branch and open a PR to `main`. Commit only when the user asks.
- Don't commit `.DS_Store` or `.claude/settings.local.json`.
