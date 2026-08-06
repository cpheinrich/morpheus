import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { TEAM_RESERVED } from "../paths.js";
import { parseInboxFile } from "../inbox/parse.js";

/** Validate every inbox in a directory. Returns an exit code. */
export async function validate(dir: string): Promise<number> {
  const read = async (d: string) =>
    (await readdir(d)).filter((f) => f.endsWith(".md") && !TEAM_RESERVED.has(f.toLowerCase()));

  // A `hq/inbox` fallback lived here through the migration window, because
  // Morpheus moves first by design while the workflows pin `@main` — so for a
  // few hours both layouts were live and a missing directory was not an error.
  // Every repo in the registry has moved, so a missing one is an error again.
  let files: string[];
  try {
    files = await read(dir);
  } catch {
    console.error(`No inbox directory at ${dir}`);
    return 1;
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
