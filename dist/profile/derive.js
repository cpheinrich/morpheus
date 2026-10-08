import { basename } from "node:path";
/**
 * A gap between two consecutive transcript events longer than this is counted
 * as this long and no longer. Five minutes is longer than any single model
 * turn we have seen without an intervening event, and shorter than the gaps
 * that mean a person walked away — so a session left open overnight reads as
 * its working time plus at most five minutes per pause, not as twelve hours.
 *
 * Gaps that fall entirely inside a running tool call are exempt: a twenty-
 * minute `gh pr checks --watch` writes nothing until it returns, and that wait
 * is precisely the cost this command exists to show.
 */
export const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
/**
 * A tool result arriving later than this after its call is a session that was
 * left and resumed — a permission prompt answered the next morning, an MCP call
 * that outlived its client — not work. Such a span keeps its measured duration
 * in `extract` but is not treated as busy time, and `report` sets it aside as
 * an outlier. The longest legitimate calls seen in practice (a full Python test
 * suite, a CI watch) run well under it.
 */
export const MAX_CREDIBLE_SPAN_MS = 4 * 60 * 60 * 1000;
export function credible(durationMs) {
    return durationMs !== null && durationMs <= MAX_CREDIBLE_SPAN_MS;
}
/**
 * Active time across sorted-or-unsorted event timestamps (epoch ms): the sum
 * of consecutive gaps, each capped at `idleMs` unless a busy interval covers
 * it entirely.
 */
export function activeTime(timestamps, busy = [], idleMs = IDLE_THRESHOLD_MS) {
    const ts = timestamps.filter(Number.isFinite).sort((a, b) => a - b);
    const merged = mergeIntervals(busy);
    let total = 0;
    for (let i = 1; i < ts.length; i++) {
        const from = ts[i - 1];
        const to = ts[i];
        const gap = to - from;
        total += gap <= idleMs || covered(merged, from, to) ? gap : idleMs;
    }
    return total;
}
function mergeIntervals(intervals) {
    const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
    const out = [];
    for (const i of sorted) {
        const last = out[out.length - 1];
        if (last && i.start <= last.end)
            last.end = Math.max(last.end, i.end);
        else
            out.push({ ...i });
    }
    return out;
}
function covered(merged, from, to) {
    let lo = 0;
    let hi = merged.length - 1;
    let candidate;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const m = merged[mid];
        if (m.start <= from) {
            candidate = m;
            lo = mid + 1;
        }
        else
            hi = mid - 1;
    }
    return candidate !== undefined && candidate.end >= to;
}
/**
 * Roadmap ids in branches use dots (`mo-26-10-07-20.37.19-slug`); in worktree
 * directory names the dots become dashes (`ev-26-10-02-13-20-53-VTtnOY`).
 * Both normalise to the canonical `MO-26-10-07-20.37.19`.
 */
const ITEM_ID = /(?:^|[/_-])([a-z]{2,4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})[.-](\d{2})[.-](\d{2})(?=$|[^0-9])/i;
export function deriveItem(...sources) {
    for (const source of sources) {
        if (!source)
            continue;
        const m = ITEM_ID.exec(source);
        if (m)
            return `${m[1].toUpperCase()}-${m[2]}-${m[3]}-${m[4]}-${m[5]}.${m[6]}.${m[7]}`;
    }
    return null;
}
/**
 * The repository a working directory belongs to, by its directory name.
 * Worktree layouts are recognised first, because a worktree's own basename is
 * a task name, not a repository:
 *
 * - `<repo>/.claude/worktrees/<name>` and `<repo>/local/worktrees/<name>`
 * - `<anything>/.morpheus-worktrees/<repo>-<12 hex>/<item>-<rand>` (and `.morpheus/worktrees`)
 * - `<anything>/.<repo>-worktrees/<repo>-<task>` for other tools' sibling worktrees
 * - `~/.codex/worktrees/<hash>/<repo>`
 *
 * Then `roots` — registered project paths — so a subdirectory such as
 * `evo/apps/ios` is attributed to `evo`. Anything else is its basename.
 */
export function deriveRepo(cwd, roots = [], home) {
    if (!cwd)
        return null;
    const path = cwd.replace(/^file:\/\//, "").replace(/\/+$/, "");
    let m = /^(.*?)\/(?:\.claude|local)\/worktrees\/[^/]+/.exec(path);
    if (m)
        return deriveRepo(m[1], roots, home);
    m = /\/\.morpheus(?:-worktrees|\/worktrees)\/(.+?)-[0-9a-f]{12}(?:\/|-|$)/.exec(path);
    if (m)
        return m[1];
    m = /\/\.([^/]+)-worktrees\/[^/]+/.exec(path);
    if (m)
        return m[1];
    m = /\/\.codex\/worktrees\/[^/]+\/([^/]+)/.exec(path);
    if (m)
        return m[1];
    if (/\/scratch-workspaces\/|^\/(private\/)?tmp\//.test(path))
        return "(scratch)";
    // Codex desktop chats run in a dated folder or a ChatGPT project, not a repository.
    if (/\/Documents\/Codex\/\d{4}-\d{2}-\d{2}\/|\/\.codex\/\.chatgpt-projects\//.test(path))
        return "(chat)";
    if (home && path === home.replace(/\/+$/, ""))
        return "(home)";
    const root = roots
        .map((r) => r.replace(/\/+$/, ""))
        .filter((r) => path === r || path.startsWith(`${r}/`))
        .sort((a, b) => b.length - a.length)[0];
    return basename(root ?? path) || null;
}
/** Nearest-rank percentile of an unsorted list; null for an empty one. */
export function percentile(values, p) {
    if (values.length === 0)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.ceil((p / 100) * sorted.length);
    return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}
//# sourceMappingURL=derive.js.map