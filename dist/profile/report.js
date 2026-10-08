import { markdownTable } from "../markdown.js";
import { credible, MAX_CREDIBLE_SPAN_MS, percentile } from "./derive.js";
import { displayCommand } from "./classify.js";
import { PHASES, addTokens, emptyTokens, totalTokens } from "./types.js";
export const TOP_N = 10;
function group(sessions, key) {
    const map = new Map();
    for (const s of sessions) {
        const k = key(s);
        let g = map.get(k);
        if (!g)
            map.set(k, (g = { key: k, sessions: 0, activeMs: 0, tokens: emptyTokens(), costUSD: 0 }));
        g.sessions++;
        g.activeMs += s.activeMs;
        addTokens(g.tokens, s.tokens);
        g.costUSD += s.costUSD ?? 0;
    }
    return [...map.values()].sort((a, b) => b.activeMs - a.activeMs);
}
/**
 * Group key for "repeated commands": the command with its leading `cd …`
 * and environment assignments removed, so the same check run from two
 * worktrees counts as one command.
 */
export function commandKey(command) {
    return displayCommand(command.replace(/…$/, "")).slice(0, 80);
}
export function buildReport(sessions, spans) {
    const tokens = emptyTokens();
    let activeMs = 0;
    let wallMs = 0;
    let costUSD = 0;
    for (const s of sessions) {
        addTokens(tokens, s.tokens);
        activeMs += s.activeMs;
        if (!s.isSidechain)
            wallMs += s.wallMs;
        costUSD += s.costUSD ?? 0;
    }
    const phases = new Map(PHASES.map((phase) => [phase, { phase, calls: 0, mainMs: 0, sidechainMs: 0, tokens: 0, outputTokens: 0 }]));
    for (const span of spans) {
        const line = phases.get(span.phase);
        line.calls++;
        const d = span.background || !credible(span.durationMs) ? 0 : span.durationMs;
        if (span.isSidechain)
            line.sidechainMs += d;
        else
            line.mainMs += d;
        line.tokens += (span.inputTokens ?? 0) + (span.outputTokens ?? 0);
        line.outputTokens += span.outputTokens ?? 0;
    }
    const models = new Map();
    for (const s of sessions) {
        let dominant;
        let dominantRequests = -1;
        for (const m of s.byModel) {
            const key = `${m.model}\u0000${m.effort ?? "-"}`;
            let line = models.get(key);
            if (!line)
                models.set(key, (line = { model: m.model, effort: m.effort ?? "-", requests: 0, tokens: emptyTokens(), activeMs: 0 }));
            line.requests += m.requests;
            addTokens(line.tokens, m.tokens);
            if (m.requests > dominantRequests) {
                dominant = line;
                dominantRequests = m.requests;
            }
        }
        if (dominant)
            dominant.activeMs += s.activeMs;
    }
    const providers = [...new Set(sessions.map((s) => s.provider))].sort();
    const firstTurn = providers.map((provider) => {
        const values = sessions
            .filter((s) => s.provider === provider && !s.isSidechain && s.firstTurnContextTokens !== null)
            .map((s) => s.firstTurnContextTokens);
        return {
            provider,
            sessions: values.length,
            p50: percentile(values, 50),
            p90: percentile(values, 90),
            max: values.length ? Math.max(...values) : null,
        };
    });
    const commands = spans.filter((s) => s.command !== null && !s.background && credible(s.durationMs));
    const slowest = [...commands]
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, TOP_N)
        .map((s) => ({ command: s.command, durationMs: s.durationMs, phase: s.phase, repo: s.repo, start: s.start }));
    const repeatedMap = new Map();
    for (const s of commands) {
        const key = commandKey(s.command);
        let line = repeatedMap.get(key);
        if (!line)
            repeatedMap.set(key, (line = { command: key, calls: 0, totalMs: 0, maxMs: 0, phase: s.phase }));
        line.calls++;
        line.totalMs += s.durationMs;
        line.maxMs = Math.max(line.maxMs, s.durationMs);
    }
    const repeated = [...repeatedMap.values()]
        .filter((l) => l.calls > 1)
        .sort((a, b) => b.calls - a.calls || b.totalMs - a.totalMs)
        .slice(0, TOP_N);
    const side = sessions.filter((s) => s.isSidechain);
    const sideActive = side.reduce((n, s) => n + s.activeMs, 0);
    const sideTokens = side.reduce((n, s) => n + totalTokens(s.tokens), 0);
    return {
        sessions: sessions.length,
        mainSessions: sessions.length - side.length,
        activeMs,
        wallMs,
        tokens,
        costUSD,
        byPhase: [...phases.values()].filter((p) => p.calls > 0).sort((a, b) => b.mainMs + b.sidechainMs - (a.mainMs + a.sidechainMs)),
        byRepo: group(sessions, (s) => s.repo ?? "(unknown)"),
        byRole: group(sessions, (s) => s.role),
        byModel: [...models.values()].sort((a, b) => totalTokens(b.tokens) - totalTokens(a.tokens)),
        firstTurn,
        slowest,
        repeated,
        outliers: spans
            .filter((s) => s.durationMs !== null && !credible(s.durationMs))
            .map((s) => ({ tool: s.tool, durationMs: s.durationMs, repo: s.repo, start: s.start })),
        sidechainShare: {
            activeTime: activeMs ? sideActive / activeMs : 0,
            tokens: totalTokens(tokens) ? sideTokens / totalTokens(tokens) : 0,
        },
    };
}
export function formatDuration(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60)
        return `${m}m${String(s % 60).padStart(2, "0")}s`;
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}
export function formatTokens(n) {
    if (n >= 1e9)
        return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6)
        return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3)
        return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
}
function pct(x) {
    return `${(x * 100).toFixed(1)}%`;
}
function code(command) {
    return `\`${command.replace(/`/g, "'").replace(/\|/g, "\\|")}\``;
}
function groupTable(lines, label) {
    return markdownTable([label, "sessions", "active", "tokens", "output", "cost (Claude)"], lines.map((g) => [
        g.key,
        String(g.sessions),
        formatDuration(g.activeMs),
        formatTokens(totalTokens(g.tokens)),
        formatTokens(g.tokens.output),
        g.costUSD ? `$${g.costUSD.toFixed(2)}` : "-",
    ]), "_none_");
}
export function renderReport(r, heading) {
    const out = [];
    out.push(`## ${heading}`, "");
    out.push(`${r.sessions} sessions (${r.mainSessions} main, ${r.sessions - r.mainSessions} subagent) · ` +
        `active ${formatDuration(r.activeMs)} · main-session wall ${formatDuration(r.wallMs)} · ` +
        `tokens ${formatTokens(totalTokens(r.tokens))} (output ${formatTokens(r.tokens.output)}, ` +
        `cache read ${formatTokens(r.tokens.cacheRead)}) · Claude cost $${r.costUSD.toFixed(2)}`, "");
    out.push("### Time and tokens by phase", "");
    out.push(markdownTable(["phase", "calls", "main time", "subagent time", "tokens", "output"], r.byPhase.map((p) => [
        p.phase,
        String(p.calls),
        formatDuration(p.mainMs),
        formatDuration(p.sidechainMs),
        formatTokens(p.tokens),
        formatTokens(p.outputTokens),
    ]), "_no tool calls_"), "", "_Time is summed tool-call duration; parallel calls overlap. Tokens are the issuing request's, split across the calls it made (Claude only)._", "");
    if (r.outliers.length) {
        out.push(`${r.outliers.length} call(s) longer than ${formatDuration(MAX_CREDIBLE_SPAN_MS)} left out as resumed sessions, not work: ` +
            r.outliers.map((o) => `${o.tool} ${formatDuration(o.durationMs)}`).join(", "), "");
    }
    out.push("### By repository", "", groupTable(r.byRepo, "repo"), "");
    out.push("### By role", "", groupTable(r.byRole, "role"), "");
    out.push(`Subagent share: ${pct(r.sidechainShare.activeTime)} of active time, ${pct(r.sidechainShare.tokens)} of tokens.`, "");
    out.push("### By model × effort", "");
    out.push(markdownTable(["model", "effort", "requests", "tokens", "output", "active (dominant)"], r.byModel.map((m) => [
        m.model,
        m.effort,
        String(m.requests),
        formatTokens(totalTokens(m.tokens)),
        formatTokens(m.tokens.output),
        formatDuration(m.activeMs),
    ]), "_none_"), "");
    out.push("### First-turn context (main sessions)", "");
    out.push(markdownTable(["provider", "sessions", "p50", "p90", "max"], r.firstTurn.map((f) => [
        f.provider,
        String(f.sessions),
        f.p50 === null ? "-" : formatTokens(f.p50),
        f.p90 === null ? "-" : formatTokens(f.p90),
        f.max === null ? "-" : formatTokens(f.max),
    ]), "_none_"), "");
    out.push(`### Slowest commands (top ${TOP_N})`, "");
    out.push(markdownTable(["duration", "phase", "repo", "command"], r.slowest.map((s) => [formatDuration(s.durationMs), s.phase, s.repo ?? "-", code(s.command)]), "_none_"), "");
    out.push(`### Most repeated commands (top ${TOP_N})`, "");
    out.push(markdownTable(["calls", "total", "max", "phase", "command"], r.repeated.map((c) => [String(c.calls), formatDuration(c.totalMs), formatDuration(c.maxMs), c.phase, code(c.command)]), "_none_"));
    return out.join("\n");
}
//# sourceMappingURL=report.js.map