import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { learnerProfile } from "../server/profile.ts";
import { DEFAULT_LEARNER_PROFILE, buildSystemPrompt } from "../server/ai/prompts.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ke-profile-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("learner profile file", () => {
  it("is created from the default when missing", async () => {
    const p = await learnerProfile(dir);
    expect(p.path).toBe(join(dir, "learner_profile.md"));
    expect((await readFile(p.path, "utf8")).trim()).toBe(DEFAULT_LEARNER_PROFILE);
    expect(await p.read()).toBe(DEFAULT_LEARNER_PROFILE);
  });

  it("keeps an existing file and picks up edits without a restart", async () => {
    await writeFile(join(dir, "learner_profile.md"), "- Mine\n");
    const p = await learnerProfile(dir);
    expect(await p.read()).toBe("- Mine");
    await writeFile(p.path, "- Edited\n");
    expect(await p.read()).toBe("- Edited");
    expect(buildSystemPrompt(await p.read())).toContain("**Learner profile:**\n- Edited\n");
  });

  it("falls back to the default when the file is empty or gone", async () => {
    const p = await learnerProfile(dir);
    await writeFile(p.path, "  \n");
    expect(await p.read()).toBe(DEFAULT_LEARNER_PROFILE);
    await rm(p.path);
    expect(await p.read()).toBe(DEFAULT_LEARNER_PROFILE);
  });
});
