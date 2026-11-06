import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { quotaUsed } from "./state.js";
import { QuotaReadError, readerFailure } from "./quota-reader.js";
const READ_MS = 60_000, CLEANUP_FUSE_MS = 3_000, INIT_ID = "morpheus-cd-init", USAGE_ID = "morpheus-cd-usage";
export const CLAUDE_USAGE_SOURCE = "Claude Code get_usage";
/**
 * Builds whose `get_usage` freshness code was read: a snapshot younger than 60 s answers without asking the
 * endpoint, and a failed fetch falls back to a "seeded" answer up to one hour old with `limits` stripped.
 * The reply carries no fetch time, so add a build only after re-reading that code (docs/cd-v2-claude-executor.md).
 */
export const CLAUDE_CODE_ANALYSED_VERSIONS = Object.freeze(["2.1.312"]);
export const CLAUDE_PLAN_NAMES = Object.freeze({ pro: "Claude Pro", max: "Claude Max" });
/** Strip every variable that could route Claude Code to another credential, provider or endpoint. */
export function claudeEnvironment(environment) {
    const env = {};
    for (const [name, value] of Object.entries(environment)) {
        if (/^(?:ANTHROPIC_|CLAUDE_CODE_|CCR_)/.test(name) || name === "AWS_BEARER_TOKEN_BEDROCK")
            continue;
        env[name] = value;
    }
    // CLAUDE_CONFIG_DIR is kept: it selects the native sign-in, and the session binding decides whether that is the bound one.
    env.DISABLE_AUTOUPDATER = "1";
    return env;
}
/** No MCP servers or connectors, and no user, project or local settings (hooks, plugins, env blocks, key helpers). */
export const CLAUDE_ISOLATION_ARGS = Object.freeze(["--strict-mcp-config", "--setting-sources", ""]);
export function claudeModelFamily(model) {
    return model.toLowerCase().match(/^(?:claude-)?(opus|fable|sonnet|haiku)(?:$|[-[])/)?.[1];
}
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const sameEmail = (value, account) => typeof value === "string" && value.trim().toLowerCase() === account.email.trim().toLowerCase();
function check(condition, reason) {
    // Fixed reasons only: provider text can echo credentials and never reaches the ledger.
    if (!condition)
        throw new QuotaReadError(`Claude usage ${reason}; retain budget wait`);
}
/** Coarse pre-claim check on `claude auth status --json`. It cannot see a key injected through a settings file. */
export function verifyClaudeLogin(stdout, account) {
    let status;
    try {
        status = JSON.parse(stdout);
    }
    catch {
        status = undefined;
    }
    const ok = record(status) && status.loggedIn === true && status.authMethod === "claude.ai" && status.apiProvider === "firstParty"
        && sameEmail(status.email, account) && status.subscriptionType === account.subscription;
    if (!ok)
        throw new Error("Claude worker must use its bound claude.ai subscription");
}
/**
 * Authoritative in-process binding from the `initialize` control reply: an analysed build, the bound account and
 * plan, first-party, and no API key or token source. Returns a fixed reason, or undefined when the session is bound.
 */
export function claudeSessionProblem(reply, account) {
    if (!record(reply) || typeof reply.claude_code_version !== "string" || !CLAUDE_CODE_ANALYSED_VERSIONS.includes(reply.claude_code_version))
        return "Claude Code build has not been analysed for this executor";
    const session = reply.account;
    if (!record(session) || !sameEmail(session.email, account) || session.apiProvider !== "firstParty" || session.apiKeySource !== undefined
        || session.tokenSource !== undefined || session.subscriptionType !== CLAUDE_PLAN_NAMES[account.subscription])
        return "Claude session is not the bound claude.ai subscription";
    return undefined;
}
/**
 * Validate one `get_usage` reply from an analysed build. Windows come from the server's own `limits[]` list:
 * every entry not scoped to another model, and the configured family's weekly entry, which must exist.
 */
export function normalizeClaudeUsage(reply, account, model, observedAt) {
    const limits = freshPlanLimits(reply, account);
    const family = claudeModelFamily(model);
    check(family, "has no known quota family for the configured model");
    const windows = [], kinds = [];
    for (const row of limits.limits) {
        const window = planWindow(row, family, observedAt);
        if (!window)
            continue;
        windows.push(window.window);
        kinds.push(window.kind);
    }
    check(kinds.includes("session") && kinds.includes("weekly_all") && kinds.includes("weekly_scoped:family"), "listed no session, weekly or model-family window");
    // Tripwire: the rows must agree with the windows they repeat, so a change of scale or meaning fails closed.
    for (const [kind, name] of [["session", "five_hour"], ["weekly_all", "seven_day"]]) {
        const repeated = limits[name], row = windows[kinds.indexOf(kind)];
        check(record(repeated) && finite(repeated.utilization) && Math.abs(repeated.utilization - row.usedPercent) <= 1, "plan rows disagree with their windows");
    }
    const snapshot = { observedAt, source: CLAUDE_USAGE_SOURCE, windows, model };
    check(quotaUsed(snapshot, observedAt) !== undefined, "returned unknown or expired telemetry");
    return snapshot;
}
/** The bound subscription's freshly read plan limits, with paid extra usage known to be disabled. */
function freshPlanLimits(reply, account) {
    check(record(reply), "returned no usage object");
    check(reply.subscription_type === account.subscription, "reported a different subscription");
    check(reply.rate_limits_available === true, "reported plan limits unavailable");
    const limits = reply.rate_limits;
    check(record(limits), "returned no plan limits");
    // The analysed build strips limits[] from its seeded (up to one hour old) fallback answer.
    check(Array.isArray(limits.limits), "answer was not freshly read");
    const extra = limits.extra_usage;
    check(record(extra) && extra.is_enabled === false, "paid extra usage is enabled or unknown");
    return limits;
}
/** One plan row as a window, or undefined when it is scoped to another model family. */
function planWindow(row, family, observedAt) {
    const { kind, scope, scoped } = planRow(row);
    const ownFamily = scoped !== undefined && scoped.trim().toLowerCase() === family;
    if (scoped !== undefined && !ownFamily)
        return undefined;
    const percent = row.percent;
    check(finite(percent), "returned an invalid plan window");
    const reset = windowReset(row.resets_at, percent, observedAt);
    const id = `${kind}${ownFamily ? `:${family}` : ""}${scope && typeof scope.surface === "string" ? `:${scope.surface}` : ""}`;
    return { window: { id, usedPercent: percent, resetsAt: new Date(reset).toISOString() }, kind: ownFamily ? `${kind}:family` : kind };
}
/** A row's kind, optional scope and the model family name it is scoped to, if any. */
function planRow(row) {
    check(record(row) && typeof row.kind === "string" && row.kind.length > 0 && (row.scope === null || row.scope === undefined || record(row.scope)), "returned malformed plan rows");
    const scope = record(row.scope) ? row.scope : undefined;
    const scoped = scope && record(scope.model) ? scope.model.display_name : undefined;
    check(scoped === undefined || typeof scoped === "string", "returned malformed plan rows");
    return { kind: row.kind, scope, scoped };
}
function windowReset(resetsAt, percent, observedAt) {
    // An unused window may carry no reset; at exactly 0 % it cannot block, so give it a short synthetic reset.
    const reset = typeof resetsAt === "string" ? Date.parse(resetsAt) : resetsAt === null && percent === 0 ? Date.parse(observedAt) + 300_000 : NaN;
    check(Number.isFinite(reset), "returned an invalid plan window");
    return reset;
}
/** One fresh read through the CLI's own sign-in, under the existing private-group reader supervisor. No model turn. */
export async function claudeQuota(command, account, model, environment, observedAt) {
    const directory = await mkdtemp(join(tmpdir(), "morpheus-cd-claude-usage-"));
    try {
        return await readUsage(command, account, model, claudeEnvironment(environment), observedAt, directory);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
}
function readUsage(command, account, model, env, observedAt, cwd) {
    return new Promise((resolve, reject) => new UsageRead(account, model, observedAt, resolve, reject).start(command, env, cwd));
}
/** One supervised `initialize` then `get_usage` exchange; the helper's control channel reports reader exit and group cleanup. */
class UsageRead {
    account;
    model;
    observedAt;
    resolve;
    reject;
    started = Date.now();
    phase = "initialize";
    buffer = "";
    control = "";
    controlBytes = 0;
    cleanup = false;
    cleanupSeen = false;
    settled = false;
    stopping = false;
    value;
    fuse;
    timer;
    child;
    constructor(account, model, observedAt, resolve, reject) {
        this.account = account;
        this.model = model;
        this.observedAt = observedAt;
        this.resolve = resolve;
        this.reject = reject;
    }
    start(command, env, cwd) {
        const helper = fileURLToPath(new URL("./quota-reader.py", import.meta.url));
        const child = this.child = spawn("/usr/bin/python3", [helper, String(READ_MS), command[0], ...command.slice(1), "-p", "--input-format", "stream-json",
            "--output-format", "stream-json", "--verbose", "--no-session-persistence", ...CLAUDE_ISOLATION_ARGS, "--tools", ""], { cwd, env, stdio: ["pipe", "pipe", "pipe", "pipe"] });
        this.timer = setTimeout(() => this.fail("read timed out"), READ_MS);
        child.on("error", () => this.fail("reader could not start"));
        child.stdin.on("error", () => this.fail("transport unavailable"));
        // CLI stderr is untrusted provider text: drain it, never keep it.
        child.stderr.resume();
        child.stdio[3].on("data", (bytes) => this.onControl(bytes));
        child.stdout.on("data", (bytes) => this.onStdout(bytes));
        child.on("close", code => this.onClose(code));
        this.send(INIT_ID, "initialize");
    }
    diagnostic(reason) { return new QuotaReadError(`Claude usage ${reason} (phase=${this.phase} elapsedMs=${Math.max(0, Date.now() - this.started)})`); }
    stop() {
        if (this.stopping)
            return;
        this.stopping = true;
        this.child.stdin.end();
        this.child.kill("SIGTERM");
        this.fuse = setTimeout(() => { this.child.kill("SIGKILL"); this.fail("cleanup unknown"); }, CLEANUP_FUSE_MS);
    }
    fail(reason, error) {
        if (this.settled)
            return;
        this.settled = true;
        clearTimeout(this.timer);
        this.stop();
        this.reject(error ?? this.diagnostic(reason));
    }
    send(id, subtype, extra = {}) {
        this.child.stdin.write(JSON.stringify({ type: "control_request", request_id: id, request: { subtype, ...extra } }) + "\n");
    }
    onControl(bytes) {
        this.controlBytes += bytes.byteLength;
        if (this.controlBytes > 256) {
            this.fail("cleanup unknown");
            return;
        }
        this.control += String(bytes);
        while (this.control.includes("\n")) {
            const end = this.control.indexOf("\n"), line = this.control.slice(0, end);
            this.control = this.control.slice(end + 1);
            let status;
            try {
                status = JSON.parse(line);
            }
            catch {
                this.fail("cleanup unknown");
                return;
            }
            if (!this.controlStatus(status)) {
                this.fail("cleanup unknown");
                return;
            }
        }
    }
    /** Applies one helper status line; false when it is malformed or a repeated cleanup report. */
    controlStatus(status) {
        if (!record(status))
            return false;
        const keys = Object.keys(status), live = !this.stopping && !this.settled;
        if (keys.length === 1 && ["terminated", "unknown"].includes(status.cleanup)) {
            if (this.cleanupSeen)
                return false;
            this.cleanupSeen = true;
            this.cleanup = status.cleanup === "terminated";
            return true;
        }
        const failure = readerFailure(status, keys.length, "reader");
        if (failure === undefined)
            return false;
        if (live)
            this.fail(failure);
        return true;
    }
    onStdout(bytes) {
        if (this.stopping || this.settled)
            return;
        this.buffer += String(bytes);
        if (this.buffer.length > 1_048_576) {
            this.fail("response unavailable");
            return;
        }
        while (this.buffer.includes("\n") && !this.stopping && !this.settled) {
            const end = this.buffer.indexOf("\n"), line = this.buffer.slice(0, end);
            this.buffer = this.buffer.slice(end + 1);
            const response = this.expectedResponse(line);
            if (!response)
                continue;
            if (response.subtype !== "success") {
                this.fail("request refused");
                return;
            }
            if (!this.accept(response.response))
                return;
        }
    }
    /** The control response this phase is waiting for, if the line is one. */
    expectedResponse(line) {
        let message;
        try {
            message = JSON.parse(line);
        }
        catch {
            return undefined;
        }
        if (!record(message) || message.type !== "control_response" || !record(message.response))
            return undefined;
        return message.response.request_id === (this.phase === "initialize" ? INIT_ID : USAGE_ID) ? message.response : undefined;
    }
    /** Advances on a successful reply: bind, then ask for usage, then keep the value and stop. False once the read has failed. */
    accept(reply) {
        if (this.phase === "initialize") {
            const problem = claudeSessionProblem(reply, this.account);
            if (problem) {
                this.fail("binding", new QuotaReadError(`${problem}; retain budget wait`));
                return false;
            }
            // Only an analysed build bound to the account is asked for usage.
            this.phase = "usage";
            this.send(USAGE_ID, "get_usage", { skip_behaviors: true });
            return true;
        }
        try {
            this.value = normalizeClaudeUsage(reply, this.account, this.model, this.observedAt);
        }
        catch (error) {
            this.fail("invalid", error instanceof QuotaReadError ? error : undefined);
            return false;
        }
        this.phase = "cleanup";
        this.stop();
        return true;
    }
    onClose(code) {
        clearTimeout(this.fuse);
        if (!this.cleanup || this.control.length !== 0 || code !== 0) {
            if (!this.settled)
                this.fail("cleanup unknown");
            else
                console.error(this.diagnostic("cleanup unknown").message);
            return;
        }
        if (this.settled)
            return;
        if (Date.now() - this.started >= READ_MS || !this.value) {
            this.fail("returned unknown or expired telemetry");
            return;
        }
        this.settled = true;
        clearTimeout(this.timer);
        this.resolve(this.value);
    }
}
//# sourceMappingURL=claude-quota.js.map