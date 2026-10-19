import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { invariant } from "./state.js";
/** Hashes alone are assertions. Verify the downloaded bytes before committing evidence. */
export async function validatePayloadFiles(evidence, evidencePath) {
    const root = await realpath(dirname(resolve(evidencePath)));
    invariant(Array.isArray(evidence.artifacts) && evidence.artifacts.length > 0, "Full-test evidence lacks actual payload files");
    for (const artifact of evidence.artifacts) {
        invariant(!artifact.name.startsWith("/") && !artifact.name.split("/").includes(".."), "Test payload name escapes evidence artifact");
        const path = await realpath(resolve(root, artifact.path ?? artifact.name));
        invariant(path.startsWith(root + sep) && (await stat(path)).isFile(), "Test payload must be a sibling regular file inside the artifact");
        invariant(createHash("sha256").update(await readFile(path)).digest("hex") === artifact.sha256, `Test artifact hash mismatch: ${artifact.name}`);
    }
}
//# sourceMappingURL=evidence.js.map