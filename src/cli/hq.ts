import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderFirestoreRules, renderRoleHelpers, updateRoleHelpers } from "../hq/rules.js";

const RULES = "firestore.rules";

/**
 * Write or refresh the generated role helpers in `firestore.rules`.
 *
 * `--check` writes nothing and fails when the block is stale, which is the
 * form CI needs. Drift here is the dangerous kind: the claim writer and the
 * data gate disagreeing means a role that grants nothing, or worse, a role
 * removed from the vocabulary that a rule still honours.
 */
export async function rules(repoRoot: string, check: boolean): Promise<number> {
  const path = join(repoRoot, RULES);
  const existing = await readFile(path, "utf8").catch(() => null);

  if (existing === null) {
    if (check) {
      console.error(`No ${RULES} here. Run \`morpheus hq rules\` to create it.`);
      return 1;
    }
    await writeFile(path, renderFirestoreRules(), "utf8");
    console.log(`Wrote ${RULES}`);
    console.log("Review the match blocks — the role helpers are generated, the policy is yours.");
    return 0;
  }

  const update = updateRoleHelpers(existing);
  if (!update) {
    // Reported rather than injected at a guessed position: see rules.ts.
    console.error(
      `${RULES} has no \`morpheus:begin roles\` block, so there is nothing to refresh.\n` +
        "Paste the generated helpers in yourself, inside the `match /databases/...` scope:\n\n" +
        "  morpheus hq rules --print\n",
    );
    return 1;
  }

  if (!update.changed) {
    console.log(`${RULES} is current.`);
    return 0;
  }

  if (check) {
    console.error(
      `${RULES} role helpers are stale — the vocabulary has changed since they were generated.\n` +
        "Run `morpheus hq rules` and commit the result.",
    );
    return 1;
  }

  await writeFile(path, update.content, "utf8");
  console.log(`Refreshed the role helpers in ${RULES}`);
  return 0;
}

/** Print the generated block, for pasting into rules that have no markers. */
export function printRules(): number {
  console.log(renderRoleHelpers());
  return 0;
}
