import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Doc } from "../shared/model.ts";
import { counts } from "../shared/ops.ts";
import { docTitle } from "../shared/model.ts";

/** Durable, local JSON-file storage for documents and settings. */
export class DocStore {
  private chains = new Map<string, Promise<unknown>>();

  constructor(private dir: string) {}

  private get docsDir() {
    return join(this.dir, "docs");
  }

  async init() {
    await mkdir(this.docsDir, { recursive: true });
  }

  private file(id: string) {
    if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error("Bad id");
    return join(this.docsDir, `${id}.json`);
  }

  /** Serialises writes per file and writes atomically (temp file + rename). */
  private write(path: string, data: unknown): Promise<void> {
    const prev = this.chains.get(path) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(tmp, JSON.stringify(data, null, 2));
        await rename(tmp, path);
      });
    this.chains.set(path, next);
    return next;
  }

  async list() {
    const files = (await readdir(this.docsDir)).filter((f) => f.endsWith(".json"));
    const out = [];
    for (const f of files) {
      try {
        const doc = JSON.parse(await readFile(join(this.docsDir, f), "utf8")) as Doc;
        const c = counts(doc);
        out.push({ id: doc.id, title: docTitle(doc), blocks: c.blocks, explored: c.explored, updatedAt: doc.updatedAt });
      } catch {
        // Skip unreadable files rather than failing the whole list.
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Doc | null> {
    try {
      return JSON.parse(await readFile(this.file(id), "utf8")) as Doc;
    } catch {
      return null;
    }
  }

  put(doc: Doc) {
    return this.write(this.file(doc.id), doc);
  }

  async delete(id: string) {
    await rm(this.file(id), { force: true });
  }

  async getSettings(): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await readFile(join(this.dir, "settings.json"), "utf8"));
    } catch {
      return {};
    }
  }

  async putSettings(s: Record<string, unknown>) {
    await this.write(join(this.dir, "settings.json"), s);
  }
}
