/**
 * `morpheus cto guide` — the agentic-CTO skill, and the individual-contributor skills under it,
 * printed by the installed CLI.
 *
 * Chris asked for the skill to live in Morpheus and be referenced from other projects, so every
 * other project carries a pointer here rather than a copy: copies in each repository drift apart
 * silently, while `self update` delivers one reviewed revision everywhere at once.
 */
import { AGENTIC_CTO_SKILL, RESEARCH_ENGINEER_SKILL, DEVOPS_ENGINEER_SKILL, agenticCtoSkillFiles, researchEngineerSkillFiles, devopsEngineerSkillFiles, } from "./skill.js";
/**
 * The individual-contributor skills under the CTO, by the topic that prints each one. A reference
 * of one prints as `<skill>/<reference>`, so its names never shadow the CTO's own references. A
 * Map, not an object literal, so a topic such as `constructor` cannot resolve through a prototype.
 */
const IC_SKILLS = new Map([
    [RESEARCH_ENGINEER_SKILL, researchEngineerSkillFiles],
    [DEVOPS_ENGINEER_SKILL, devopsEngineerSkillFiles],
]);
const REFERENCE = /^references\/([\w-]+)\.md$/;
const TOPIC = /^(?:([\w-]+)\/)?([\w-]+)$/;
const referencesOf = (files) => Object.keys(files)
    .flatMap((file) => REFERENCE.exec(file)?.[1] ?? [])
    .sort();
/**
 * Every topic `morpheus cto guide <topic>` takes: each CTO reference, then each
 * individual-contributor skill followed by its references.
 */
export function ctoGuideTopics() {
    return [
        ...referencesOf(agenticCtoSkillFiles()),
        ...[...IC_SKILLS].flatMap(([skill, files]) => [
            skill,
            ...referencesOf(files()).map((reference) => `${skill}/${reference}`),
        ]),
    ];
}
/** A skill's `description`, which a pointer copies so both route the same requests. */
export function ctoSkillDescription(skill = AGENTIC_CTO_SKILL) {
    const files = skill === AGENTIC_CTO_SKILL ? agenticCtoSkillFiles() : IC_SKILLS.get(skill)?.();
    const description = /^description: (.+)$/m.exec(files?.["SKILL.md"] ?? "")?.[1];
    // A pointer with no description would never be selected, and would look installed.
    if (!description)
        throw new Error(`The ${skill} SKILL.md has no description line.`);
    return description;
}
/** A skill's entrypoint, then the command that prints each reference it links. */
function entrypoint(files, prefix) {
    const routes = referencesOf(files)
        .map((t) => `  references/${t}.md  →  morpheus cto guide ${prefix}${t}`)
        .join("\n");
    return (`${files["SKILL.md"]}\n---\n` +
        `Printed by the installed Morpheus CLI. Read a reference this guide links with:\n${routes}\n`);
}
/**
 * With no topic, the CTO entrypoint; with a CTO reference's name, that reference verbatim; with an
 * individual-contributor skill's name, its entrypoint; with `<skill>/<reference>`, that reference.
 */
export function ctoGuide(topic) {
    if (topic === undefined)
        return { ok: true, text: entrypoint(agenticCtoSkillFiles(), "") };
    const ic = IC_SKILLS.get(topic);
    if (ic)
        return { ok: true, text: entrypoint(ic(), `${topic}/`) };
    const [, skill, reference] = TOPIC.exec(topic) ?? [];
    const files = skill === undefined ? agenticCtoSkillFiles() : IC_SKILLS.get(skill)?.();
    const file = reference === undefined ? undefined : files?.[`references/${reference}.md`];
    if (file === undefined) {
        return {
            ok: false,
            message: `Unknown cto guide topic "${topic}". Topics: ${ctoGuideTopics().join(", ")}.`,
        };
    }
    return { ok: true, text: file };
}
//# sourceMappingURL=guide.js.map