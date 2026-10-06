import { readFile } from "node:fs/promises";
import { join } from "node:path";
const isStrings = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.length > 0);
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
/** Validates `qa.ios`, reporting every problem rather than the first. */
export function parseIosPreviewConfig(raw, projectName = "Project") {
    const issues = [];
    const ios = record(record(raw)?.ios);
    if (!ios)
        return { ok: false, issues: ["morpheus.json has no qa.ios block; add one to describe this project's app."] };
    const text = (key, fallback) => {
        const v = ios[key];
        if (typeof v === "string" && v.length > 0)
            return v;
        if (v === undefined && fallback !== undefined)
            return fallback;
        issues.push(`qa.ios.${key} must be a non-empty string.`);
        return "";
    };
    const app = text("app");
    const product = text("product");
    const bundleId = text("bundleId");
    const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
    const derivedData = text("derivedData", `/private/tmp/${projectName.replace(/[^A-Za-z0-9]/g, "")}DerivedData-{key}`);
    const namespace = text("namespace", `morpheus.qa.${slug}`);
    const minimumXcode = text("minimumXcode", "26.0");
    if (minimumXcode && !/^\d+(\.\d+)?$/.test(minimumXcode))
        issues.push("qa.ios.minimumXcode must look like 26.5.");
    if (namespace && !/^[A-Za-z0-9.-]+$/.test(namespace))
        issues.push("qa.ios.namespace may hold letters, digits, dots and dashes only.");
    const build = ios.build;
    if (!isStrings(build))
        issues.push("qa.ios.build must be a non-empty array of strings (the build command).");
    const precheck = ios.precheck;
    if (precheck !== undefined && !isStrings(precheck))
        issues.push("qa.ios.precheck must be an array of strings when present.");
    const deviceRaw = record(ios.device) ?? {};
    const device = {
        name: typeof deviceRaw.name === "string" && deviceRaw.name ? deviceRaw.name : `${projectName} QA`,
        type: typeof deviceRaw.type === "string" && deviceRaw.type ? deviceRaw.type : "iPhone 17 Pro",
    };
    if (!/^[\w .-]+$/.test(device.name))
        issues.push("qa.ios.device.name may hold letters, digits, spaces, dots and dashes only.");
    const modes = {};
    const modesRaw = record(ios.modes);
    if (!modesRaw || Object.keys(modesRaw).length === 0) {
        issues.push("qa.ios.modes must declare at least one launch mode.");
    }
    else {
        const seenFlags = new Map();
        for (const [name, value] of Object.entries(modesRaw)) {
            const m = record(value);
            if (!/^[a-z][a-z0-9-]*$/.test(name) || !m) {
                issues.push(`qa.ios.modes.${name} must be an object named in lower-case.`);
                continue;
            }
            const args = m.args === undefined ? [] : m.args;
            if (!Array.isArray(args) || !args.every((a) => typeof a === "string"))
                issues.push(`qa.ios.modes.${name}.args must be an array of strings.`);
            const flags = m.flags === undefined ? [] : m.flags;
            if (!Array.isArray(flags) || !flags.every((f) => typeof f === "string" && /^--[a-z][a-z0-9-]*$/.test(f))) {
                issues.push(`qa.ios.modes.${name}.flags must be --long-flags.`);
            }
            else
                for (const f of flags) {
                    if (RESERVED_FLAGS.has(f))
                        issues.push(`qa.ios.modes.${name}.flags: ${f} is reserved by the preview command or the morpheus CLI.`);
                    else if (seenFlags.has(f))
                        issues.push(`qa.ios.modes: ${f} selects both ${seenFlags.get(f)} and ${name}.`);
                    else
                        seenFlags.set(f, name);
                }
            const summary = typeof m.summary === "string" && m.summary ? m.summary : `Mode: ${name}.`;
            let prepare;
            if (m.prepare !== undefined) {
                const p = record(m.prepare);
                if (!p || !isStrings(p.command))
                    issues.push(`qa.ios.modes.${name}.prepare.command must be an array of strings.`);
                else
                    prepare = { command: p.command, credentials: p.credentials === true };
            }
            modes[name] = { name, args: (Array.isArray(args) ? args : []), flags: (Array.isArray(flags) ? flags : []), summary, ...(prepare ? { prepare } : {}) };
        }
    }
    const defaultMode = typeof ios.defaultMode === "string" ? ios.defaultMode : Object.keys(modes)[0] ?? "";
    if (defaultMode && Object.keys(modes).length && !modes[defaultMode])
        issues.push(`qa.ios.defaultMode "${defaultMode}" is not a declared mode.`);
    if (issues.length)
        return { ok: false, issues };
    return {
        ok: true,
        config: {
            app, build: build, ...(precheck ? { precheck: precheck } : {}), product, derivedData,
            bundleId, device, namespace, minimumXcode, defaultMode, modes,
        },
    };
}
/** Flags the preview command owns, plus global flags the morpheus parser consumes first. */
export const RESERVED_FLAGS = new Set([
    "--port", "--ttl-minutes", "--no-build", "--ssh-host", "--root", "--mode", "--help",
    "--project", "--name", "--kind", "--source", "--json", "--check", "--print", "--dry-run", "--all",
]);
export async function loadIosPreviewConfig(root) {
    let manifest;
    try {
        manifest = JSON.parse(await readFile(join(root, "morpheus.json"), "utf8"));
    }
    catch (error) {
        return { ok: false, issues: [`Could not read ${join(root, "morpheus.json")}: ${error.message}`] };
    }
    const m = record(manifest);
    const name = typeof m?.name === "string" && m.name ? m.name : "Project";
    const display = name.charAt(0).toUpperCase() + name.slice(1);
    return parseIosPreviewConfig(m?.qa, display);
}
/** Expands `{key}` and `{root}`. */
export function expand(value, vars) {
    return value.replaceAll("{key}", vars.key).replaceAll("{root}", vars.root);
}
//# sourceMappingURL=config.js.map