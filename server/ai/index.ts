import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AnthropicProvider } from "./anthropic.ts";
import { DemoProvider } from "./demo.ts";
import type { AIProvider } from "./types.ts";

/** True if the Anthropic SDK can find credentials (env var or an `ant auth login` profile). */
function hasAnthropicCredentials(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  if (process.env.ANTHROPIC_PROFILE) return true;
  return existsSync(join(homedir(), ".config", "anthropic"));
}

/** `profile` returns the current learner profile text (see server/profile.ts). */
export function createProvider(profile: () => Promise<string>): AIProvider {
  const choice = process.env.KE_PROVIDER;
  if (choice === "demo") return new DemoProvider();
  if (choice === "anthropic" || hasAnthropicCredentials()) return new AnthropicProvider(profile);
  return new DemoProvider();
}

export type { AIProvider } from "./types.ts";
