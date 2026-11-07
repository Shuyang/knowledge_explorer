# Knowledge Explorer — UX design spec

Companion to `../knowledge_explorer_prd.md` (product rules) and `../knowledge_explorer_examples.md`.
The PRD wins if anything here disagrees. The HTML files in this folder are **static mockups** (open `index.html`); treat them as visual reference, not production code.

| File | Screen |
|---|---|
| `01-start.html` | Start a topic, recent documents |
| `02-first-outline.html` | First outline; drafts on the tint; subtopic row |
| `03-growing-the-page.html` | Mostly inked page; latest exploration as drafts; "Ink the chain?" prompt |
| `04-side-link.html` | Side link open in a side peek |
| `05-safe-delete.html` | Deleting a section that has children and a side link |
| `06-export.html` | Export dialog with Markdown preview |
| `07-interaction-spec.html` | Block anatomy, states, rules |

## 1. Mental model

- **Generated** → never visible. No placeholders, ghost rows, "ready" dots or counts. Ever.
- **Explored** → a *temporary draft*. Every block the user can see is at least Explored.
- **Inked** → the *normal page*. Inked is the norm, not a favorite or bookmark.
- The page is the product: one reading column that grows; Explore adds, Ink accepts.

## 2. Visual language

| State | Treatment |
|---|---|
| Inked | Plain page: white background, text `#37352F` (titles/root `#141413`). **No marker.** |
| Explored | Faint blue tint `#F3F6FC` behind the block, one **continuous** area across adjacent drafts (no separate cards). A faint ✓ (`#8F8E8A`) at the block's right, always visible. |
| Explored, hovered/focused | Slightly deeper tint `#E9EFFA`; ✓ turns `#141413`; block menu appears. |
| Just added | Small "New" pill (`#FBF3DB` / `#7A5A00`), fades after ~8 s or on scroll. |
| Edited by user | Small grey "Edited" pill (`#F1F1EF` / `#5F5E5B`). |
| Side link mention | Inline orange mention (`#93490F`, underline `#EBC8A8`) with ↔ icon. |

Never use the tint for emphasis. Inking animates the block off the tint onto the white page (~250 ms).

### Tokens (Notion-like, minimal)

- Font: `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`. Formulas: serif italic (render with KaTeX in the real app).
- Sizes: page title 40/700, H2 24/600, H3 20/600, H4 17/600, body 16/1.6, UI 14, meta 12–13.
- Colours: text `#37352F`, strong text `#141413`, muted `#73726E` (≥4.5:1), secondary `#5F5E5B`, sidebar `#F7F7F5`, hover `#EFEFED`, hairline `#EDEDEC`, danger `#C4362F`, primary button `#141413` on white text.
- Reading column max-width 708 px. Radius 4–8 px. Menus/popovers use the soft three-layer shadow from the mockups. No other shadows or borders on content.

## 3. Layout

- **Left sidebar** (`#F7F7F5`, 240–260 px): app name, "New root topic", **Topics** list; the open topic expands into its outline. "Hide explored" filter.
- **Top bar**: breadcrumb, counts as `11 blocks · 3 explored` (explored = drafts left; never count Generated), Export, ⋯.
- **Reading column**: root title + intro (inked), then sections.
- **Right margin** (200–260 px): "Relations" list. Side links open in a **side peek** panel (right), never inline.
- Responsive: sidebar and margin wrap above/below the column at narrow widths.

## 4. Block anatomy

- **Left gutter (hover):** ⋮⋮ grip — drag to move; click for *Move to, Ask for a new version, Delete*.
- **Right of an explored block:** ✓ = **Ink**. Not shown on inked blocks.
- **Block menu (hover/focus, floating):** Relate · Edit · ⋯. There is **no Explore and no Ink in the menu.**
- **Subtopic row (bottom of a block):** `Explore  [suggested subtopic] [suggested subtopic] … [+]`. These are buttons (labels only, not content). Clicking one reveals that subtopic as **one** new child block (Explored). `+` lets the user name their own. Explore never targets the current block — it is already explored by being visible.

## 5. Ink rules (see PRD 5.5)

- Ink acts on one block. Nothing is inked silently.
- A block can be inked only under an inked parent. The root topic is inked when the document is created.
- A side link can be inked only when both endpoints are inked.
- If prerequisites are missing, ✓ opens **"Ink the chain?"**: lists the blocks to be inked (ancestors + target, or endpoints), a checkbox **"Always ink the whole chain"**, and buttons `Ink N blocks` / `Cancel`.
- Moving an inked block under an explored parent opens the same prompt for the new parent chain (with the same "always" option). Cancel = the move does not happen.
- **No un-ink.** Inked blocks can be edited or deleted. New children under an inked block start Explored.

## 6. Explore states

- Writing: in-place skeleton for exactly one block ("Writing…"). A cached answer just skips this.
- Added: block appears with the "New" pill.
- Failure: inline "Couldn't add a block. Your page is unchanged. Try again". No partial content.

## 7. Edits and AI replacement

- Visible blocks are never silently overwritten by AI.
- Replacement only via ⋮⋮ › *Ask for a new version*: side-by-side "Yours · edited" vs "New version" with `Keep mine` / `Use new` / `Add as separate block`.

## 8. Side links

- Create: Relate on a block → pick the other block from a searchable outline (visible blocks only) → ask ("How are they different?") or write your own.
- Shown as an orange mention on both endpoints and a line in the right margin.
- Side peek: icon, title, properties (`Connects: A ↔ B`, `Notes: Inked/Explored`), body, child blocks, and its own subtopic row.

## 9. Delete

- Deleting a block with children or a side link opens a dialog listing the impact (counts incl. inked).
- Children: **Move them up** (default) or delete too. Side link: **Keep its notes as a block under the other endpoint** (default) or delete.
- Every delete has a 10 s undo.

## 10. Export

- Options: Include `Inked only` / `Whole document`; Format `Markdown` / `JSON`; Relations at the end; Formulas as LaTeX.
- Inked notes always form a complete outline (ink order), so no "context headings" option is needed.
- Markdown puts side links under `## Related concepts`. JSON keeps ids, hierarchy, side-link endpoints and lifecycle states. Works offline.

## 11. Accessibility

- Real buttons/links/inputs; icon-only buttons have `aria-label` (e.g. "Ink Temperature τ").
- State is announced in text, never colour alone. Text contrast ≥ 4.5:1.
- Block controls reachable by Tab on a focused block. Formulas get spoken labels.
- Note: Notion-style controls are 28–32 px; enlarge to 44 px for touch.

## 12. Canvas notes (verbatim)

> Key UX decisions
>
> • The document is the product: one reading column, outline on the left, relations in a right margin and a side peek, so side links never break the narrative. Notion-like: white page, system sans, controls appear only on hover.
>
> • Explored is the state of every visible block. Explore is an action on a subtopic, offered in a row at the bottom of each block (never in the block menu). Inked is the norm and explored is a temporary draft: inked blocks are the plain page with no marker; only explored blocks are marked, by a faint blue tint and a ✓ at the right to ink them. Ink ≠ favorite. Generated never appears: no counts, ghosts or 'ready' hints.
>
> • Ink order: a block inks only under an inked parent (the root topic is always inked); a side link only when both ends are inked. Missing parents → one explicit “Ink the chain” prompt, with “Always ink the whole chain”. Moving an inked block under an explored parent offers to ink the new parent chain, with the same “always” option. No un-ink: inked blocks are edited or deleted instead.
>
> • Exploring a subtopic always adds exactly one block, from suggested directions or a free-form ask.
>
> • Explore, Ink, Relate act on one block. Toasts restate scope ("only this block").
>
> • Edited blocks carry an 'Edited' tag; AI replacement only through an explicit side-by-side compare.
>
> • Deleting a linked section previews impact and keeps relation notes by default; undo for 10 s.
>
> • Export separates Notes (inked) from Whole document, Markdown from JSON, offline.
