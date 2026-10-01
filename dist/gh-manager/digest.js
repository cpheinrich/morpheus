function cell(text) {
    return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}
export function renderDigest(opts) {
    const outcomes = new Map(opts.outcomes.map(o => [o.number, o]));
    const rows = opts.routed.map(r => {
        const outcome = outcomes.get(r.number);
        const result = outcome
            ? [outcome.verdict, outcome.overridden ? `(overridden: ${outcome.overridden})` : "", outcome.error ? `**failed: ${outcome.error}**` : ""].filter(Boolean).join(" ")
            // A session that was routed and has no outcome did not report. Say so; an empty cell
            // would read as "nothing to do".
            : r.route === "skip" ? "—" : "**no result reported**";
        // The title is whatever the author typed, and untrusted authors are listed too. As code it
        // cannot mention anyone or carry a link under the App's name.
        const title = `\`${cell(r.title).replace(/`/g, "'").slice(0, 60)}\``;
        return `| #${r.number} | ${title} | ${r.route}: ${r.reason} | ${cell(r.detail)} | ${cell(result)} |`;
    });
    const acted = opts.outcomes.filter(o => o.did.length).length;
    return [
        `### Run ${opts.at.toISOString().slice(0, 16).replace("T", " ")} UTC`,
        opts.routed.length
            ? `${opts.routed.length} open pull request(s); acted on ${acted}. [Run log](${opts.runUrl}).`
            : `No open pull requests. [Run log](${opts.runUrl}).`,
        ...(rows.length ? [["| PR | Title | Route | Why | Result |", "|---|---|---|---|---|", ...rows].join("\n")] : []),
    ].join("\n\n");
}
//# sourceMappingURL=digest.js.map