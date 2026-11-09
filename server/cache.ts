import { mkdir, readFile, rm, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { BlockDraft } from "../shared/model.ts";
import { subtopicKey } from "../shared/context.ts";

/**
 * The Generated cache. Content here has been produced by the AI but never
 * shown to the user. It lives outside of documents entirely, so it cannot
 * overwrite Explored/Inked content, cannot leak into counts, and can be
 * evicted at any time without losing user work (PRD §5.5, §6).
 *
 * Entries are keyed by (document, parent block, requested subtopic). Taking
 * an entry removes it: once shown, the content belongs to the document.
 */
interface Entry {
  parentId: string;
  key: string;
  draft: BlockDraft;
  createdAt: number;
}

interface Job {
  docId: string;
  parentId: string;
  key: string;
  run: () => Promise<BlockDraft>;
  state: "queued" | "running";
  done: Promise<void>;
  resolve: () => void;
}

export interface CacheOptions {
  ttlMs?: number;
  maxPerDoc?: number;
  concurrency?: number;
}

export class GeneratedCache {
  private entries = new Map<string, Entry[]>();
  private loaded = new Set<string>();
  private epochs = new Map<string, number>();
  private jobs = new Map<string, Job>();
  private queue: Job[] = [];
  private running = 0;
  private ttlMs: number;
  private maxPerDoc: number;
  private concurrency: number;
  /** Count of AI calls made for prefetching (useful for diagnostics/tests). */
  prefetchCalls = 0;

  constructor(
    private dir: string,
    opts: CacheOptions = {},
  ) {
    this.ttlMs = opts.ttlMs ?? 14 * 24 * 3600 * 1000;
    this.maxPerDoc = opts.maxPerDoc ?? 80;
    this.concurrency = opts.concurrency ?? 2;
  }

  async init() {
    await mkdir(join(this.dir, "cache"), { recursive: true });
  }

  private file(docId: string) {
    return join(this.dir, "cache", `${docId}.json`);
  }

  private async load(docId: string): Promise<Entry[]> {
    if (!this.loaded.has(docId)) {
      this.loaded.add(docId);
      try {
        const data = JSON.parse(await readFile(this.file(docId), "utf8")) as Entry[];
        this.entries.set(docId, data);
      } catch {
        this.entries.set(docId, []);
      }
    }
    const now = Date.now();
    const list = (this.entries.get(docId) ?? []).filter((e) => now - e.createdAt < this.ttlMs);
    this.entries.set(docId, list);
    return list;
  }

  private async save(docId: string) {
    const list = this.entries.get(docId) ?? [];
    const tmp = `${this.file(docId)}.${Date.now()}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(list));
      await rename(tmp, this.file(docId));
    } catch {
      // The cache is disposable; failing to persist it is not an error for the user.
    }
  }

  private jobKey(docId: string, parentId: string, key: string) {
    return `${docId}|${parentId}|${key}`;
  }

  private epoch(docId: string, parentId: string) {
    return this.epochs.get(`${docId}|${parentId}`) ?? 0;
  }

  /**
   * Removes and returns a prepared block, if there is one. If the same block
   * is currently being prepared, waits for it instead of generating twice;
   * if it is still only queued, it is cancelled so the caller generates now.
   */
  async take(docId: string, parentId: string, subtopic: string): Promise<BlockDraft | null> {
    const key = subtopicKey(subtopic);
    const jk = this.jobKey(docId, parentId, key);
    const job = this.jobs.get(jk);
    if (job?.state === "queued") {
      this.queue = this.queue.filter((j) => j !== job);
      this.jobs.delete(jk);
      job.resolve();
    } else if (job?.state === "running") {
      await job.done;
    }
    const list = await this.load(docId);
    const idx = list.findIndex((e) => e.parentId === parentId && e.key === key);
    if (idx < 0) return null;
    const [entry] = list.splice(idx, 1);
    await this.save(docId);
    return entry.draft;
  }

  async has(docId: string, parentId: string, subtopic: string): Promise<boolean> {
    const key = subtopicKey(subtopic);
    return (await this.load(docId)).some((e) => e.parentId === parentId && e.key === key);
  }

  async size(docId: string): Promise<number> {
    return (await this.load(docId)).length;
  }

  /** Queue background generation of a block that stays invisible until requested. */
  prefetch(docId: string, parentId: string, subtopic: string, run: () => Promise<BlockDraft>) {
    const key = subtopicKey(subtopic);
    const jk = this.jobKey(docId, parentId, key);
    if (this.jobs.has(jk)) return;
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const job: Job = { docId, parentId, key, run, state: "queued", done, resolve };
    this.jobs.set(jk, job);
    this.queue.push(job);
    this.pump();
  }

  private pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      job.state = "running";
      this.running++;
      void this.execute(job);
    }
  }

  private async execute(job: Job) {
    const jk = this.jobKey(job.docId, job.parentId, job.key);
    const startEpoch = this.epoch(job.docId, job.parentId);
    try {
      const list = await this.load(job.docId);
      if (!list.some((e) => e.parentId === job.parentId && e.key === job.key)) {
        this.prefetchCalls++;
        const draft = await job.run();
        // Context changed while generating (edit/delete): discard the stale candidate.
        if (this.epoch(job.docId, job.parentId) === startEpoch && this.loaded.has(job.docId)) {
          const current = await this.load(job.docId);
          current.push({ parentId: job.parentId, key: job.key, draft, createdAt: Date.now() });
          while (current.length > this.maxPerDoc) current.shift();
          await this.save(job.docId);
        }
      }
    } catch {
      // Prefetch failures are silent: the user simply gets an on-demand generation later.
    } finally {
      this.jobs.delete(jk);
      this.running--;
      job.resolve();
      this.pump();
    }
  }

  /** Drop unseen candidates whose context changed (parent edited, deleted, moved). */
  async invalidate(docId: string, parentIds: string[]) {
    const set = new Set(parentIds);
    for (const p of parentIds) this.epochs.set(`${docId}|${p}`, this.epoch(docId, p) + 1);
    this.queue = this.queue.filter((j) => {
      if (j.docId === docId && set.has(j.parentId)) {
        this.jobs.delete(this.jobKey(j.docId, j.parentId, j.key));
        j.resolve();
        return false;
      }
      return true;
    });
    const list = await this.load(docId);
    const kept = list.filter((e) => !set.has(e.parentId));
    if (kept.length !== list.length) {
      this.entries.set(docId, kept);
      await this.save(docId);
    }
  }

  async clearDoc(docId: string) {
    this.queue = this.queue.filter((j) => {
      if (j.docId !== docId) return true;
      this.jobs.delete(this.jobKey(j.docId, j.parentId, j.key));
      j.resolve();
      return false;
    });
    // Running jobs finish, but their results are discarded.
    for (const j of this.jobs.values())
      if (j.docId === docId) this.epochs.set(`${docId}|${j.parentId}`, this.epoch(docId, j.parentId) + 1);
    this.entries.set(docId, []);
    this.loaded.add(docId);
    await rm(this.file(docId), { force: true });
  }

  async clearAll() {
    const ids = new Set([...this.entries.keys()]);
    for (const id of ids) await this.clearDoc(id);
    await rm(join(this.dir, "cache"), { recursive: true, force: true });
    await mkdir(join(this.dir, "cache"), { recursive: true });
    this.entries.clear();
    this.loaded.clear();
  }

  /** Resolves when no prefetch work is queued or running (tests). */
  async idle() {
    while (this.jobs.size) await Promise.all([...this.jobs.values()].map((j) => j.done));
  }
}
