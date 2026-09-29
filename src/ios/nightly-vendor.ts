import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `morpheus ios nightly-core write|check <file>` — vendor the shared nightly
 * admission core into an app.
 *
 * The core runs from a pinned copy in the app's host runtime on the Mac mini,
 * where no `node_modules` is reachable, so it is copied rather than imported.
 * A copy drifts silently unless it says what it is: the header records a
 * digest of the exact module, `check` tells a hand edit from an upgrade, and
 * refreshing is one command rather than a diff someone has to reconstruct.
 */

const MARK = "// morpheus-nightly-core sha256:";

export function digest(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function vendored(body: string): string {
  return `${MARK}${digest(body)}\n` +
    "// Vendored from morpheus-kit src/ios/nightly-core.ts. Do not edit by hand;\n" +
    "// refresh with `morpheus ios nightly-core write <this file>`.\n" + body;
}

/** The compiled core beside this module. Only an installed or built Morpheus has it. */
export function coreSource(moduleUrl: string = import.meta.url): string {
  const path = resolve(dirname(fileURLToPath(moduleUrl)), "nightly-core.js");
  if (!existsSync(path)) {
    throw new Error(`The compiled nightly core is missing (looked in ${path}). Run from an installed morpheus-kit, or build this checkout first.`);
  }
  // The source map stays behind, so its pointer would dangle in the copy.
  return readFileSync(path, "utf8").replace(/\n\/\/# sourceMappingURL=\S+\s*$/, "\n");
}

export type CheckResult = "current" | "outdated" | "edited" | "not-vendored";

/** Whether a vendored file is intact, and whether it is this Morpheus's core. */
export function check(text: string, current: string): CheckResult {
  const [first, , , ...rest] = text.split("\n");
  if (!first?.startsWith(MARK)) return "not-vendored";
  const body = rest.join("\n");
  if (digest(body) !== first.slice(MARK.length)) return "edited";
  return body === current ? "current" : "outdated";
}

export function run(action: string | undefined, file: string | undefined, source: () => string = coreSource): number {
  if ((action !== "write" && action !== "check") || !file) {
    console.error("Usage: morpheus ios nightly-core write|check <file>");
    return 1;
  }
  const current = source();
  if (action === "write") {
    writeFileSync(file, vendored(current));
    console.log(`Wrote the nightly core to ${file} (sha256 ${digest(current)}).`);
    return 0;
  }
  if (!existsSync(file)) { console.error(`${file} does not exist.`); return 1; }
  const result = check(readFileSync(file, "utf8"), current);
  const messages: Record<CheckResult, string> = {
    current: `${file} is this Morpheus's nightly core.`,
    outdated: `${file} is an intact, older nightly core; refresh it with \`morpheus ios nightly-core write ${file}\`.`,
    edited: `${file} was edited by hand; its body no longer matches its recorded digest.`,
    "not-vendored": `${file} is not a vendored nightly core.`,
  };
  (result === "current" ? console.log : console.error)(messages[result]);
  return result === "current" ? 0 : 1;
}
