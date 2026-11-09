/**
 * Pure operations on a Doc. Every function returns a new Doc and never mutates
 * its input, so the UI can keep snapshots for undo and the server can validate.
 *
 * Lifecycle invariants enforced here (PRD §5.5):
 *   - Inking is per block. Only ids passed explicitly are inked.
 *   - Ink order: a block is inkable only under an inked parent; a side link only
 *     when both endpoints are inked. Callers obtain the chain with `inkChain()`
 *     and must pass it explicitly (after the user confirms).
 *   - There is no un-ink.
 *   - New content (explore, relate, add) always starts Explored.
 */
import {
  type Block,
  type BlockDraft,
  type Doc,
  type OutlineDraft,
  type SideLink,
  SCHEMA_VERSION,
  getContainer,
  newId,
  nowIso,
} from "./model.ts";

export class OpError extends Error {}

function clone(doc: Doc): Doc {
  return structuredClone(doc);
}

function touch(doc: Doc, now = nowIso()): Doc {
  doc.updatedAt = now;
  return doc;
}

function cleanSuggestions(s: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of s ?? []) {
    const t = raw.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, 5);
}

function makeBlock(parentId: string | null, draft: BlockDraft, id = newId(), now = nowIso()): Block {
  return {
    id,
    parentId,
    childIds: [],
    title: draft.title.trim(),
    body: draft.body.trim(),
    lifecycle: "explored",
    edited: false,
    suggestions: cleanSuggestions(draft.suggestions),
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** Root is Inked from the start; every other visible block is Explored (PRD §4.1). */
export function createDoc(outline: OutlineDraft, opts: { id?: string; now?: string } = {}): Doc {
  const now = opts.now ?? nowIso();
  const root = makeBlock(null, { title: outline.title, body: outline.intro, suggestions: outline.suggestions }, newId(), now);
  root.lifecycle = "inked";
  const doc: Doc = {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id ?? newId(),
    rootId: root.id,
    blocks: { [root.id]: root },
    links: {},
    ui: { collapsed: [] },
    createdAt: now,
    updatedAt: now,
  };
  for (const s of outline.sections) {
    const b = makeBlock(root.id, s, newId(), now);
    doc.blocks[b.id] = b;
    root.childIds.push(b.id);
  }
  return doc;
}

/** Adds exactly one new Explored block under a block or side link. */
export function addChild(doc: Doc, parentId: string, draft: BlockDraft, opts: { id?: string; index?: number } = {}): Doc {
  const next = clone(doc);
  const parent = getContainer(next, parentId);
  if (!parent) throw new OpError(`Unknown parent ${parentId}`);
  const id = opts.id ?? newId();
  if (next.blocks[id] || next.links[id]) throw new OpError(`Id already exists: ${id}`);
  const b = makeBlock(parentId, draft, id);
  next.blocks[id] = b;
  const idx = opts.index ?? parent.childIds.length;
  parent.childIds.splice(Math.max(0, Math.min(idx, parent.childIds.length)), 0, id);
  // A used suggestion is no longer offered on the parent.
  parent.suggestions = parent.suggestions.filter((s) => s.toLowerCase() !== draft.title.trim().toLowerCase());
  return touch(next);
}

/** Removes a suggestion label (after it's been explored, or dismissed). */
export function consumeSuggestion(doc: Doc, containerId: string, label: string): Doc {
  const next = clone(doc);
  const c = getContainer(next, containerId);
  if (!c) return doc;
  c.suggestions = c.suggestions.filter((s) => s.toLowerCase() !== label.trim().toLowerCase());
  return next;
}

export function setSuggestions(doc: Doc, containerId: string, suggestions: string[]): Doc {
  const next = clone(doc);
  const c = getContainer(next, containerId);
  if (!c) return doc;
  c.suggestions = cleanSuggestions(suggestions);
  return next;
}

/** Creates an Explored side link between two distinct tree blocks. */
export function createLink(doc: Doc, a: string, b: string, draft: BlockDraft, opts: { id?: string } = {}): Doc {
  if (a === b) throw new OpError("A side link needs two different blocks");
  if (!doc.blocks[a] || !doc.blocks[b]) throw new OpError("Side-link endpoints must be existing blocks");
  if (isInsideLink(doc, a) || isInsideLink(doc, b)) throw new OpError("Side-link endpoints must be tree blocks");
  const next = clone(doc);
  const now = nowIso();
  const link: SideLink = {
    id: opts.id ?? newId(),
    endpoints: [a, b],
    childIds: [],
    title: draft.title.trim(),
    body: draft.body.trim(),
    lifecycle: "explored",
    edited: false,
    suggestions: cleanSuggestions(draft.suggestions),
    createdAt: now,
    updatedAt: now,
  };
  next.links[link.id] = link;
  return touch(next);
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

/** Ancestors of a block from root down to (excluding) the block. Stops at a side link (included). */
export function ancestors(doc: Doc, id: string): string[] {
  const out: string[] = [];
  let cur = doc.blocks[id]?.parentId ?? null;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    out.unshift(cur);
    if (doc.links[cur]) break;
    cur = doc.blocks[cur]?.parentId ?? null;
  }
  return out;
}

/** The side link a block lives under, if any. */
export function owningLink(doc: Doc, id: string): string | null {
  const a = ancestors(doc, id);
  return a.length && doc.links[a[0]] ? a[0] : null;
}

export function isInsideLink(doc: Doc, id: string): boolean {
  return owningLink(doc, id) !== null;
}

/** All descendant block ids (depth-first, pre-order), excluding the start id. */
export function descendants(doc: Doc, id: string): string[] {
  const out: string[] = [];
  const walk = (cid: string) => {
    const c = getContainer(doc, cid);
    if (!c) return;
    for (const ch of c.childIds) {
      out.push(ch);
      walk(ch);
    }
  };
  walk(id);
  return out;
}

/** Tree depth (root = 0). Blocks inside a side link count from the link (link children = 1). */
export function depth(doc: Doc, id: string): number {
  return ancestors(doc, id).length;
}

/** Tree blocks in reading order (pre-order), excluding blocks that belong to side links. */
export function treeOrder(doc: Doc): string[] {
  return [doc.rootId, ...descendants(doc, doc.rootId)];
}

export function linksOf(doc: Doc, blockId: string): SideLink[] {
  return Object.values(doc.links).filter((l) => l.endpoints.includes(blockId));
}

// ---------------------------------------------------------------------------
// Inking
// ---------------------------------------------------------------------------

/**
 * Everything that must be inked (in order) for `targetId` to be inked,
 * ending with the target itself. Parents/endpoints come first. Already-inked
 * items are omitted. Empty if the target is already inked.
 */
export function inkChain(doc: Doc, targetId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const link = doc.links[id];
    if (link) {
      for (const e of link.endpoints) visit(e);
    } else {
      const b = doc.blocks[id];
      if (!b) throw new OpError(`Unknown id ${id}`);
      if (b.parentId) visit(b.parentId);
    }
    const item = getContainer(doc, id)!;
    if (item.lifecycle !== "inked") out.push(id);
  };
  visit(targetId);
  return out;
}

/** Prerequisites only (the chain minus the target). */
export function missingPrereqs(doc: Doc, targetId: string): string[] {
  return inkChain(doc, targetId).filter((id) => id !== targetId);
}

/**
 * Inks exactly the given ids. Throws if any id would end up under an un-inked
 * parent or with an un-inked endpoint — i.e. the caller must pass the full,
 * user-confirmed chain. Nothing outside `ids` changes.
 */
export function ink(doc: Doc, ids: string[]): Doc {
  const set = new Set(ids);
  const isInked = (id: string) => set.has(id) || getContainer(doc, id)?.lifecycle === "inked";
  for (const id of ids) {
    const link = doc.links[id];
    if (link) {
      if (!link.endpoints.every(isInked)) throw new OpError("A side link can be inked only when both ends are inked");
      continue;
    }
    const b = doc.blocks[id];
    if (!b) throw new OpError(`Unknown id ${id}`);
    if (b.parentId && !isInked(b.parentId)) throw new OpError("A block can be inked only under an inked parent");
  }
  const next = clone(doc);
  const now = nowIso();
  for (const id of ids) {
    const item = getContainer(next, id)!;
    if (item.lifecycle !== "inked") {
      item.lifecycle = "inked";
      item.updatedAt = now;
    }
  }
  return touch(next, now);
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/** User edit. Lifecycle is unchanged (an edited visible block stays at least Explored). */
export function editContent(doc: Doc, id: string, patch: Partial<{ title: string; body: string }>): Doc {
  const next = clone(doc);
  const item = getContainer(next, id);
  if (!item) throw new OpError(`Unknown id ${id}`);
  const title = patch.title !== undefined ? patch.title.trim() : item.title;
  const body = patch.body !== undefined ? patch.body.trim() : item.body;
  if (title === item.title && body === item.body) return doc;
  item.title = title;
  item.body = body;
  item.edited = true;
  item.updatedAt = nowIso();
  return touch(next);
}

/** Explicit, user-chosen replacement with a new AI version ("Use new"). */
export function replaceWithVersion(doc: Doc, id: string, content: { title: string; body: string }): Doc {
  const next = clone(doc);
  const item = getContainer(next, id);
  if (!item) throw new OpError(`Unknown id ${id}`);
  item.title = content.title.trim();
  item.body = content.body.trim();
  item.edited = false;
  item.updatedAt = nowIso();
  return touch(next);
}

// ---------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------

export function canMove(doc: Doc, id: string, newParentId: string): string | null {
  if (id === doc.rootId) return "The root topic can't be moved";
  if (!doc.blocks[id]) return "Unknown block";
  if (!getContainer(doc, newParentId)) return "Unknown destination";
  if (id === newParentId || descendants(doc, id).includes(newParentId)) return "A block can't be moved inside itself";
  // A block that is the endpoint of a relation must stay in the tree.
  if (doc.links[newParentId] || isInsideLink(doc, newParentId)) {
    if ([id, ...descendants(doc, id)].some((d) => linksOf(doc, d).length > 0))
      return "A block with relations can't be moved into a relation";
  }
  return null;
}

/**
 * Blocks that must be inked before `id` can move under `newParentId`:
 * if the moved block is inked and the new parent chain isn't, the new parent
 * chain must be inked (with confirmation). Empty if no confirmation needed.
 */
export function moveChain(doc: Doc, id: string, newParentId: string): string[] {
  const b = doc.blocks[id];
  if (!b || b.lifecycle !== "inked") return [];
  return inkChain(doc, newParentId);
}

/**
 * Moves a block (with its subtree) to `newParentId` at `index`.
 * If the block is inked and the new parent chain isn't, `inkIds` must contain
 * that chain (the user confirmed it); otherwise this throws and nothing moves.
 */
export function moveBlock(doc: Doc, id: string, newParentId: string, index?: number, inkIds: string[] = []): Doc {
  const err = canMove(doc, id, newParentId);
  if (err) throw new OpError(err);
  const needed = moveChain(doc, id, newParentId);
  if (needed.some((n) => !inkIds.includes(n))) throw new OpError("Moving an inked block needs an inked parent chain");
  const next = inkIds.length ? ink(doc, inkIds) : clone(doc);
  const b = next.blocks[id];
  const oldParent = getContainer(next, b.parentId!)!;
  const oldIdx = oldParent.childIds.indexOf(id);
  oldParent.childIds.splice(oldIdx, 1);
  const np = getContainer(next, newParentId)!;
  let idx = index ?? np.childIds.length;
  idx = Math.max(0, Math.min(idx, np.childIds.length));
  np.childIds.splice(idx, 0, id);
  b.parentId = newParentId;
  b.updatedAt = nowIso();
  return touch(next);
}

// ---------------------------------------------------------------------------
// Deleting
// ---------------------------------------------------------------------------

export interface DeleteOptions {
  /** What happens to blocks beneath it. */
  children: "moveUp" | "delete";
  /** What happens to relations that would lose an endpoint. */
  links: "keepAsBlock" | "delete";
}

export interface DeleteImpact {
  childCount: number;
  inkedChildCount: number;
  /** Relations touching the block itself (affected whatever happens to children). */
  directLinks: { linkId: string; otherId: string; inked: boolean }[];
  /** Relations touching only descendants (affected only if children are deleted too). */
  descendantLinks: { linkId: string; otherId: string; inked: boolean }[];
}

function linkInfo(l: SideLink, removed: Set<string>) {
  const otherId = l.endpoints.find((e) => !removed.has(e)) ?? "";
  return { linkId: l.id, otherId, inked: l.lifecycle === "inked" };
}

export function deleteImpact(doc: Doc, id: string): DeleteImpact {
  const desc = descendants(doc, id);
  const all = new Set([id, ...desc]);
  const direct = linksOf(doc, id).map((l) => linkInfo(l, all));
  const directIds = new Set(direct.map((d) => d.linkId));
  const descLinks = Object.values(doc.links)
    .filter((l) => !directIds.has(l.id) && l.endpoints.some((e) => all.has(e)))
    .map((l) => linkInfo(l, all));
  return {
    childCount: desc.length,
    inkedChildCount: desc.filter((d) => doc.blocks[d]?.lifecycle === "inked").length,
    directLinks: direct,
    descendantLinks: descLinks,
  };
}

function removeSubtree(doc: Doc, id: string) {
  for (const d of descendants(doc, id)) delete doc.blocks[d];
  delete doc.blocks[id];
}

function removeLink(doc: Doc, linkId: string) {
  const l = doc.links[linkId];
  if (!l) return;
  for (const ch of [...l.childIds]) removeSubtree(doc, ch);
  delete doc.links[linkId];
}

/**
 * Deletes a block safely. Relations that lose an endpoint are never left
 * dangling: either their notes become a block under the surviving endpoint
 * (default) or they are deleted.
 */
export function deleteBlock(doc: Doc, id: string, opts: DeleteOptions = { children: "moveUp", links: "keepAsBlock" }): Doc {
  if (id === doc.rootId) throw new OpError("The root topic can't be deleted; delete the whole topic instead");
  const b = doc.blocks[id];
  if (!b) throw new OpError(`Unknown block ${id}`);
  const next = clone(doc);
  const parent = getContainer(next, b.parentId!)!;
  const pos = parent.childIds.indexOf(id);

  const removed = new Set<string>([id]);
  if (opts.children === "delete") for (const d of descendants(next, id)) removed.add(d);

  // Relations losing an endpoint.
  const affected = Object.values(next.links).filter((l) => l.endpoints.some((e) => removed.has(e)));
  for (const l of affected) {
    const survivors = l.endpoints.filter((e) => !removed.has(e));
    if (opts.links === "keepAsBlock" && survivors.length > 0) {
      const otherId = survivors[0];
      const lostTitles = l.endpoints.filter((e) => removed.has(e)).map((e) => next.blocks[e]?.title ?? "a deleted block");
      const note = `_Kept from a relation with “${lostTitles.join(", ")}” (deleted)._`;
      const keep = makeBlock(otherId, { title: l.title, body: `${l.body}\n\n${note}`.trim(), suggestions: l.suggestions });
      // An inked relation implies its surviving endpoint is inked, so the kept notes may stay inked.
      keep.lifecycle = l.lifecycle === "inked" && next.blocks[otherId].lifecycle === "inked" ? "inked" : "explored";
      keep.edited = l.edited;
      keep.childIds = [...l.childIds];
      for (const ch of keep.childIds) next.blocks[ch].parentId = keep.id;
      next.blocks[keep.id] = keep;
      next.blocks[otherId].childIds.push(keep.id);
      delete next.links[l.id];
    } else {
      removeLink(next, l.id);
    }
  }

  if (opts.children === "moveUp") {
    const kids = next.blocks[id].childIds;
    for (const k of kids) next.blocks[k].parentId = b.parentId;
    parent.childIds.splice(pos, 1, ...kids);
    delete next.blocks[id];
  } else {
    parent.childIds.splice(pos, 1);
    removeSubtree(next, id);
  }
  next.ui.collapsed = next.ui.collapsed.filter((c) => next.blocks[c] || next.links[c]);
  return touch(next);
}

export function deleteLink(doc: Doc, linkId: string): Doc {
  if (!doc.links[linkId]) throw new OpError(`Unknown relation ${linkId}`);
  const next = clone(doc);
  removeLink(next, linkId);
  return touch(next);
}

// ---------------------------------------------------------------------------
// Clean-up of drafts (explicit, previewed)
// ---------------------------------------------------------------------------

export interface CleanupPreview {
  blocks: number;
  links: number;
}

export function cleanupPreview(doc: Doc): CleanupPreview {
  return {
    blocks: Object.values(doc.blocks).filter((b) => b.lifecycle === "explored").length,
    links: Object.values(doc.links).filter((l) => l.lifecycle === "explored").length,
  };
}

/** Removes every Explored block and relation. Inked content is never touched. */
export function cleanup(doc: Doc): Doc {
  const next = clone(doc);
  for (const l of Object.values(next.links)) if (l.lifecycle === "explored") removeLink(next, l.id);
  // Explored blocks only ever have explored descendants (ink order), so removing subtrees is safe.
  for (const c of [...Object.values(next.blocks), ...Object.values(next.links)]) {
    if (!next.blocks[c.id] && !next.links[c.id]) continue;
    for (const ch of [...c.childIds]) {
      if (next.blocks[ch]?.lifecycle === "explored") {
        removeSubtree(next, ch);
      }
    }
    c.childIds = c.childIds.filter((ch) => next.blocks[ch]);
  }
  next.ui.collapsed = next.ui.collapsed.filter((c) => next.blocks[c] || next.links[c]);
  return touch(next);
}

// ---------------------------------------------------------------------------
// UI state (not content; doesn't bump updatedAt)
// ---------------------------------------------------------------------------

export function setCollapsed(doc: Doc, id: string, collapsed: boolean): Doc {
  const next = clone(doc);
  const set = new Set(next.ui.collapsed);
  if (collapsed) set.add(id);
  else set.delete(id);
  next.ui.collapsed = [...set];
  return next;
}

export function setLastViewed(doc: Doc, id: string): Doc {
  if (doc.ui.lastViewedId === id) return doc;
  return { ...doc, ui: { ...doc.ui, lastViewedId: id } };
}

// ---------------------------------------------------------------------------
// Counts and validation
// ---------------------------------------------------------------------------

/** User-visible counts. Never includes Generated content (it isn't in a Doc). */
export function counts(doc: Doc): { blocks: number; explored: number; links: number } {
  const blocks = Object.values(doc.blocks);
  const links = Object.values(doc.links);
  return {
    blocks: blocks.length + links.length,
    explored: blocks.filter((b) => b.lifecycle === "explored").length + links.filter((l) => l.lifecycle === "explored").length,
    links: links.length,
  };
}

/** Returns a list of invariant violations (empty = valid). */
export function validate(doc: Doc): string[] {
  const errs: string[] = [];
  const root = doc.blocks[doc.rootId];
  if (!root) return ["Missing root block"];
  if (root.parentId !== null) errs.push("Root must have no parent");
  if (root.lifecycle !== "inked") errs.push("Root must be inked");
  const seenChild = new Map<string, string>();
  for (const c of [...Object.values(doc.blocks), ...Object.values(doc.links)]) {
    for (const ch of c.childIds) {
      if (!doc.blocks[ch]) errs.push(`${c.id} lists missing child ${ch}`);
      else if (doc.blocks[ch].parentId !== c.id) errs.push(`${ch} parent mismatch`);
      if (seenChild.has(ch)) errs.push(`${ch} listed under two parents`);
      seenChild.set(ch, c.id);
    }
  }
  for (const b of Object.values(doc.blocks)) {
    if (b.id === doc.rootId) continue;
    if (!b.parentId || !getContainer(doc, b.parentId)) errs.push(`${b.id} has a missing parent`);
    else if (!seenChild.has(b.id)) errs.push(`${b.id} is not listed by its parent`);
    if (b.lifecycle === "inked" && b.parentId && getContainer(doc, b.parentId)?.lifecycle !== "inked")
      errs.push(`${b.id} is inked under an un-inked parent`);
    if (b.lifecycle !== "inked" && b.lifecycle !== "explored") errs.push(`${b.id} has invalid lifecycle`);
  }
  // Reachability (no cycles / orphans).
  const reach = new Set<string>(treeOrder(doc));
  for (const l of Object.values(doc.links)) for (const d of descendants(doc, l.id)) reach.add(d);
  for (const id of Object.keys(doc.blocks)) if (!reach.has(id)) errs.push(`${id} is unreachable`);
  for (const l of Object.values(doc.links)) {
    if (l.endpoints.length !== 2) errs.push(`${l.id} must have two endpoints`);
    for (const e of l.endpoints) {
      if (!doc.blocks[e]) errs.push(`${l.id} points to missing block ${e}`);
    }
    if (l.lifecycle === "inked" && !l.endpoints.every((e) => doc.blocks[e]?.lifecycle === "inked"))
      errs.push(`${l.id} is inked but an endpoint isn't`);
  }
  return errs;
}
