/**
 * Export / import adapters. Decoupled from UI and storage (PRD §8).
 *  - JSON: open, loss-minimising; keeps ids, hierarchy, side-link endpoints and lifecycle.
 *  - Markdown: readable notes; side links linearised under "Related concepts".
 */
import { z } from "zod";
import { type Block, type Doc, type SideLink, SCHEMA_VERSION, docTitle, newId, nowIso } from "./model.ts";
import { outlineNumbers, treeOrder, validate } from "./ops.ts";

export type ExportScope = "inked" | "all";

export interface MarkdownOptions {
  scope: ExportScope;
  relationsAtEnd: boolean;
  latex: boolean;
}

const included = (scope: ExportScope, item: { lifecycle: string }) => scope === "all" || item.lifecycle === "inked";

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export const EXPORT_FORMAT = "knowledge-explorer";

export function toJSON(doc: Doc, scope: ExportScope, now = nowIso()) {
  const blocks = Object.values(doc.blocks).filter((b) => included(scope, b));
  const keep = new Set(blocks.map((b) => b.id));
  const links = Object.values(doc.links).filter((l) => included(scope, l) && l.endpoints.every((e) => keep.has(e)));
  for (const l of links) keep.add(l.id);
  // Blocks under a relation that isn't exported are dropped too.
  const finalBlocks = blocks.filter((b) => b.parentId === null || keep.has(b.parentId));
  const finalIds = new Set(finalBlocks.map((b) => b.id));
  const order = new Map(treeOrder(doc).map((id, i) => [id, i]));
  finalBlocks.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    scope,
    document: {
      id: doc.id,
      title: docTitle(doc),
      rootId: doc.rootId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      blocks: finalBlocks.map((b) => ({
        id: b.id,
        parentId: b.parentId,
        childIds: b.childIds.filter((c) => finalIds.has(c)),
        title: b.title,
        body: b.body,
        lifecycle: b.lifecycle,
        edited: b.edited,
        suggestions: b.suggestions,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
      links: links.map((l) => ({
        id: l.id,
        endpoints: l.endpoints,
        childIds: l.childIds.filter((c) => finalIds.has(c)),
        title: l.title,
        body: l.body,
        lifecycle: l.lifecycle,
        edited: l.edited,
        suggestions: l.suggestions,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    },
  };
}

const LifecycleZ = z.enum(["explored", "inked"]);
const ItemZ = {
  id: z.string().min(1),
  childIds: z.array(z.string()),
  title: z.string(),
  body: z.string(),
  lifecycle: LifecycleZ,
  edited: z.boolean().optional().default(false),
  suggestions: z.array(z.string()).optional().default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
};
const ImportZ = z.object({
  format: z.literal(EXPORT_FORMAT),
  schemaVersion: z.number(),
  document: z.object({
    rootId: z.string(),
    createdAt: z.string().optional(),
    blocks: z.array(z.object({ ...ItemZ, parentId: z.string().nullable() })),
    links: z.array(z.object({ ...ItemZ, endpoints: z.array(z.string()) })).optional().default([]),
  }),
});

/** Imports a JSON export as a new document (fresh document id; block ids preserved). */
export function fromJSON(data: unknown): Doc {
  const parsed = ImportZ.safeParse(data);
  if (!parsed.success) throw new Error("This file isn't a Knowledge Explorer JSON export");
  if (parsed.data.schemaVersion > SCHEMA_VERSION) throw new Error("This export was made by a newer version");
  const d = parsed.data.document;
  const now = nowIso();
  const blocks: Record<string, Block> = {};
  for (const b of d.blocks)
    blocks[b.id] = { ...b, createdAt: b.createdAt ?? now, updatedAt: b.updatedAt ?? now } as Block;
  const links: Record<string, SideLink> = {};
  for (const l of d.links)
    links[l.id] = { ...l, createdAt: l.createdAt ?? now, updatedAt: l.updatedAt ?? now } as SideLink;
  const doc: Doc = {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    rootId: d.rootId,
    blocks,
    links,
    ui: { collapsed: [] },
    createdAt: d.createdAt ?? now,
    updatedAt: now,
  };
  const errs = validate(doc);
  if (errs.length) throw new Error(`The file has an inconsistent structure: ${errs[0]}`);
  return doc;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Optionally converts $…$ math into code so it reads in plain Markdown viewers. */
function mathOut(body: string, latex: boolean): string {
  if (latex) return body;
  return body
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => "```\n" + tex.trim() + "\n```")
    .replace(/(^|[^\\$])\$([^\s$](?:[^$\n]*?[^\s$])?)\$/g, (_m, pre: string, tex: string) => `${pre}\`${tex}\``);
}

export function toMarkdown(doc: Doc, opts: MarkdownOptions, now = new Date()): string {
  const out: string[] = [];
  const root = doc.blocks[doc.rootId];
  const draftMark = (x: { lifecycle: string }) => (opts.scope === "all" && x.lifecycle === "explored" ? " _(draft)_" : "");
  const h = (level: number, text: string) => `${"#".repeat(Math.min(6, Math.max(1, level)))} ${text}`;

  const linksToWrite = Object.values(doc.links).filter(
    (l) => included(opts.scope, l) && l.endpoints.every((e) => doc.blocks[e] && included(opts.scope, doc.blocks[e])),
  );
  const linkTitle = (l: SideLink) => l.endpoints.map((e) => doc.blocks[e].title).join(" ↔ ");
  // Same outline numbers as the page, counting only the blocks this export includes.
  const nums = outlineNumbers(doc, (b) => included(opts.scope, b));
  const heading = (id: string) => {
    const b = doc.blocks[id];
    const n = nums.get(id);
    return n ? `${n} ${b.title}` : b.title;
  };

  const writeLink = (l: SideLink, level: number) => {
    out.push(h(level, linkTitle(l)) + draftMark(l), "");
    const [a, b] = l.endpoints.map((e) => doc.blocks[e].title);
    const [ha, hb] = l.endpoints.map(heading);
    out.push(`_Connects [${a}](#${slug(ha)}) and [${b}](#${slug(hb)})_`, "");
    if (l.title && l.title !== linkTitle(l)) out.push(`**${l.title}**`, "");
    if (l.body) out.push(mathOut(l.body, opts.latex), "");
    for (const ch of l.childIds) writeBlock(ch, level + 1);
  };

  const writtenInline = new Set<string>();
  const writeBlock = (id: string, level: number) => {
    const b = doc.blocks[id];
    if (!b || !included(opts.scope, b)) return;
    out.push(h(level, heading(id)) + draftMark(b), "");
    if (b.body) out.push(mathOut(b.body, opts.latex), "");
    for (const ch of b.childIds) writeBlock(ch, level + 1);
    if (!opts.relationsAtEnd) {
      for (const l of linksToWrite) {
        if (l.endpoints[0] === id && !writtenInline.has(l.id)) {
          writtenInline.add(l.id);
          writeLink(l, level + 1);
        }
      }
    }
  };

  out.push(h(1, root.title), "");
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  out.push(`_${opts.scope === "inked" ? "Notes" : "Whole topic"} · ${date}_`, "");
  if (root.body) out.push(mathOut(root.body, opts.latex), "");
  for (const ch of root.childIds) writeBlock(ch, 2);

  const remaining = linksToWrite.filter((l) => !writtenInline.has(l.id));
  if (remaining.length) {
    out.push("---", "", h(2, "Related concepts"), "");
    for (const l of remaining) writeLink(l, 3);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function exportFileName(doc: Doc, ext: "md" | "json"): string {
  return `${slug(docTitle(doc)) || "topic"}.${ext}`;
}
