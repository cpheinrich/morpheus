import { readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { Minimatch } from "minimatch";
import { sessionGit } from "../session/start.js";

export const CONTEXT_SOURCE_DEFAULTS = [
  "AGENTS.md", "architecture.md", ".agent/context-core.md", ".agent/decisions.md", ".agent/learned.md",
  ".agent/{decisions,learned,worklog}/**/*.md", "hq/product/**/*.md", "docs/**/*.md",
  "hq/team/meeting-notes/**/*.md",
];

const ignored = [
  "**/{node_modules,dist,build,local,.git}/**", ".agent/inbox-archive/**",
  "hq/team/*.md", ".agent/{review,reviews}/**", ".agent/README.md", "hq/product/{roadmap,goals,requests}/README.md",
];

const options = { dot: true, nonegate: true, nocomment: true } as const;
const compile = (patterns: readonly string[]) => patterns.map(pattern => new Minimatch(pattern, options));
const matches = (path: string, patterns: readonly Minimatch[]) => patterns.some(pattern => pattern.match(path));
const defaultIncludes = compile(CONTEXT_SOURCE_DEFAULTS);
const defaultExcludes = compile(ignored);
const safePath = (path: string) =>
  path.endsWith(".md") && !path.startsWith("/") && !path.split("/").some(part => part === ".." || part === ".");

export const CONTEXT_KINDS = ["decision", "lesson", "roadmap", "worklog", "runbook", "meeting_note", "other"] as const;
export type ContextKind = typeof CONTEXT_KINDS[number];

const kindPaths = ([
  ["decision", ".agent/decisions{.md,/**}"],
  ["lesson", ".agent/learned{.md,/**}"],
  ["roadmap", "hq/product/roadmap/**"],
  ["worklog", ".agent/worklog/**"],
  ["runbook", "docs/runbooks/**"],
  ["meeting_note", "hq/team/meeting-notes/**"],
] as const).map(([kind, pattern]) => [kind, new Minimatch(pattern, options)] as const);

export function contextKind(path: string): ContextKind {
  return kindPaths.find(([, pattern]) => pattern.match(path))?.[0] ?? "other";
}

export interface SourceRules {
  include: readonly string[];
  exclude: readonly string[];
}

export interface Coverage {
  included: string[];
  excluded: string[];
  uncovered: string[];
  emptyPatterns: string[];
}

export function classifySources(paths: readonly string[], rules: SourceRules): Coverage {
  const coverage: Coverage = { included: [], excluded: [], uncovered: [], emptyPatterns: [] };
  const customIncludes = compile(rules.include);
  const include = [...defaultIncludes, ...customIncludes];
  const exclude = [...defaultExcludes, ...compile(rules.exclude)];
  const markdown = [...new Set(paths.filter(safePath))].sort();
  for (const path of markdown) {
    if (matches(path, exclude)) coverage.excluded.push(path);
    else if (matches(path, include)) coverage.included.push(path);
    else coverage.uncovered.push(path);
  }
  coverage.emptyPatterns = unmatchedPatterns(coverage.included, rules.include, customIncludes);
  return coverage;
}

function unmatchedPatterns(paths: readonly string[], patterns: readonly string[], matchers = compile(patterns)): string[] {
  return patterns.filter((_, i) => !paths.some(path => matchers[i]!.match(path)));
}

export async function discoverSources(root: string, rules: SourceRules): Promise<Coverage> {
  const names = await sessionGit(root, ["ls-files", "-z", "--cached", "--", "*.md"], false);
  return classifySources(names.split("\0"), rules);
}

async function usableSource(absolute: string): Promise<boolean> {
  try {
    return await realpath(absolute) === absolute && (await stat(absolute)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function contextCoverage(root: string, rules: SourceRules): Promise<Coverage & {unavailable: string[]}> {
  const coverage = await discoverSources(root, rules);
  const availability = await Promise.all(coverage.included.map(path => usableSource(join(root, path))));
  const included = coverage.included.filter((_, i) => availability[i]);
  return {
    ...coverage,
    included,
    unavailable: coverage.included.filter((_, i) => !availability[i]),
    emptyPatterns: unmatchedPatterns(included, rules.include),
  };
}

export async function readContextSources(root: string, paths: readonly string[]): Promise<{path: string; text: string}[]> {
  const sources = await Promise.all(paths.map(async path => {
    const absolute = join(root, path);
    try {
      if (!await usableSource(absolute)) return null;
      return { path, text: await readFile(absolute, "utf8") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }));
  return sources.filter(source => source !== null);
}
