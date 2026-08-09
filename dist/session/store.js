import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
/**
 * Local-only session state. `local/` is deliberately gitignored, so a receipt
 * never becomes a misleading shared claim that another machine has read the
 * same files. Shared evidence remains the worklog/commit/PR.
 */
export function leasePath(root, sessionId) {
    return join(root, "local", "sessions", `${sessionId}.json`);
}
const contextInput = z.strictObject({ id: z.string(), fingerprint: z.string() });
/**
 * The enforcement point for the receipt's one privacy claim — *safe source
 * labels only, never raw memory or conversation text*. A bare `string[]` made
 * that a convention for whoever writes the producer, which is the "a field
 * names a guarantee the code does not provide" shape this module exists to
 * stop. `store:key` and a hard length bound will not hold prose.
 */
const advisoryMemorySource = z
    .string()
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*:[\w./-]+$/, "must be a `source:key` label, not free text");
/**
 * Strict throughout, so a persisted key that no longer exists is loud rather
 * than dropped. `unreadableInputs` → `unresolvableInputs` was a breaking
 * format change under an unchanged `version`; non-strict, an old lease would
 * have parsed clean with every unresolvable record silently reading as
 * refreshable. `LeaseRead.issue` is exactly the channel for saying so.
 */
const leaseSchema = z.strictObject({
    version: z.literal(1),
    receipt: z.strictObject({
        version: z.literal(1),
        id: z.string(),
        createdAt: z.string(),
        remoteSha: z.string(),
        branch: z.string(),
        worktree: z.string(),
        inputs: z.array(contextInput),
        advisoryMemorySources: z.array(advisoryMemorySource).optional(),
    }),
    checkedAt: z.string(),
    status: z.enum(["fresh", "refresh_required", "unknown"]),
    changedInputs: z.array(z.string()),
    unresolvableInputs: z.array(z.string()).optional(),
    remoteAdvanced: z.literal(true).optional(),
    reason: z.string().optional(),
});
/**
 * Persist a lease, validated on the way out as well as in.
 *
 * A guarantee about what is never written has to be checked where writing
 * happens — an adapter that put a memory *hit* rather than a memory *source*
 * into the receipt would otherwise land conversation text in
 * `local/sessions/`, and a read-side check would only notice afterwards.
 *
 * Reported as data rather than thrown, and the advisory field is dropped
 * rather than taken as grounds to discard the lease. Throwing put the failure
 * on the wrong side of the distinction `LeaseRead.issue` exists to preserve: a
 * hook that computed a correct lease, threw on one malformed label, and caught
 * broadly would leave nothing on disk — and the next `readLease` would report
 * *no session was ever established*. `advisoryMemorySources` is optional and
 * advisory by its own name; the receipt and the verdict are what the protocol
 * runs on.
 */
export async function writeLease(root, sessionId, lease) {
    const path = leasePath(root, sessionId);
    let toWrite = lease;
    let issue;
    if (!leaseSchema.safeParse(lease).success) {
        const { advisoryMemorySources: _dropped, ...receipt } = lease.receipt;
        const stripped = { ...lease, receipt };
        const retry = leaseSchema.safeParse(stripped);
        if (!retry.success) {
            return { path, written: false, issue: `${path}: not a session lease — ${detail(retry.error)}` };
        }
        toWrite = stripped;
        issue = `${path}: dropped advisoryMemorySources — not \`source:key\` labels`;
    }
    try {
        await mkdir(dirname(path), { recursive: true });
        // Write-then-rename: a crash mid-write leaves the previous lease intact
        // rather than a half-file that `readLease` would have to reject.
        const staging = `${path}.${process.pid}.tmp`;
        await writeFile(staging, `${JSON.stringify(toWrite, null, 2)}\n`, "utf8");
        await rename(staging, path);
    }
    catch (error) {
        // Data, like every other failure in this module — `readLease` handles
        // these same codes ten lines down. And `written: false` is load-bearing
        // rather than cosmetic: surviving the previous file is the safe outcome
        // against a half-write and the *fail-open* one against a failed write,
        // because a stale `fresh` lease inside its term still passes
        // `requireFresh`. This is the only place a caller can learn which happened.
        const err = error;
        return { path, written: false, issue: `${path}: ${err.code ?? err.message}` };
    }
    return issue ? { path, written: true, issue } : { path, written: true };
}
function detail(error) {
    return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}
/** Remove a session's stored lease. Absent is not an error. */
export async function clearLease(root, sessionId) {
    await rm(leasePath(root, sessionId), { force: true });
}
/**
 * Read local session state, surfacing a malformed file as data rather than
 * casting it through. Parseable-but-wrong JSON would otherwise reach
 * `requireFresh` and fail with a type error instead of a freshness error.
 */
export async function readLease(root, sessionId) {
    const path = leasePath(root, sessionId);
    let raw;
    try {
        raw = await readFile(path, "utf8");
    }
    catch (error) {
        const err = error;
        // The same two holes `readInputs` had, in the sibling file. A raw fs error
        // thrown from here aborts the guard instead of failing closed through it,
        // and `readFile` follows symlinks — so a dangling one reports ENOENT and
        // unusable state reads as "no session was ever established", which is what
        // this function exists to prevent.
        if (err.code !== "ENOENT")
            return { lease: null, issue: `${path}: ${err.code ?? err.message}` };
        if (await lstat(path).catch(() => null)) {
            return { lease: null, issue: `${path}: dangling symlink — the lease it pointed at is gone` };
        }
        return { lease: null };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        return { lease: null, issue: `${path}: not valid JSON (${error.message})` };
    }
    const result = leaseSchema.safeParse(parsed);
    if (!result.success) {
        return { lease: null, issue: `${path}: not a session lease — ${detail(result.error)}` };
    }
    return { lease: result.data };
}
//# sourceMappingURL=store.js.map