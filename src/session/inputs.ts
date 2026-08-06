import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
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
      const path = join(root, id);
      try {
        return { id, fingerprint: fingerprint(await readFile(path, "utf8")) };
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          return { id, fingerprint: UNREADABLE };
        }
        // `readFile` follows symlinks, so a dangling one also reports ENOENT —
        // and `CLAUDE.md` is a symlink in this repo. `lstat` sees the link
        // itself: if it is there, the record exists and cannot be read, which
        // is a different thing from a record that was never created.
        return { id, fingerprint: (await lstat(path).catch(() => null)) ? UNREADABLE : ABSENT };
      }
    }),
  );
}
