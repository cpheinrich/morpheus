import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ProjectManifest, resolveEntries } from "../access/schema.js";
import { syncAccess } from "../access/sync.js";

const MARK: Record<string, string> = {
  granted: "+",
  unchanged: " ",
  pending: "?",
  revoked: "-",
};

/** Apply morpheus.json's allowlist to Firebase custom claims. */
export async function sync(
  repoRoot: string,
  project: string | undefined,
  dryRun: boolean,
): Promise<number> {
  let manifest;
  try {
    manifest = ProjectManifest.parse(
      JSON.parse(await readFile(join(repoRoot, "morpheus.json"), "utf8")),
    );
  } catch (err) {
    console.error(`Could not read morpheus.json: ${err instanceof Error ? err.message : err}`);
    return 1;
  }

  const target = project ?? manifest.accounts?.["firebase"] ?? manifest.accounts?.["gcpProject"];
  if (!target) {
    console.error(
      "No Firebase project. Pass --project, or set accounts.firebase in morpheus.json.",
    );
    return 1;
  }

  const entries = resolveEntries(manifest.hq);
  if (entries.length === 0) {
    console.error("The allowlist is empty — nobody would be able to reach /hq.");
    return 1;
  }

  console.log(`${dryRun ? "Would sync" : "Syncing"} ${entries.length} entries to ${target}\n`);

  const results = await syncAccess({ project: target, entries, dryRun });
  for (const r of results) {
    console.log(
      `${MARK[r.outcome] ?? " "} ${r.email.padEnd(30)} ${(r.role ?? "—").padEnd(10)} ${r.outcome}` +
        (r.detail ? `  (${r.detail})` : ""),
    );
  }

  const pending = results.filter((r) => r.outcome === "pending").length;
  if (pending) {
    console.log(
      `\n${pending} user(s) have not signed in yet. Their claim applies the next time this runs.`,
    );
  }
  return 0;
}
