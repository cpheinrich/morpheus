import { chmodSync, lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const marketing = "MARKETING_VERSION";
const build = "CURRENT_PROJECT_VERSION";
const components = ["major", "minor", "patch"];
const decimal = "(?:0|[1-9][0-9]*)";
const versionPattern = new RegExp(`^${decimal}\\.${decimal}(?:\\.${decimal})?$`);

function versionParts(value, label) {
  if (typeof value !== "string" || !versionPattern.test(value)) {
    throw new Error(`${label} must be a numeric two- or three-component version without leading zeros`);
  }
  const parts = value.split(".").map(BigInt);
  if (parts.length === 2) parts.push(0n);
  return parts;
}

function compare(left, right) {
  for (const [index, part] of left.entries()) {
    if (part !== right[index]) return part > right[index] ? 1 : -1;
  }
  return 0;
}

function lookupUrl(appId, bundleId, storefront) {
  if (!/^[1-9][0-9]*$/.test(appId) || !Number.isSafeInteger(Number(appId))) {
    throw new Error("--app-id must be a positive numeric Apple track ID");
  }
  if (!bundleId || !/^[a-z0-9.-]+$/i.test(bundleId)) throw new Error("--bundle-id must be an Apple bundle ID");
  if (!/^[a-z]{2}$/i.test(storefront)) throw new Error("--storefront must be a two-letter country code");
  const url = new URL("https://itunes.apple.com/lookup");
  url.search = new URLSearchParams({ id: appId, country: storefront.toLowerCase(), entity: "software" });
  return url;
}

async function lookup(url) {
  const signal = AbortSignal.timeout(10_000);
  try {
    const response = await fetch(url, { signal, redirect: "error" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (signal.aborted) throw new Error("Apple App Store lookup timed out after 10 seconds");
    throw new Error(`Apple App Store lookup failed: ${error.message}`);
  }
}

function listingVersion(data, appId, bundleId, storefront) {
  if (!Array.isArray(data?.results) || data.resultCount !== data.results.length || data.resultCount > 1) {
    throw new Error("Apple returned a malformed or ambiguous App Store lookup result");
  }
  const [listing] = data.results;
  if (data.resultCount === 0) throw new Error(`No App Store listing for app ${appId} in ${storefront}`);
  if (listing?.trackId !== Number(appId) || listing.bundleId !== bundleId) {
    throw new Error(`Apple returned a listing that does not match app ${appId} and bundle ${bundleId}`);
  }
  if (listing.wrapperType !== "software" || listing.kind !== "software") {
    throw new Error("Apple returned a listing that is not iOS software");
  }
  return listing.version;
}

function unquote(value) {
  return value.startsWith('"') ? value.slice(1, -1) : value;
}

function projectTokens(text) {
  return [...text.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\[\s\S]|[^"\\])*"|[\w.$-]+|[^\s]/g)]
    .filter(([token]) => !token.startsWith("//") && !token.startsWith("/*"));
}

function assignmentOperator(text, tokens, index) {
  const [token] = tokens[index];
  const operator = tokens[index + 1]?.[0];
  if (token === '"' || (token === "/" && text.startsWith("/*", tokens[index].index))) {
    throw new Error("Unterminated string or comment in the Xcode project");
  }
  if (operator === "=" && token.startsWith('"') && token.includes("\\")) {
    throw new Error("Escaped assignment key in the Xcode project; refusing to guess its setting");
  }
  return operator;
}

function assignments(text, key, pattern) {
  const tokens = projectTokens(text);
  const values = [];
  for (const [index, [token]] of tokens.entries()) {
    const operator = assignmentOperator(text, tokens, index);
    const name = unquote(token);
    if (name !== key && !name.startsWith(`${key}[`)) continue;
    if (operator !== "=" && operator !== "[") continue;
    const value = tokens[index + 2];
    if (name !== key || operator !== "=" || !value || tokens[index + 3]?.[0] !== ";" || !pattern.test(unquote(value[0]))) {
      throw new Error(`Expected an unqualified literal ${key} assignment in the Xcode project`);
    }
    values.push({ start: value.index, raw: value[0], literal: unquote(value[0]) });
  }
  if (values.length === 0) throw new Error(`Missing ${key} assignments in the Xcode project`);
  return values;
}

function projectVersion(values) {
  const version = values[0].literal;
  if (values.some(({ literal }) => literal !== version)) throw new Error(`Mixed ${marketing} assignments in the Xcode project`);
  return version;
}

function readProject(path) {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error("--project-file must be a regular file (not a symlink)");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(path));
  return { text, mode: stat.mode & 0o777 };
}

function rewrite(text, marketingValues, buildValues, toVersion) {
  const edits = [
    ...marketingValues.map((value) => ({ ...value, target: toVersion })),
    ...buildValues.map((value) => ({ ...value, target: "0" })),
  ].sort((left, right) => right.start - left.start);
  for (const { start, raw, target } of edits) {
    const replacement = raw.startsWith('"') ? `"${target}"` : target;
    text = text.slice(0, start) + replacement + text.slice(start + raw.length);
  }
  return text;
}

function replaceProject(path, original, updated, mode) {
  const temporary = mkdtempSync(join(dirname(path), ".morpheus-version-"));
  try {
    const staged = join(temporary, "project.pbxproj");
    writeFileSync(staged, updated);
    chmodSync(staged, mode);
    if (readProject(path).text !== original) throw new Error("Xcode project changed while applying the version bump");
    renameSync(staged, path);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function apply({ "project-file": path, "from-version": fromVersion, "to-version": toVersion }) {
  if (!path) throw new Error("apply requires --project-file");
  if (compare(versionParts(toVersion, "--to-version"), versionParts(fromVersion, "--from-version")) <= 0) {
    throw new Error("--to-version must be greater than --from-version");
  }
  const { text, mode } = readProject(path);
  const marketingValues = assignments(text, marketing, versionPattern);
  const buildValues = assignments(text, build, /^[0-9]+$/);
  const current = projectVersion(marketingValues);
  if (current === toVersion && buildValues.every(({ literal }) => literal === "0")) return;
  if (current !== fromVersion) throw new Error(`Expected ${marketing} ${fromVersion}, found ${current}; refusing to edit`);
  replaceProject(path, text, rewrite(text, marketingValues, buildValues, toVersion), mode);
}

async function plan({ "app-id": appId, "bundle-id": bundleId, storefront = "us", version, "project-file": path, component = "patch" }) {
  const bump = components.indexOf(component);
  if (bump === -1) throw new Error("--component must be patch, minor or major");
  if ((version === undefined) === (path === undefined)) throw new Error("plan requires exactly one of --version or --project-file");
  const url = lookupUrl(appId, bundleId, storefront);
  const currentVersion = version ?? projectVersion(assignments(readProject(path).text, marketing, versionPattern));
  const current = versionParts(currentVersion, "Xcode marketing version");
  const storeVersion = listingVersion(await lookup(url), appId, bundleId, storefront);
  const order = compare(current, versionParts(storeVersion, "App Store marketing version"));
  const status = order > 0 ? "ahead" : order < 0 ? "behind" : "bump-required";
  const nextVersion = order === 0 ? current.map((part, index) => index < bump ? part : index === bump ? part + 1n : 0n).join(".") : null;
  console.log(JSON.stringify({ status, currentVersion, storeVersion, nextVersion }));
}

try {
  const [, , command, ...args] = process.argv;
  const keys = {
    plan: ["app-id", "bundle-id", "storefront", "version", "project-file", "component"],
    apply: ["project-file", "from-version", "to-version"],
  };
  if (!Object.hasOwn(keys, command)) throw new Error("Usage: version.mjs plan|apply [options]; see the iOS App Store version action README");
  const options = Object.fromEntries(keys[command].map((key) => [key, { type: "string" }]));
  const { values } = parseArgs({ args, options });
  if (command === "plan") await plan(values);
  else apply(values);
} catch (error) {
  console.error(`iOS App Store version: ${error.message}`);
  process.exitCode = 1;
}
