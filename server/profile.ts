import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_LEARNER_PROFILE } from "./ai/prompts.ts";

/**
 * The learner profile is a plain Markdown file in the data folder, so it is
 * personal (never in git) and editable in any text editor. It is created from
 * the generic default if missing, and re-read on every generation, so edits
 * take effect without restarting the server.
 */
export async function learnerProfile(dataDir: string) {
  const path = join(dataDir, "learner_profile.md");
  await mkdir(dataDir, { recursive: true });
  await writeFile(path, DEFAULT_LEARNER_PROFILE + "\n", { flag: "wx" }).catch((err) => {
    if (err.code !== "EEXIST") throw err;
  });
  const read = async () => {
    try {
      return (await readFile(path, "utf8")).trim() || DEFAULT_LEARNER_PROFILE;
    } catch {
      return DEFAULT_LEARNER_PROFILE;
    }
  };
  return { path, read };
}
