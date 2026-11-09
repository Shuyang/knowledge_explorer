import { describe, expect, it } from "vitest";
import { addChild, createDoc, createLink } from "../shared/ops.ts";
import { contextFor, outlineWithChild } from "../shared/context.ts";
import { blockPrompt } from "../server/ai/prompts.ts";

function doc() {
  let d = createDoc({
    title: "Loss functions",
    intro: "Intro.",
    suggestions: [],
    sections: [
      { title: "Regression losses", body: "MSE and friends.", suggestions: ["MSE"] },
      { title: "Contrastive losses", body: "Pull positives together.", suggestions: ["InfoNCE"] },
    ],
  });
  const [reg, con] = d.blocks[d.rootId].childIds;
  d = addChild(d, reg, { title: "Mean squared error", body: "SECRET BODY TEXT", suggestions: [] }, { id: "mse" });
  d = createLink(d, "mse", con, { title: "Both are distances", body: "", suggestions: [] });
  return { d, reg, con };
}

describe("page outline in generation context", () => {
  it("lists every tree title in order, marks the target, and lists relations", () => {
    const { d, con } = doc();
    const o = contextFor(d, con).outline!;
    expect(o.lines.map((l) => [l.depth, l.title])).toEqual([
      [0, "Loss functions"],
      [1, "Regression losses"],
      [2, "Mean squared error"],
      [1, "Contrastive losses"],
    ]);
    expect(o.lines.filter((l) => l.here).map((l) => l.title)).toEqual(["Contrastive losses"]);
    expect(o.relations).toEqual(["Mean squared error ↔ Contrastive losses: Both are distances"]);
  });

  it("sends titles but not bodies from outside the path", () => {
    const { d, con } = doc();
    const p = blockPrompt(contextFor(d, con), "InfoNCE");
    expect(p).toContain("Whole page outline");
    expect(p).toContain("- Mean squared error");
    expect(p).toContain("Contrastive losses   <-- the new block goes beneath this");
    expect(p).not.toContain("SECRET BODY TEXT");
  });

  it("moves the marker onto a new child for prefetch", () => {
    const { d, reg } = doc();
    const o = outlineWithChild(contextFor(d, reg).outline, "Huber loss")!;
    expect(o.lines.map((l) => `${l.depth}:${l.title}${l.here ? "*" : ""}`)).toEqual([
      "0:Loss functions",
      "1:Regression losses",
      "2:Mean squared error",
      "2:Huber loss*",
      "1:Contrastive losses",
    ]);
  });
});
