import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parseDir } from "../pm/parse.js";
import { validateMeetingNoteBody } from "../team/note-structure.js";
import { DiscoveryNote } from "./schema.js";
function normalizedRemote(remote) {
    const trimmed = remote.trim().replace(/\.git$/, "");
    const https = trimmed.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/);
    if (https)
        return https[1];
    const ssh = trimmed.match(/^git@github\.com:([\w.-]+\/[\w.-]+)$/);
    return ssh?.[1] ?? null;
}
/** Read immutable Git objects; uncommitted files never acquire a committed source label. */
export async function readCanonicalRecords(source, ref, config) {
    if (!/^[\w./-]+$/.test(ref) || ref.startsWith("-") || ref.includes("..")) {
        throw new Error("Invalid revision");
    }
    const git = (...args) => execFileSync("git", ["-C", source, ...args], {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
    });
    const remote = normalizedRemote(git("remote", "get-url", "origin"));
    if (remote !== config.canonical.repository) {
        throw new Error("Source repository does not match configuration");
    }
    const revision = git("rev-parse", "--verify", `${ref}^{commit}`).trim();
    const directory = await mkdtemp(join(tmpdir(), "meeting-intake-"));
    try {
        const raws = new Map();
        const prefix = `${config.canonical.directory}/`;
        for (const line of git("ls-tree", "-rz", revision, "--", config.canonical.directory)
            .split("\0")
            .filter(Boolean)) {
            const tab = line.indexOf("\t");
            const entry = line.slice(0, tab);
            const path = line.slice(tab + 1);
            if (!path.endsWith(".md") || /\/readme\.md$/i.test(path))
                continue;
            const filename = path.slice(prefix.length);
            if (tab < 0 ||
                !entry.startsWith("100644 blob ") ||
                !path.startsWith(prefix) ||
                !/^[\w.-]+\.md$/.test(filename)) {
                throw new Error(`Unexpected meeting path/type: ${path}`);
            }
            const raw = git("show", `${revision}:${path}`);
            raws.set(filename, { raw, path });
            await writeFile(join(directory, filename), raw);
        }
        const parsed = await parseDir(directory, DiscoveryNote);
        const issues = [...parsed.issues];
        for (const item of parsed.items) {
            for (const message of validateMeetingNoteBody(item.data, item.body)) {
                issues.push({ path: item.path, message });
            }
        }
        if (issues.length > 0)
            throw new Error(JSON.stringify(issues));
        if (parsed.items.length === 0) {
            throw new Error("No canonical meeting records found; refusing empty overwrite");
        }
        return {
            revision,
            records: parsed.items.map((item) => ({
                ...raws.get(basename(item.path)),
                data: item.data,
            })),
        };
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
}
//# sourceMappingURL=git.js.map