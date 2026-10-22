/**
 * `morpheus cto guide` — the agentic-CTO skill, printed by the installed CLI.
 *
 * Chris asked for the skill to live in Morpheus and be referenced from other projects, so every
 * other project carries a pointer here rather than a copy: copies in each repository drift apart
 * silently, while `self update` delivers one reviewed revision everywhere at once.
 */
import { agenticCtoSkillFiles } from "./skill.js";
const REFERENCE = /^references\/([\w-]+)\.md$/;
/** Each reference file, by the name `morpheus cto guide <topic>` takes. */
export function ctoGuideTopics() {
    return Object.keys(agenticCtoSkillFiles())
        .flatMap((file) => REFERENCE.exec(file)?.[1] ?? [])
        .sort();
}
/** The skill's `description`, which a pointer copies so both route the same requests. */
export function ctoSkillDescription() {
    const description = /^description: (.+)$/m.exec(agenticCtoSkillFiles()["SKILL.md"] ?? "")?.[1];
    // A pointer with no description would never be selected, and would look installed.
    if (!description)
        throw new Error("The agentic-cto SKILL.md has no description line.");
    return description;
}
/** The entrypoint with no topic, or one reference file verbatim. */
export function ctoGuide(topic) {
    const files = agenticCtoSkillFiles();
    const topics = ctoGuideTopics();
    if (topic === undefined) {
        const routes = topics.map((t) => `  references/${t}.md  →  morpheus cto guide ${t}`).join("\n");
        return {
            ok: true,
            text: `${files["SKILL.md"]}\n---\n` +
                `Printed by the installed Morpheus CLI. Read a reference this guide links with:\n${routes}\n`,
        };
    }
    const file = files[`references/${topic}.md`];
    if (file === undefined) {
        return { ok: false, message: `Unknown cto guide topic "${topic}". Topics: ${topics.join(", ")}.` };
    }
    return { ok: true, text: file };
}
//# sourceMappingURL=guide.js.map