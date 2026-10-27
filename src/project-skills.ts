import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import matter from "@11ty/gray-matter";
import {
  agenticCtoPointerSkill,
  brandReviewSkill,
  commentQaSkill,
  devopsEngineerPointerSkill,
  motionDesignExplorationSkill,
  researchEngineerPointerSkill,
  websiteInitSkill,
  type Seed,
} from "./init/templates.js";
import {
  AGENTIC_CTO_SKILL,
  DEVOPS_ENGINEER_SKILL,
  RESEARCH_ENGINEER_SKILL,
} from "./cto/skill.js";

export type ProjectKind = Seed["kind"];
export type SkillProvider = "agents" | "claude";
export type SkillDistribution = "copy" | "pointer";

const ALL_KINDS: readonly ProjectKind[] = ["company", "personal", "internal"];
const USER_FACING_KINDS: readonly ProjectKind[] = ["company", "personal"];

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
export const PROJECT_SKILLS: readonly ProjectSkillDefinition[] = [
  {
    name: "motion-design-exploration",
    providers: ["agents"],
    kinds: ALL_KINDS,
    distribution: "copy",
    canonical: true,
    render: motionDesignExplorationSkill,
  },
  {
    name: "comment-qa",
    providers: ["agents", "claude"],
    kinds: ALL_KINDS,
    distribution: "pointer",
    canonical: true,
    guide: "morpheus qa guide",
    render: commentQaSkill,
  },
  {
    name: AGENTIC_CTO_SKILL,
    providers: ["agents", "claude"],
    kinds: ALL_KINDS,
    distribution: "pointer",
    canonical: true,
    guide: "morpheus cto guide",
    render: agenticCtoPointerSkill,
  },
  {
    name: RESEARCH_ENGINEER_SKILL,
    providers: ["agents", "claude"],
    kinds: ALL_KINDS,
    distribution: "pointer",
    canonical: true,
    guide: `morpheus cto guide ${RESEARCH_ENGINEER_SKILL}`,
    render: researchEngineerPointerSkill,
  },
  {
    name: DEVOPS_ENGINEER_SKILL,
    providers: ["agents", "claude"],
    kinds: ALL_KINDS,
    distribution: "pointer",
    canonical: true,
    guide: `morpheus cto guide ${DEVOPS_ENGINEER_SKILL}`,
    render: devopsEngineerPointerSkill,
  },
  {
    name: "brand-review",
    providers: ["claude"],
    kinds: USER_FACING_KINDS,
    distribution: "copy",
    canonical: true,
    render: brandReviewSkill,
  },
  {
    name: "website-init",
    providers: ["claude"],
    kinds: USER_FACING_KINDS,
    distribution: "pointer",
    canonical: false,
    guide: "morpheus web init",
    render: websiteInitSkill,
  },
];

/** Skills that are useful only while operating Morpheus itself, not inside a managed project. */
export const MORPHEUS_ONLY_SKILLS = ["launch-company", "voice-handoff", "voice-import"] as const;

export interface ProjectSkillCatalogEntry {
  name: string;
  description: string;
  providers: readonly SkillProvider[];
  projectKinds: readonly ProjectKind[];
  distribution: SkillDistribution;
  guide?: string;
}

const frontmatter = (definition: ProjectSkillDefinition): { name: string; description: string } => {
  const data = matter(definition.render()).data as { name?: unknown; description?: unknown };
  if (data.name !== definition.name) {
    throw new Error(
      `Project skill ${definition.name} renders the frontmatter name ${JSON.stringify(data.name)}.`,
    );
  }
  if (typeof data.description !== "string" || data.description.trim() === "") {
    throw new Error(`Project skill ${definition.name} has no frontmatter description.`);
  }
  return { name: data.name, description: data.description };
};

/** The machine-readable catalog, with routing descriptions taken from the actual skill files. */
export function projectSkillCatalog(): ProjectSkillCatalogEntry[] {
  return PROJECT_SKILLS.map((definition) => {
    const metadata = frontmatter(definition);
    return {
      name: metadata.name,
      description: metadata.description,
      providers: definition.providers,
      projectKinds: definition.kinds,
      distribution: definition.distribution,
      ...(definition.guide ? { guide: definition.guide } : {}),
    };
  });
}

export function applicableProjectSkills(kind: ProjectKind): readonly ProjectSkillDefinition[] {
  return PROJECT_SKILLS.filter((skill) => skill.kinds.includes(kind));
}

export const projectSkillPath = (provider: SkillProvider, name: string): string =>
  `${provider === "agents" ? ".agents" : ".claude"}/skills/${name}/SKILL.md`;

export interface ProjectSkillSyncResult {
  expected: string[];
  created: string[];
  present: string[];
  issues: string[];
}

const missing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";

const alreadyExists = (error: unknown): boolean =>
  error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST";

/** Publish complete contents without ever replacing a path another session already owns. */
async function publishExclusive(path: string, content: string): Promise<"created" | "present"> {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.morpheus-skill-tmp`,
  );
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  try {
    // A hard link is an atomic no-clobber publication of the fully closed temporary inode.
    await link(temporary, path);
    return "created";
  } catch (error) {
    if (alreadyExists(error)) return "present";
    throw error;
  } finally {
    await unlink(temporary);
  }
}

const validateExisting = (path: string, expectedName: string, content: string): string | null => {
  try {
    const data = matter(content).data as { name?: unknown; description?: unknown };
    if (data.name !== expectedName) {
      return `${path}: frontmatter name must be ${JSON.stringify(expectedName)}, got ${JSON.stringify(data.name)}`;
    }
    if (typeof data.description !== "string" || data.description.trim() === "") {
      return `${path}: frontmatter description must be a non-empty string`;
    }
    return null;
  } catch (error) {
    return `${path}: invalid skill frontmatter (${error instanceof Error ? error.message : String(error)})`;
  }
};

/**
 * Install only missing loader-native skill entrypoints. Existing project-owned files are never
 * replaced; malformed ones are reported rather than silently treated as a working index.
 */
export async function syncProjectSkills(
  root: string,
  kind: ProjectKind,
  check: boolean,
): Promise<ProjectSkillSyncResult> {
  const result: ProjectSkillSyncResult = { expected: [], created: [], present: [], issues: [] };
  const definitions = applicableProjectSkills(kind);
  // Fail on an invalid Morpheus template before writing any part of the registry.
  for (const definition of definitions) frontmatter(definition);

  for (const definition of definitions) {
    for (const provider of definition.providers) {
      const path = projectSkillPath(provider, definition.name);
      result.expected.push(path);
      const absolute = join(root, path);
      let content: string;
      try {
        content = await readFile(absolute, "utf8");
      } catch (error) {
        if (!missing(error)) {
          result.issues.push(
            `${path}: could not read skill (${error instanceof Error ? error.message : String(error)})`,
          );
          continue;
        }
        if (check) {
          result.issues.push(`${path}: missing`);
          continue;
        }
        try {
          await mkdir(dirname(absolute), { recursive: true });
          const publication = await publishExclusive(absolute, definition.render());
          if (publication === "created") {
            result.created.push(path);
            continue;
          }

          // Every sync publishes by linking a fully written inode, so an EEXIST path is complete.
          const appeared = await readFile(absolute, "utf8");
          const issue = validateExisting(path, definition.name, appeared);
          if (issue) result.issues.push(issue);
          else result.present.push(path);
        } catch (writeError) {
          result.issues.push(
            `${path}: could not create skill (${writeError instanceof Error ? writeError.message : String(writeError)})`,
          );
        }
        continue;
      }

      const issue = validateExisting(path, definition.name, content);
      if (issue) result.issues.push(issue);
      else result.present.push(path);
    }
  }
  return result;
}
