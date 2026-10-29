/** `morpheus product guide` — the CPO and the VP of Design beneath it. */
import {
  CHIEF_PRODUCT_OFFICER_SKILL,
  VP_DESIGN_SKILL,
  chiefProductOfficerSkillFiles,
  vpDesignSkillFiles,
} from "./skill.js";

const CHILD_SKILLS = new Map<string, () => Record<string, string>>([
  [VP_DESIGN_SKILL, vpDesignSkillFiles],
]);
const REFERENCE = /^references\/([\w-]+)\.md$/;
const TOPIC = /^(?:([\w-]+)\/)?([\w-]+)$/;

const referencesOf = (files: Record<string, string>): string[] =>
  Object.keys(files)
    .flatMap((file) => REFERENCE.exec(file)?.[1] ?? [])
    .sort();

export function productGuideTopics(): string[] {
  return [
    ...referencesOf(chiefProductOfficerSkillFiles()),
    ...[...CHILD_SKILLS].flatMap(([skill, files]) => [
      skill,
      ...referencesOf(files()).map((reference) => `${skill}/${reference}`),
    ]),
  ];
}

export function productSkillDescription(skill: string = CHIEF_PRODUCT_OFFICER_SKILL): string {
  const files =
    skill === CHIEF_PRODUCT_OFFICER_SKILL
      ? chiefProductOfficerSkillFiles()
      : CHILD_SKILLS.get(skill)?.();
  const description = /^description: (.+)$/m.exec(files?.["SKILL.md"] ?? "")?.[1];
  if (!description) throw new Error(`The ${skill} SKILL.md has no description line.`);
  return description;
}

export type ProductGuide = { ok: true; text: string } | { ok: false; message: string };

function entrypoint(files: Record<string, string>, prefix: string): string {
  const routes = referencesOf(files)
    .map((topic) => `  references/${topic}.md  →  morpheus product guide ${prefix}${topic}`)
    .join("\n");
  return (
    `${files["SKILL.md"]}\n---\n` +
    `Printed by the installed Morpheus CLI. Read a reference this guide links with:\n${routes}\n`
  );
}

export function productGuide(topic?: string): ProductGuide {
  if (topic === undefined) return { ok: true, text: entrypoint(chiefProductOfficerSkillFiles(), "") };

  const child = CHILD_SKILLS.get(topic);
  if (child) return { ok: true, text: entrypoint(child(), `${topic}/`) };

  const [, skill, reference] = TOPIC.exec(topic) ?? [];
  const files =
    skill === undefined ? chiefProductOfficerSkillFiles() : CHILD_SKILLS.get(skill)?.();
  const file = reference === undefined ? undefined : files?.[`references/${reference}.md`];
  if (file === undefined) {
    return {
      ok: false,
      message: `Unknown product guide topic "${topic}". Topics: ${productGuideTopics().join(", ")}.`,
    };
  }
  return { ok: true, text: file };
}
