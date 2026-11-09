import type { GenContext, PageOutline, Snippet } from "../../shared/context.ts";

/**
 * Who the learner is, including their language preferences. Fixed for now;
 * kept separate from the rest of the system prompt so it can later become a
 * per-user setting (pass a different profile to buildSystemPrompt). The rest
 * of the prompt stays language-neutral and defers to this.
 */
export const LEARNER_PROFILE = `- An experienced ML Engineering Manager with a strong background in software engineering, search, recommendation systems, and applied ML.
- Preparing for senior-level ML engineering and engineering leadership interviews, with an emphasis on deep technical understanding.
- Technically sophisticated but may be revisiting fundamentals or exploring unfamiliar areas. Explain non-obvious concepts and mathematical reasoning without oversimplifying.
- Language preferences:
  - Titles and suggestions are always in English (e.g. "InfoNCE", "Negative Sampling", "Why Hard Negatives Matter").
  - Body text: concise, natural Chinese prose, but every ML, engineering, math, and product term stays in English, even when a common Chinese translation exists. This covers concepts, methods, metrics, and processes, not just model names: "human annotation", "evaluation", "online experiment", "A/B test", "embedding", "loss function", "negative sampling", "ranking", "recall", "latency", "trade-off", "overfitting", "gradient".
    - Wrong: 通过人工标注构建评估集，再做线上实验。
    - Right: 通过 human annotation 构建 evaluation set，再做 online experiment（A/B test）。
  - Chinese is for connecting words and explanations (因为、所以、关键在于、本质上). If unsure whether a word is a term, use English.
  - Avoid forced translations and overly formal Chinese.`;

export function buildSystemPrompt(profile: string = LEARNER_PROFILE): string {
  return `You write content for a learner's personal study page: a concise, rigorous, well-structured technical reference (think of a tight but approachable Wikipedia section). Every block should be independently useful and worth keeping.

**Learner profile:**
${profile.trim()}

**Writing principles:**
- Explain the **why and how**, not just the what. Connect intuition to mechanisms, mathematics, and practical implications.
- Be technically rigorous but approachable. Use standard terminology, clarify assumptions, and address common misconceptions.
- Use concrete examples, meaningful comparisons, and engineering trade-offs when they deepen understanding.
- Aim for the depth of a thoughtful technical discussion with an experienced engineer, not a textbook summary or memorized interview answer.
- Be concise and substantive. Avoid filler, repetition, generic statements, and unnecessary lists.

**Block format:**
- Prefer visible structure over prose. Pick the shape that fits the content:
  - **Summary table**: when several items share the same dimensions (e.g. Loss | Formula | Key property, or Type | Method | Goal). 3–8 rows, 2–4 short columns; cells are terms, short formulas, or a few words, never sentences. Add at most one line of framing before or after it.
  - **Formula + notes**: a display formula, then 2–4 short bullets on the symbols, intuition, or edge cases.
  - **Comparison**: a short list or table contrasting 2–4 alternatives on the dimensions that actually differ (e.g. pointwise vs. pairwise vs. listwise).
  - **Short paragraph** (about 40–110 words): for reasoning or a mechanism that doesn't break into rows.
- One coherent unit per block. A block may combine shapes (formula + notes + one takeaway), but stays focused on one idea.
- End with a one-line callout when there is a genuinely important insight, misconception, or frequently tested point: a bold lead-in label followed by the point (e.g. "**Key distinction:** …"). Don't add one just to have one.
- Build on the surrounding page without repeating existing explanations or restating the title.
- Respect the page's titles-only outline. Keep content focused on its section and avoid duplicating material belonging elsewhere.
- Use LaTeX for math: \`$...$\` inline and \`$$...$$\` for display. Otherwise use light Markdown (**bold**, *italic*, \`code\`, lists).
- Titles are short phrases (1–6 words), usually the standard term itself.
- Follow the learner's language preferences for titles, suggestions, and body text.
- Suggestions are the directions for the next block (2–7 words each), in priority order:
  1. If the block has a summary table, first list its items, one suggestion per row, named exactly as in the table's first column and in table order. Skip rows already covered elsewhere on the page.
  2. Then add 1–2 other directions that go deeper into this block's own subject: derivations, mechanisms, examples, assumptions, or trade-offs.
  Never suggest a comparison between two items that are (or will become) blocks of their own, such as two rows of a table or two sections (e.g. "MSE vs. MAE"). The learner compares those with a relation link between the two blocks, not a child block.
  Without a table, give 3–4 such directions. Avoid generic suggestions and already-covered topics.

**Goal:** Progressively deepen understanding, one meaningful block at a time. Prioritize clarity, technical accuracy, and insight over content volume.`;
}

export const SYSTEM_PROMPT = buildSystemPrompt();

function renderPath(path: Snippet[]): string {
  return path
    .map((s, i) => `${"  ".repeat(i)}- ${s.title}${s.body ? `: ${s.body.replace(/\s+/g, " ")}` : ""}`)
    .join("\n");
}

function renderOutline(o: PageOutline | undefined, hereLabel: string): string {
  if (!o || !o.lines.length) return "";
  const lines = o.lines.map((l) => `${"  ".repeat(l.depth)}- ${l.title}${l.here ? `   <-- ${hereLabel}` : ""}`);
  if (o.truncated) lines.push("  … (outline cut short; the page is longer)");
  const rel = o.relations.length ? `\n\nRelations on the page:\n${o.relations.map((r) => `- ${r}`).join("\n")}` : "";
  return `Whole page outline (titles only):\n${lines.join("\n")}${rel}\n\n`;
}

function renderRelation(ctx: GenContext): string {
  if (!ctx.relation) return "";
  return `Endpoint A (path from the page root):\n${renderPath(ctx.relation.a)}\n\nEndpoint B (path from the page root):\n${renderPath(ctx.relation.b)}`;
}

export function outlinePrompt(topic: string): string {
  return `Create the opening outline for a new study page on: ${topic}

Return:
- title: the topic name as its standard term, cleaned up, in the language the learner prefers for titles.
- intro: 1–2 sentences that define the topic and say how it is organized (the axis the sections split along, e.g. "by task type").
- sections: 4–6 top-level sections that partition the topic along that axis. Each has:
  - a short title;
  - a body that is a quick-reference summary: one line of framing (what the section covers or when it applies), then a compact Markdown summary table of its key members (3–8 rows, 2–4 columns such as Name | Formula | Key property, or Method | Use case | Trade-off). Cells are terms, short formulas, or a few words. Optionally end with one bold-labelled line for the most important distinction in the section;
  - suggestions: every item in the table, one per row, named exactly as in its first column and in table order. No comparisons between items: those become relation links once the items are explored.
- suggestions: 2–3 further top-level sections the learner might add later.

Keep it a map: no sub-sections and no long explanations. The tables give the overview; the learner drills into each item one block at a time.`;
}

export function blockPrompt(ctx: GenContext, request: string): string {
  const where = ctx.path.length ? ctx.path[ctx.path.length - 1].title : ctx.topic;
  return `Page topic: ${ctx.topic}

${renderOutline(ctx.outline, "the new block goes beneath this")}Where the new block goes (path from the page root to its parent):
${renderPath(ctx.path)}
${ctx.relation ? `\nThe parent is a relation between two parts of the page.\n${renderRelation(ctx)}\n` : ""}
Blocks already beneath "${where}": ${ctx.existingChildren.length ? ctx.existingChildren.map((c) => `"${c}"`).join(", ") : "none"}

Write the next single block beneath "${where}" about: ${request}`;
}

export function relationPrompt(ctx: GenContext, question: string): string {
  return `Page topic: ${ctx.topic}

${renderOutline(ctx.outline, "")}The learner wants to connect two parts of their page.
${renderRelation(ctx)}

Write one block about the relationship between A and B that answers: ${question}
Be concrete about where they overlap and where they differ. Title it with a short phrase naming the relationship.`;
}

export function rewritePrompt(ctx: GenContext, current: Snippet): string {
  return `Page topic: ${ctx.topic}

${renderOutline(ctx.outline, "the block to rewrite")}Context (path from the page root to the block):
${renderPath(ctx.path.slice(0, -1))}
${ctx.relation ? `\n${renderRelation(ctx)}\n` : ""}
The learner asked for a new version of this block:
Title: ${current.title}
Text: ${current.body}

Write a fresh version covering the same scope. Fix anything inaccurate or unclear; keep it to one block. Keep the title unless a clearer one is obvious.`;
}
