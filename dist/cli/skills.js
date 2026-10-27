import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectSkillCatalog, syncProjectSkills, } from "../project-skills.js";
const providerName = (provider) => provider === "agents" ? "Codex/Grok" : "Claude";
export function listProjectSkills(json) {
    const skills = projectSkillCatalog();
    if (json) {
        console.log(JSON.stringify({ schemaVersion: "morpheus-project-skills-1", skills }, null, 2));
        return 0;
    }
    console.log(`Morpheus project skills (${skills.length})`);
    for (const skill of skills) {
        const kinds = skill.projectKinds.length === 3 ? "all projects" : skill.projectKinds.join(", ");
        console.log(`\n${skill.name} · ${skill.providers.map(providerName).join(", ")} · ${kinds}`);
        console.log(`  ${skill.description}`);
        if (skill.guide)
            console.log(`  Guide: ${skill.guide}`);
    }
    console.log("\nRun `morpheus skills sync` in a project to add missing loader-native entrypoints; " +
        "existing project skills are never overwritten.");
    return 0;
}
async function projectKind(root) {
    const path = join(root, "morpheus.json");
    let text;
    try {
        text = await readFile(path, "utf8");
    }
    catch (error) {
        throw new Error(`Could not read morpheus.json (${error instanceof Error ? error.message : String(error)}). ` +
            "Run `morpheus init` before syncing project skills.");
    }
    let manifest;
    try {
        manifest = JSON.parse(text);
    }
    catch (error) {
        throw new Error(`morpheus.json is not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
    }
    const kind = manifest && typeof manifest === "object" && "kind" in manifest
        ? manifest.kind
        : undefined;
    if (kind !== "company" && kind !== "personal" && kind !== "internal") {
        throw new Error('morpheus.json kind must be "company", "personal", or "internal".');
    }
    return kind;
}
export async function syncProjectSkillEntrypoints(root, check) {
    try {
        const result = await syncProjectSkills(root, await projectKind(root), check);
        if (result.issues.length) {
            console.error(`✗ Morpheus project skills need attention (${result.issues.length}):`);
            for (const issue of result.issues)
                console.error(`  ${issue}`);
            if (check)
                console.error("Run `morpheus skills sync` to add missing entrypoints.");
            return 1;
        }
        if (check) {
            console.log(`✓ ${result.expected.length} Morpheus project skill entrypoint(s) are discoverable.`);
            return 0;
        }
        if (result.created.length) {
            console.log(`Created ${result.created.length} Morpheus project skill entrypoint(s):`);
            for (const path of result.created)
                console.log(`  ${path}`);
        }
        else {
            console.log("All Morpheus project skill entrypoints are already present.");
        }
        console.log("Existing project-owned skill files were left untouched.");
        return 0;
    }
    catch (error) {
        console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
}
//# sourceMappingURL=skills.js.map