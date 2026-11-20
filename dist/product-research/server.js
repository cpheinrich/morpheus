import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { parseAppResearchStudy, ProductResearchValidationError, STUDY_FILE, } from "./index.js";
export { fetchAppeekySnapshot } from "./appeeky.js";
/**
 * Validate a study directory for an offline, repeatable import: `study.json` parses, and the
 * directory holds exactly the files its asset inventory names — no symlinks, nothing extra or
 * missing, each with the recorded byte count and SHA-256. A directory that passes can be uploaded
 * object-for-object and served to the viewer without further checks on the server.
 */
export async function validateStudyDirectory(directory) {
    const issues = [];
    const requested = path.resolve(directory);
    try {
        const stats = await lstat(requested);
        if (!stats.isDirectory())
            return { study: null, issues: [{ path: directory, message: "is not a real directory" }] };
    }
    catch {
        return { study: null, issues: [{ path: directory, message: "does not exist" }] };
    }
    const root = await realpath(requested);
    const files = await inventory(root, "", issues);
    const study = files.has(STUDY_FILE) ? await readStudy(root, issues) : null;
    if (!files.has(STUDY_FILE))
        issues.push({ path: STUDY_FILE, message: "is missing" });
    if (!study)
        return { study: null, issues };
    files.delete(STUDY_FILE);
    for (const [assetPath, asset] of Object.entries(study.assets)) {
        if (!files.delete(assetPath))
            issues.push({ path: assetPath, message: "is in assets but not in the directory" });
        else
            await checkAsset(root, assetPath, asset, issues);
    }
    for (const extra of [...files].sort())
        issues.push({ path: extra, message: "is not listed in assets" });
    return { study: issues.length ? null : study, issues };
}
async function readStudy(root, issues) {
    try {
        return parseAppResearchStudy(JSON.parse(await readFile(path.join(root, STUDY_FILE), "utf8")));
    }
    catch (error) {
        if (!(error instanceof ProductResearchValidationError)) {
            issues.push({ path: STUDY_FILE, message: "is not valid JSON" });
            return null;
        }
        issues.push(...error.issues.map((issue) => ({ path: `${STUDY_FILE}:${issue.path}`, message: issue.message })));
        return null;
    }
}
async function checkAsset(root, assetPath, asset, issues) {
    const bytes = await readFile(path.join(root, ...assetPath.split("/")));
    if (bytes.byteLength !== asset.bytes) {
        issues.push({ path: assetPath, message: `has ${bytes.byteLength} bytes; assets records ${asset.bytes}` });
    }
    else if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
        issues.push({ path: assetPath, message: "SHA-256 does not match assets" });
    }
}
/** Regular files under `root`, as POSIX relative paths. Symlinks and special files are issues. */
async function inventory(root, prefix, issues) {
    const files = new Set();
    const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink())
            issues.push({ path: relative, message: "is a symlink" });
        else if (entry.isDirectory())
            for (const file of await inventory(root, relative, issues))
                files.add(file);
        else if (entry.isFile())
            files.add(relative);
        else
            issues.push({ path: relative, message: "is not a regular file" });
    }
    return files;
}
//# sourceMappingURL=server.js.map