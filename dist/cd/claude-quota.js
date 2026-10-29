import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { quotaUsed } from "./state.js";
import { QuotaReadError } from "./quota-reader.js";
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
    check(record(reply), "returned no usage object");
    check(reply.subscription_type === account.subscription, "reported a different subscription");
    check(reply.rate_limits_available === true, "reported plan limits unavailable");
    const limits = reply.rate_limits;
    check(record(limits), "returned no plan limits");
    // The analysed build strips limits[] from its seeded (up to one hour old) fallback answer.
    check(Array.isArray(limits.limits), "answer was not freshly read");
    const extra = limits.extra_usage;
    check(record(extra) && extra.is_enabled === false, "paid extra usage is enabled or unknown");
    const family = claudeModelFamily(model);
    check(family, "has no known quota family for the configured model");
    const rows = limits.limits, windows = [], kinds = [];
    for (const row of rows) {
        check(record(row) && typeof row.kind === "string" && row.kind.length > 0 && (row.scope === null || row.scope === undefined || record(row.scope)), "returned malformed plan rows");
        const scoped = record(row.scope) && record(row.scope.model) ? row.scope.model.display_name : undefined;
        check(scoped === undefined || typeof scoped === "string", "returned malformed plan rows");
        const ownFamily = scoped !== undefined && scoped.trim().toLowerCase() === family;
        if (scoped !== undefined && !ownFamily)
            continue;
        check(finite(row.percent), "returned an invalid plan window");
        // An unused window may carry no reset; at exactly 0 % it cannot block, so give it a short synthetic reset.
        const reset = typeof row.resets_at === "string" ? Date.parse(row.resets_at) : row.resets_at === null && row.percent === 0 ? Date.parse(observedAt) + 300_000 : NaN;
        check(Number.isFinite(reset), "returned an invalid plan window");
        const id = `${row.kind}${ownFamily ? `:${family}` : ""}${record(row.scope) && typeof row.scope.surface === "string" ? `:${row.scope.surface}` : ""}`;
        windows.push({ id, usedPercent: row.percent, resetsAt: new Date(reset).toISOString() });
        kinds.push(ownFamily ? `${row.kind}:family` : row.kind);
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
    return new Promise((resolve, reject) => {
        const started = Date.now();
        let phase = "initialize", buffer = "", control = "", controlBytes = 0, cleanup = false, cleanupSeen = false, settled = false, stopping = false, value;
        let fuse;
        const helper = fileURLToPath(new URL("./quota-reader.py", import.meta.url));
        const child = spawn("/usr/bin/python3", [helper, String(READ_MS), command[0], ...command.slice(1), "-p", "--input-format", "stream-json",
            "--output-format", "stream-json", "--verbose", "--no-session-persistence", ...CLAUDE_ISOLATION_ARGS, "--tools", ""], { cwd, env, stdio: ["pipe", "pipe", "pipe", "pipe"] });
        const diagnostic = (reason) => new QuotaReadError(`Claude usage ${reason} (phase=${phase} elapsedMs=${Math.max(0, Date.now() - started)})`);
        const stop = () => {
            if (stopping)
                return;
            stopping = true;
            child.stdin.end();
            child.kill("SIGTERM");
            fuse = setTimeout(() => { child.kill("SIGKILL"); fail("cleanup unknown"); }, CLEANUP_FUSE_MS);
        };
        const fail = (reason, error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            stop();
            reject(error ?? diagnostic(reason));
        };
        const timer = setTimeout(() => fail("read timed out"), READ_MS);
        const send = (id, subtype, extra = {}) => child.stdin.write(JSON.stringify({ type: "control_request", request_id: id, request: { subtype, ...extra } }) + "\n");
        child.on("error", () => fail("reader could not start"));
        child.stdin.on("error", () => fail("transport unavailable"));
        // CLI stderr is untrusted provider text: drain it, never keep it.
        child.stderr.resume();
        child.stdio[3].on("data", (bytes) => {
            controlBytes += bytes.byteLength;
            if (controlBytes > 256) {
                fail("cleanup unknown");
                return;
            }
            control += String(bytes);
            while (control.includes("\n")) {
                const end = control.indexOf("\n"), line = control.slice(0, end);
                control = control.slice(end + 1);
                let status;
                try {
                    status = JSON.parse(line);
                }
                catch {
                    fail("cleanup unknown");
                    return;
                }
                if (!record(status)) {
                    fail("cleanup unknown");
                    return;
                }
                const keys = Object.keys(status);
                if (keys.length === 1 && ["terminated", "unknown"].includes(status.cleanup)) {
                    if (cleanupSeen) {
                        fail("cleanup unknown");
                        return;
                    }
                    cleanupSeen = true;
                    cleanup = status.cleanup === "terminated";
                }
                else if (keys.length === 2 && status.reader === "spawn-failed" && Number.isInteger(status.errno) && Number(status.errno) >= 0 && Number(status.errno) <= 4095) {
                    if (!stopping && !settled)
                        fail(`reader could not start (errno=${status.errno})`);
                }
                else if (keys.length === 2 && status.reader === "exited" && Number.isInteger(status.code) && Number(status.code) >= -255 && Number(status.code) <= 255) {
                    if (!stopping && !settled)
                        fail(`reader exited (code=${status.code})`);
                }
                else if (keys.length === 1 && status.reader === "status-unavailable") {
                    if (!stopping && !settled)
                        fail("reader status unavailable");
                }
                else {
                    fail("cleanup unknown");
                    return;
                }
            }
        });
        child.stdout.on("data", (bytes) => {
            if (stopping || settled)
                return;
            buffer += String(bytes);
            if (buffer.length > 1_048_576) {
                fail("response unavailable");
                return;
            }
            while (buffer.includes("\n") && !stopping && !settled) {
                const end = buffer.indexOf("\n"), line = buffer.slice(0, end);
                buffer = buffer.slice(end + 1);
                let message;
                try {
                    message = JSON.parse(line);
                }
                catch {
                    continue;
                }
                if (!record(message) || message.type !== "control_response" || !record(message.response))
                    continue;
                const response = message.response, expected = phase === "initialize" ? INIT_ID : USAGE_ID;
                if (response.request_id !== expected)
                    continue;
                if (response.subtype !== "success") {
                    fail("request refused");
                    return;
                }
                if (phase === "initialize") {
                    const problem = claudeSessionProblem(response.response, account);
                    if (problem) {
                        fail("binding", new QuotaReadError(`${problem}; retain budget wait`));
                        return;
                    }
                    // Only an analysed build bound to the account is asked for usage.
                    phase = "usage";
                    send(USAGE_ID, "get_usage", { skip_behaviors: true });
                    continue;
                }
                try {
                    value = normalizeClaudeUsage(response.response, account, model, observedAt);
                }
                catch (error) {
                    fail("invalid", error instanceof QuotaReadError ? error : undefined);
                    return;
                }
                phase = "cleanup";
                stop();
            }
        });
        child.on("close", code => {
            clearTimeout(fuse);
            if (!cleanup || control.length !== 0 || code !== 0) {
                if (!settled)
                    fail("cleanup unknown");
                else
                    console.error(diagnostic("cleanup unknown").message);
                return;
            }
            if (settled)
                return;
            if (Date.now() - started >= READ_MS || !value) {
                fail("returned unknown or expired telemetry");
                return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(value);
        });
        send(INIT_ID, "initialize");
    });
}
//# sourceMappingURL=claude-quota.js.map