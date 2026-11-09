import { describe, expect, it } from "vitest";
import type { Doc } from "../shared/model.ts";
import {
  addChild,
  cleanup,
  counts,
  createDoc,
  createLink,
  deleteBlock,
  deleteImpact,
  editContent,
  ink,
  inkChain,
  moveBlock,
  moveChain,
  validate,
} from "../shared/ops.ts";
import { fromJSON, toJSON, toMarkdown } from "../shared/export.ts";

function lossDoc() {
  let doc = createDoc({
    title: "ML Loss Functions",
    intro: "A loss function turns error into a number.",
    suggestions: [],
    sections: [
      { title: "Regression losses", body: "Numerical error.", suggestions: ["MSE"] },
      { title: "Ranking losses", body: "Relative ordering.", suggestions: ["Pairwise loss"] },
      { title: "Representation learning losses", body: "Embeddings.", suggestions: ["Contrastive learning"] },
    ],
  });
  const [reg, rank, rep] = doc.blocks[doc.rootId].childIds;
  doc = addChild(doc, rep, { title: "Contrastive learning", body: "Pulls positives together." }, { id: "contrastive" });
  doc = addChild(doc, "contrastive", { title: "InfoNCE", body: "Pick the positive." }, { id: "infonce" });
  doc = addChild(doc, "infonce", { title: "Formula", body: "$$L=-\\log p$$" }, { id: "formula" });
  doc = addChild(doc, "infonce", { title: "Temperature τ", body: "Sharpens." }, { id: "temp" });
  doc = addChild(doc, rank, { title: "Pairwise loss", body: "Pairs." }, { id: "pairwise" });
  return { doc, reg, rank, rep };
}

const life = (d: Doc, id: string) => (d.blocks[id] ?? d.links[id]).lifecycle;

describe("outline creation (AC1)", () => {
  it("root is inked, displayed sections are explored", () => {
    const { doc, reg } = lossDoc();
    expect(life(doc, doc.rootId)).toBe("inked");
    expect(life(doc, reg)).toBe("explored");
    expect(validate(doc)).toEqual([]);
  });
});

describe("exploring adds one explored block", () => {
  it("adds exactly one block, explored, even under an inked parent (AC3, AC8)", () => {
    const { doc, reg } = lossDoc();
    const inked = ink(doc, [reg]);
    const before = Object.keys(inked.blocks).length;
    const after = addChild(inked, reg, { title: "MSE", body: "Squared error." }, { id: "mse" });
    expect(Object.keys(after.blocks).length).toBe(before + 1);
    expect(life(after, "mse")).toBe("explored");
    expect(after.blocks[reg].suggestions).not.toContain("MSE");
  });
});

describe("inking", () => {
  it("inks a single block under an inked parent only (AC6)", () => {
    const { doc, reg } = lossDoc();
    let d = addChild(doc, reg, { title: "MSE", body: "x" }, { id: "mse" });
    expect(inkChain(d, reg)).toEqual([reg]);
    d = ink(d, [reg]);
    expect(life(d, reg)).toBe("inked");
    expect(life(d, "mse")).toBe("explored");
  });

  it("refuses to ink under an un-inked parent unless the chain is passed (AC7)", () => {
    const { doc, rep } = lossDoc();
    expect(() => ink(doc, ["formula"])).toThrow();
    const chain = inkChain(doc, "formula");
    expect(chain).toEqual([rep, "contrastive", "infonce", "formula"]);
    const d = ink(doc, chain);
    expect(chain.every((id) => life(d, id) === "inked")).toBe(true);
    expect(life(d, "temp")).toBe("explored"); // sibling untouched
    expect(validate(d)).toEqual([]);
  });

  it("side link needs both ends inked; inking it doesn't touch endpoints and vice versa (AC9, AC10)", () => {
    const { doc, rank, rep } = lossDoc();
    let d = createLink(doc, "pairwise", "contrastive", { title: "How are they different?", body: "…" }, { id: "L" });
    expect(life(d, "L")).toBe("explored");
    expect(() => ink(d, ["L"])).toThrow();
    expect(inkChain(d, "L")).toEqual([rank, "pairwise", rep, "contrastive", "L"]);
    // Inking endpoints does not ink the link.
    d = ink(d, [rank, "pairwise", rep, "contrastive"]);
    expect(life(d, "L")).toBe("explored");
    d = editContent(d, "L", { body: "Edited relation" });
    expect(life(d, "pairwise")).toBe("inked");
    expect(d.links.L.edited).toBe(true);
    d = ink(d, ["L"]);
    expect(life(d, "L")).toBe("inked");
    expect(validate(d)).toEqual([]);
  });

  it("blocks inside a relation need the relation (and its ends) inked", () => {
    const { doc } = lossDoc();
    let d = createLink(doc, "pairwise", "contrastive", { title: "Q", body: "…" }, { id: "L" });
    d = addChild(d, "L", { title: "Training-example setup", body: "…" }, { id: "LC" });
    const chain = inkChain(d, "LC");
    expect(chain.slice(-2)).toEqual(["L", "LC"]);
    expect(validate(ink(d, chain))).toEqual([]);
  });
});

describe("editing", () => {
  it("edits keep lifecycle and mark edited", () => {
    const { doc } = lossDoc();
    const d = editContent(doc, "formula", { body: "$$L_i$$" });
    expect(d.blocks.formula.edited).toBe(true);
    expect(life(d, "formula")).toBe("explored");
  });
});

describe("moving", () => {
  it("moving an inked block under an explored parent requires the new parent chain (AC7)", () => {
    const { doc, reg, rep } = lossDoc();
    let d = ink(doc, [reg]);
    d = addChild(d, reg, { title: "MSE", body: "x" }, { id: "mse" });
    d = ink(d, ["mse"]);
    expect(moveChain(d, "mse", "infonce")).toEqual([rep, "contrastive", "infonce"]);
    expect(() => moveBlock(d, "mse", "infonce")).toThrow();
    // Declined: nothing changed.
    expect(d.blocks.mse.parentId).toBe(reg);
    const moved = moveBlock(d, "mse", "infonce", undefined, moveChain(d, "mse", "infonce"));
    expect(moved.blocks.mse.parentId).toBe("infonce");
    expect(life(moved, "infonce")).toBe("inked");
    expect(validate(moved)).toEqual([]);
  });

  it("explored blocks move freely; can't move into own subtree", () => {
    const { doc, reg } = lossDoc();
    const d = moveBlock(doc, "infonce", reg);
    expect(d.blocks[reg].childIds).toContain("infonce");
    expect(() => moveBlock(doc, "contrastive", "formula")).toThrow();
    expect(validate(d)).toEqual([]);
  });
});

describe("deleting", () => {
  it("move-up keeps children; relation notes kept under the other end (no dangling link)", () => {
    const { doc } = lossDoc();
    let d = createLink(doc, "pairwise", "infonce", { title: "Rel", body: "Relation notes" }, { id: "L" });
    const impact = deleteImpact(d, "infonce");
    expect(impact.childCount).toBe(2);
    expect(impact.directLinks).toHaveLength(1);
    d = deleteBlock(d, "infonce", { children: "moveUp", links: "keepAsBlock" });
    expect(d.blocks.infonce).toBeUndefined();
    expect(d.blocks.formula.parentId).toBe("contrastive");
    expect(d.links.L).toBeUndefined();
    const kept = d.blocks.pairwise.childIds.map((c) => d.blocks[c]).find((b) => b.title === "Rel");
    expect(kept?.body).toContain("Relation notes");
    expect(validate(d)).toEqual([]);
  });

  it("delete-all removes subtree and relations touching it", () => {
    const { doc } = lossDoc();
    let d = createLink(doc, "pairwise", "formula", { title: "Rel", body: "x" }, { id: "L" });
    d = deleteBlock(d, "contrastive", { children: "delete", links: "delete" });
    expect(d.blocks.formula).toBeUndefined();
    expect(Object.keys(d.links)).toHaveLength(0);
    expect(validate(d)).toEqual([]);
  });

  it("cleanup removes explored drafts and never inked content", () => {
    const { doc, rep } = lossDoc();
    const d = cleanup(ink(doc, inkChain(doc, "formula")));
    expect(d.blocks.formula).toBeDefined();
    expect(d.blocks[rep]).toBeDefined();
    expect(d.blocks.temp).toBeUndefined();
    expect(d.blocks.pairwise).toBeUndefined();
    expect(counts(d).explored).toBe(0);
    expect(validate(d)).toEqual([]);
  });
});

describe("export (AC13)", () => {
  it("JSON keeps hierarchy, links and lifecycle, and round-trips", () => {
    const { doc, rank, rep } = lossDoc();
    let d = createLink(doc, "pairwise", "contrastive", { title: "How are they different?", body: "Rel body" }, { id: "L" });
    d = ink(d, [rank, "pairwise", rep, "contrastive", "L"]);
    const all = toJSON(d, "all");
    expect(all.document.links[0].endpoints).toEqual(["pairwise", "contrastive"]);
    expect(all.document.blocks.find((b) => b.id === "temp")?.lifecycle).toBe("explored");
    const back = fromJSON(JSON.parse(JSON.stringify(all)));
    expect(back.id).not.toBe(d.id);
    expect(Object.keys(back.blocks).sort()).toEqual(Object.keys(d.blocks).sort());
    const inkedOnly = toJSON(d, "inked");
    expect(inkedOnly.document.blocks.every((b) => b.lifecycle === "inked")).toBe(true);
    expect(inkedOnly.document.links).toHaveLength(1);
    expect(validate(fromJSON(JSON.parse(JSON.stringify(inkedOnly))))).toEqual([]);
  });

  it("Markdown lists inked notes and relations under Related concepts", () => {
    const { doc, rank, rep } = lossDoc();
    let d = createLink(doc, "pairwise", "contrastive", { title: "How are they different?", body: "Rel body" }, { id: "L" });
    d = ink(d, [rank, "pairwise", rep, "contrastive", "L"]);
    const md = toMarkdown(d, { scope: "inked", relationsAtEnd: true, latex: true });
    expect(md).toContain("# ML Loss Functions");
    expect(md).toContain("### Pairwise loss");
    expect(md).not.toContain("Temperature");
    expect(md).toContain("## Related concepts");
    expect(md).toContain("### Pairwise loss ↔ Contrastive learning");
    const plain = toMarkdown(d, { scope: "all", relationsAtEnd: false, latex: false });
    expect(plain).toContain("_(draft)_");
    expect(plain).not.toContain("$$");
  });
});
