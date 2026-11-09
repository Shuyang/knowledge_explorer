import type { BlockDraft, OutlineDraft } from "../../shared/model.ts";
import type { GenContext, Snippet } from "../../shared/context.ts";

/**
 * The AI service boundary. Providers return plain drafts; nothing about a
 * provider's response schema leaks into the knowledge model (PRD §6, §11.14).
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** A concise top-level map of a topic. */
  outline(topic: string): Promise<OutlineDraft>;
  /** Exactly one new block beneath the context's target, about `request`. */
  block(ctx: GenContext, request: string): Promise<BlockDraft>;
  /** One block explaining how the two endpoints in ctx.relation relate. */
  relation(ctx: GenContext, question: string): Promise<BlockDraft>;
  /** A fresh version of an existing block (explicit user request only). */
  rewrite(ctx: GenContext, current: Snippet): Promise<BlockDraft>;
}

export class AIError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}
