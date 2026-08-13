import { formatStatus, packageStatus } from "../brand/package.js";
import { initializeWorkflow, migrateLegacyAnswers, writeFinalizePrompt, } from "../brand/workflow.js";
function printWrites(result) {
    if (result.files.length) {
        console.log(`\n\x1b[32mWrote ${result.files.length} workflow file(s):\x1b[0m`);
        for (const path of result.files)
            console.log(`  ${path}`);
    }
    if (result.skipped.length) {
        console.log(`\n\x1b[2mLeft ${result.skipped.length} authored file(s) untouched:\x1b[0m`);
        for (const path of result.skipped)
            console.log(`  ${path}`);
    }
}
/**
 * Scaffold the visual-first brand workflow. It deliberately asks no terminal
 * questions: the editable brief and the moodboard are better design input
 * than a forced questionnaire, and a stopped command leaves useful files.
 */
export async function init(opts) {
    const result = await initializeWorkflow(opts);
    printWrites(result);
    console.log(`\n\x1b[1mStart the exploration in three moves.\x1b[0m\n` +
        `  1. Add any useful notes to ${opts.brandDir}/brand-vibes.md\n` +
        `  2. Add visual reference files to ${opts.brandDir}/moodboard/\n` +
        `  3. Run \x1b[1mmorpheus brand explore\x1b[0m and give its prompt to a design agent\n` +
        "\n\x1b[2mThe agent creates research/brand.html with five comparable directions. " +
        "Final records are written only after a person selects a direction.\x1b[0m");
    return 0;
}
/** Refresh only derived handoff material after the brief or reference set moves. */
export async function explore(opts) {
    const result = await initializeWorkflow({ ...opts, refresh: true });
    printWrites(result);
    const status = await packageStatus(opts.brandDir);
    console.log(formatStatus(status, opts.name));
    console.log(`\x1b[2mOpen ${opts.brandDir}/explore-prompt.md in a fresh design session. ` +
        "It instructs the agent to preserve research/brand.html while you iterate.\x1b[0m");
    return 0;
}
/**
 * Legacy compatibility for projects which still invoke `brand build`.
 * There is no longer an answers file to generate from; refreshing the
 * exploration handoff is the safe equivalent.
 */
export async function build(opts) {
    console.warn("\x1b[33m`morpheus brand build` is now `morpheus brand explore`. " +
        "No answers.md was read or written.\x1b[0m");
    return explore(opts);
}
/** Create a finalization prompt only after a valid review page exists. */
export async function finalize(opts) {
    const selection = opts.selection?.trim();
    if (!selection) {
        console.error("Choose the selected direction with `--selection \"Name\"`.");
        return 1;
    }
    const result = await writeFinalizePrompt({ ...opts, selection });
    if (result.error) {
        console.error(`\x1b[33m${result.error}\x1b[0m`);
        return 1;
    }
    console.log(`\x1b[32mWrote ${result.path}.\x1b[0m\n` +
        "\x1b[2mUse it to promote the selected concept into canonical strategy, voice, " +
        "tokens, moodboards, imagery, and application records without discarding the review.\x1b[0m");
    return 0;
}
/** Copy, never delete, a legacy questionnaire into a free-form exploration brief. */
export async function migrate(opts) {
    const result = await migrateLegacyAnswers(opts);
    if (result.error) {
        console.error(`\x1b[33m${result.error}\x1b[0m`);
        return 1;
    }
    console.log(`\x1b[32mCopied legacy context to ${result.path}.\x1b[0m\n` +
        "\x1b[2manswers.md was retained so the migration is reversible. Rewrite brand-vibes.md, " +
        "then run `morpheus brand explore`.\x1b[0m");
    return 0;
}
/** A CI-safe completeness check that never writes. */
export async function check(opts) {
    const status = await packageStatus(opts.brandDir);
    console.log(formatStatus(status, opts.name));
    return status.complete ? 0 : 1;
}
//# sourceMappingURL=brand.js.map