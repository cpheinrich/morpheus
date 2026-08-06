import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CANONICAL_INPUTS, type ContextInput } from "./lease.js";

/**
 * A file that does not exist gets a fingerprint rather than being skipped. A
 * deleted `.agent/decisions.md` is a change an agent must see; omitting the
 * entry would make the absent file indistinguishable from an unchanged one.
 */
export const ABSENT = "absent";

/**
 * A record that exists but could not be read — a permission change, a broken
 * symlink (`CLAUDE.md` is one in this repo), a directory where a file was.
 * A sentinel rather than a throw: a freshness check is the wrong place to
 * abort with a raw fs error, and an unreadable record is *exactly* the state
 * that should read as drift and make the agent go look.
 */
export const UNREADABLE = "unreadable";

export function fingerprint(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Fingerprint canonical inputs on disk. This is the only producer of the
 * fingerprints a receipt stores and an observation compares, so both sides of
 * the comparison are computed the same way by construction.
 */
export async function readInputs(
  root: string,
  ids: readonly string[] = CANONICAL_INPUTS,
): Promise<ContextInput[]> {
  return Promise.all(
    ids.map(async (id) => {
      try {
        return { id, fingerprint: fingerprint(await readFile(join(root, id), "utf8")) };
      } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException).code;
        return { id, fingerprint: code === "ENOENT" ? ABSENT : UNREADABLE };
      }
    }),
  );
}
