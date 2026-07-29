import { readFile } from "node:fs/promises";

/**
 * Design tokens: one generator instead of three.
 *
 * `cpheinrich.com`, `heinrichbros.com` and `lakina` each hand-rolled a script
 * to turn brand tokens into CSS custom properties. Three independent
 * implementations of the same twenty lines is the extract-on-second-use
 * trigger passed twice over, and each one is subtly different — one throws on
 * arrays, one silently drops them, one hardcodes every variable name.
 *
 * This reads DTCG-shaped JSON and emits CSS custom properties and a typed TS
 * module. It deliberately does **not** decide semantic names: only one of the
 * three projects has a semantic layer, its mapping is bespoke, and inventing
 * a shared vocabulary from a sample of one would be guessing.
 */

/** A leaf value, flattened out of the token tree. */
export interface Token {
  /** Dot path in the source, e.g. `color.ink`. */
  path: string[];
  /** Kebab-cased variable name without the prefix, e.g. `color-ink`. */
  name: string;
  value: string;
}

export interface ParseResult {
  tokens: Token[];
  /** Everything wrong with the file, reported together. */
  issues: string[];
}

const kebab = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

/** Keys carrying metadata rather than a value. */
const isAnnotation = (key: string): boolean => key.startsWith("$") || key.startsWith("_");

/**
 * DTCG wraps a value as `{ $value, $type }`. Plain nested objects are also
 * accepted, because every brand file we have uses the plain form and rejecting
 * them would mean rewriting three projects to adopt one generator.
 */
function unwrap(node: Record<string, unknown>): unknown {
  return "$value" in node ? node.$value : undefined;
}

function walk(node: unknown, path: string[], out: Token[], issues: string[]): void {
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

  const record = node as Record<string, unknown>;
  const wrapped = unwrap(record);
  if (wrapped !== undefined) {
    walk(wrapped, path, out, issues);
    return;
  }

  for (const [key, child] of Object.entries(record)) {
    if (isAnnotation(key)) continue;
    walk(child, [...path, key], out, issues);
  }
}

/**
 * Flatten a token document.
 *
 * Reports every problem rather than throwing on the first — a brand file with
 * two mistakes should surface both, the same rule the roadmap parser follows.
 */
export function parseTokens(doc: unknown): ParseResult {
  const tokens: Token[] = [];
  const issues: string[] = [];

  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return { tokens, issues: ["The token file must be a JSON object."] };
  }

  for (const [key, child] of Object.entries(doc as Record<string, unknown>)) {
    // `meta` is convention in two of our projects and is not a token group.
    if (isAnnotation(key) || key === "meta") continue;
    walk(child, [key], tokens, issues);
  }

  const seen = new Map<string, string[]>();
  for (const t of tokens) {
    const clash = seen.get(t.name);
    if (clash) {
      issues.push(
        `${t.path.join(".")} and ${clash.join(".")} both become --${t.name}`,
      );
    } else {
      seen.set(t.name, t.path);
    }
  }

  return { tokens, issues };
}

export async function readTokens(path: string): Promise<ParseResult> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { tokens: [], issues: [`Cannot read ${path}`] };
  }
  try {
    return parseTokens(JSON.parse(raw));
  } catch (err) {
    const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return { tokens: [], issues: [`${path} is not valid JSON — ${detail}`] };
  }
}

export interface RenderOptions {
  /** Variable prefix, e.g. `brand` gives `--brand-color-ink`. */
  prefix: string;
  /** Where the tokens came from, named in the generated header. */
  source: string;
  /** CSS selector the properties are declared on. */
  selector?: string;
}

const header = (source: string): string =>
  `/* Generated from ${source} by \`morpheus tokens build\`.\n * Do not edit by hand — change the source and regenerate.\n */\n`;

export function renderCss(tokens: Token[], opts: RenderOptions): string {
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
export function renderTs(tokens: Token[], opts: RenderOptions): string {
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
