import { ContextFreshnessError } from "./lease.js";
import { check } from "./context.js";
/**
 * Which `morpheus` commands are gated, and how far each reaches.
 *
 * **Deliberately not every command.** A gate that fires on `pm index` or
 * `check pr` trains people to route around it, and the routing-around is
 * permanent where the staleness was not. These six are the ones where acting
 * on stale context does identifiable harm:
 *
 * | Command | Harm | Reach |
 * |---|---|---|
 * | `pm claim` | claiming work you would not claim knowing what merged | external |
 * | `pm new` | filing an item that already exists on the board | local |
 * | `pm link-issue` | attaching an issue to the wrong or obsolete work item | local |
 * | `pm block` | escalating a question the inbox already answered | local¹ |
 * | `access sync` | granting access from an allowlist that has moved | external |
 * | `firebase auth setup` | changing an authentication provider and OAuth domains | external |
 *
 * ¹ `pm block` is local *conditionally*: offline it writes the records and
 * skips the push. `pm new`'s only remote use is a read-only `ls-remote` for id
 * allocation, and it never writes outward at all.
 *
 * Read-only and mechanical commands — `pm index`, `pm validate`, `pm ship`,
 * `check pr`, `heartbeat`, `doctor` — are not gated. Neither is
 * `context refresh`, which would be circular, nor `access sync --dry-run`,
 * which leaves nothing behind: its whole output is a description of what
 * *would* change, and reading that on stale context is how you find out the
 * context is stale.
 */
export const GATED = {
    "pm claim": "external",
    "pm new": "local",
    "pm link-issue": "local",
    // `local`, and it takes work to keep it true: `block` normally ends in
    // `commitRecords` — add, commit, **push** — so an offline session skips the
    // push and says the block is on disk but not yet visible. The blunt
    // alternative was reclassifying it `external`, which shuts the one escape
    // hatch AGENTS.md gives an agent that hits real ambiguity: *block rather
    // than guess*. Refusing it offline leaves guessing or stopping, for exactly
    // the session that most needs the third option.
    "pm block": "local",
    "access sync": "external",
    "firebase auth setup": "external",
};
/**
 * True when the operator has declared this session offline. An env var as
 * well as a flag because hooks and wrappers set environment, not argv — and
 * because it has to be *declared*: an unreachable remote is `unknown` either
 * way, and the exception is the human saying "I know, proceed locally".
 */
export function offlineDeclared(flag) {
    return flag === true || process.env["MORPHEUS_OFFLINE"] === "1";
}
/**
 * The gate. Fails closed, and says what would clear it.
 *
 * The message matters as much as the verdict: this is the only thing an agent
 * sees, and a refusal that does not name the next command is a refusal the
 * agent will work around rather than satisfy.
 */
export async function gate(root, action, reach, options = {}) {
    const { lease, issue, trunkMissing } = await check(root, options.now ?? new Date());
    if (!lease) {
        const why = issue
            ? `Session state exists but could not be read — ${issue}`
            : "No context receipt for this worktree.";
        return {
            ok: false,
            message: `${why}\n\n  Read ${"`"}.agent/decisions.md${"`"} and ${"`"}.agent/learned.md${"`"}, then run:\n    morpheus context refresh`,
        };
    }
    if (lease.status === "fresh")
        return { ok: true, message: issue ?? "" };
    // A trunk ref that does not exist is a **configuration** error wearing an
    // `unknown` lease. It is not an offline condition, so the offline exception
    // must not contain it: containing it would make `pm block` quietly stop
    // pushing on a fully online machine, and would answer a misconfiguration
    // with "reconnect". Checked before the offline branch for exactly that.
    if (trunkMissing) {
        return {
            ok: false,
            message: `The configured trunk \`${trunkMissing.remote}/${trunkMissing.branch}\` does not exist.\n\n` +
                `  This is not a network problem — every observation will be "unknown" until it is\n` +
                `  fixed. Set \`context.trunk\` in morpheus.json, or add the remote.\n` +
                `  \`morpheus doctor\` reports it too.`,
        };
    }
    if (lease.status === "unknown" && offlineDeclared(options.offline)) {
        // The exception covers an **unverifiable trunk**, and nothing else.
        // `observeLease` returns `unknown` unconditionally for an unreachable
        // remote but still fills in the local delta, because that half is
        // knowable without a network — so waving it through would permit exactly
        // the harm the gated list names for `pm block`: escalating a question the
        // records already answered, on records the session could have read.
        if (lease.changedInputs.length) {
            return {
                ok: false,
                message: `${new ContextFreshnessError(lease).message}\n\n` +
                    `  Offline covers a trunk you cannot reach — not records you can.\n` +
                    `${next(lease)}`,
            };
        }
        if (reach === "local") {
            return {
                ok: true,
                contained: true,
                message: `Offline: proceeding with ${action} because it stays on this machine. The trunk was not verified.`,
            };
        }
        return {
            ok: false,
            message: `Offline, and ${action} leaves this machine.\n\n` +
                `  The offline exception covers local work only — pushing, granting access and\n` +
                `  operating external controls need a verified trunk. Reconnect, then:\n    morpheus context refresh`,
        };
    }
    return {
        ok: false,
        message: `${new ContextFreshnessError(lease).message}\n\n${next(lease)}` +
            (lease.status === "unknown"
                ? `\n\n  If you are deliberately offline, MORPHEUS_OFFLINE=1 permits local work on\n  records you have read.`
                : ""),
    };
}
/**
 * What to do next, which is not always "refresh".
 *
 * `ContextFreshnessError` already separates repair from refresh in its own
 * sentence; appending an unconditional "read it, then refresh" underneath
 * contradicts it whenever the whole delta is unresolvable. One derivation,
 * used by both branches above.
 */
function next(lease) {
    const stuck = lease.unresolvableInputs ?? [];
    const readable = lease.changedInputs.filter((id) => !stuck.includes(id));
    if (!readable.length && stuck.length) {
        return `  Repair what it names — refreshing will not clear it.`;
    }
    return `  Read what it names, then run:\n    morpheus context refresh`;
}
//# sourceMappingURL=gate.js.map