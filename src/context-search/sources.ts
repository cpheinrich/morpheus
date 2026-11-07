import { readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { minimatch } from "minimatch";
import { sessionGit } from "../session/start.js";

const defaults = [
  "AGENTS.md", "architecture.md", ".agent/context-core.md", ".agent/decisions.md", ".agent/learned.md",
  ".agent/{decisions,learned,worklog}/**/*.md", "hq/product/**/*.md", "docs/**/*.md",
  "hq/team/meeting-notes/**/*.md",
];

const ignored = [
  "**/{node_modules,dist,build,local,.git}/**", ".agent/inbox-archive/**",
  "hq/team/*.md", ".agent/{review,reviews}/**", ".agent/README.md", "hq/product/{roadmap,goals,requests}/README.md",
];

const options = { dot: true, nonegate: true, nocomment: true } as const;
const matches = (path: string, patterns: readonly string[]) => patterns.some(pattern => minimatch(path, pattern, options));
const safePath = (path: string) =>
  path.endsWith(".md") && !path.startsWith("/") && !path.split("/").some(part => part === ".." || part === ".");

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
  const include = [...defaults, ...rules.include];
  const markdown = [...new Set(paths.filter(safePath))].sort();
  for (const path of markdown) {
    if (matches(path, ignored) || matches(path, rules.exclude)) coverage.excluded.push(path);
    else if (matches(path, include)) coverage.included.push(path);
    else coverage.uncovered.push(path);
  }
  coverage.emptyPatterns = rules.include.filter(pattern => !matchesAny(coverage.included, pattern));
  return coverage;
}

function matchesAny(paths: readonly string[], pattern: string): boolean {
  return paths.some(path => minimatch(path, pattern, options));
}

export async function contextCoverage(root: string, rules: SourceRules, tracked = false): Promise<Coverage> {
  const args = tracked ? ["--cached"] : ["--cached", "--others", "--exclude-standard"];
  const names = await sessionGit(root, ["ls-files", "-z", ...args, "--", "*.md"], false);
  return classifySources(names.split("\0"), rules);
}

export async function readContextSources(root: string, paths: readonly string[]): Promise<{path: string; text: string}[]> {
  const sources = await Promise.all(paths.map(async path => {
    const absolute = join(root, path);
    try {
      if (await realpath(absolute) !== absolute || !(await stat(absolute)).isFile()) return null;
      return { path, text: await readFile(absolute, "utf8") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }));
  return sources.filter(source => source !== null);
}
