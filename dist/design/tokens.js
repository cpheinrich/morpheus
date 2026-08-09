import { readFile } from "node:fs/promises";
const kebab = (value) => value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
/** Keys carrying metadata rather than a value. */
const isAnnotation = (key) => key.startsWith("$") || key.startsWith("_");
/**
 * DTCG wraps a value as `{ $value, $type }`. Plain nested objects are also
 * accepted, because every brand file we have uses the plain form and rejecting
 * them would mean rewriting three projects to adopt one generator.
 */
function unwrap(node) {
    return "$value" in node ? node.$value : undefined;
}
function walk(node, path, out, issues) {
    if (node === null || typeof node === "string" || typeof node === "number") {
        out.push({ path, name: path.map(kebab).join("-"), value: String(node) });
        return;
    }
    if (Array.isArray(node)) {
        // A CSS custom property has no array form, and silently joining or
        // dropping would produce a stylesheet that looks fine and is wrong.
        issues.push(`${path.join(".")}: arrays are not tokens — use separate keys`);
        return;
    }
    if (typeof node !== "object") {
        issues.push(`${path.join(".")}: unsupported value of type ${typeof node}`);
        return;
    }
    const record = node;
    const wrapped = unwrap(record);
    if (wrapped !== undefined) {
        walk(wrapped, path, out, issues);
        return;
    }
    for (const [key, child] of Object.entries(record)) {
        if (isAnnotation(key))
            continue;
        walk(child, [...path, key], out, issues);
    }
}
/**
 * Flatten a token document.
 *
 * Reports every problem rather than throwing on the first — a brand file with
 * two mistakes should surface both, the same rule the roadmap parser follows.
 */
export function parseTokens(doc) {
    const tokens = [];
    const issues = [];
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
        return { tokens, issues: ["The token file must be a JSON object."] };
    }
    for (const [key, child] of Object.entries(doc)) {
        // `meta` is convention in two of our projects and is not a token group.
        if (isAnnotation(key) || key === "meta")
            continue;
        walk(child, [key], tokens, issues);
    }
    const seen = new Map();
    for (const t of tokens) {
        const clash = seen.get(t.name);
        if (clash) {
            issues.push(`${t.path.join(".")} and ${clash.join(".")} both become --${t.name}`);
        }
        else {
            seen.set(t.name, t.path);
        }
    }
    return { tokens, issues };
}
export async function readTokens(path) {
    let raw;
    try {
        raw = await readFile(path, "utf8");
    }
    catch {
        return { tokens: [], issues: [`Cannot read ${path}`] };
    }
    try {
        return parseTokens(JSON.parse(raw));
    }
    catch (err) {
        const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
        return { tokens: [], issues: [`${path} is not valid JSON — ${detail}`] };
    }
}
const header = (source) => `/* Generated from ${source} by \`morpheus tokens build\`.\n * Do not edit by hand — change the source and regenerate.\n */\n`;
export function renderCss(tokens, opts) {
    const selector = opts.selector ?? ":root";
    const body = tokens
        .map((t) => `  --${opts.prefix}-${t.name}: ${t.value};`)
        .join("\n");
    return `${header(opts.source)}${selector} {\n${body}\n}\n`;
}
/**
 * A typed module, so a token that no longer exists fails at build rather than
 * rendering as an empty CSS variable — which is the failure mode a stylesheet
 * cannot catch.
 */
export function renderTs(tokens, opts) {
    const entries = tokens
        .map((t) => `  ${JSON.stringify(t.name)}: "var(--${opts.prefix}-${t.name})",`)
        .join("\n");
    const raw = tokens.map((t) => `  ${JSON.stringify(t.name)}: ${JSON.stringify(t.value)},`).join("\n");
    return `${header(opts.source)}
/** Every token as a \`var()\` reference — prefer these in components. */
export const token = {
${entries}
} as const;

/** The literal values, for contexts that cannot use custom properties. */
export const value = {
${raw}
} as const;

export type TokenName = keyof typeof token;
`;
}
//# sourceMappingURL=tokens.js.map