import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { globalFlags } from "../../cli/args.js";
const isStrings = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.length > 0);
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
/** The app's identity and build locations, defaults filled in; a missing or empty required field is an issue. */
function appFields(ios, projectName, issues) {
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
    if (namespace && (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(namespace) || namespace.includes("..")))
        issues.push("qa.ios.namespace may hold letters, digits, single dots and dashes only.");
    return { app, product, bundleId, derivedData, namespace, minimumXcode };
}
function previewDevice(ios, projectName, issues) {
    const deviceRaw = record(ios.device) ?? {};
    const device = {
        name: typeof deviceRaw.name === "string" && deviceRaw.name ? deviceRaw.name : `${projectName} QA`,
        type: typeof deviceRaw.type === "string" && deviceRaw.type ? deviceRaw.type : "iPhone 17 Pro",
    };
    if (!/^[\w .-]+$/.test(device.name))
        issues.push("qa.ios.device.name may hold letters, digits, spaces, dots and dashes only.");
    return device;
}
/** Every declared launch mode, in order; a flag may select only one mode. */
function previewModes(ios, issues) {
    const modes = {};
    const modesRaw = record(ios.modes);
    if (!modesRaw || Object.keys(modesRaw).length === 0) {
        issues.push("qa.ios.modes must declare at least one launch mode.");
        return modes;
    }
    const seenFlags = new Map();
    for (const [name, value] of Object.entries(modesRaw)) {
        const m = record(value);
        if (!/^[a-z][a-z0-9-]*$/.test(name) || !m) {
            issues.push(`qa.ios.modes.${name} must be an object named in lower-case.`);
            continue;
        }
        modes[name] = previewMode(name, m, seenFlags, issues);
    }
    return modes;
}
function previewMode(name, m, seenFlags, issues) {
    const args = m.args === undefined ? [] : m.args;
    if (!Array.isArray(args) || !args.every((a) => typeof a === "string"))
        issues.push(`qa.ios.modes.${name}.args must be an array of strings.`);
    const flags = m.flags === undefined ? [] : m.flags;
    modeFlags(name, flags, seenFlags, issues);
    const summary = typeof m.summary === "string" && m.summary ? m.summary : `Mode: ${name}.`;
    const prepare = modePrepare(name, m.prepare, issues);
    modeIdentity(name, m, issues);
    return {
        name, args: (Array.isArray(args) ? args : []), flags: (Array.isArray(flags) ? flags : []), summary,
        ...(prepare ? { prepare } : {}),
        ...(isStrings(m.build) ? { build: m.build } : {}),
        ...(typeof m.product === "string" && m.product ? { product: m.product } : {}),
        ...(typeof m.bundleId === "string" && m.bundleId ? { bundleId: m.bundleId } : {}),
    };
}
function modePrepare(name, raw, issues) {
    if (raw === undefined)
        return undefined;
    const p = record(raw);
    if (!p || !isStrings(p.command)) {
        issues.push(`qa.ios.modes.${name}.prepare.command must be an array of strings.`);
        return undefined;
    }
    return { command: p.command, credentials: p.credentials === true };
}
function modeFlags(name, flags, seenFlags, issues) {
    if (!Array.isArray(flags) || !flags.every((f) => typeof f === "string" && /^--[a-z][a-z0-9-]*$/.test(f))) {
        issues.push(`qa.ios.modes.${name}.flags must be --long-flags.`);
        return;
    }
    for (const f of flags) {
        if (RESERVED_FLAGS.has(f))
            issues.push(`qa.ios.modes.${name}.flags: ${f} is reserved by the preview command or the morpheus CLI.`);
        else if (seenFlags.has(f))
            issues.push(`qa.ios.modes: ${f} selects both ${seenFlags.get(f)} and ${name}.`);
        else
            seenFlags.set(f, name);
    }
}
/** A mode selects a different app only by overriding build, product and bundleId together. */
function modeIdentity(name, m, issues) {
    const identity = ["build", "product", "bundleId"];
    const overridden = identity.filter((key) => m[key] !== undefined);
    if (overridden.length && overridden.length !== identity.length) {
        issues.push(`qa.ios.modes.${name} must override build, product and bundleId together to select a different app.`);
    }
    if (m.build !== undefined && !isStrings(m.build))
        issues.push(`qa.ios.modes.${name}.build must be a non-empty array of strings.`);
    for (const key of ["product", "bundleId"]) {
        if (m[key] !== undefined && (typeof m[key] !== "string" || !m[key]))
            issues.push(`qa.ios.modes.${name}.${key} must be a non-empty string.`);
    }
}
/** Validates `qa.ios`, reporting every problem rather than the first. */
export function parseIosPreviewConfig(raw, projectName = "Project") {
    const issues = [];
    const ios = record(record(raw)?.ios);
    if (!ios)
        return { ok: false, issues: ["morpheus.json has no qa.ios block; add one to describe this project's app."] };
    const { app, product, bundleId, derivedData, namespace, minimumXcode } = appFields(ios, projectName, issues);
    const build = ios.build;
    if (!isStrings(build))
        issues.push("qa.ios.build must be a non-empty array of strings (the build command).");
    const precheck = ios.precheck;
    if (precheck !== undefined && !isStrings(precheck))
        issues.push("qa.ios.precheck must be an array of strings when present.");
    const device = previewDevice(ios, projectName, issues);
    const modes = previewModes(ios, issues);
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
export function modeBuildIdentity(config, mode) {
    return { build: mode.build ?? config.build, product: mode.product ?? config.product, bundleId: mode.bundleId ?? config.bundleId };
}
/** Flags the preview command owns, plus every flag the morpheus parser consumes first. */
export const PREVIEW_FLAGS = ["--port", "--ttl-minutes", "--no-build", "--no-ax", "--ssh-host", "--root", "--mode"];
export const RESERVED_FLAGS = new Set([...PREVIEW_FLAGS, ...globalFlags()]);
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