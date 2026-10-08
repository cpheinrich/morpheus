/**
 * Phase rules for shell commands, in priority order: the first rule that
 * matches *any* segment of a compound command wins. Priority, not position,
 * because `cd repo && pnpm test` is a check, and `git push && gh pr checks
 * --watch` is spent waiting on CI however it was spelled.
 *
 * Each rule is anchored to the start of a segment, after `cd`, environment
 * assignments and `pnpm`/`npx` runners are stripped — so `rg "pnpm test"` is a
 * search, not a check.
 */
export const COMMAND_RULES = [
    { phase: "ci-wait", pattern: /^gh (pr checks\b.*--watch|run watch\b)/, why: "blocks until CI finishes" },
    { phase: "ci-wait", pattern: /^(until|while)\b.*\bgh (pr checks|run (view|list))\b/, why: "a hand-rolled CI poll loop" },
    { phase: "ci-wait", pattern: /^morpheus wait-ci\b/, why: "blocks once until CI finishes" },
    { phase: "review", pattern: /^morpheus review\b/, why: "the independent-review packet and record" },
    { phase: "review", pattern: /^codex review\b/, why: "a model review run" },
    { phase: "checks", pattern: /^morpheus check\b/, why: "`check pr` is the PR convention gate" },
    {
        phase: "context",
        pattern: /^morpheus (context|heartbeat|pm|inbox|team|doctor|self|registry|codebase-memory)\b/,
        why: "session ceremony: receipts, claims, indexes, validation",
    },
    {
        phase: "checks",
        pattern: /^(pnpm|npm|yarn|bun)( (-C|--dir|--filter|--prefix) \S+)*( run)? (typecheck|test|test:\S+|lint|check|compile|validate)\b/,
        why: "the repository's own check scripts",
    },
    {
        phase: "checks",
        pattern: /^(vitest|jest|tsc|eslint|prettier --check|pytest|ruff|mypy|swift test|cargo (test|clippy)|go (test|vet)|swift-format lint)\b/,
        why: "test runners, type checkers and linters invoked directly",
    },
    { phase: "checks", pattern: /^(xcodebuild|xcrun xcodebuild)\b.*\b(test|test-without-building)\b/, why: "iOS test runs" },
    { phase: "simulator", pattern: /^xcrun simctl\b/, why: "simulator control" },
    {
        phase: "build",
        pattern: /^(xcodebuild|swift build|cargo build|docker build|next build|vite build|(pnpm|npm|yarn|bun)( run)? (build|install|i)\b|(pnpm|npm|yarn) (add|ci)\b)/,
        why: "builds and dependency installs",
    },
    { phase: "git", pattern: /^git\b/, why: "local version control" },
    { phase: "gh", pattern: /^gh\b/, why: "GitHub API: PRs, issues, runs" },
    { phase: "wait", pattern: /^sleep\b/, why: "an explicit pause" },
    { phase: "edit", pattern: /^(apply_patch|patch)\b/, why: "file edits through the shell" },
    {
        phase: "read/search",
        pattern: /^(cat|sed -n|head|tail|less|rg|grep|egrep|find|fd|ls|tree|wc|jq|stat|file|du|diff|codebase-memory-mcp)\b/,
        why: "reading and searching files",
    },
];
/** Tools classified by name alone. MCP tools match on their server prefix below. */
const TOOL_PHASES = {
    Read: "read/search",
    Grep: "read/search",
    Glob: "read/search",
    LSP: "read/search",
    ToolSearch: "read/search",
    WebFetch: "read/search",
    WebSearch: "read/search",
    Edit: "edit",
    Write: "edit",
    NotebookEdit: "edit",
    MultiEdit: "edit",
    FileChange: "edit",
    Agent: "subagent",
    Task: "subagent",
    SendMessage: "subagent",
    TaskStop: "subagent",
    ListAgents: "subagent",
    SubagentHandback: "subagent",
    spawn_agent: "subagent",
    send_message: "subagent",
    followup_task: "subagent",
    list_agents: "subagent",
    AskUserQuestion: "human-wait",
    ExitPlanMode: "human-wait",
    wait_agent: "wait",
    Monitor: "wait",
    ScheduleWakeup: "wait",
    wait: "wait",
    sleep: "wait",
    "extension:clock.sleep": "wait",
};
const MCP_PREFIX_PHASES = [
    [/^mcp__Claude_Browser__|^mcp__.*(playwright|browser|chrome)/i, "browser"],
    [/^mcp__Claude_Code_iOS_Simulator__|^mcp__.*simulator/i, "simulator"],
    [/^mcp__codebase-memory/i, "read/search"],
    [/^mcp__cua_/, "browser"],
];
const SHELL_TOOLS = new Set(["Bash", "exec_command", "CommandExecution", "shell", "local_shell"]);
/**
 * The read of the agent's own records — decisions, learned, the inbox — is
 * context loading even though it is a plain file read.
 */
const CONTEXT_PATH = /(^|\/)(\.agent\/|hq\/team\/|AGENTS\.md$|CLAUDE\.md$)/;
const REVIEW_HINT = /\breview(er)?\b/i;
/** Split a shell command into the segments that each start a program. */
export function commandSegments(command) {
    return command
        .split(/\s*(?:&&|\|\||;|\||\n)\s*/)
        .map(normaliseSegment)
        .filter((s) => s.length > 0 && !/^(cd|export|set|source|\.|true|echo|printf|done|fi|esac)\b/.test(s) && !BARE_ASSIGNMENT.test(s));
}
const BARE_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'[^']*'|\S*)$/;
/**
 * The command as worth showing: leading `cd <dir> &&`, `export X=…;` and
 * `W=<path>;` prefixes removed, because in a worktree they are the same long
 * path on every call and would fill the whole truncated width.
 */
export function displayCommand(command) {
    let s = command.trim();
    const prefix = /^(?:cd\s+("[^"]*"|'[^']*'|\S+)|export\s+[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'[^']*'|\S*)|[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'[^']*'|\S*))\s*(?:&&|;|\n)\s*/;
    for (let m = prefix.exec(s); m && m[0].length < s.length; m = prefix.exec(s))
        s = s.slice(m[0].length);
    return s;
}
function normaliseSegment(segment) {
    // Shell keywords and grouping that precede the program: `do sleep 30`, `(cd x`, `then pnpm test`.
    let s = segment.trim().replace(/^(?:[({]\s*|(?:do|then|else|time)\s+)+/, "");
    // Environment assignments: `FOO=1 BAR=x pnpm test`.
    s = s.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/, "");
    // Runners that only locate a binary: `pnpm exec vitest`, `npx tsc`, `pnpm morpheus pm index`,
    // `uv run --project apps/backend pytest`, `python -m pytest`.
    s = s.replace(/^(?:pnpm (?:exec|dlx) |npx |bunx |pnpm (?=(?:morpheus|vitest|tsc|eslint|jest|prettier)\b)|(?:uv|poetry) run (?:--?\S+(?: (?!-)\S+)? )*|python3? -m (?=(?:pytest|mypy|ruff)\b))/, "");
    s = s.replace(/^node dist\/cli\/index\.js\b/, "morpheus");
    // A program named by path is still that program: `.venv/bin/pytest`, `./node_modules/.bin/tsc`.
    s = s.replace(/^(?:\S*\/)([A-Za-z][\w.-]*)(?=\s|$)/, "$1");
    return s.trim();
}
export function classifyCommand(command) {
    const segments = commandSegments(command);
    for (const rule of COMMAND_RULES) {
        if (segments.some((s) => rule.pattern.test(s)))
            return rule.phase;
    }
    return "other";
}
/**
 * Classify one tool call. `input` is the tool's input object as recorded; only
 * the fields named here are read.
 */
export function classifyTool(tool, input) {
    const fields = (input && typeof input === "object" ? input : {});
    if (SHELL_TOOLS.has(tool)) {
        const command = typeof fields.command === "string" ? fields.command : typeof fields.cmd === "string" ? fields.cmd : "";
        return classifyCommand(command);
    }
    if (tool === "Agent" || tool === "Task" || tool === "spawn_agent") {
        const hint = [fields.subagent_type, fields.description, fields.agent_type, fields.name]
            .filter((v) => typeof v === "string")
            .join(" ");
        return REVIEW_HINT.test(hint) ? "review" : "subagent";
    }
    if (tool === "Read" && typeof fields.file_path === "string" && CONTEXT_PATH.test(fields.file_path)) {
        return "context";
    }
    const named = Object.hasOwn(TOOL_PHASES, tool) ? TOOL_PHASES[tool] : undefined;
    if (named)
        return named;
    for (const [pattern, phase] of MCP_PREFIX_PHASES)
        if (pattern.test(tool))
            return phase;
    return "other";
}
/** Commands are recorded for timing analysis, so a prefix is enough and keeps payloads out. */
export const COMMAND_LIMIT = 120;
/**
 * Values that look like credentials are masked before a command is kept:
 * `FOO_TOKEN=…`, `--password …`, `Authorization: Bearer …`, and any long
 * unbroken key-shaped run. The command is evidence about time, not about
 * what was sent.
 */
export function redactCommand(command) {
    return command
        // URL userinfo: `https://user:pass@host`.
        .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1***@")
        // Header values: `-H "X-Api-Key: …"`, `Authorization: Basic …`, `Cookie: …`.
        .replace(/\b((?:[A-Za-z-]*(?:key|token|secret|auth|authorization|cookie|password))\s*:\s*)(?:(?:Bearer|Basic|token)\s+)?[^\s"']+/gi, "$1***")
        // `curl -u user:pass`, `mysql -pSECRET`.
        .replace(/(\s-u\s+|\s--user[= ])("[^"]*"|'[^']*'|[^\s:]+:\S+)/g, "$1***")
        .replace(/(\b(?:mysql|mysqldump|mariadb)\b[^|;&]*?\s-p)(?!\s)\S+/g, "$1***")
        .replace(/\b([A-Za-z_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|AUTH|CREDENTIALS?)[A-Za-z_]*)=("[^"]*"|'[^']*'|\S+)/gi, "$1=***")
        .replace(/(--(?:token|password|secret|api-key|auth)[= ])("[^"]*"|'[^']*'|\S+)/gi, "$1***")
        .replace(/\b(Bearer|token)\s+[A-Za-z0-9._~+/=-]{16,}/gi, "$1 ***")
        .replace(/\b(?:sk|pk|ghp|gho|ghs|github_pat|xox[abp])[-_][A-Za-z0-9_-]{16,}/g, "***")
        .replace(/[A-Za-z0-9+/_-]{40,}={0,2}/g, (m) => (/[0-9]/.test(m) && /[A-Za-z]/.test(m) && !m.includes("/") ? "***" : m));
}
/**
 * A heredoc body is file content or a script, not the command: keep the line
 * that opens it, through the delimiter, and drop the rest.
 */
export function cutHeredoc(command) {
    const m = /<<-?\s*(['"]?)[A-Za-z_][A-Za-z0-9_]*\1/.exec(command);
    if (!m)
        return command;
    const end = m.index + m[0].length;
    const lineEnd = command.indexOf("\n", end);
    return `${command.slice(0, lineEnd === -1 ? command.length : lineEnd)}${lineEnd === -1 ? "" : " …"}`;
}
export function truncateCommand(command) {
    const oneLine = redactCommand(cutHeredoc(displayCommand(command))).replace(/\s+/g, " ").trim();
    return oneLine.length > COMMAND_LIMIT ? `${oneLine.slice(0, COMMAND_LIMIT - 1)}…` : oneLine;
}
//# sourceMappingURL=classify.js.map