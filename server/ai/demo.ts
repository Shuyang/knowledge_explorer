import type { BlockDraft, OutlineDraft } from "../../shared/model.ts";
import type { GenContext, Snippet } from "../../shared/context.ts";
import { AIError, type AIProvider } from "./types.ts";

/**
 * Offline demo provider: used when no Anthropic credentials are configured,
 * and in tests. Produces clearly-labelled placeholder text so the whole app
 * (exploring, inking, relations, export) can be tried without network access.
 */
export class DemoProvider implements AIProvider {
  readonly name = "demo";
  readonly model = "offline-demo";
  calls = 0;
  delayMs: number;
  failNext = false;

  constructor(opts: { delayMs?: number } = {}) {
    this.delayMs = opts.delayMs ?? 400;
  }

  private async tick() {
    this.calls++;
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failNext) {
      this.failNext = false;
      throw new AIError("Demo failure");
    }
  }

  async outline(topic: string): Promise<OutlineDraft> {
    await this.tick();
    const t = topic.trim();
    const names = ["Core ideas", "Key techniques", "How it's evaluated", "Trade-offs and pitfalls", "In practice"];
    return {
      title: t,
      intro: `Demo outline for **${t}**. Connect an Anthropic API key to get real content; this text only shows how the page grows.`,
      sections: names.map((n) => ({
        title: n,
        body: `What “${n.toLowerCase()}” covers within ${t}. (Demo text.)\n\n| Item | Formula | Key property |\n|---|---|---|\n| Example A | $a^2$ | Placeholder row |\n| Example B | $\\lvert b \\rvert$ | Placeholder row |\n| Example C | $\\log c$ | Placeholder row |`,
        suggestions: ["Example A", "Example B", "Example C"],
      })),
      suggestions: ["History", "Related fields"],
    };
  }

  async block(ctx: GenContext, request: string): Promise<BlockDraft> {
    await this.tick();
    const parent = ctx.path[ctx.path.length - 1]?.title ?? ctx.topic;
    const formula = /formula|equation|math/i.test(request);
    return {
      title: request.replace(/\?$/, "").slice(0, 60),
      body: formula
        ? `$$L = -\\log \\frac{e^{s^+/\\tau}}{\\sum_j e^{s_j/\\tau}}$$\n\nA placeholder formula under “${parent}”. (Demo text.)`
        : `A short placeholder paragraph about “${request}” beneath “${parent}”. Real content appears once an Anthropic API key is configured. (Demo text.)`,
      suggestions: ["Intuition", "A worked example", "Formula"],
    };
  }

  async relation(ctx: GenContext, question: string): Promise<BlockDraft> {
    await this.tick();
    const a = ctx.relation?.a.at(-1)?.title ?? "A";
    const b = ctx.relation?.b.at(-1)?.title ?? "B";
    return {
      title: `${a} vs ${b}`,
      body: `Placeholder answer to “${question}” for ${a} and ${b}: where they overlap and where they differ. (Demo text.)`,
      suggestions: ["When are they the same?", "A worked example"],
    };
  }

  async rewrite(_ctx: GenContext, current: Snippet): Promise<BlockDraft> {
    await this.tick();
    return {
      title: current.title,
      body: `A rewritten placeholder version of “${current.title}”. (Demo text.)`,
      suggestions: [],
    };
  }
}
