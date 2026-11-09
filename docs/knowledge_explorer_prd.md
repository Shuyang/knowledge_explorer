# PRD — AI-Native Knowledge Explorer & Notes

**Status:** MVP product requirements  
**Version:** 1.3 (terminology: "Pin" renamed to "Ink"; ink order: parents and side-link endpoints first)  
**Primary use case:** Technical interview preparation (e.g., ML loss functions, search, retrieval, ranking)  
**Audience:** Product and design

## 1. Product summary

Build a **document-first, AI-assisted learning and note-taking application**. A user begins with a topic, gets a concise, structured, Wikipedia-like outline, explores individual knowledge blocks progressively, discovers relationships between blocks, and inks the blocks they accept into their durable notes.

The experience should feel like **constructing one's own structured reference page through learning**, not reading a massive pre-generated answer, editing an AI dump down to size, or manipulating an infinite canvas.

The product distinguishes two **orthogonal dimensions**:

1. **Structure:** hierarchical **tree nodes** and cross-node **side links**.
2. **Lifecycle:** **Generated** (not visible), **Draft** (visible; called "Explored" in earlier drafts of this PRD and stored as `explored` in the data), **Inked** (explicitly hardened and saved as a note).

These dimensions must not be conflated. A tree node or a side link can independently occupy any lifecycle state.

## 2. Problem and goals

### Problem

- Chat-based learning supports questions and follow-ups, but insights become buried in linear conversations.
- Conventional documents are good for revisiting material but cumbersome to build incrementally during exploration.
- Automatically generated long-form study guides can be overwhelming and encourage pruning rather than active discovery.
- Conceptual relationships (e.g., **contrastive loss vs. pairwise loss**) do not always fit cleanly into a tree.

### MVP goals

- Turn a topic into a concise, understandable **structured outline**.
- Make **progressive exploration** the primary learning interaction.
- Allow user-controlled, block-level promotion of draft material into lasting notes.
- Represent cross-topic/cross-node relationships without disrupting the primary document hierarchy.
- Preserve work locally and make content exportable and portable.
- Reduce perceived latency and model cost using generation/display decoupling and caching.

### Non-goals for MVP

- Infinite canvas or graph-first authoring.
- Flashcards, spaced repetition, familiarity scoring, and adaptive quizzes.
- Notion synchronization or collaboration/cloud accounts.
- A complex citation-management platform or full academic research workflow.
- Automatic global deduplication or merging across topics.
- Rich multi-endpoint/hypergraph relationships; support two endpoints in MVP, with an extensible foundation.
- Elaborate bulk operations, including bulk inking (the explicit ink-the-chain prompt in 5.5 is the only multi-block ink).

## 3. Target user and scenarios

Initial audience: an individual preparing for technical interviews who needs to learn, compare, and retain concepts across interconnected subjects.

Example topics:

- **ML Loss Functions** → Regression / Classification / Ranking / Contrastive Learning → InfoNCE → formula and temperature intuition.
- **Search Interview Preparation** → Inverted Index / BM25 / Sparse & Dense Retrieval / Ranking → conceptual comparisons and explanations.

The application should be general-purpose enough for other learning domains; do not hard-code ML or search concepts into the content model.

## 4. User journey

The journey is iterative, not a forced wizard or a rigid sequence.

1. **Start:** User enters a topic. The application creates a document and displays a concise hierarchical outline. The root topic is **Inked** from the start; every other block actually displayed is **Draft**. The system may also generate additional blocks invisibly and cache them as **Generated**.
2. **Explore:** User chooses a specific node and asks for deeper detail, e.g., a conceptual explanation, paragraph, formula, image, or narrower subtopic. Each exploration operation adds/reveals **one knowledge block at a time**. A cache hit can reveal a pre-generated block; otherwise, the system can call an LLM. Newly displayed content becomes **Draft** immediately.
3. **Connect:** User explores a relationship between two nodes, e.g., InfoNCE vs. sampled softmax or contrastive vs. pairwise learning. This becomes a **side link with its own substantive content**, not just a line or pointer. Side links also follow Generated → Draft → Inked lifecycle.
4. **Curate:** User edits, organizes, deletes, and individually inks material. Inking **one block** does not automatically ink its children, connected nodes, or side links. A block can only be inked under an inked parent: if its ancestors are not inked yet, the app offers to ink the whole chain in one explicit action. Inked content remains editable and explorable.
5. **Resume:** After returning later, user can reopen the document, see their visible draft/inked knowledge, and continue where they left off. Unseen generated content remains an internal implementation detail.
6. **Export:** User can export knowledge into portable formats without requiring a third-party service.

Future journey: review inked knowledge, mark familiarity, generate interview questions or flashcards, and revisit weaknesses. This is **not in MVP** and does **not require adding unused fields now**.

## 5. Core product model

### 5.1 Document-first

- Primary artifact is a structured, readable, revisitable **topic document**, similar in spirit to a self-authored Wikipedia page but with explicit structure and incremental growth.
- The **tree** is the main reading and organizational structure.
- **Side links** express meaningful relationships not naturally represented as parent-child containment.
- Do **not** impose a canvas-first interface. A design agent may propose how relations are presented while preserving document readability.
- Do **not** prescribe specific buttons, panels, post-it styles, tab layouts, or other UI details in this PRD.

### 5.2 Knowledge blocks

- A **knowledge block** is an independently addressable, editable unit of content.
- Typical granularity: **one paragraph, one formula, or one image**. A conceptual node may have child blocks, and leaf blocks may be decomposed further.
- Avoid hard-coding named categories such as `Formula`, `FAQ`, or `Comparison` as the core structural abstraction. Those are content/presentation patterns, not the fundamental hierarchy.
- Each block needs a **stable identity** so edits, relationships, persistence, and later extensions remain possible.
- Support text, mathematical notation, and images as content. The MVP should handle these formats with appropriate rendering and persistence; do not require sophisticated image generation.
- Blocks can be edited regardless of lifecycle state. Generated blocks are not exposed in UI; if modified internally, the cache must honor that edit until the block is shown or discarded. User editing a visible block leaves it at least Draft.

### 5.3 Tree structure

- Tree nodes can contain child nodes and can be expanded incrementally.
- **One exploration action reveals/adds one block**, not an entire subtree. This does **not** mean only one branch is allowed to be open in the UI at a time.
- Initial displayed outline can contain multiple nodes: the root topic is **Inked** and all other initially visible nodes are already **Draft**. Do not label visible outlines as Generated.
- An individual node can be Draft while its children are Generated or Draft, and an Inked node can have children in any state, subject to the usual visibility and ink-order rules.
- User must be able to change the organization and content of draft/inked nodes; deletion needs a safe UX, with implementation details left to design.

### 5.4 Side links

- Side links are **first-class content objects** linking **two tree nodes** in the MVP.
- A side link has its **own editable/explorable content** and lifecycle, not merely a line or label.
- It can represent comparisons, explanations of relationships, questions, or arbitrary lateral insights. Do not constrain it to a special `Comparison` or `FAQ` type.
- A side link can be inked only when both endpoints are inked; if they are not, the app offers to ink them (with their chains) first. Inking a tree node does not ink its side links.
- Future architecture should accommodate links with multiple endpoints without implementing that feature now.
- Deletion of an endpoint must never silently leave a broken, misleading relationship; choose a clear safe behavior (e.g., unlink or remove with confirmation) and test it.

### 5.5 Lifecycle and visibility

| State | Definition | User-visible? | Expected retention |
|---|---|---|---|
| **Generated** | AI-generated and cached but **never yet shown** to the user | **No** | Disposable internal cache |
| **Draft** | Content **has been shown** to the user, whether on initial document creation or by subsequent expansion | **Yes** | Retain for short-term continuation |
| **Inked** | User explicitly inked the **individual block**, hardening and saving it as durable notes | **Yes** | Persist long-term |

**Hard invariants:**

1. **Generated means invisible.** Once content is rendered/shown to the user, it is at least **Draft**, regardless of whether they clicked anything.
2. **Inking is per block only.** No silent inking of a parent, child, subtree, endpoint, or link.
3. **Ink order.** A block can be inked only if its parent is inked; the root topic is always inked. A side link can be inked only if both endpoints are inked. When a prerequisite is missing, the app offers to ink the chain as one explicit action; the user may choose to always ink the chain without being asked. The same applies when an inked block is moved under an Draft parent: the app offers to ink the new parent chain (with the same "always" option); if the user declines, the move does not happen.
4. **Exploration is per block only.** Each explicit Explore expansion reveals/adds one block. Background pre-generation of additional blocks is allowed, but those remain invisible until actually presented.
5. **Explore and Ink are independent of tree vs. side link structure.**
6. **Any content already shown to or edited by the user must never be silently overwritten by AI regeneration.** Explicit user-directed replacement may be supported if it is clear and intentional.
7. Inked blocks remain editable and expandable. New content added beneath an inked block is not automatically inked.
8. Do not expose `Generated` as an apparent user-visible status or section.

**Lifecycle interpretation:** The primary promotion path is Generated → Draft → Inked. Inking cannot be undone: there is no un-ink/demotion workflow. An inked block can still be edited or deleted. For the MVP, there is also no requirement to implement undo history, or regeneration versions beyond basic safe editing, unless the design naturally calls for them. The implementation should not assume AI-generated content is immutable.

## 6. Generation, caching, and latency

The primary goal is to **decouple LLM generation from what is displayed**.

- Generate an initial **outline-first** response that is concise and structured. Avoid generating a full textbook and requiring users to delete most of it.
- The backend is permitted to **pre-generate or batch-generate** more content than is immediately shown, and keep this invisible in a cache.
- An Explore operation should first consult relevant generated/cache content; only request additional LLM generation when needed.
- Showing a cached block promotes it from Generated to Draft.
- The system should support partial generation or graceful fallback if an LLM call fails, and preserve user-visible work.
- Prioritize **perceived speed** and **reasonable token cost**; the PRD does not mandate a specific prefetch breadth, batch size, cache eviction policy, or provider.
- Cache invalidation must not overwrite Draft/Inked content. Changes to context may invalidate **unseen Generated** candidates.
- AI generation should be grounded in the current document context and nearby related nodes when relevant, without indiscriminately sending the entire knowledge base on every request.
- The generation architecture should support interchangeable model providers or a separable AI service boundary; avoid embedding provider assumptions into the knowledge data model.

**Important:** Whether a block has been generated and whether a block is visible are separate technical facts; the user-facing lifecycle must reflect actual visibility.

## 7. Editing and knowledge curation

MVP should support:

- Editing individual visible blocks (both Draft and Inked).
- Adding and organizing blocks into a tree.
- Deleting blocks and side links safely.
- Creating/editing a side link and its explanatory content.
- Inking an individual Draft block.
- Continuing exploration from any visible block, including Inked blocks.
- Maintaining user edits without silent AI overwrite.

Design decisions such as inline vs. modal editing, deletion affordances, how ink state is indicated, and side-link presentation are delegated to the design agent.

## 8. Local-first persistence and export

- **MVP storage is local**, with no login/cloud dependency.
- Reloading or reopening the app must restore the user's documents, all visible Draft/Inked content, their organization, edits, relationships, and state.
- Generated/unseen material is a cache; it may be persisted for optimization but may be evicted safely.
- **Inked content must be durable** and must not depend on the generated cache.
- Keep the domain model and storage/export adapters decoupled from UI rendering.
- Provide an **open, loss-minimizing structured export** (e.g., JSON) that represents documents, blocks, hierarchy, links, content, and lifecycle. Also support a **readable export** (e.g., Markdown) for notes.
- A Markdown export can use sensible linearization for side links (e.g., a referenced relationship section); it need not perfectly preserve interactive features. The structured export should preserve relationships.
- Future Notion export/sync should be possible through an adapter. **Do not implement Notion integration in MVP**, and do not couple the core model to Notion page/block schemas.
- Export should work without internet access, even if AI generation requires network access.

## 9. Future extension: review and interview preparation

Later versions may:

- Track how familiar a user is with individual blocks.
- Generate interview questions, quizzes, or flashcards from selected blocks.
- Plan reviews based on familiarity or retention.
- Import reference documents and support citations.
- Build cross-document connections and reusable knowledge blocks.
- Export or synchronize with external tools, including Notion.

**Architecture guidance:** Use stable knowledge objects, clean separation of structure/content/lifecycle and presentation, and extensible persistence. **Do not introduce unused familiarity fields or premature review workflows in the MVP.** Future fields can be added later.

## 10. UX and design-agent handoff

Design intent, not a prescribed implementation:

- Reading-first, structured-document experience; clean enough to be a lasting study note.
- Encourage **gradual addition** via exploration, not bulk generation followed by deletion.
- Distinguish Draft vs. Inked without treating them as separate structural locations.
- Side links should be understandable without interrupting the main narrative of the tree.
- The invisible Generated cache must not leak into visible controls or misleading content counts.
- Make the distinction between **Explore** and **Ink** intelligible, while keeping each operation focused on **one block**.
- Favor understandable, low-friction interactions over a feature-dense editor.

**Leave to the design agent:** visual hierarchy, block controls, discovery affordances, navigation, relation visualization, editing mechanics, confirmation/undo treatments, responsiveness and accessibility details. The design may iterate as long as the core data/state invariants remain intact.

## 11. MVP functional acceptance criteria

The following are verifiable product outcomes, not implementation instructions.

1. **Outline creation:** Given `ML Loss Functions`, the app produces a concise, hierarchical outline, with the root topic Inked and the other displayed blocks in Draft state.
2. **Invisible pre-generation:** The system can cache AI-generated content that is *not shown* and remains Generated until displayed.
3. **Incremental exploration:** Exploring one node reveals/adds **one new block**; a second exploration can reveal a second block. It must not silently expose an entire prefetched subtree.
4. **Cache optimization:** When applicable cached content exists, exploration can complete without a separate LLM request for that block.
5. **No silent overwrite:** After a user sees or edits a block, background generation/regeneration cannot replace its content without explicit user intent.
6. **Single-block inking:** Inking a node whose parent is already inked saves that node alone; children and side links retain their existing states.
7. **Ink order:** Inking a node under an un-inked parent, moving an inked node under an un-inked parent, or inking a side link with an un-inked endpoint changes nothing until the user confirms the chain (or has chosen to always ink the chain).
8. **Inked expansion:** An inked node can be expanded, and newly revealed children become Draft, not Inked.
9. **Relationship authoring:** The user can relate two nodes via a side link with explanatory text, edit that text, and individually ink the side link.
10. **Side-link independence:** Inking or editing a side link does not automatically modify/ink either endpoint.
11. **Editing:** Users can edit, move/organize, and delete visible blocks and can edit/delete side links, without corrupting the document.
12. **Persistence:** A reload restores visible content, links, edits, and lifecycle states; inked content survives cache cleanup.
13. **Exports:** User can export a readable note and a structured representation that retains tree relationships and side links.
14. **Portability:** Application data does not depend on Notion or a particular LLM provider's response schema.
15. **Learning-centric output:** The default does not dump a fully expanded, long-form document that users must trim down.

## 12. Open implementation/design questions (do not block initial design)

These are genuine choices to resolve during design/engineering rather than prescribed PRD outcomes:

- How should a user ask for the *next* block: model-suggested options, free-form request, or both?
- How should initial outline depth/breadth adapt to broad vs. narrow subjects?
- What prefetch batching and cache eviction policy best balance cost/latency?
- How long should Draft (un-inked) content be retained? MVP can persist it locally and provide an explicit clean-up action rather than enforce a time-based policy.
- How best to represent links in a linear Markdown export, and which structured export schema/versioning strategy to use?
- How should a user explicitly request AI replacement of an existing draft block while protecting their edits?
- How should deleting a parent node or a side-link endpoint affect dependent content, with minimal data loss?
- How to handle image blocks in portable export (embedded files/assets vs. references)?
- What lightweight warnings or correction affordances should exist for AI-generated technical material and equations?

## 13. Worked examples

See **[Worked Examples — Knowledge Explorer](knowledge_explorer_examples.md)** for detailed, illustrative user journeys covering:

1. **ML Loss Functions:** outline creation, invisible prefetched blocks, one-block exploration, formula-level granularity, editing, and selective inking.
2. **Contrastive vs. Pairwise Loss:** a substantive side link, further exploration, independent lifecycle, and preservation in exports.
3. **Search Interview Preparation:** iterative study across sessions, AI regeneration without silent overwrites, and a readable durable note.

The examples clarify expected behaviors and edge cases. They are **illustrative, not a prescribed UI design or a fixed taxonomy of knowledge block types**.

---

**One-line product principle:** *A document-first learning workspace where AI prepares knowledge ahead of time, users reveal it incrementally, and only explicitly inked blocks become lasting notes.*
