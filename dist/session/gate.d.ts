/**
 * How far an action reaches.
 *
 * The offline exception turns on this and nothing else: a session that cannot
 * verify the trunk may still work locally, and may never operate a control
 * that leaves the machine. Without the distinction, offline is either wholly
 * blocked — which is what shipped, and makes a plane useless — or wholly
 * permitted, which is the hole.
 */
export type Reach = "local" | "external";
export interface GateResult {
    ok: boolean;
    /** What to print. Empty when the gate passed silently. */
    message: string;
    /**
     * True only when the offline branch was actually taken — an `unknown`
     * observation *and* a declaration. Callers that degrade their behaviour
     * offline read this rather than `offlineDeclared()` directly: everywhere
     * else in this design the declaration is a modifier on an observation, and
     * a sticky `MORPHEUS_OFFLINE=1` set by a wrapper outlives the condition it
     * was set for.
     */
    contained?: true;
}
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
export declare const GATED: Record<string, Reach>;
/**
 * True when the operator has declared this session offline. An env var as
 * well as a flag because hooks and wrappers set environment, not argv — and
 * because it has to be *declared*: an unreachable remote is `unknown` either
 * way, and the exception is the human saying "I know, proceed locally".
 */
export declare function offlineDeclared(flag?: boolean): boolean;
/**
 * The gate. Fails closed, and says what would clear it.
 *
 * The message matters as much as the verdict: this is the only thing an agent
 * sees, and a refusal that does not name the next command is a refusal the
 * agent will work around rather than satisfy.
 */
export declare function gate(root: string, action: string, reach: Reach, options?: {
    offline?: boolean;
    now?: Date;
}): Promise<GateResult>;
