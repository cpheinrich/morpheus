# Agent-stack historical decision evaluation

Twelve short decisions reconstructed from real Morpheus-family records, asked of the same model
and effort under two prompt conditions. It measures whether a role policy plus retrieved lessons
changes a **next-action decision**. It does not re-run historical implementations, and it cannot
show saved iterations or productivity: that needs prospective outcomes.

| Path | What | Reaches a worker? |
|---|---|---|
| `cases/Hnn.json` | Sanitized situation, evidence items `E1…`, objective, split | Yes |
| `oracles/Hnn.json` | Acceptable and forbidden actions, expected claim, required evidence, source anchor | **Never** |
| `prompts/baseline.md` | Ordinary concise Morpheus instructions | Baseline |
| `prompts/candidate.md` | Role policy; retrieved lessons appended | Candidate |
| `lessons.json` | Tagged lessons; deterministic trigger-word retrieval | Candidate (retrieved text only) |
| `rubric.json` | Shared action vocabulary and scoring rules | Yes (vocabulary only) |
| `manifest.json` | Frozen digests, model, effort, splits, retrieval and render digests | No |
| `harness.mjs` | `freeze`, `verify`, `render`, `score`, `report` | No |

The workspace `AGENTS.md` both conditions load
([`scripts/paperclip-pilot/worker-instructions.md`](../../../scripts/paperclip-pilot/worker-instructions.md))
is frozen too, and carries no lessons — otherwise the baseline would inherit the candidate's policy.

## Protocol

1. **Freeze before any execution.** `node harness.mjs freeze --model M --effort E` records the
   model, effort and the digest of every input. Commit the manifest before dispatching. If the
   model must change and nothing has run, delete `manifest.json`, freeze again and commit. After
   the first dispatch the manifest is never replaced; `render`, `score` and `report` refuse when
   any frozen input differs.
2. **Same model and effort for both conditions,** taken from the agent configuration and checked
   against the manifest. Record the receipt's requested model and effort; the served model is
   reported `unknown` by the host, never assumed.
3. **One fresh session per case and condition:** a new Paperclip task per run. Reject any run
   whose host receipt shows `resume: true`.
4. **Dispatch** `render CASE CONDITION [ATTEMPT]` through `pilot.mjs create-task` to one
   enrolled host. Run development cases first; execution-holdout cases are never used to change
   prompts, lessons, rubric or oracles. The holdout is **not blind** — its designers had read
   every lesson — so it guards against tuning during execution, not against design leakage.
5. **Accept by readback, not by comment.** Copy `eval-output/<case>.<condition>.<attempt>.json`
   from the host workspace into a results directory, with an optional `<same>.meta.json` holding
   the Paperclip run id, host, receipt and reported usage. A missing or stale artifact is
   `unknown`.
6. **Report** with `report RESULTS_DIR`. Every case × condition appears; unknowns, forbidden
   (harmful) choices, regressions and improvements are listed. If the baseline already passes
   every paired case, the report says no improvement is measurable — keep that result.

## Scoring

Objective, frozen with the cases: the action must be in the oracle's acceptable set, the claim must
match, cited evidence must intersect every required group and name no invented ids. A forbidden
action is counted separately as harmful even if the rest passes. Ambiguity was resolved before
freezing by widening acceptable sets (H01, H02, H07 also accept `change-root-cause`).

## Cases

| Id | Split | Mechanism | Source |
|---|---|---|---|
| H01 | dev | evidence-based completion | Morpheus worklog — empty artifact accepted |
| H02 | holdout | reporter delivery | Morpheus learned — green review job with no report |
| H03 | dev | primary evidence first | Lakina learned — wrong root directory read as missing access |
| H04 | holdout | probe positive control | Lakina learned — invalid probe reports absence |
| H05 | dev | capacity accounting | Lakina learned — merged branches counted as live claims |
| H06 | dev | recorded trade-off, contention | Kairos worklog — repeated concurrency reversals |
| H07 | dev | resource contention | Evo learned — deleting an active shared package cache |
| H08 | dev | unknown quota fails closed | Morpheus worklog — reader timeouts are unknown, not exhaustion |
| H09 | holdout | post-clearance change | Lakina learned — commit after clearance claimed covered |
| H10 | dev | evidence-based completion | Evo learned — zero tests executed, exit 0 |
| H11 | holdout | orchestration cannot repair | Kairos worklog — signing mints certificates every run |
| H12 | holdout | orchestration cannot repair | Lakina learned — freshness guard deadlocks a daily job (domain terms removed) |

Exact anchors are in each oracle's `source`. Evidence text is paraphrased; account names, run ids,
bundle identifiers and hostnames are removed. Two earlier lessons shape the protocol: Evo found
benchmark files sharing a name and seed but drawn from different manifests (only 8 of 25 cases
paired), hence full input digests; and a reasoning-effort change moved latency without moving
accuracy, hence model and effort are always reported together.

Retrieval is deterministic and, because the lessons come from these incidents, effectively maps
one lesson to each case. The candidate therefore tests delivery of known lessons into a decision,
not generalisation to unseen failures.
