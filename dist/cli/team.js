import { MEETING_NOTES_DIR, MEMBERS_FILE } from "../paths.js";
import { validateTeam } from "../team/validate.js";
/**
 * `morpheus team validate` — the roster and the meeting notes.
 *
 * Separate from `pm validate` because they answer different questions and a
 * project can legitimately have one and not the other: Morpheus has a board and
 * no roster, and a services company might have the reverse.
 */
export async function validate(root) {
    const { members, noteCount, issues } = await validateTeam(root);
    if (issues.length) {
        console.error(`\n✗ Team — ${issues.length} issue(s)`);
        for (const i of issues)
            console.error(`  ${i.path}\n    ${i.message}`);
        console.error(`\n${issues.length} issue(s) found.`);
        return 1;
    }
    // "No roster" and "a valid empty roster" are different answers, and a count
    // of zero should not read as a clean bill of health for a file that is absent.
    console.log(members.length
        ? `✓ Members — ${members.length} in ${MEMBERS_FILE}`
        : `· No ${MEMBERS_FILE} — this project records no collaborators`);
    console.log(`✓ Meeting notes — ${noteCount} in ${MEETING_NOTES_DIR}/`);
    return 0;
}
//# sourceMappingURL=team.js.map