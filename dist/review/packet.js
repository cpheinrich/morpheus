import { join } from "node:path";
import { accessible, readJson } from "../file-io.js";
/**
 * What a fresh reviewer needs that the contract and the diff range do not say:
 * where the repository is, and how to run its tests.
 *
 * The first packet ever handed to an isolated reviewer omitted both, so the
 * reviewer either had to ask the author — defeating the isolation — or rebuild
 * an environment and spend its whole budget on setup (#241). `morpheus.json`
 * knows the project's shape; the commands are derived from the files that
 * actually define them rather than guessed.
 */
export async function projectCommands(root) {
    const commands = [];
    const pkg = await readJson(join(root, "package.json"));
    if (pkg?.scripts) {
        const runner = await packageRunner(root, pkg.packageManager);
        for (const script of ["typecheck", "test", "lint"]) {
            if (pkg.scripts[script])
                commands.push(`${runner} ${script}`);
        }
    }
    if (await accessible(join(root, "pyproject.toml"))) {
        commands.push((await accessible(join(root, "uv.lock"))) ? "uv run pytest" : "pytest");
    }
    if (await accessible(join(root, "Package.swift")))
        commands.push("swift test");
    return commands;
}
/**
 * The manager the project declares, else the one its lockfile implies. Under
 * Yarn PnP there is no `node_modules/.bin`, so handing a reviewer `npm run`
 * for a Yarn project fails on the first command — the setup detour #241 exists
 * to remove.
 */
async function packageRunner(root, packageManager) {
    const declared = packageManager?.match(/^(pnpm|yarn|bun|npm)@/)?.[1];
    const byLock = (await accessible(join(root, "pnpm-lock.yaml")))
        ? "pnpm"
        : (await accessible(join(root, "yarn.lock")))
            ? "yarn"
            : (await accessible(join(root, "bun.lockb"))) || (await accessible(join(root, "bun.lock")))
                ? "bun"
                : undefined;
    const manager = declared ?? byLock ?? "npm";
    return manager === "npm" ? "npm run" : manager === "bun" ? "bun run" : manager;
}
/**
 * The lines after the contract. Ticket and acceptance are described rather
 * than reported as `none`: an unclaimed two-file fix is a legitimate thing to
 * review, and a packet that prints `none` reads as something missing and
 * invites the author to create an item just to fill the line.
 */
export function reviewPacket(opts) {
    const { ticket } = opts;
    const lines = [
        `Repository: ${opts.root}`,
        `Review range: ${opts.fork}..${opts.head}`,
        opts.commands.length
            ? `Test commands (run from the repository): ${opts.commands.join("; ")}`
            : "Test commands: none detected — ask the author before rebuilding an environment.",
    ];
    if (ticket.id) {
        lines.push(`Ticket: ${ticket.id} — ${ticket.title ?? "no declared title"}`);
        if (ticket.intent)
            lines.push(ticket.intent);
    }
    else {
        lines.push("Ticket: unclaimed change — review against the PR title and body; no roadmap item is required for this review.");
    }
    if (ticket.acceptance)
        lines.push(`Acceptance: ${ticket.acceptance}`);
    else if (ticket.missingAcceptance) {
        lines.push(`Acceptance: declared at ${ticket.missingAcceptance}, but that file is missing — treat as undeclared and flag it.`);
    }
    else {
        lines.push("Acceptance: none declared — review against the ticket context and the PR description. That is a supported state, not a gap to fill by creating an item.");
    }
    return lines.join("\n");
}
//# sourceMappingURL=packet.js.map