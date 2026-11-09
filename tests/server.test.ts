import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.ts";
import { DemoProvider } from "../server/ai/demo.ts";
import { contextFor } from "../shared/context.ts";
import type { Doc } from "../shared/model.ts";
import { addChild, editContent, ink, inkChain } from "../shared/ops.ts";

let dir: string;
let provider: DemoProvider;
let ctx: Awaited<ReturnType<typeof createApp>>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ke-test-"));
  provider = new DemoProvider({ delayMs: 5 });
  ctx = await createApp({ dataDir: dir, provider, prefetchPerSection: 1, prefetchPerBlock: 2 });
});

afterEach(async () => {
  await ctx.cache.idle();
  await rm(dir, { recursive: true, force: true });
});

async function newDoc(): Promise<Doc> {
  const res = await request(ctx.app).post("/api/docs").send({ topic: "ML Loss Functions" }).expect(201);
  return res.body as Doc;
}

describe("server", () => {
  it("creates an outline; prefetched content stays invisible (AC1, AC2)", async () => {
    const doc = await newDoc();
    await ctx.cache.idle();
    const sections = doc.blocks[doc.rootId].childIds;
    expect(await ctx.cache.size(doc.id)).toBe(sections.length);
    // The saved document only contains what was shown.
    const saved = (await request(ctx.app).get(`/api/docs/${doc.id}`).expect(200)).body as Doc;
    expect(Object.keys(saved.blocks)).toHaveLength(sections.length + 1);
    const list = (await request(ctx.app).get("/api/docs").expect(200)).body;
    expect(list[0].blocks).toBe(sections.length + 1);
  });

  it("explore reveals one block from cache without a new LLM call (AC3, AC4)", async () => {
    const doc = await newDoc();
    await ctx.cache.idle();
    const sid = doc.blocks[doc.rootId].childIds[0];
    const label = doc.blocks[sid].suggestions[0];
    const foreground = () => provider.calls - ctx.cache.prefetchCalls;
    const callsBefore = foreground();
    const res = await request(ctx.app)
      .post(`/api/docs/${doc.id}/explore`)
      .send({ parentId: sid, subtopic: label, newBlockId: "new-1", context: contextFor(doc, sid) })
      .expect(200);
    expect(res.body.fromCache).toBe(true);
    await ctx.cache.idle();
    expect(foreground()).toBe(callsBefore); // no call for the revealed block
    expect(ctx.cache.prefetchCalls).toBeGreaterThan(0); // its children are being prepared invisibly
    // A second, different exploration is generated on demand.
    const res2 = await request(ctx.app)
      .post(`/api/docs/${doc.id}/explore`)
      .send({ parentId: sid, subtopic: "Something new", newBlockId: "new-2", context: contextFor(doc, sid) })
      .expect(200);
    expect(res2.body.fromCache).toBe(false);
  });

  it("edits invalidate unseen candidates and never get overwritten (AC5)", async () => {
    let doc = await newDoc();
    await ctx.cache.idle();
    const sid = doc.blocks[doc.rootId].childIds[0];
    doc = editContent(doc, sid, { body: "My own words" });
    await request(ctx.app).put(`/api/docs/${doc.id}`).send(doc).expect(200);
    await request(ctx.app).post(`/api/docs/${doc.id}/cache/invalidate`).send({ parentIds: [sid] }).expect(200);
    expect(await ctx.cache.has(doc.id, sid, doc.blocks[sid].suggestions[0])).toBe(false);
    await ctx.cache.idle();
    const saved = (await request(ctx.app).get(`/api/docs/${doc.id}`)).body as Doc;
    expect(saved.blocks[sid].body).toBe("My own words");
  });

  it("refuses to save documents that break ink order", async () => {
    const doc = await newDoc();
    const bad = structuredClone(doc);
    const sid = bad.blocks[bad.rootId].childIds[0];
    const withChild = addChild(bad, sid, { title: "x", body: "y" }, { id: "kid" });
    withChild.blocks.kid.lifecycle = "inked"; // parent still explored
    await request(ctx.app).put(`/api/docs/${doc.id}`).send(withChild).expect(422);
  });

  it("persists inked content across cache clean-up and app restart (AC12)", async () => {
    let doc = await newDoc();
    const sid = doc.blocks[doc.rootId].childIds[1];
    doc = ink(doc, inkChain(doc, sid));
    await request(ctx.app).put(`/api/docs/${doc.id}`).send(doc).expect(200);
    await ctx.cache.idle();
    await request(ctx.app).delete("/api/cache").expect(200);
    const again = await createApp({ dataDir: dir, provider });
    const saved = (await request(again.app).get(`/api/docs/${doc.id}`).expect(200)).body as Doc;
    expect(saved.blocks[sid].lifecycle).toBe("inked");
    expect(await again.cache.size(doc.id)).toBe(0);
  });

  it("reports AI failures without changing anything", async () => {
    const doc = await newDoc();
    await ctx.cache.idle();
    provider.failNext = true;
    const sid = doc.blocks[doc.rootId].childIds[0];
    await request(ctx.app)
      .post(`/api/docs/${doc.id}/explore`)
      .send({ parentId: sid, subtopic: "Not cached", newBlockId: "n", context: contextFor(doc, sid) })
      .expect(502);
    const saved = (await request(ctx.app).get(`/api/docs/${doc.id}`)).body as Doc;
    expect(saved).toEqual(doc);
  });
});
