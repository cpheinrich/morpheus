# Executable workflow comparison

The deeper comparison does **not justify making manager delegation the default for small
repairs**. Frozen scores were6/6 for direct work and5/6 for manager plus Paperclip, with
more time and tokens for the latter. However, the only differing case has an underspecified
input format, and actual execution exposed an external-tool isolation defect. These are
exploratory results, not a qualified ranking of the workflows.

The useful delivered increment is the [explicit Git/Paperclip bridge](paperclip-integration.md),
merged in [PR470](https://github.com/cpheinrich/morpheus/pull/470): one roadmap parent can
link multiple jobs with exact source, artifact and acceptance receipts. Git still owns
protected delivery. This study leaves the earlier12/12 historical decision tie unchanged.

## Frozen method

Eight incident-inspired Python tasks were split into two development and six held-out
cases. All arms received the same public contract, history, starter and smoke test, with
requested gpt-6.1-sol/xhigh through native Codex0.163.0. Served model/effort are unknown.

| Arm | Execution | Separate manager |
|---|---|---|
| A | Direct through the native quota/process wrapper | No |
| Q | Paperclip assignment through the same wrapper | No |
| P | Direct through the wrapper | Yes |
| F | Paperclip assignment through the wrapper | Yes |

A/F ran on all six held-out cases. Q/P and a direct repeat ran on T01/T02 only. Managers
had at most45 seconds within the same170-second initial total, produced a brief from public
facts, and did not implement. One fresh130-second continuation was permitted only for primary
A/F public-smoke failure. All12 primary smokes passed, so no continuation ran. Hidden grading
started after all repair calls terminated. This was a controller-account experiment, not a
two-host benchmark or a replay of large historical implementations.

The predeclared screen required at least two additional F successes, zero A-only successes,
no critical regression and at most25% more input plus output tokens per verified success.
It was **not met** on the frozen scores; validity defects also prevent treating that screen
as a confirmatory comparison. Additional manager reasoning prevents attributing differences
to role labels alone. Queue-only receives the real upstream adapter envelope, so it is not a
byte-identical input control. Six synthetic cases do not establish general productivity.

Plan SHA256: `0431b27286594f1b84ecaf0b60ef87a128b73d31cd7903fe530c0775fa7ffcd9`.
Clarified corpus SHA256: `f37d1e2510eb613c7d6c7f9141234a3cc69f29e0652ac186c7c8a35fb45dd7f9`.
Locked collection used implementation `33dbe5c8`; later source hardening did not change paid
outputs, public inputs, hidden checks, scoring source or frozen selection rules.

## Results retained without retries

| Held-out case | A | F | Q | P | A repeat |
|---|---|---|---|---|---|
| T01: account/quota/lease | Pass | Fail | Pass | Pass | Fail |
| T02: stale async editor result | Pass | Pass | Pass | Pass | Pass |
| T03: paired benchmark manifest | Pass | Pass | — | — | — |
| T04: decision authority | Pass | Pass | — | — | — |
| T05: simulator ownership | Pass | Pass | — | — | — |
| T06: delivery evidence | Pass | Pass | — | — | — |

| Arm | Accepted / scheduled | Model calls | Input tokens | Output tokens | Total episode seconds |
|---|---:|---:|---:|---:|---:|
| A | 6/6 | 6 | 1,078,628 | 31,740 | 485.23 |
| F | 5/6 | 12 | 1,114,962 | 43,819 | 697.78 |
| Q | 2/2 | 2 | 473,655 | 14,470 | 212.15 |
| P | 2/2 | 4 | 352,077 | 12,329 | 199.58 |
| A repeat | 1/2 | 2 | 476,162 | 12,005 | 174.42 |

These totals include managers. All scheduled held-out artifacts and token/elapsed records
were present; none was censored by the budget or retried after hidden feedback. The paired
count is five both-pass, one A-only, zero F-only, zero both-fail. F used43.8% more elapsed time
and25.2% more input plus output tokens per frozen-score success. That ratio is descriptive:
it is not subscription dollars, and the disputed T01 score changes its denominator. Included
subscription tokens are unpriced, not free; cached-input billing is not inferred here.

**T01 is not a reliable model-quality discriminator.** Post-collection inspection found
that hidden tests require a mixed `windows` collection with `kind` tags, but the public
contract names shared/model windows without specifying that collection shape. F and A-repeat
implemented separate collections and explicitly reported the missing schema. Their only
failing hidden check was the valid admission example using the undisclosed shape. A-repeat
also made one clarification request; it received no operator answer or extra task facts.
The pre-lock blind audit missed this ambiguity. Keep all original rows; do not reinterpret
these failures as demonstrated model errors or the A/F gap as evidence of regression.
The other five paired cases tie, a post-hoc descriptive observation rather than a replacement
screen. Repeats on two cases cannot establish a population noise band.

The frozen handoff-material metric was A6/6, F5/6, Q2/2, P1/2 and A-repeat0/2. It requires
accepted behavior plus a report containing literal words and minimum length. Every episode
actually produced a report. Accepted T01-P and T02-A-repeat had meaningful caveats but lacked
the literal `limitation`/`unchecked` token, so the metric missed them. Failed T01 episodes
cannot satisfy the composite regardless of report quality. This is a weak mechanical
presence metric, not evidence of truth, saved human effort, or worse handoffs.

## What qualification found

The curator verified all8 starters fail and references pass. Development D02 exposed an
undisclosed whitespace-only receipt restriction; its wording was clarified before locking,
while all six locked case objects and42 companion files remained byte-identical. Earlier
D01 launch/deadline/retry diagnostics and D02 original failures are retained, not ranked.

Native shell canaries denied oracle reads/chmod and loopback access. Public smoke imports
and hidden candidate execution used separate deny-default Seatbelt processes; the trusted
grader retained expectations. Completed workspaces/traces and private corpus were mode000
during later repair calls. All18 artifacts passed immutable-file checks; all26 held-out
manager/worker receipts reported verified termination. The JSON boundary cannot test Python
object identity or input nonmutation inside the candidate process.

**Tool capability isolation was not qualified.** Although preflight status and development
traces showed zero MCP tools/calls, locked T02-Q successfully indexed its own scratch repo
through codebase-memory-mcp; two subsequent calls were denied. T03-A made two denied MCP
attempts. This demonstrates a real boundary defect. The successful index named only that
worker's scratch tree, used in-memory persistence and returned35 nodes/57 edges. These
records show no oracle access; absence of such a record is not a complete capability proof.

Post-collection probes found CLI `-c` options before the subcommand did not constrain actual
exec/app-server behavior on this build. The new generator puts them after the subcommand,
and exec also uses `--ignore-user-config`. Forced-enabled MCP probes then returned three
servers with zero tools; an actual turn saw no MCP/apps/browser/web tool surface. However,
a separately authorized one-child delegation-denial probe **successfully spawned a child**
despite disabled multi-agent settings. It immediately interrupted the child; the native
child transcript ends in `turn_aborted:interrupted`. No second child ran.

Moreover, `exec --json` omitted those hosted collaboration calls. The collector now labels
its check `recordedToolsAccepted`, with `capabilitiesVerified:false`, rather than pretending
an empty event list qualifies isolation. Typed unexpected events keep the credential vault
sealed pending reconciliation. The generator is a best-effort restriction helper, **not a
complete worker boundary**; no new repair collection or unattended worker rollout is qualified
by it. [The preserved consumer qualification item](../hq/product/roadmap/MO-26-10-23-19.45.05-qualify-paperclip-consumers.md)
requires effective hosted-delegation denial, independent child accounting and real worker
authority checks before widening execution.

A probe also exposed Paperclip returning an old issue on duplicate title despite a different
intended assignee. Exact readback and absence of a native-launch marker identified the mismatch;
no heartbeat ran on the intended binding. After reconciliation, a unique-title submission ran
once. The collector now includes the full agent ID in titles and checks returned company,
assignee and title before observation. A successful POST is not proof of correct assignment.

## Resource accounting and reproduction

The shared experimental ledger reserved42 native identities:38 benchmark calls (12 dev,
26 held-out), three actual capability-parent calls and one pre-native refusal. The delegation
probe added one authorized child outside that ledger. Thus42 actual experiment invocations
including that child, with43 conservative call liabilities; design/review/source agents and
two bridge snapshot calls are additional initiative work within the same shared quota ceiling.
The duplicate-title probe reused only its reconciled, unconsumed identity; no paid answer was
replaced. No new Claude inference or other owner's provider subscription was used.

The phase started at28% weekly used; the post-collection observer read42% before final
review/closure. This14-point shared delta includes source/review work and unrelated account
activity and is not attributable precisely. The phase hard ceiling remains48%, admission
stop45%, within the original32.5-point initiative grant after carrying12.5 points for the
first phase. Final closure telemetry belongs in the worklog; no new grant or paid fallback.

[Source and reproduction](../qa/evals/workflow-repair/README.md) operate on cached outputs;
rescoring calls no model. Sanitized aggregates are committed in
[results.json](../qa/evals/workflow-repair/results.json). Private campaign root is
`~/.local/share/morpheus-paperclip/deeper-20261023/locked-v1`; corpus is sibling
`curation-clarified`. Raw traces, native transcripts and credentials remain private.

Cached score SHA256: `5355081a46bef72253089d086f2bc38ebad92665b315e522916c6d67ee3da115`.
Summary SHA256: `dd193423a2774c3a3d6dcb8f5800772347bffd31ec6e899634f608731acba94d`.
The private `final-evidence.private.json` links native sessions, termination, recorded tool
exceptions and paused queue identities. All18 registered study/snapshot agents were paused;
26 direct-only bindings were not registered, and native account reservations were empty.

## Next use and success criteria

Keep explicit parent/job linkage and independently accepted artifacts. Route small bounded
repairs directly; use an accountable CTO when decomposition, experimentation or cross-project
follow-through is the work. This study gives no reason to abandon that use of a lead, and no
evidence yet that role titles alone help. Leave broad routing and consumer rollout experimental.

After completing the preserved execution qualification, evaluate the next ten ordinary project
tasks prospectively without redoing finished work. Record task size/domain, requested and
observed model/effort, first-pass acceptance, final protected delivery, actual human steering
messages, abandoned/stale jobs, elapsed time and allowance consumed. Count tooling/debugging
interventions separately from substantive human decisions. Compare similar direct/delegated
tasks and retain failures; do not claim randomized causality from a convenience sample.
A useful local adoption signal is more accepted work per human intervention with no weaker
acceptance/review, within the agreed resource budget. Require exact source-to-job-to-evidence
linkage, no forgotten accepted jobs, and no duplicate or unbudgeted execution before increasing
concurrency. Model-cost routing requires measured allowance per accepted task by difficulty;
this one-model study cannot choose cheaper versus stronger models.
