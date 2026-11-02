import { type Seed } from "./init/templates.js";
export type ProjectKind = Seed["kind"];
export type SkillProvider = "agents" | "claude";
export type SkillDistribution = "copy" | "pointer";
export interface ProjectSkillDefinition {
    name: string;
    providers: readonly SkillProvider[];
    kinds: readonly ProjectKind[];
    distribution: SkillDistribution;
    /** Whether Morpheus itself carries a canonical skill directory with this name. */
    canonical: boolean;
    guide?: string;
    render: () => string;
}
/**
 * The one distribution registry for reusable project-facing skills.
 *
 * `morpheus init`, `morpheus skills list`, and `morpheus skills sync` all consume this array.
 * Descriptions are deliberately absent: they are parsed from each rendered SKILL.md, which keeps
 * the loader's routing text as the one source of truth.
 */
export declare const PROJECT_SKILLS: readonly ProjectSkillDefinition[];
/** Skills that are useful only while operating Morpheus itself, not inside a managed project. */
export declare const MORPHEUS_ONLY_SKILLS: readonly ["launch-company", "voice-handoff", "voice-import"];
export interface ProjectSkillCatalogEntry {
    name: string;
    description: string;
    providers: readonly SkillProvider[];
    projectKinds: readonly ProjectKind[];
    distribution: SkillDistribution;
    guide?: string;
}
/** The machine-readable catalog, with routing descriptions taken from the actual skill files. */
export declare function projectSkillCatalog(): ProjectSkillCatalogEntry[];
export declare function applicableProjectSkills(kind: ProjectKind): readonly ProjectSkillDefinition[];
export declare const projectSkillPath: (provider: SkillProvider, name: string) => string;
export interface ProjectSkillSyncResult {
    expected: string[];
    created: string[];
    present: string[];
    issues: string[];
}
/**
 * Install only missing loader-native skill entrypoints. Existing project-owned files are never
 * replaced; malformed ones are reported rather than silently treated as a working index.
 */
export declare function syncProjectSkills(root: string, kind: ProjectKind, check: boolean): Promise<ProjectSkillSyncResult>;
