import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { addProject, readRegistry, removeProject, RegistryError, suggestPrefix, takenPrefixes, } from "../registry/index.js";
async function manifest(root) {
    try {
        return JSON.parse(await readFile(join(root, "morpheus.json"), "utf8"));
    }
    catch {
        return null;
    }
}
export async function list() {
    const reg = await readRegistry();
    if (reg.projects.length === 0) {
        console.log("No projects registered. Run `morpheus registry add` in a project.");
        return 0;
    }
    for (const p of reg.projects) {
        console.log(`${p.prefix.padEnd(5)} ${p.name.padEnd(14)} ${(p.kind ?? "").padEnd(9)} ${p.path}`);
    }
    return 0;
}
/** Register the project in cwd, deriving what it can from morpheus.json. */
export async function add(cwd, prefixArg) {
    const root = resolve(cwd);
    const m = await manifest(root);
    if (!m) {
        console.error("No morpheus.json here — registry entries describe Morpheus projects.");
        return 1;
    }
    const name = m.name ?? basename(root);
    const reg = await readRegistry();
    const prefix = prefixArg ?? m.prefix ?? suggestPrefix(name, takenPrefixes(reg));
    try {
        await addProject({ name, prefix, path: root, kind: m.kind ?? "personal", ...(m.org ? { org: m.org } : {}) });
    }
    catch (err) {
        console.error(err instanceof RegistryError ? err.message : String(err));
        return 1;
    }
    console.log(`Registered ${name} as ${prefix} — ${root}`);
    if (!m.prefix) {
        console.log(`\nAdd "prefix": "${prefix}" to morpheus.json. The registry is a local index;\n` +
            "the manifest is what travels with the repo and is authoritative.");
    }
    return 0;
}
export async function remove(name) {
    try {
        await removeProject(name);
    }
    catch (err) {
        console.error(err instanceof RegistryError ? err.message : String(err));
        return 1;
    }
    console.log(`Removed ${name}.`);
    return 0;
}
//# sourceMappingURL=registry.js.map