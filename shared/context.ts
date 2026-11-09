/**
 * Builds the context sent with a generation request: the path from the root
 * to the target (with bodies), existing children (to avoid repeats), for
 * relations both endpoints, and a titles-only outline of the whole page so
 * the model knows what other sections already cover. Bodies outside the path
 * are never sent, and nothing outside this document is (PRD §6).
 *
 * This is provider-neutral; server/ai/prompts.ts turns it into a prompt.
 */
import { type Doc, getContainer } from "./model.ts";
import { ancestors } from "./ops.ts";

export interface Snippet {
  title: string;
  body: string;
}

export interface GenContext {
  topic: string;
  /** Root → target (inclusive). For targets inside a relation, starts at the relation. */
  path: Snippet[];
  /** Titles already present beneath the target. */
  existingChildren: string[];
  /** For relations (and blocks inside them): each endpoint's path from the root. */
  relation?: { a: Snippet[]; b: Snippet[] };
  /** Titles-only structure of the whole page. Optional so older clients still work. */
  outline?: PageOutline;
}

export interface OutlineLine {
  depth: number;
  title: string;
  /** The block the request is about (the parent of a new block, or the block being rewritten). */
  here?: boolean;
}

export interface PageOutline {
  lines: OutlineLine[];
  /** Side links as "A ↔ B: relation title". */
  relations: string[];
  /** True when the page was too large and the outline was cut short. */
  truncated?: boolean;
}

export const MAX_OUTLINE_LINES = 400;
const MAX_TITLE = 120;

// Large enough to keep a summary table intact.
const MAX_BODY = 1500;

function snip(title: string, body: string): Snippet {
  return { title, body: body.length > MAX_BODY ? body.slice(0, MAX_BODY) + "…" : body };
}

export function pathTo(doc: Doc, id: string): Snippet[] {
  const ids = doc.blocks[id] ? [...ancestors(doc, id), id] : [id];
  return ids.map((x) => {
    const c = getContainer(doc, x)!;
    return snip(c.title, c.body);
  });
}

const clip = (t: string) => {
  const s = (t || "Untitled").replace(/\s+/g, " ").trim();
  return s.length > MAX_TITLE ? s.slice(0, MAX_TITLE) + "…" : s;
};

/** Titles of every tree block in reading order, plus the page's relations. */
export function outlineOf(doc: Doc, hereId?: string): PageOutline {
  const lines: OutlineLine[] = [];
  let truncated = false;
  const walk = (id: string, depth: number) => {
    const b = doc.blocks[id];
    if (!b) return;
    if (lines.length >= MAX_OUTLINE_LINES) {
      truncated = true;
      return;
    }
    lines.push(id === hereId ? { depth, title: clip(b.title), here: true } : { depth, title: clip(b.title) });
    for (const c of b.childIds) walk(c, depth + 1);
  };
  walk(doc.rootId, 0);
  const relations = Object.values(doc.links)
    .slice(0, 100)
    .map((l) => {
      const [a, b] = l.endpoints.map((e) => clip(doc.blocks[e]?.title ?? "?"));
      return `${a} ↔ ${b}${l.title ? `: ${clip(l.title)}` : ""}`;
    });
  return truncated ? { lines, relations, truncated } : { lines, relations };
}

/**
 * The outline as it will look once a new child titled `title` exists under the
 * current "here" line; "here" moves to the new child. Used for prefetching
 * that child's own children.
 */
export function outlineWithChild(o: PageOutline | undefined, title: string): PageOutline | undefined {
  if (!o) return o;
  const i = o.lines.findIndex((l) => l.here);
  if (i < 0) return o;
  const d = o.lines[i].depth;
  let j = i + 1;
  while (j < o.lines.length && o.lines[j].depth > d) j++;
  const lines: OutlineLine[] = o.lines.map((l) => ({ depth: l.depth, title: l.title }));
  lines.splice(j, 0, { depth: d + 1, title: clip(title), here: true });
  return { ...o, lines };
}

export function contextFor(doc: Doc, targetId: string): GenContext {
  const topic = doc.blocks[doc.rootId].title;
  const target = getContainer(doc, targetId);
  if (!target) throw new Error(`Unknown target ${targetId}`);
  const path = pathTo(doc, targetId);
  const existingChildren = target.childIds.map((c) => doc.blocks[c]?.title).filter(Boolean) as string[];
  const linkId = doc.links[targetId] ? targetId : doc.blocks[targetId] ? ancestors(doc, targetId).find((a) => doc.links[a]) : undefined;
  const ctx: GenContext = { topic, path, existingChildren, outline: outlineOf(doc, doc.blocks[targetId] ? targetId : undefined) };
  if (linkId) {
    const [a, b] = doc.links[linkId].endpoints;
    ctx.relation = { a: pathTo(doc, a), b: pathTo(doc, b) };
  }
  return ctx;
}

/** Context for creating a brand-new relation between two blocks. */
export function relationContext(doc: Doc, a: string, b: string): GenContext {
  return {
    topic: doc.blocks[doc.rootId].title,
    path: [],
    existingChildren: [],
    relation: { a: pathTo(doc, a), b: pathTo(doc, b) },
    outline: outlineOf(doc),
  };
}

/** Normalised cache key for a requested subtopic. */
export function subtopicKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
}
