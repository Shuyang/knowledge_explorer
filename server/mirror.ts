import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Doc } from "../shared/model.ts";
import { docTitle } from "../shared/model.ts";
import { slug, toMarkdown } from "../shared/export.ts";
import type { DocStore } from "./store.ts";

/** Records which files the mirror wrote, so it never deletes or overwrites anything else in the folder. */
const MANIFEST = ".knowledge-explorer.json";
const README = "README.md";

/** True if anything besides the root has been inked: drafts-only topics aren't published. */
function hasNotes(doc: Doc): boolean {
  return (
    Object.values(doc.blocks).some((b) => b.id !== doc.rootId && b.lifecycle === "inked") ||
    Object.values(doc.links).some((l) => l.lifecycle === "inked")
  );
}

/** When the published content last changed: the newest inked item, so draft-only edits don't touch the file. */
function notesUpdatedAt(doc: Doc): string {
  let t = "";
  for (const x of [...Object.values(doc.blocks), ...Object.values(doc.links)]) {
    if (x.lifecycle === "inked" && x.updatedAt > t) t = x.updatedAt;
  }
  return t || doc.updatedAt;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Keeps a folder (e.g. a git repo) in sync with the inked notes, as one
 * Markdown file per topic plus a README.md index. Writes are debounced and
 * serialised; each run rebuilds the folder from the stored docs, so it is
 * always consistent with them. Committing and pushing are left to the user.
 */
export class MarkdownMirror {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> = Promise.resolve();

  constructor(
    readonly dir: string,
    private store: DocStore,
    private delayMs = 1000,
  ) {}

  /** Ask for a sync soon; bursts of saves (typing) collapse into one run. */
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.runNow(), this.delayMs);
  }

  private runNow() {
    this.timer = undefined;
    this.running = this.running
      .then(() => this.sync())
      .catch((err) => console.error(`Markdown mirror failed: ${(err as Error).message}`));
    return this.running;
  }

  /** Runs any scheduled sync immediately and waits for it (tests, shutdown). */
  async idle() {
    if (this.timer) {
      clearTimeout(this.timer);
      await this.runNow();
    }
    await this.running;
  }

  async sync() {
    await mkdir(this.dir, { recursive: true });
    const owned = new Set(await this.readManifest());
    const isFree = (name: string) => owned.has(name) || !existsSync(join(this.dir, name));

    const docs: Doc[] = [];
    for (const { id } of await this.store.list()) {
      const doc = await this.store.get(id);
      if (doc && hasNotes(doc)) docs.push(doc);
    }
    // Oldest first, so a later topic with the same title gets the suffix and existing names stay put.
    docs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const written = new Set<string>();
    const entries: { title: string; file: string; blocks: number; updated: string }[] = [];
    for (const doc of docs) {
      const base = slug(docTitle(doc)) || "topic";
      let file = `${base}.md`;
      for (let n = 2; written.has(file) || file.toLowerCase() === "readme.md" || !isFree(file); n++) file = `${base}-${n}.md`;
      const updated = notesUpdatedAt(doc);
      await this.writeIfChanged(file, toMarkdown(doc, { scope: "inked", relationsAtEnd: true, latex: true, githubMath: true }, new Date(updated)));
      written.add(file);
      const blocks = Object.values(doc.blocks).filter((b) => b.id !== doc.rootId && b.lifecycle === "inked").length;
      entries.push({ title: docTitle(doc), file, blocks, updated });
    }

    if (isFree(README)) {
      await this.writeIfChanged(README, readme(entries));
      written.add(README);
    } else {
      console.warn(`Markdown mirror: ${join(this.dir, README)} wasn't written by Knowledge Explorer; leaving it alone.`);
    }

    for (const name of owned) {
      if (!written.has(name)) await rm(join(this.dir, name), { force: true });
    }
    await this.writeIfChanged(MANIFEST, JSON.stringify({ files: [...written].sort() }, null, 2) + "\n");
  }

  private async readManifest(): Promise<string[]> {
    try {
      const files = JSON.parse(await readFile(join(this.dir, MANIFEST), "utf8")).files;
      // Plain file names only: never follow a path out of the folder.
      return Array.isArray(files) ? files.filter((f: unknown) => typeof f === "string" && /^[^/\\]+\.md$/.test(f)) : [];
    } catch {
      return [];
    }
  }

  private async writeIfChanged(name: string, content: string) {
    const path = join(this.dir, name);
    try {
      if ((await readFile(path, "utf8")) === content) return;
    } catch {
      // Missing: write it.
    }
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, content);
    await rename(tmp, path);
  }
}

function readme(entries: { title: string; file: string; blocks: number; updated: string }[]): string {
  const cell = (s: string) => s.replace(/\|/g, "\\|");
  const rows = [...entries].sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title));
  const out = ["# Notes", "", "<!-- Generated by Knowledge Explorer; edits here will be overwritten. -->", ""];
  if (!rows.length) out.push("_No notes yet._");
  else {
    out.push("| Topic | Blocks | Updated |", "|---|---:|---|");
    for (const e of rows) out.push(`| [${cell(e.title)}](${encodeURI(e.file)}) | ${e.blocks} | ${fmtDate(e.updated)} |`);
  }
  return out.join("\n") + "\n";
}
