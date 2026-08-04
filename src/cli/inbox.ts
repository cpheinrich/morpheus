import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { LEGACY_INBOX_DIR, TEAM_RESERVED } from "../paths.js";
import { parseInboxFile } from "../inbox/parse.js";

/** Validate every inbox in a directory. Returns an exit code. */
export async function validate(dir: string): Promise<number> {
  const read = async (d: string) =>
    (await readdir(d)).filter((f) => f.endsWith(".md") && !TEAM_RESERVED.has(f.toLowerCase()));

  let files: string[];
  try {
    files = await read(dir);
  } catch {
    // Fall back to the pre-`hq/team/` layout rather than failing. Morpheus
    // migrates first by design and the workflows pin `@main`, so on merge every
    // repo that has not moved yet would otherwise go red on a directory that is
    // absent for the documented reason.
    const legacy = dir.replace(/hq\/team$/, LEGACY_INBOX_DIR);
    try {
      files = await read(legacy);
      console.log(`Using ${legacy} — this repo has not moved to hq/team/ yet.`);
      dir = legacy;
    } catch {
      console.error(`No inbox directory at ${dir}`);
      return 1;
    }
  }

  if (files.length === 0) {
    console.log("No inboxes found.");
    return 0;
  }

  let total = 0;
  for (const f of files.sort()) {
    const path = join(dir, f);
    const { items, issues, meta } = await parseInboxFile(path);
    const open = items.filter((i) => i.state === "open").length;

    if (issues.length) {
      console.error(`\n✗ ${f} — ${issues.length} issue(s)`);
      for (const i of issues) console.error(`    ${i.message}`);
      total += issues.length;
    } else {
      console.log(
        `✓ ${f} — ${items.length} item(s), ${open} open` +
          (meta.agents ? `  [${meta.agents.join(", ")}]` : ""),
      );
    }
  }

  if (total) {
    console.error(`\n${total} issue(s) found.`);
    return 1;
  }
  return 0;
}
