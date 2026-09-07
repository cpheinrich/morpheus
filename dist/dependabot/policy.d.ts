export declare const DEPENDABOT_LOGIN = "dependabot[bot]";
export type UpdateType = "version-update:semver-major" | "version-update:semver-minor" | "version-update:semver-patch" | "version-update:git-commit" | "version-update:unknown";
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
export type PolicyDecision = {
    route: "auto_merge";
    reason: string;
} | {
    route: "close";
    reason: string;
} | {
    route: "agent";
    reason: string;
} | {
    route: "human_review";
    reason: string;
};
/** Parse the title shape Dependabot uses for a single dependency update. */
export declare function parseDependabotTitle(title: string): DependencyUpdate | null;
/** Classify ordinary semver updates and exact git-SHA refreshes. */
export declare function updateType(fromVersion: string, toVersion: string): UpdateType;
/**
 * Dependency-only is deliberately a narrow allowlist. A bot identity is not
 * permission to change source, workflows, or its own policy.
 */
export declare function isDependencyFile(path: string): boolean;
export declare function isDependencyOnly(paths: string[]): boolean;
/** A strict protected branch cannot finish auto-merge while its head is behind the base. */
export declare function shouldAdvanceAutoMerge(route: PolicyDecision["route"], mergeStateStatus: string): boolean;
export declare function decideByPolicy(policy: DependabotPolicy, input: {
    author: string;
    title: string;
    changedFiles: string[];
}): PolicyDecision;
