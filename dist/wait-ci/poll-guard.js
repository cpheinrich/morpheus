import { createHash } from "node:crypto";
import { basename, join } from "node:path";
/**
 * The PreToolUse poll guard: on the third `gh run view`, `gh run watch` or
 * `gh pr checks` of one target in one agent session, refuse the call and hand
 * back the single `morpheus wait-ci` command that replaces the loop.
 *
 * Instructions alone did not move the number: transcripts from 2026-09-24 to
 * 2026-10-28 show Claude sessions polling CI 4.6–7.8 times each *after*
 * `wait-ci` existed and `AGENTS.md` said "never poll", and `wait-ci` itself
 * almost never run. Each poll re-reads the whole conversation to learn
 * "still running". A refusal at the moment of the third poll, carrying the
 * exact replacement, is the cheapest point at which to change the behaviour.
 *
 * Two polls are allowed on purpose — a look before and after a push is not a
 * loop — and reading a log (`--log`, `--log-failed`) or opening the browser
 * is never counted, because that is how a failure is diagnosed, not awaited.
 */
/** The poll that is refused. The first `POLL_LIMIT - 1` are allowed. */
export const POLL_LIMIT = 3;
const SEPARATORS = new Set([";", "&", "|", "(", ")", "\n", "`"]);
/**
 * A command line as simple commands, each a list of words with quotes
 * removed. Not a shell parser — enough to find `gh` in `a && gh …`,
 * `x=$(gh …)`, `while …; do gh …; done` and a quoted `--jq` argument, which
 * is where the polls in the transcripts sit.
 */
export function simpleCommands(command) {
    const splitter = new CommandSplitter(command);
    for (let i = 0; i < command.length; i++)
        i = splitter.step(i);
    splitter.endCommand();
    return splitter.commands;
}
/** Word and command boundaries for {@link simpleCommands}; each step consumes one token and returns its last index. */
class CommandSplitter {
    command;
    commands = [];
    words = [];
    word = "";
    inWord = false;
    constructor(command) {
        this.command = command;
    }
    step(i) {
        const c = this.command[i];
        if (c === "'")
            return this.singleQuoted(i);
        if (c === '"')
            return this.doubleQuoted(i);
        if (c === "\\")
            return this.escaped(i);
        if (c === "$" && this.command[i + 1] === "(") {
            this.endCommand();
            return i + 1;
        }
        if (SEPARATORS.has(c))
            this.endCommand();
        else if (c === " " || c === "\t" || c === "\r")
            this.endWord();
        else if (c === "#" && !this.inWord) {
            const newline = this.command.indexOf("\n", i);
            return (newline < 0 ? this.command.length : newline) - 1;
        }
        else
            this.append(c);
        return i;
    }
    append(text) { this.word += text; this.inWord = true; }
    singleQuoted(i) {
        const close = this.command.indexOf("'", i + 1);
        const end = close < 0 ? this.command.length : close;
        this.append(this.command.slice(i + 1, end));
        return end;
    }
    doubleQuoted(i) {
        const command = this.command;
        this.inWord = true;
        for (i++; i < command.length && command[i] !== '"'; i++) {
            if (command[i] === "\\" && i + 1 < command.length)
                i++;
            this.word += command[i];
        }
        return i;
    }
    escaped(i) {
        if (this.command[i + 1] !== "\n")
            this.append(this.command[i + 1] ?? "");
        return i + 1;
    }
    endWord() {
        if (this.inWord)
            this.words.push(this.word);
        this.word = "";
        this.inWord = false;
    }
    endCommand() {
        this.endWord();
        if (this.words.length > 0)
            this.commands.push(this.words);
        this.words = [];
    }
}
/** Words that run the next word as the command. */
const PREFIXES = new Set(["command", "builtin", "exec", "time", "nohup", "env", "do", "then", "else", "elif", "while", "until", "if", "!", "{"]);
function commandStart(words) {
    let i = 0;
    while (i < words.length) {
        const w = words[i];
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || PREFIXES.has(w)) {
            i++;
        }
        else if (w === "timeout" || w === "gtimeout") {
            i++;
            while (words[i]?.startsWith("-"))
                i++;
            i++; // the duration
        }
        else {
            break;
        }
    }
    return i;
}
const SPECS = {
    "run view": {
        values: new Set(["-R", "--repo", "-j", "--job", "-a", "--attempt", "--json", "-q", "--jq", "-t", "--template"]),
        exempt: new Set(["--log", "--log-failed", "-w", "--web", "-h", "--help"]),
    },
    "run watch": {
        values: new Set(["-R", "--repo", "-i", "--interval"]),
        exempt: new Set(["-h", "--help"]),
    },
    "pr checks": {
        values: new Set(["-R", "--repo", "--json", "-q", "--jq", "-t", "--template", "-i", "--interval"]),
        exempt: new Set(["-w", "--web", "-h", "--help"]),
    },
};
const RUN_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)/;
const PR_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/;
/** A value pasted into the suggested command, quoted only when the shell would otherwise split or expand it. */
export function shellWord(value) {
    return /^[\w./:@%+=,-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}
function target(sub, args, cwd) {
    const scanned = scanGhArgs(SPECS[sub], args);
    if (!scanned)
        return null;
    return sub === "pr checks" ? prTarget(scanned.positional, scanned.repo, cwd) : runTarget(sub, scanned.positional, scanned.repo);
}
const repoFlag = (r) => (r ? ` --repo ${shellWord(r)}` : "");
/** The `--repo` value and first positional argument; null when an exempt flag makes the call not a poll. */
function scanGhArgs(spec, args) {
    let repo;
    let positional;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        // A redirection (`2>/dev/null`, `> out.json`) is the shell's, not gh's.
        if (/^\d*(?:>>?|<)/.test(arg)) {
            if (/^\d*(?:>>?|<)$/.test(arg))
                i++;
            continue;
        }
        const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
        const name = eq > 0 ? arg.slice(0, eq) : arg;
        if (spec.exempt.has(name))
            return null;
        if (spec.values.has(name)) {
            const value = eq > 0 ? arg.slice(eq + 1) : args[++i];
            if (name === "-R" || name === "--repo")
                repo = value;
            continue;
        }
        if (!arg.startsWith("-") && positional === undefined)
            positional = arg;
    }
    return { repo, positional };
}
function prTarget(positional, repo, cwd) {
    let pr = positional?.replace(/^#/, "");
    const url = pr ? PR_URL.exec(pr) : null;
    if (url) {
        repo = url[1];
        pr = url[2];
    }
    return {
        kind: "pr",
        key: `pr|${repo ?? ""}|${pr ?? `@${cwd}`}`,
        display: `gh pr checks${pr ? ` ${pr}` : ""}${repoFlag(repo)}`,
        waitCommand: `morpheus wait-ci${pr ? ` ${shellWord(pr)}` : ""}${repoFlag(repo)}`,
    };
}
function runTarget(sub, positional, repo) {
    // Without a run id the only exact replacement is unknown: `--job` alone
    // names a job, and no argument at all is gh's interactive picker.
    if (positional === undefined)
        return null;
    let run = positional;
    const url = RUN_URL.exec(run);
    if (url) {
        repo = url[1];
        run = url[2];
    }
    // `$RUN_ID` or `$(gh run list …)` names a different run on each call, and
    // `wait-ci --run` would refuse the suggestion; an id not visible here is
    // unknown, like the interactive picker.
    if (!/^\d+$/.test(run))
        return null;
    return {
        kind: "run",
        key: `run|${repo ?? ""}|${run}`,
        display: `gh ${sub} ${run}${repoFlag(repo)}`,
        waitCommand: `morpheus wait-ci --run ${shellWord(run)}${repoFlag(repo)}`,
    };
}
/**
 * A heredoc's body is data — a note or a script being written — not commands
 * this call runs, so a `gh run view` line inside one is not a poll.
 */
export function withoutHeredocBodies(command) {
    const out = [];
    let delimiter = null;
    for (const line of command.split("\n")) {
        if (delimiter) {
            if ((delimiter.tabs ? line.replace(/^\t+/, "") : line) === delimiter.word)
                delimiter = null;
            continue;
        }
        out.push(line);
        const start = /<<(-?)\s*(['"]?)([\w.-]+)\2/.exec(line);
        if (start)
            delimiter = { word: start[3], tabs: start[1] === "-" };
    }
    return out.join("\n");
}
/** Every CI poll in one command line, in order; a target polled twice in one line appears twice. */
export function pollTargets(command, cwd = "") {
    const found = [];
    for (const words of simpleCommands(withoutHeredocBodies(command))) {
        const at = commandStart(words);
        if (at >= words.length || basename(words[at]) !== "gh")
            continue;
        const sub = `${words[at + 1] ?? ""} ${words[at + 2] ?? ""}`;
        if (!Object.hasOwn(SPECS, sub))
            continue;
        const t = target(sub, words.slice(at + 3), cwd);
        if (t)
            found.push(t);
    }
    return found;
}
/**
 * Count this call's polls and decide. A refused call did not run, so it is
 * not recorded: the next attempt at the same target is refused again, and a
 * second target named in the refused line keeps its count.
 */
export function decide(state, targets, limit = POLL_LIMIT) {
    const counts = { ...state.counts };
    for (const t of targets)
        counts[t.key] = (counts[t.key] ?? 0) + 1;
    const hit = targets.find((t) => counts[t.key] >= limit);
    if (hit)
        return { allow: false, target: hit, count: counts[hit.key] };
    return { allow: true, state: { ...state, counts } };
}
const ORDINAL = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
export function refusal(target, count) {
    const what = target.kind === "run" ? "the run finishes" : "the pull request's checks finish";
    return [
        `Morpheus poll guard: refused the ${ORDINAL(count)} \`${target.display}\` in this session.`,
        `Each poll re-reads the whole conversation to learn "still running". Wait once instead — it prints`,
        `nothing until ${what}, then the verdict and any failing step's log:`,
        "",
        `  ${target.waitCommand}`,
        "",
        "Exit 0 green, 1 failed, 2 timeout (default 45m; pass --timeout 90m for a long release), 3 error.",
        "Reading a log with --log or --log-failed is never counted.",
    ].join("\n");
}
/** The state file for one session, under the repository's ignored `local/sessions/`. */
export function statePath(root, sessionId) {
    const safe = /^[\w.-]{1,100}$/.test(sessionId) ? sessionId : createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
    return join(root, "local", "sessions", `poll-guard-${safe}.json`);
}
export function parseState(raw, sessionId) {
    const empty = { version: 1, sessionId, counts: {} };
    if (raw === null)
        return empty;
    try {
        const value = JSON.parse(raw);
        if (value.version !== 1 || value.sessionId !== sessionId || !value.counts || typeof value.counts !== "object")
            return empty;
        const counts = {};
        for (const [key, n] of Object.entries(value.counts))
            if (Number.isInteger(n) && n > 0)
                counts[key] = n;
        return { version: 1, sessionId, counts };
    }
    catch {
        return empty;
    }
}
/** The Bash command, session and directory a hook payload names; null for anything else. */
function bashCall(input, fallbackCwd) {
    let payload;
    try {
        payload = JSON.parse(input);
    }
    catch {
        return null;
    }
    if (!payload || typeof payload !== "object")
        return null;
    if (payload.tool_name !== undefined && payload.tool_name !== "Bash")
        return null;
    const command = payload.tool_input?.command;
    const sessionId = payload.session_id;
    if (typeof command !== "string" || typeof sessionId !== "string" || sessionId === "")
        return null;
    return { command, sessionId, cwd: typeof payload.cwd === "string" && payload.cwd ? payload.cwd : fallbackCwd };
}
/**
 * One PreToolUse invocation. Anything it cannot read — no session id, no
 * repository, an unwritable state file — allows the call: the guard steers,
 * it must never be the reason a session cannot run a command.
 */
export async function runPollGuard(input, deps, fallbackCwd = process.cwd()) {
    const call = bashCall(input, fallbackCwd);
    if (!call)
        return { exitCode: 0 };
    const { command, sessionId, cwd } = call;
    const targets = pollTargets(command, cwd);
    if (targets.length === 0)
        return { exitCode: 0 };
    try {
        const root = await deps.root(cwd);
        if (!root)
            return { exitCode: 0 };
        const path = statePath(root, sessionId);
        const decision = decide(parseState(await deps.read(path), sessionId), targets);
        if (!decision.allow)
            return { exitCode: 2, message: refusal(decision.target, decision.count) };
        await deps.write(path, `${JSON.stringify(decision.state, null, 2)}\n`);
        return { exitCode: 0 };
    }
    catch {
        return { exitCode: 0 };
    }
}
//# sourceMappingURL=poll-guard.js.map