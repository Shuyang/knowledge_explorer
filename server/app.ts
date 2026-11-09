import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BlockDraft, Doc } from "../shared/model.ts";
import { type GenContext, MAX_OUTLINE_LINES, contextFor, outlineWithChild } from "../shared/context.ts";
import { createDoc, validate } from "../shared/ops.ts";
import { fromJSON } from "../shared/export.ts";
import { DocStore } from "./store.ts";
import { GeneratedCache, type CacheOptions } from "./cache.ts";
import { AIError, type AIProvider } from "./ai/types.ts";

export interface AppOptions {
  dataDir: string;
  provider: AIProvider;
  cache?: CacheOptions;
  /** How many suggestions to prepare in the background after each new block. */
  prefetchPerBlock?: number;
  /** How many suggestions to prepare per section when an outline is created. */
  prefetchPerSection?: number;
  staticDir?: string;
}

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function str(v: unknown, name: string, max = 2000): string {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `${name} is required`);
  if (v.length > max) throw new HttpError(400, `${name} is too long`);
  return v.trim();
}

function id(v: unknown, name: string): string {
  if (typeof v !== "string" || !ID_RE.test(v)) throw new HttpError(400, `${name} is invalid`);
  return v;
}

function ctx(v: unknown): GenContext {
  const c = v as GenContext;
  if (!c || typeof c.topic !== "string" || !Array.isArray(c.path) || !Array.isArray(c.existingChildren))
    throw new HttpError(400, "context is invalid");
  const o = c.outline;
  if (o !== undefined) {
    const ok =
      o && Array.isArray(o.lines) && Array.isArray(o.relations) &&
      o.lines.length <= MAX_OUTLINE_LINES && o.relations.length <= 100 &&
      o.lines.every((l) => l && typeof l.title === "string" && l.title.length <= 200 && Number.isInteger(l.depth) && l.depth >= 0) &&
      o.relations.every((r) => typeof r === "string" && r.length <= 500);
    if (!ok) throw new HttpError(400, "context.outline is invalid");
  }
  return c;
}

export async function createApp(opts: AppOptions) {
  const store = new DocStore(opts.dataDir);
  const cache = new GeneratedCache(opts.dataDir, opts.cache);
  await store.init();
  await cache.init();
  const ai = opts.provider;
  const perBlock = opts.prefetchPerBlock ?? 2;
  const perSection = opts.prefetchPerSection ?? 1;

  /** Prepare up to `n` of a new block's suggested children invisibly. */
  function prefetchChildren(docId: string, parentId: string, base: GenContext, draft: BlockDraft, n: number) {
    const childCtx: GenContext = {
      topic: base.topic,
      path: [...base.path, { title: draft.title, body: draft.body }],
      existingChildren: [],
      relation: base.relation,
      outline: outlineWithChild(base.outline, draft.title),
    };
    for (const s of (draft.suggestions ?? []).slice(0, n)) {
      cache.prefetch(docId, parentId, s, () => ai.block({ ...childCtx }, s));
    }
  }

  const app = express();
  app.use(express.json({ limit: "30mb" }));

  app.get("/api/status", (_req, res) => {
    res.json({ provider: ai.name, model: ai.model });
  });

  app.get(
    "/api/settings",
    wrap(async (_req, res) => res.json(await store.getSettings())),
  );
  app.put(
    "/api/settings",
    wrap(async (req, res) => {
      const s = { ...(await store.getSettings()), ...(req.body ?? {}) };
      await store.putSettings(s);
      res.json(s);
    }),
  );

  app.get(
    "/api/docs",
    wrap(async (_req, res) => res.json(await store.list())),
  );

  // Create a topic: a concise outline. Root inked, sections explored.
  app.post(
    "/api/docs",
    wrap(async (req, res) => {
      const topic = str(req.body?.topic, "topic", 300);
      const outline = await ai.outline(topic);
      if (!outline.sections?.length) throw new AIError("The outline came back empty");
      const doc = createDoc({ ...outline, title: outline.title?.trim() || topic, sections: outline.sections.slice(0, 8) });
      await store.put(doc);
      for (const sid of doc.blocks[doc.rootId].childIds) {
        const b = doc.blocks[sid];
        const c = contextFor(doc, sid);
        for (const s of b.suggestions.slice(0, perSection)) cache.prefetch(doc.id, sid, s, () => ai.block(c, s));
      }
      res.status(201).json(doc);
    }),
  );

  app.post(
    "/api/docs/import",
    wrap(async (req, res) => {
      let doc: Doc;
      try {
        doc = fromJSON(req.body);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      await store.put(doc);
      res.status(201).json(doc);
    }),
  );

  app.get(
    "/api/docs/:id",
    wrap(async (req, res) => {
      const doc = await store.get(id(req.params.id, "id"));
      if (!doc) throw new HttpError(404, "Not found");
      res.json(doc);
    }),
  );

  app.put(
    "/api/docs/:id",
    wrap(async (req, res) => {
      const docId = id(req.params.id, "id");
      const doc = req.body as Doc;
      if (!doc || doc.id !== docId) throw new HttpError(400, "Document id mismatch");
      const errs = validate(doc);
      if (errs.length) throw new HttpError(422, `Refusing to save an inconsistent document: ${errs[0]}`);
      await store.put(doc);
      res.json({ ok: true, updatedAt: doc.updatedAt });
    }),
  );

  app.delete(
    "/api/docs/:id",
    wrap(async (req, res) => {
      const docId = id(req.params.id, "id");
      await store.delete(docId);
      await cache.clearDoc(docId);
      res.json({ ok: true });
    }),
  );

  // Explore: reveal exactly one block. Cache first; generate only on a miss.
  app.post(
    "/api/docs/:id/explore",
    wrap(async (req, res) => {
      const docId = id(req.params.id, "id");
      const parentId = id(req.body?.parentId, "parentId");
      const newBlockId = id(req.body?.newBlockId, "newBlockId");
      const subtopic = str(req.body?.subtopic, "subtopic", 300);
      const c = ctx(req.body?.context);
      let draft = await cache.take(docId, parentId, subtopic);
      const fromCache = !!draft;
      if (!draft) draft = await ai.block(c, subtopic);
      prefetchChildren(docId, newBlockId, c, draft, perBlock);
      res.json({ draft, fromCache });
    }),
  );

  // Relate: one explanatory block for a new side link.
  app.post(
    "/api/docs/:id/relate",
    wrap(async (req, res) => {
      const docId = id(req.params.id, "id");
      const linkId = id(req.body?.linkId, "linkId");
      const question = str(req.body?.question, "question", 500);
      const c = ctx(req.body?.context);
      if (!c.relation) throw new HttpError(400, "context.relation is required");
      const draft = await ai.relation(c, question);
      prefetchChildren(docId, linkId, { ...c, path: [] }, draft, perBlock);
      res.json({ draft });
    }),
  );

  // Ask for a new version: returned for side-by-side comparison, never applied here.
  app.post(
    "/api/docs/:id/rewrite",
    wrap(async (req, res) => {
      id(req.params.id, "id");
      const c = ctx(req.body?.context);
      const current = req.body?.current;
      if (!current || typeof current.title !== "string" || typeof current.body !== "string")
        throw new HttpError(400, "current is required");
      const draft = await ai.rewrite(c, current);
      res.json({ draft });
    }),
  );

  // Context changed (edit/delete/move): unseen candidates under these parents are stale.
  app.post(
    "/api/docs/:id/cache/invalidate",
    wrap(async (req, res) => {
      const docId = id(req.params.id, "id");
      const ids = Array.isArray(req.body?.parentIds) ? req.body.parentIds.filter((x: unknown) => typeof x === "string") : [];
      await cache.invalidate(docId, ids);
      res.json({ ok: true });
    }),
  );

  app.delete(
    "/api/cache",
    wrap(async (_req, res) => {
      await cache.clearAll();
      res.json({ ok: true });
    }),
  );

  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(opts.staticDir!, "index.html")));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof AIError) return res.status(502).json({ error: err.message, retryable: err.retryable });
    if ((err as { type?: string })?.type === "entity.too.large")
      return res.status(413).json({ error: "That's too large to save (images over ~20 MB?)" });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on this device's server" });
  });

  return { app, store, cache };
}
