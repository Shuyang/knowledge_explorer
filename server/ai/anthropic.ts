import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { BlockDraft, OutlineDraft } from "../../shared/model.ts";
import type { GenContext, Snippet } from "../../shared/context.ts";
import { AIError, type AIProvider } from "./types.ts";
import { SYSTEM_PROMPT, blockPrompt, outlinePrompt, relationPrompt, rewritePrompt } from "./prompts.ts";

const BlockZ = z.object({
  title: z.string(),
  body: z.string(),
  suggestions: z.array(z.string()),
});

const OutlineZ = z.object({
  title: z.string(),
  intro: z.string(),
  sections: z.array(BlockZ),
  suggestions: z.array(z.string()),
});

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(
    readonly model = process.env.KE_MODEL ?? "claude-opus-5-5",
    private effort: Effort = (process.env.KE_EFFORT as Effort) ?? "low",
  ) {
    this.client = new Anthropic();
  }

  private async generate<T>(schema: z.ZodType<T>, prompt: string): Promise<T> {
    try {
      const res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        // Server-side fallback: if a safety classifier declines, the API retries on a recommended model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: this.effort, format: betaZodOutputFormat(schema) },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });
      if (res.stop_reason === "refusal") throw new AIError("The model declined this request", false);
      if (res.stop_reason === "max_tokens") throw new AIError("The answer was cut off");
      if (!res.parsed_output) throw new AIError("The model returned an unreadable answer");
      return res.parsed_output as T;
    } catch (err) {
      if (err instanceof AIError) throw err;
      if (err instanceof Anthropic.AuthenticationError) throw new AIError("The Anthropic API key was rejected", false);
      if (err instanceof Anthropic.RateLimitError) throw new AIError("Rate limited by the AI service; try again shortly");
      if (err instanceof Anthropic.BadRequestError) throw new AIError(`AI request rejected: ${err.message}`, false);
      if (err instanceof Anthropic.APIConnectionError) throw new AIError("Couldn't reach the AI service (are you offline?)");
      if (err instanceof Anthropic.APIError) throw new AIError(`AI service error (${err.status ?? "unknown"})`);
      throw new AIError(err instanceof Error ? err.message : "Unknown AI error");
    }
  }

  outline(topic: string): Promise<OutlineDraft> {
    return this.generate(OutlineZ, outlinePrompt(topic));
  }

  block(ctx: GenContext, request: string): Promise<BlockDraft> {
    return this.generate(BlockZ, blockPrompt(ctx, request));
  }

  relation(ctx: GenContext, question: string): Promise<BlockDraft> {
    return this.generate(BlockZ, relationPrompt(ctx, question));
  }

  rewrite(ctx: GenContext, current: Snippet): Promise<BlockDraft> {
    return this.generate(BlockZ, rewritePrompt(ctx, current));
  }
}
