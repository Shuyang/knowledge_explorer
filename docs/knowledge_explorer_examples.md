# Worked Examples — AI-Native Knowledge Explorer & Notes

**Companion to:** [Product Requirements Document](knowledge_explorer_prd.md)  
**Purpose:** Make the product behavior tangible, especially progressive discovery, block lifecycle, side links, and local persistence. These examples are **illustrative**. They are not a prescribed screen layout, fixed content taxonomy, or implementation plan.

## Conventions

- `[E]` = **Explored**: visible to the user, including every block initially displayed below the root of an outline.
- `[I]` = **Inked**: visible and explicitly hardened and saved as a lasting note.
- `[G]` = **Generated**: AI-generated but **not visible**. `[G]` appears only in the explanatory internal-state diagrams below; it must not appear in the user's interface.
- A **block** is usually about one paragraph, formula, or image, and may have children.
- One Explore action introduces **one new visible block**. An initial outline may display several blocks at document creation: the root topic is `[I]`, all others already `[E]`.
- Ink acts on **exactly one block**: no silent inking of descendants, ancestors, or linked objects.
- A block can be inked only under an inked parent (the root topic is always inked), and a side link only when both endpoints are inked. If a prerequisite is missing, the app offers to ink the chain in one explicit action.
- Side links are independent, content-bearing objects connecting two nodes (MVP: two endpoints); they follow the same lifecycle.

---

## Example 1 — Learning ML Loss Functions progressively

### User intent

> “I want to prepare for ML interviews. Let's start with loss functions. Give me a compact map, and I'll drill down where I'm weak.”

### Step 1: Create a topic document

**User action:** Enters `ML Loss Functions`.

**User-visible document (illustrative):**

```text
[I] ML Loss Functions (root topic, always inked)
├── [E] Regression losses — how to penalize numerical prediction error
├── [E] Classification losses — how to optimize class probabilities/margins
├── [E] Ranking losses — how to learn relative ordering
└── [E] Representation learning losses — how to shape embeddings
```

The headings are not empty labels: each has a brief, useful description. No exhaustive formula catalog is displayed. Every visible block below the root is already **Explored**, even though the user did not individually click it.

**Possible background generation (not displayed):**

```text
Regression losses
  ├── [G] MSE intuition and formula
  └── [G] Huber loss motivation
Representation learning losses
  ├── [G] Contrastive learning overview
  └── [G] InfoNCE overview
```

The precise prefetch strategy is not a product promise. Its purpose is to prepare potential follow-ups without making every Explore action a new LLM request.

### Step 2: Explore one block

**User action:** Requests `Contrastive learning overview` under Representation learning losses.

**Change to visible document:** Exactly **one** block is newly displayed:

```text
└── [E] Representation learning losses
    └── [E] Contrastive learning — pulls positive examples closer in
            representation space and pushes negative examples apart.
```

If the content was prefetched, the cached block transitions `[G] → [E]` when shown; no new model request is necessary for this block. Other prefetched blocks remain invisible. If no useful cache exists, generating it on demand is acceptable.

### Step 3: Drill down to a formula

**User action:** Asks for the InfoNCE objective. If an InfoNCE concept node does not yet exist, the user can first explore that node; each reveal remains a **single-block operation**.

**Illustrative result after two successive explorations:**

```text
[E] Contrastive learning
└── [E] InfoNCE — a contrastive objective for identifying a positive
    example among candidate negatives.
    └── [E] Formula — L_i = -log[ exp(sim(q_i,k_i+)/τ) /
                         Σ_j exp(sim(q_i,k_j)/τ) ]
```

The formula block is a separate addressable block of approximately one-formula granularity. It can be edited, inked, removed, or later broken into children explaining the variables. The representation is illustrative; rendered math may be LaTeX.

### Step 4: Explore nuance without committing it

**User action:** Explores “What does temperature τ do?”

**New block:**

```text
[E] Temperature τ — rescales similarity logits; smaller τ generally
    sharpens the softmax distribution and changes gradient emphasis.
```

This block remains **Explored**. The user may read it and leave it un-inked. The user could request more nuance later, without changing its lifecycle.

### Step 5: Edit and ink selectively

**User action:** Corrects the notation in the formula, then inks it. Its ancestors are not inked yet, so the app offers to ink the chain: Representation learning losses › Contrastive learning › InfoNCE › Formula. The user confirms.

```text
[I] Representation learning losses
└── [I] Contrastive learning
    └── [I] InfoNCE
        ├── [I] Formula — (user-edited formula and notation)
        └── [E] Temperature τ — (still explored, not inked)
```

**Required behavior:**

- Nothing is inked silently: the ancestors are inked only because the user confirmed the chain. The Temperature child and any related side links keep their states.
- An edited **Explored** or **Inked** block must not be silently replaced by subsequent background AI generation.
- The user can continue exploring children of the **Inked** formula, and those new children start **Explored**, not Inked.
- The document remains primarily something the user **grows**, not a huge generated draft they must trim.

### Step 6: Return later

After closing and reopening the local app, the user finds the visible outline, the explored temperature note, the edited inked formula, and the document hierarchy intact. Unseen `[G]` content may or may not survive cache eviction; this must not affect the visible work.

---

## Example 2 — Side link: contrastive loss vs. pairwise loss

### User intent

> “We discussed both pairwise losses and contrastive learning. How are they actually different?”

This question spans different branches; neither concept is naturally a child of the other.

### Step 1: Start with two visible tree nodes

```text
[E] Ranking losses
└── [E] Pairwise loss — optimizes preferences/orderings of item pairs

[E] Representation learning losses
└── [E] Contrastive loss — learns representations through positive
        and negative examples
```

### Step 2: Explore a relationship between them

The user requests a comparison. A **side link** is created with these two endpoint IDs and its own content.

**Side-link content (illustrative, one paragraph):**

> Pairwise ranking losses typically express that one candidate should score above another for a query, while contrastive objectives often shape an embedding space by distinguishing positive pairs from negative candidates. They can overlap mathematically: the distinction depends on the learning setup, scoring function, and negative sampling, not just the word “pairwise.”

This side link is `[E]` once displayed. It is **not** automatically inserted as a child under either concept, and it is **not** automatically inked.

### Step 3: Extend the relationship itself

**User action:** Requests a deeper distinction about training examples.

**Possible outcome:** The side link is explored further via an additional content block associated with the relation (rather than forcing an unrelated FAQ category):

```text
Side link [E]: Pairwise loss ↔ Contrastive loss
└── [E] Training-example setup — a typical ranking triplet has a query,
        preferred candidate, and less-preferred candidate; contrastive
        training may compare one positive against many negatives.
```

Each explicit Explore action reveals one block. There is no requirement to open all possible relation details simultaneously.

### Step 4: Ink selectively

**User action:** Inks the main relation explanation but not the training-example detail. Both endpoints are still Explored, so the app offers to ink them (with their parents) together with the side link. The user confirms.

```text
[I] Ranking losses
└── [I] Pairwise loss
[I] Representation learning losses
└── [I] Contrastive loss
[I] Side link: Pairwise loss ↔ Contrastive loss
└── [E] Training-example detail
```

The endpoints are inked only because the user confirmed the chain; inking an endpoint on its own never inks the side link. The content of the relation remains editable after inking.

### Step 5: Preserve a cross-cutting insight in a linear export

**Readable export, one possible linearization:**

```markdown
## Ranking losses
### Pairwise loss
...

## Representation learning losses
### Contrastive loss
...

## Related concepts
### Pairwise loss ↔ Contrastive loss
[The inked side-link explanation, with references to both concepts]
```

This is an *example*, not a required UI section or fixed FAQ/Comparison block type. The structured export must also preserve **endpoint identities** and the side link as an independent content object.

### Relationship deletion edge case

If one endpoint is deleted, the app must not leave an apparently valid relationship pointing to nonexistent content. Whether the relation is removed, detached, or surfaced for user resolution is a design decision; silent broken links are not acceptable.

---

## Example 3 — Search interview preparation over multiple sessions

### User intent

> “I have a search interview coming up. I need a concise structure I can study incrementally, and a durable set of notes I can revisit.”

### Session 1: Build and explore the initial map

**Prompt/topic:** `Search Interview Preparation`

**Visible initial outline:**

```text
[E] Indexing — building structures for efficient retrieval
[E] Lexical retrieval — matching query terms to documents
[E] Dense retrieval — using learned representations
[E] Ranking — combining signals to order candidates
[E] Evaluation — measuring retrieval and ranking performance
[E] System design — scaling search infrastructure
```

The user explores `Inverted Index` under Indexing and then `BM25` under Lexical retrieval, one block per operation. A later request for a formula produces a separate formula block under BM25.

```text
[E] Lexical retrieval
└── [E] BM25 — term-based ranking function with term-frequency
    saturation and document-length normalization
    └── [E] BM25 formula — [math content]
```

The user inks the BM25 concept paragraph (confirming Lexical retrieval as its inked parent), but leaves the formula un-inked until they feel comfortable with it.

### Session 2: Question and revision

The user returns and asks: “Is ELSER basically the same as SPLADE?” This may create a side link between the two concept nodes once those nodes exist, or motivate exploring them first. The relationship explanation is visible/Explored and remains outside the primary tree hierarchy.

The user notices an oversimplification in the existing BM25 description and edits it. A later AI regeneration or background prefetch must **not silently restore the old text**. If the user expressly asks for a new version of the explanation, replacement needs to be intentional and clearly scoped to the targeted block.

### Session 3: Durable notes vs. temporary exploration

At this point, the document might contain:

```text
[I] BM25 core explanation (edited)
[E] BM25 formula (not yet selected for lasting notes)
[I] SPLADE and ELSER concept blocks (inked, so their side link can be)
[I] Side link: SPLADE ↔ ELSER (explicitly inked)
[E] Unfinished exploration about hard negatives
```

These are **independently curated objects**, not an all-or-nothing save of a whole document or branch.

When the user exports notes:

- A human-readable Markdown representation should make the **durable inked material** easy to study, with side links linearized sensibly.
- A structured export must preserve block identity, hierarchy, relations, lifecycle, and content, so the user's document can be migrated or processed by other tools without relying on Notion or one model provider.
- An export that includes explored material may be useful as a full workspace backup; its scope should be distinguishable from an export of durable notes. The exact export UI is left to design.

### Future session: Reviewing instead of exploring (out of MVP)

Later, the same stable block objects could support familiarity assessments, quiz question generation, and flashcards. **No familiarity field or review feature must be built in the MVP.** The architectural requirement is to avoid making the knowledge model inherently incompatible with such extensions.

---

## Cross-example behavioral checks

| Situation | Expected behavior |
|---|---|
| AI pre-generates ten candidate blocks but displays none | All ten are Generated and invisible |
| Initial outline displays six blocks at once | All six are immediately Explored |
| User explores once beneath a node with five cached candidates | Exactly one candidate becomes visible/Explored; the others remain Generated |
| User inks a block whose parent is Inked and children are Explored | Only the selected block becomes Inked |
| User inks a block whose parent is Explored | App offers to ink the chain; nothing is inked until the user confirms |
| User moves an Inked block under an Explored parent | App offers to ink the new parent chain; if declined, the move does not happen |
| User wants to undo an ink | Not supported; the block can be edited or deleted instead |
| User inks a side link whose endpoints are Explored | App offers to ink the endpoints first; nothing is inked silently |
| User continues exploring under an Inked block | The newly visible block is Explored |
| User edits an Explored block, then AI prefetch runs again | The visible user-edited content stays unchanged |
| User closes/reopens the local app | Previously visible content, links, edits, and states are restored |
| The cache is cleared | Inked content is unaffected; user-visible work is not silently lost |
| User exports a document with cross-node comparisons | Structured export preserves the side links and their endpoints |

**Guiding principle:** The system may be proactive in *preparing* knowledge, but users control what they *see*, *explore*, and *retain*.
