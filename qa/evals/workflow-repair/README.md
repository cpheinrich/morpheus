# Executable workflow comparison

This bounded experiment compares direct Morpheus work (A), Paperclip transport alone (Q),
an actual separate technical manager (P), and manager plus Paperclip (F). The existing
[historical decision evaluation](../agent-stack/README.md) stays frozen.

`campaign.py freeze ROOT --curation PRIVATE_CORPUS` freezes public inputs, prompts, source,
model/effort, order, deadlines and stopping rules. Include `--config PRIVATE_CONFIG` at
freeze to pin the execution profile and archive its native wrapper too. `collect ROOT --config PRIVATE_CONFIG
--row T01-A` reserves one call identity before executing through the existing pilot wrapper
and native quota/process supervisor. It refuses an existing/uncertain identity instead of
replaying a mutation. The operator must reconcile any thrown transport error before admission.
The private config points to the reviewed pilot bundle, controller company, native quota
command, shared account/host state and optional board token file. All inference uses Chris's
existing native account; additional subscription enrollment is deferred.

The 26 worker episodes and 12 manager calls comprise two development cases in four arms,
six locked A/F pairs, Q/P ablations on T01/T02, and direct repeats on T01/T02. After an
independent `public-check`, one fresh `continue` is permitted for each locked primary A/F
episode whose public smoke test fails; there are at most 50 calls. No hidden result or author
hint enters that continuation. Manager and worker share the initial170-second budget;
manager has at most45 seconds. Continuations get130 seconds. Deliberate interruption and
changed-requirement stress runs are outside this comparison; phase2 qualification owns recovery.

The curator's private hidden checks, references and builders must stay outside model access:
mode000 outside each writable workspace, with native read/chmod canaries, and tool network
disabled in both arms. Disable apps, plugins, remote plugins, computer/browser control,
multi-agent tools and automatic skill MCP installation as well as each configured MCP
server. Config flags alone were insufficient: skill dependencies re-enabled a server during
development. Check effective thread MCP status and inspect actual development traces.
The wrapper and native user config are hashed; changes require qualification before more
collection. Completed source trees and traces are similarly protected from later
episodes. Never publish the private corpus before all relevant model calls terminate.
The coordinator owns Paperclip updates; these artifact-only workers do not call its API.
Each call has a once-only native launcher and a fresh agent with daily cap1 and max-turn
continuations disabled. Pinned upstream transient retry rows may still be scheduled;
pause/cancel them after the original execution and prove no additional provider launch.
All arms receive the same public files and ordinary evidence/test instructions. A queued arm
also receives the pinned upstream adapter's normal envelope; Q is a transport ablation of the
real adapter, not a byte-identical model-input control.

After model termination and artifact freezing, `grading.py` runs trusted hidden tests with a
JSON-only callback. `remote_runner.py` executes submitted Python in a separate Seatbelt
process, which cannot inspect the trusted interpreter, hidden files, home, network or source
writes. A timeout, malformed output, changed digest or unavailable sandbox fails closed.
Use `/usr/bin/python3`: arbitrary Homebrew interpreter installations are not qualified.
`LocalSandboxRPC` is used on the enrolled Mac; SSH grading needs an outer remote watchdog
and is not claimed by this implementation.

Run portable and native synthetic controls with:

```
/usr/bin/python3 -m unittest discover -s qa/evals/workflow-repair -p 'test_*.py'
pnpm exec vitest run tests/workflow-repair.test.ts
```

This measures small incident-inspired repairs, token/time overhead and local repeat variation.
Report material presence is a separate metric; it does not attest the truth of its contents.
It cannot establish production delivery, actual human time saved, or role labels as the cause
of any gain: manager arms contain additional reasoning. Report every scheduled refusal,
timeout, failed repair and missing artifact. Six locked cases are screening evidence only.

After all collection and independent acceptance, rebuild descriptive totals with
`/usr/bin/python3 qa/evals/workflow-repair/summarize.py PRIVATE_CAMPAIGN`. The totals include
manager calls and continuations; repeats stay separate from independent case counts.
Missing usage and elapsed records remain unknown, so partial token sums cannot support
a cost-per-success claim. Subscription-included calls are unpriced, not free.
