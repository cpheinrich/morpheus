export const DEPENDABOT_LOGIN = "dependabot[bot]";

export type UpdateType =
  | "version-update:semver-major"
  | "version-update:semver-minor"
  | "version-update:semver-patch"
  | "version-update:git-commit"
  | "version-update:unknown";

export interface DependencyUpdate {
  dependency: string;
  fromVersion: string;
  toVersion: string;
  directory?: string;
  updateType: UpdateType;
}

export interface PolicyRule {
  dependency: string;
  updateTypes: UpdateType[];
  reason?: string;
}

export interface DependabotPolicy {
  version: 1;
  autoMerge: PolicyRule[];
  close: PolicyRule[];
}

export type PolicyDecision =
  | { route: "auto_merge"; reason: string }
  | { route: "close"; reason: string }
  | { route: "agent"; reason: string }
  | { route: "human_review"; reason: string };

const DEPENDENCY_FILES = new Set([
  "Cargo.lock",
  "Cargo.toml",
  "Gemfile",
  "Gemfile.lock",
  "Pipfile",
  "Pipfile.lock",
  "composer.json",
  "composer.lock",
  "go.mod",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "pyproject.toml",
  "setup.cfg",
  "setup.py",
  "uv.lock",
  "yarn.lock",
]);

/** Parse the title shape Dependabot uses for a single dependency update. */
export function parseDependabotTitle(title: string): DependencyUpdate | null {
  const match = /^(?:Build\(deps(?:-dev)?\):\s+)?Bump (.+?) from (\S+) to (\S+?)(?: in (\/\S+))?$/i.exec(
    title.trim(),
  );
  if (!match) return null;

  const dependency = match[1];
  const fromVersion = match[2]?.replace(/^`|`$/g, "");
  const toVersion = match[3]?.replace(/^`|`$/g, "");
  if (!dependency || !fromVersion || !toVersion) return null;

  return {
    dependency,
    fromVersion,
    toVersion,
    directory: match[4],
    updateType: updateType(fromVersion, toVersion),
  };
}

function semverCore(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Classify ordinary semver updates and exact git-SHA refreshes. */
export function updateType(fromVersion: string, toVersion: string): UpdateType {
  const from = semverCore(fromVersion);
  const to = semverCore(toVersion);

  if (from && to) {
    if (from[0] !== to[0]) return "version-update:semver-major";
    if (from[1] !== to[1]) return "version-update:semver-minor";
    if (from[2] !== to[2]) return "version-update:semver-patch";
  }

  if (/^[0-9a-f]{7,40}$/i.test(fromVersion) && /^[0-9a-f]{7,40}$/i.test(toVersion)) {
    return "version-update:git-commit";
  }

  return "version-update:unknown";
}

/**
 * Dependency-only is deliberately a narrow allowlist. A bot identity is not
 * permission to change source, workflows, or its own policy.
 */
export function isDependencyFile(path: string): boolean {
  const basename = path.split("/").at(-1) ?? "";
  return DEPENDENCY_FILES.has(basename) || /^requirements(?:[-_.].+)?\.txt$/.test(basename);
}

export function isDependencyOnly(paths: string[]): boolean {
  return paths.length > 0 && paths.every(isDependencyFile);
}

/** A strict protected branch cannot finish auto-merge while its head is behind the base. */
export function shouldAdvanceAutoMerge(
  route: PolicyDecision["route"],
  mergeStateStatus: string,
): boolean {
  return route === "auto_merge" && mergeStateStatus.toUpperCase() === "BEHIND";
}

function matchingRule(rules: PolicyRule[], update: DependencyUpdate): PolicyRule | undefined {
  return rules.find(
    (rule) =>
      rule.dependency === update.dependency && rule.updateTypes.includes(update.updateType),
  );
}

export function decideByPolicy(
  policy: DependabotPolicy,
  input: { author: string; title: string; changedFiles: string[] },
): PolicyDecision {
  if (input.author !== DEPENDABOT_LOGIN) {
    return { route: "human_review", reason: `author is ${input.author || "unknown"}, not Dependabot` };
  }

  if (!isDependencyOnly(input.changedFiles)) {
    return {
      route: "human_review",
      reason: "the pull request changes something outside the dependency manifest allowlist",
    };
  }

  const update = parseDependabotTitle(input.title);
  if (!update) {
    return { route: "agent", reason: "the update metadata is not a single parseable dependency bump" };
  }

  const close = matchingRule(policy.close, update);
  if (close) {
    return {
      route: "close",
      reason: close.reason ?? `${update.dependency} ${update.updateType} is held by project policy`,
    };
  }

  const autoMerge = matchingRule(policy.autoMerge, update);
  if (autoMerge) {
    return {
      route: "auto_merge",
      reason:
        autoMerge.reason ?? `${update.dependency} ${update.updateType} is approved by project policy`,
    };
  }

  return { route: "agent", reason: "no deterministic project policy matches this update" };
}
