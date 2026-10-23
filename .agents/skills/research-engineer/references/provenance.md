# Provenance

Read this when a rule in the skill seems to conflict with a project's records or the person's
current instructions, or before revising the skill.

The rules distil what Chris Heinrich told agents doing ML and algorithm work, and what those agents
learned, across Evo's calorie-estimation, segmentation, volume, model-evaluation and
restaurant-matching work and a few Lakina and Morpheus sessions, as of 2026-10-23. On 2026-10-22
Chris asked for this skill so the research prompts he kept repeating (a time-boxed literature
review, rounds of experiments, benchmark first) would be built in, as the first individual-
contributor skill under the agentic CTO. Weigh sources in this order: the person's current
instruction, a project's accepted decisions, then this skill.

Evo and Lakina are private, so their sources are cited by date or path and paraphrased. Session
dates are UTC. Classes: **D** explicit direction from Chris · **A** a decision or rule recorded in a
project · **L** an agent's lesson, not stated by a human.

## Rules and their sources

### Framing

| Rule | Sources |
|---|---|
| Write the function being learned | Evo session 2026-10-22 03:06: Chris framed the cookie problem as learning RGB-D → volume, a general ML problem, and asked for prior work and data (D) |
| Measure each stage; get it right before the end metric | Evo session 2026-10-23 05:19 and 05:29: masks, then volume, then calories, "each step right" before moving on (D) |
| Still score the end metric before shipping | Evo `CLAUDE.md`, "Testing": every estimator change is benchmarked end to end before merge (A); Evo `.agent/decisions.md` 2026-10-20: a shape call improved footprint geometry and did not move fused calories, so it shipped off (L) |
| Read the project's history first | Evo session 2026-10-22 05:56: read recent PRs and worklogs before designing (D) |
| Time-boxed literature review, targets from published results | Evo session 2026-10-20 06:36: about ten minutes of literature review before proposing (D); Codex session 2026-10-22 23:29: Chris kept repeating a 15-minute review prompt and asked for this skill to carry it (D); Evo session 2026-10-22: a published under-11% MAPE used as a target (D) |
| Know what a method is really solving | Evo session 2026-10-23 06:42: SAM 3D hallucinates because it solves a full textured reconstruction (D); Evo `.agent/worklog/2026-10-22-sam3d-food-volume.md`: ±36% seed noise and 1.6–2× high volumes (L) |

### Benchmark

| Rule | Sources |
|---|---|
| Benchmark before the feature | Codex session 2026-10-09 20:50: build the benchmark dataset first, split it, then iterate (D) |
| Ground truth must be real or exact, and present | Evo session 2026-10-21 08:46: data without size ground truth is of limited use (D); Evo session 2026-10-22 02:59: scaled scans give exact volume truth (D) |
| Dev and locked splits; split by group; pin by digest | Evo `benchmarks/rgbd-calorie/README.md`, dev and locked splits and the experiment ledger (A); Evo `.agent/learned.md`: two dev manifests shared a name and differed in every case (L) |
| The metric must match the use | Evo `benchmarks/food-segmentation/README.md`: ingredient-level labels rewarded cutting dishes apart, which Evo's own photos exposed (L) |
| Prefer a log ratio to MAPE; report bias | Evo `.agent/worklog/2026-09-12-energy-density-phase.md`: a 0.78 scale lowered MAPE by estimating low (L); Evo session 2026-09-13: Chris declined a MAPE-tuned scale (D) |
| Score the system that ships; oracle inputs are upper bounds | Evo session 2026-10-23 03:48–04:07: a mask comparison gave SAM the true food names and misled; Chris had the results re-scored as the pipeline runs (D, L); Evo `.agent/learned.md`: score the fusion that ships (L) |
| Synthetic diagnoses, real decides; calibrate simulations; prefer real scans | Evo session 2026-10-22 03:22: use scanned 3D data rather than random primitives (D); Evo session 2026-10-21: a simulated iPhone depth kept far more height than real captures (L); Evo volume design (PR #609), a day of real captures before trusting simulation (A) |

### Iteration

| Rule | Sources |
|---|---|
| Small dev set, enlarged, then the full run | Evo session 2026-10-23 04:14: enlarge the iteration set to about 100 photos, then a larger benchmark (D) |
| Spot-check on real in-domain data | Evo session 2026-10-23 05:35: use the product's own photos for the spot check (D) |
| Rounds of at least four variants | Codex session 2026-10-09 23:26: propose four or more, run, analyse, then a second and third round (D) |
| Cache paid answers per unit; collection separate from scoring | Evo `benchmarks/food-segmentation/` and `benchmarks/rgbd-calorie/` caches: every table rescored offline (L) |
| Ablate the arbitrary; question thresholds | Evo session 2026-10-23 03:48: ablate the 24 prompts (D); Evo session 2026-10-21 02:21: a 4× guard against a 230× disagreement (D); Evo `.agent/decisions.md` 2026-10-20: a one-incident threshold replaced (L) |
| Look for the cheaper setting with the same gain | Evo session 2026-10-22 23:39: test a lower resolution (D); Evo `.agent/learned.md`: reasoning effort moved latency as much as the model (L) |
| Use invariants such as several views of one item | Evo session 2026-10-20 23:03 (D); Evo `.agent/learned.md`: view-to-view spread is twice the run-to-run noise (L) |
| Separate error into factors by substituting the truth | Evo `.agent/worklog/2026-09-12-energy-density-phase.md`: oracle density and oracle mass sized each lever (L) |
| Hold the model's answers fixed for deterministic changes | Evo `.agent/decisions.md` 2026-10-20 and 2026-10-22: replays with stored answers isolated fusion changes (L) |
| A single failure case is a debugging tool | Evo session 2026-10-20 22:09: do not overfit to the cookie (D); Codex session 2026-10-16 07:35: failure cases are instructive, the main benchmark must not regress (D) |

### Decision

| Rule | Sources |
|---|---|
| Measure the noise; a run inside the band is not a finding | Evo `.agent/learned.md`: identical runs moved the median by nearly the whole verdict band (L) |
| Paired, pooled, bootstrapped by group | Evo `.agent/decisions.md` 2026-10-22: a SAM 3D gain did not clear a by-meal bootstrap (L) |
| Split by whether the change did anything | Evo PR #616 (2026-10-23): a single-repeat "worse" sat entirely in cases with identical segmentation (L) |
| Predeclare the selection rule | Evo `.agent/decisions.md` 2026-10-09: restaurant matching chose by a rule declared before final inference (A) |
| Merge a principled non-regressing fix; flag small or unapproved gains off | Evo session 2026-10-21 02:34: merge a clear fix without regression even if the aggregate is flat (D); Evo PRs #569, #584 and #611 shipped off by default (A) |
| Count every provider's cost; time can matter more than money | Evo session 2026-10-23: a provider listed at $0 (D, L); Evo session 2026-10-23 00:02: time, not money (D); Codex session 2026-10-09 05:59: under 2 points of accuracy for over 5× cheaper (D) |
| Measure latency where the method runs | Evo PR #616: a writer measured at 3.6 s in the harness ran at 1.8 s standalone (L) |

### Record and reporting

| Rule | Sources |
|---|---|
| A ledger entry per run, whole outputs stored | Evo `benchmarks/rgbd-calorie/README.md`, the experiment ledger (A); Evo `.agent/learned.md`, store the model's whole answer (A) |
| Scripts that rebuild every table | Evo session 2026-10-23 06:18: a solid record of the experiments with the implementation (D) |
| Worklog dead ends | Evo `.agent/worklog/2026-10-22-sam3d-food-volume.md`, "Dead ends and surprises" (L) |
| A shipped algorithm writes a replayable trace | Evo `.agent/decisions.md` 2026-10-14 (A) |
| Visible results on any device | Evo sessions 2026-10-20 06:19, 2026-10-21 06:52 and 2026-10-22 23:11: debug images, a data review page, a 3D viewer; a localhost page failed on another machine (D) |
| Before-and-after tables; define every metric | Evo session 2026-10-23 03:37 (D); Chris asked for definitions of undefined columns in at least six sessions (D) |
| Say plainly when results change | Evo session 2026-10-23: give where things actually stand (D) |
| Recommendation and decisions, not a survey | Evo volume design (PR #609), "Decisions for Chris" (A) |

### Data, licences, providers and autonomy

| Rule | Sources |
|---|---|
| Licence table | Evo volume design (PR #609) §5.3 (A) |
| Terms before fetching; no personal identifiers | Evo PR #589: a helper fetched pages whose terms ban automation, another sent an email address in a header (L) |
| Send providers only approved data | Evo `.agent/decisions.md` 2026-10-20 and 2026-10-22: segmentation and SAM 3D off pending privacy disclosure (A) |
| Smoke-test a new provider; record quirks | Evo session 2026-10-22 06:16 (D); Evo `.agent/worklog/2026-10-22-sam3d-food-volume.md`, provider quirks (L) |
| Budget exhaustion is a pause | Evo `.agent/worklog/2026-09-12-energy-density-phase.md`: runs resumed after credit top-ups (L) |
| Plan when present, run when unsupervised | Evo sessions 2026-10-20 07:54 and 2026-10-23 06:42: unsupervised, finish and report (D); Codex session 2026-10-09 05:59: logging off, do not stop to ask (D); Evo session 2026-10-21: think it through and come back first (D) |
| Treat the person's numbers as hypotheses | Codex session 2026-10-09: a guessed GPS multiplier to be tested (D); Codex session 2026-09-12: portion multipliers "made up", to be researched (D) |

## Tensions and how the skill resolves them

- **Each stage first, but the end metric decides shipping.** Gate iteration on the stage's own
  metric; run the end-to-end benchmark before shipping a change to what ships.
- **Cost discipline, but time over money.** Weigh absolute cost per thousand uses and latency in
  seconds; a large multiple on material spend needs the person's rule, a sub-cent change does not
  block a real gain.
- **Do not overfit to one case, but fix what it reveals.** Generic fixes only; the case is reported,
  never used to choose a setting; nothing may regress on the main benchmarks.
- **Synthetic data, but not random shapes.** Exact synthetic scenes diagnose method error; real
  scans and real captures decide.
- **The person's intuition against the data.** Test it quickly and report plainly either way.
