import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseInboxFile } from "../inbox/parse.js";

/** Validate every inbox in a directory. Returns an exit code. */
export async function validate(dir: string): Promise<number> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter(
      (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md",
    );
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
