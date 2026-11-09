import type { BlockDraft, Doc } from "../shared/model.ts";
import type { GenContext, Snippet } from "../shared/context.ts";

export interface DocSummary {
  id: string;
  title: string;
  blocks: number;
  explored: number;
  updatedAt: string;
}

export interface Settings {
  alwaysInkChain?: boolean;
  alwaysInkMoveChain?: boolean;
  tipDismissed?: boolean;
  hideExplored?: boolean;
  /** Sidebar width in px, set by dragging its right edge. */
  sidebarWidth?: number;
}

export class ApiError extends Error {}

async function call<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    });
  } catch {
    throw new ApiError("Can't reach the local server. Is it running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  status: () => call<{ provider: string; model: string }>("GET", "/api/status"),
  settings: () => call<Settings>("GET", "/api/settings"),
  saveSettings: (s: Settings) => call<Settings>("PUT", "/api/settings", s),
  listDocs: () => call<DocSummary[]>("GET", "/api/docs"),
  createDoc: (topic: string) => call<Doc>("POST", "/api/docs", { topic }),
  importDoc: (json: unknown) => call<Doc>("POST", "/api/docs/import", json),
  getDoc: (id: string) => call<Doc>("GET", `/api/docs/${id}`),
  saveDoc: (doc: Doc, keepalive = false) => call<{ ok: true }>("PUT", `/api/docs/${doc.id}`, doc, { keepalive }),
  deleteDoc: (id: string) => call<{ ok: true }>("DELETE", `/api/docs/${id}`),
  explore: (docId: string, body: { parentId: string; subtopic: string; newBlockId: string; context: GenContext }) =>
    call<{ draft: BlockDraft; fromCache: boolean }>("POST", `/api/docs/${docId}/explore`, body),
  relate: (docId: string, body: { linkId: string; question: string; context: GenContext }) =>
    call<{ draft: BlockDraft }>("POST", `/api/docs/${docId}/relate`, body),
  rewrite: (docId: string, body: { context: GenContext; current: Snippet }) =>
    call<{ draft: BlockDraft }>("POST", `/api/docs/${docId}/rewrite`, body),
  invalidate: (docId: string, parentIds: string[]) =>
    call<{ ok: true }>("POST", `/api/docs/${docId}/cache/invalidate`, { parentIds }).catch(() => undefined),
};
