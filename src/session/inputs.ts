import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ABSENT, CANONICAL_INPUTS, UNREADABLE, type ContextInput } from "./lease.js";

export function fingerprint(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Fingerprint canonical inputs on disk. This is the only producer of the
 * fingerprints a receipt stores and an observation compares, so both sides of
 * the comparison are computed the same way by construction.
 *
 * A file that cannot be read gets a sentinel rather than being skipped or
 * throwing. Skipping would make an absent record indistinguishable from an
 * unchanged one, and a freshness check is the wrong place to abort with a raw
 * filesystem error — one bad record must not take the whole check down.
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
