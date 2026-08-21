function list(lines) {
    return lines.length ? lines.map((l) => `- ${l}`).join("\n") : "_None._";
}
/**
 * Render the live-state brief.
 *
 * Section order is deliberate: the topic first, because a voice session that
 * reads one paragraph and starts talking should already know what this is
 * about. State second. Housekeeping last.
 */
export function buildBrief(input) {
    const { name, topic, beat, openInbox, since, notes, today } = input;
    const out = [];
    out.push(`# ${name} — where things stand, ${today}`);
    out.push("");
    if (topic) {
        out.push(`**What I want to think about:** ${topic}`);
        out.push("");
    }
    else {
        out.push("**No topic set** — Chris will open with one. Everything below is context, not an agenda.");
        out.push("");
    }
    if (input.selfContained) {
        out.push("_This brief carries the standing explainer above it, so it stands alone in a fresh chat._", "");
    }
    if (notes?.trim()) {
        out.push("## What just happened", "", notes.trim(), "");
    }
    out.push("## Where the work is", "");
    out.push(beat.pick
        ? `The next unclaimed item is **${beat.pick.id} — ${beat.pick.title}** (${beat.pick.priority}, ${beat.pick.note}).`
        : `Nothing is queued up next. ${beat.reason}`);
    out.push("");
    out.push(`**In flight** (${beat.inFlight.length} of a ceiling of ${beat.ceiling}):`);
    out.push(list(beat.inFlight.map((c) => `${c.id} — on branch \`${c.branch}\``)));
    out.push("");
    if (beat.staleClaims.length) {
        out.push("**Settled claims whose branch still exists on origin:**");
        out.push(list(beat.staleClaims.map((c) => `${c.id} — branch \`${c.branch}\``)));
        out.push("");
    }
    // Blocked work is what a conversation is most likely to be able to unstick,
    // so it is stated with what it needs rather than merely counted.
    out.push("**Blocked, waiting on a person:**");
    out.push(list(beat.blocked.map((b) => `${b.id} — ${b.title}. Needs: ${b.needs} (${b.age}d)`)));
    out.push("");
    out.push("**Next few in the backlog:**");
    out.push(list(beat.ranked.slice(0, 6).map((c) => `${c.id} — ${c.title} (${c.priority}, ${c.note})`)));
    out.push("");
    out.push("## What Chris still owes a decision on", "");
    out.push(list(openInbox.map((i) => `Inbox item ${i.n}: ${i.title}`)));
    out.push("");
    out.push("## What has moved since we last spoke", "");
    if (since.unavailable) {
        out.push("_Could not read the git history, so this is unknown rather than empty — do not assume nothing shipped._");
    }
    else if (since.commits.length === 0) {
        out.push(since.date
            ? `_Nothing has landed since the last handoff on ${since.date}._`
            : "_Nothing found._");
    }
    else {
        out.push(since.date
            ? `Since the last handoff on ${since.date}:`
            : "No previous handoff, so the last 20 commits:");
        out.push("");
        out.push(list(since.commits.slice(0, 20)));
    }
    out.push("");
    out.push("---", "");
    out.push("When we reach something worth acting on, close with a handoff spec in the shape from your", "standing context — including the caveat that you cannot see the codebase and it should be", "deferred to. Do not draft roadmap items; you cannot see the board. And if the conversation", "does not reach something worth building, say that instead of writing a spec to have one.");
    return out.join("\n");
}
//# sourceMappingURL=brief.js.map