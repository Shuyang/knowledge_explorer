import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.ts";
import { DemoProvider } from "../server/ai/demo.ts";
import type { Doc } from "../shared/model.ts";
import { addChild, ink } from "../shared/ops.ts";

let dir: string;
let md: string;
let ctx: Awaited<ReturnType<typeof createApp>>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ke-mirror-"));
  md = join(dir, "notes");
  ctx = await createApp({ dataDir: join(dir, "data"), provider: new DemoProvider({ delayMs: 1 }), markdownDir: md, mirrorDelayMs: 0, prefetchPerSection: 0, prefetchPerBlock: 0 });
});

afterEach(async () => {
  await ctx.mirror!.idle();
  await ctx.cache.idle();
  await rm(dir, { recursive: true, force: true });
});

const newDoc = async (topic: string) => (await request(ctx.app).post("/api/docs").send({ topic }).expect(201)).body as Doc;
const save = (doc: Doc) => request(ctx.app).put(`/api/docs/${doc.id}`).send(doc).expect(200);
const files = async () => (await readdir(md)).sort();
const read = (name: string) => readFile(join(md, name), "utf8");
const section = (doc: Doc, i = 0) => doc.blocks[doc.rootId].childIds[i];

describe("markdown mirror", () => {
  it("publishes only topics with inked notes, plus a README index", async () => {
    let doc = await newDoc("Ranking Losses");
    await ctx.mirror!.idle();
    expect(await files()).toEqual([".knowledge-explorer.json", "README.md"]);
    expect(await read("README.md")).toContain("_No notes yet._");

    doc = ink(doc, [section(doc)]);
    await save(doc);
    await ctx.mirror!.idle();
    const name = (await files()).find((f) => f !== "README.md" && f.endsWith(".md"))!;
    expect(name).toMatch(/^[a-z0-9-]+\.md$/);
    const body = await read(name);
    expect(body).toContain(`## 1 ${doc.blocks[section(doc)].title}`);
    expect(body).not.toContain(doc.blocks[section(doc, 1)].title); // still a draft
    expect(await read("README.md")).toContain(`](${name}) | 1 |`);
  });

  it("leaves the file alone when only drafts change", async () => {
    let doc = await newDoc("Ranking Losses");
    doc = ink(doc, [section(doc)]);
    await save(doc);
    await ctx.mirror!.idle();
    const name = (await files()).find((f) => f !== "README.md" && f.endsWith(".md"))!;
    const before = await read(name);
    await new Promise((r) => setTimeout(r, 5));
    doc = addChild(doc, section(doc, 1), { title: "A draft", body: "x", suggestions: [] });
    await save(doc);
    await ctx.mirror!.idle();
    expect(await read(name)).toBe(before);
  });

  it("removes a deleted topic's file, and never touches files it didn't write", async () => {
    await (await import("node:fs/promises")).mkdir(md, { recursive: true });
    await writeFile(join(md, "README.md"), "mine\n");
    await writeFile(join(md, "keep.md"), "mine\n");
    const a = await newDoc("Same Title");
    const b = await newDoc("Same Title");
    await save(ink(a, [section(a)]));
    await save(ink(b, [section(b)]));
    await ctx.mirror!.idle();
    const topicFiles = (await files()).filter((f) => !["README.md", "keep.md"].includes(f) && f.endsWith(".md"));
    expect(topicFiles).toHaveLength(2);
    expect(topicFiles.some((f) => f.endsWith("-2.md"))).toBe(true);
    expect(await read("README.md")).toBe("mine\n");

    await request(ctx.app).delete(`/api/docs/${b.id}`).expect(200);
    await ctx.mirror!.idle();
    expect((await files()).filter((f) => f.endsWith("-2.md"))).toEqual([]);
    expect(await read("keep.md")).toBe("mine\n");
  });
});
