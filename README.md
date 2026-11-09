# Knowledge Explorer

A document-first learning workspace: start with a topic, get a short outline, grow it one block at a time, and **ink** the blocks you want to keep as notes. This is the MVP described in [`docs/knowledge_explorer_prd.md`](docs/knowledge_explorer_prd.md), following the UX in [`docs/design/`](docs/design/DESIGN.md).

Everything is stored on this machine, as JSON files in `./data/`. There are no accounts and no cloud sync.

## Run it

Requires Node 20+.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # optional, see "AI" below
npm start                              # builds, then serves http://localhost:5175
```

For development with hot reload, run `npm run dev` and open http://localhost:5173. That starts the API on :5175 and Vite on :5173.

`npm test` runs the domain and server tests.

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Turns on Claude generation. `ant auth login` profiles also work. |
| `KE_PROVIDER` | auto | `anthropic` or `demo`. Without credentials, it falls back to `demo`. |
| `KE_MODEL` | `claude-opus-5-5` | The Claude model to use. |
| `KE_EFFORT` | `low` | Effort level (`low` … `max`). Low keeps each block fast and cheap. |
| `KE_DATA_DIR` | `./data` | Where documents, settings and the prefetch cache live. |
| `KE_PORT` | `5175` | Server port. The server binds to 127.0.0.1 only. |

**AI:** With credentials, the app calls Claude through the Anthropic SDK, using structured JSON output and server-side refusal fallback (`fallbacks: "default"`). Without credentials, an **offline demo provider** writes clearly labelled placeholder text, so you can try every interaction without network access. Export always works offline.

## How it works

- **Lifecycle:** *Generated → Explored → Inked.* Generated content lives only in the server-side cache (`data/cache/`), never in a document, so it can't appear in the UI, in counts, or overwrite anything. Showing a cached block moves it into the document as Explored. Inking is explicit and per block.
- **Ink order:** A block can be inked only under an inked parent, and a side link only when both ends are inked. If something in the chain is missing, the app asks "Ink the chain?" (with an "Always" option). Moving an inked block under a draft parent asks the same question, and the move is cancelled if you decline. There is no un-ink.
- **Explore:** Each click on a suggested subtopic, or on `+` to name your own, adds exactly one block. The server checks the cache first and calls the model only on a miss. After every new block it prepares 1–2 of that block's suggested children in the background.
- **Side links:** Use *Relate* on a block, pick the other block, then either ask a question or write your own notes. A relation has its own body, children, subtopics and lifecycle. It opens in a side peek and is listed in the right margin.
- **Safe editing:** Edits mark a block "Edited", and they also invalidate unseen cache entries under that block. AI replacement happens only through *Ask for a new version*, which shows a side-by-side compare (Keep mine / Use new / Add as separate block). If a delete would orphan a relation, its notes are kept under the other end by default. Delete and clean-up offer a 10-second undo.
- **Export:** *Inked only* or *Whole topic*, as Markdown (relations under "Related concepts") or JSON (ids, hierarchy, endpoints, lifecycle). JSON exports can be re-imported from the start page.

## Layout

```
shared/   domain model + pure operations (ink rules, move, delete, validate), context building, export/import
server/   Express API, JSON file store, Generated cache + background prefetch, AI providers (Claude, demo)
src/      React UI (start page, document page, side peek, dialogs)
tests/    vitest: PRD acceptance criteria on the domain and the API
```

The knowledge model (`shared/model.ts`) has no UI, storage, or provider types in it. Providers implement `server/ai/types.ts`. The server re-validates every saved document against the invariants and refuses inconsistent writes.
