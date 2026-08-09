import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { scaffold } from "../init/index.js";
import { readRegistry, suggestPrefix } from "../registry/index.js";
import * as registry from "./registry.js";
import { status as initStatus } from "./onboarding.js";
const exec = promisify(execFile);
/** The GitHub handle to name the inbox after. */
async function githubHandle(cwd) {
    try {
        const { stdout } = await exec("gh", ["api", "user", "--jq", ".login"], { cwd });
        return stdout.trim() || null;
    }
    catch {
        return null;
    }
}
/**
 * Scaffold the repository, then show what is left.
 *
 * Ends in `init status` rather than a wall of "next steps" prose: the
 * checklist is the durable version of that list, and printing a second copy
 * that cannot be ticked would be the thing this command exists to replace.
 */
export async function init(opts) {
    const name = opts.name ?? basename(opts.root);
    const kind = opts.kind ?? "personal";
    if (kind !== "company" && kind !== "personal" && kind !== "internal") {
        console.error(`Unknown kind "${kind}". Use company, personal or internal.`);
        return 1;
    }
    const taken = new Set((await readRegistry()).projects.map((p) => p.prefix));
    const prefix = (opts.prefix ?? suggestPrefix(name, taken)).toUpperCase();
    if (!/^[A-Z]{2,4}$/.test(prefix)) {
        console.error(`Prefix "${prefix}" must be 2-4 letters.`);
        return 1;
    }
    const owner = opts.owner ?? (await githubHandle(opts.root));
    if (!owner) {
        console.error("Could not determine a GitHub handle for the inbox.\n" +
            "Pass --owner <handle>, or authenticate with `gh auth login`.");
        return 1;
    }
    const { written, skipped, notes } = await scaffold(opts.root, { name, prefix, kind, owner });
    console.log(`\n\x1b[1m${name}\x1b[0m \x1b[2m· ${kind} · ids ${prefix}-001\x1b[0m`);
    if (written.length) {
        console.log(`\n\x1b[32mCreated ${written.length} file(s)\x1b[0m`);
        for (const f of written)
            console.log(`  ${f}`);
    }
    if (skipped.length) {
        console.log(`\n\x1b[2mLeft ${skipped.length} existing file(s) untouched:\x1b[0m`);
        for (const f of skipped)
            console.log(`  \x1b[2m${f}\x1b[0m`);
    }
    if (!written.length && !skipped.length) {
        console.log("\nNothing to do.");
    }
    for (const n of notes)
        console.log(`\n\x1b[2m${n}\x1b[0m`);
    // Registering here rather than asking: the prefix is already decided, and a
    // collision is far cheaper to find now than after ids exist.
    //
    // A failure here is reported, not swallowed. The usual cause is a prefix
    // another project already holds, which is precisely the thing registration
    // exists to catch — hiding it would defeat the point.
    const registered = await registry.add(opts.root, prefix);
    if (registered !== 0) {
        console.error("\n\x1b[33mThe files are written, but registration failed.\x1b[0m\n" +
            "\x1b[2mIds work regardless; the registry is what catches a prefix two projects\n" +
            "share. Re-run with a different \x1b[0m--prefix\x1b[2m, then \x1b[0mmorpheus registry add\x1b[2m.\x1b[0m");
    }
    return initStatus(opts.root, name);
}
//# sourceMappingURL=init.js.map