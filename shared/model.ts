/**
 * Core knowledge model.
 *
 * Two orthogonal dimensions (PRD §1):
 *   - Structure: tree blocks (parent/children) and side links (two endpoints).
 *   - Lifecycle: Generated (never in a Doc — lives only in the server-side cache),
 *                Explored (visible), Inked (accepted into durable notes).
 *
 * A Doc only ever contains content the user has seen, so every Block/SideLink
 * here is at least Explored. "Generated" exists only as cache entries on the
 * server (see server/cache.ts) and never appears in this model.
 *
 * Nothing here depends on an AI provider or on a particular UI.
 */

export type Lifecycle = "explored" | "inked";

export const SCHEMA_VERSION = 1;

/** Content shared by blocks and side links. Body is Markdown with $…$ / $$…$$ math. */
export interface Content {
  title: string;
  body: string;
}

export interface Block extends Content {
  id: string;
  /** null only for the root. Otherwise a block id or a side-link id (blocks that belong to a relation). */
  parentId: string | null;
  childIds: string[];
  lifecycle: Lifecycle;
  /** True once the user has changed the content by hand. */
  edited: boolean;
  /** Suggested next subtopics to explore beneath this block (labels only, not content). */
  suggestions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SideLink extends Content {
  id: string;
  /** MVP: exactly two tree-block ids. Stored as an array so more endpoints can be supported later. */
  endpoints: string[];
  childIds: string[];
  lifecycle: Lifecycle;
  edited: boolean;
  suggestions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DocUI {
  collapsed: string[];
  lastViewedId?: string;
}

export interface Doc {
  schemaVersion: number;
  id: string;
  rootId: string;
  blocks: Record<string, Block>;
  links: Record<string, SideLink>;
  ui: DocUI;
  createdAt: string;
  updatedAt: string;
}

/** What the AI (or the user) supplies for a new block. */
export interface BlockDraft extends Content {
  suggestions?: string[];
}

export interface OutlineDraft {
  title: string;
  intro: string;
  suggestions: string[];
  sections: BlockDraft[];
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function docTitle(doc: Doc): string {
  return doc.blocks[doc.rootId]?.title ?? "Untitled";
}

/** A container is anything that can hold child blocks: a block or a side link. */
export function getContainer(doc: Doc, id: string): Block | SideLink | undefined {
  return doc.blocks[id] ?? doc.links[id];
}

export function isLink(doc: Doc, id: string): boolean {
  return id in doc.links;
}
