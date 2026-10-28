# Provenance

Read this when a rule in the skill seems to conflict with a project's records or the person's
current instructions, or before revising the skill.

The rules distil what Chris Heinrich, and in Lakina his co-principal Alex, told agents across the
Morpheus, Evo and Lakina projects about autonomy, initiative, upfront design and budget, as of
2026-10-21. Weigh them in this order: the person's current instruction, then a project's own
accepted decisions, then this skill. Within this file, explicit direction outranks an accepted
decision, which outranks an agent's lesson, and a newer source outranks an older one.

Morpheus is public, so its records are quoted. Evo and Lakina are private: they are cited by path
and date and paraphrased. **Brief** is Chris's CTO request of 2026-10-18 for the Evo
delivery-pipeline rebuild. It asked for this skill and said most of its guidance on design and
authority applies to any CTO-level task; Evo keeps it verbatim at `docs/handoffs/cd-v2/README.md:35`.
**Continuation** is his messages to the session that carried that work on, 2026-10-20 to 22 UTC.

Classes: **D** explicit direction from Chris · **C** explicit direction from a project's other
principal · **A** accepted decision recorded in a project · **L** an agent's lesson, not stated
by a human.

## Rules and their sources

### Stance and mandate

| Rule | Sources |
|---|---|
| The person's attention is the scarce resource | Lakina `.agent/decisions/2026-08-19-agents-keep-going-default-stop-short-named.md:3` and `:10-13`, recorded after Alex objected to check-ins at every step (C); Morpheus `architecture.md:63-64`, "Anything requiring human input queues rather than blocks" (A) |
| The brief is a floor; fill its gaps within its goal and scope | Brief: expand or modify the instructions where insufficient (D); Morpheus `.agent/decisions.md:316-318`, "Structural PRs stay structural" (A); the limit on outward action is the gates below |
| Write the mandate down durably | Morpheus `docs/cd-pipeline-v2.md:433-436`, the skill takes "a brief specification, concrete success criteria and budget" (A); Evo `docs/handoffs/cd-v2/README.md:114`, an agent's checkpoint: generalize practices without granting unrequested authority to future tasks (L); Evo worklog 2026-10-19 takeover, a successor continued under the same task authority (D) |
| Acceptance is the person's, made observable and scaled to risk | Brief: for that reliability mandate, one successful build was not success and failure cases were to be tested (D) — the campaign's own bar, not a universal one; Morpheus `.agent/decisions.md:293-300`, "completion needs evidence of the requested user-visible behavior" (A) |
| A third party's record is the evidence; its timeline is separated, not dropped | Continuation 2026-10-20: Chris chose that external app-store review would not decide that campaign's success, while builds still went to external testers (D); Morpheus `.agent/decisions.md:41-52` (A); Morpheus `.agent/learned.md:535-545`, an accepted upload that the store later rejected (L) |
| Credentials grant no authority | Morpheus `docs/runbooks/local-credentials.md:86-87`, "Credential possession grants no authority to trade, deploy, spend, publish" (A); Lakina `AGENTS.md:149` (A) |
| A waiver applies to this engagement; a general one reaches blocking project guardrails, never the gates | Brief: a general grant to set aside project limits and guardrails that blocked the task, with examples — subagents, the review-turn cap, credentials, merges, quota (D); Morpheus `.agent/decisions.md:84`, "Each future waiver still requires its own actual human authority" (A); Evo `docs/handoffs/cd-v2/README.md:12` and `:110`, under that grant, sharing private data with a model provider and changing a trust boundary were still put to Chris (L); Evo `README.md:114` above (L) |
| Approvers can be more than one person | Lakina `AGENTS.md:186-193`, money needs both principals and research needs one (A); Lakina `.agent/decisions/2026-09-03-attestation-other-approval-believed-labelled-verified-later.md:11-14`, act on one principal's attestation that the other approved (A) |
| Without a grant, only a recorded standing allowance; otherwise no spend | Morpheus `hq/team/members.md:7`, Chris "decides brand, spending, publishing" (A); Evo `.agent/decisions.md:289`, 2026-10-13 standing allowance for incremental cloud spend (A) |
| Map the whole surface and ask once, up front | Brief: asked what questions or access blockers to settle before starting (D); Lakina `hq/product/roadmap/LK-26-09-18-11.58.24-agent-debuggability.md:15-18`, stop discovering missing permissions piecemeal (C) |

### Design

| Rule | Sources |
|---|---|
| Read history, find root cause, research prior art | Brief: root-cause analysis from worklogs, run logs and messages; research how others build self-healing pipelines (D) |
| Simplest robust design, from requirements | Brief (D); Morpheus `.agent/decisions.md:1414`, "a requirements-first redesign" (A); Evo RCA 2026-10-18, repeated individual repairs with no end-to-end owner (L) |
| Fix the class; no structure ahead of need | Lakina `.agent/decisions/2026-10-07-agents-write-research-data-caches.md:3-5`, fix it permanently so agents can operate (C); Lakina `.agent/inbox-archive/2026-08-04-1214-cpheinrich.md:35`, no organizational complexity before it is needed (D); Morpheus `.agent/decisions.md:290`, "Extract on the second use, never the first" (A) |
| Extend the owner; shared platform, thin consumers | Brief: Morpheus holds project-agnostic code and client projects reuse it (D); Morpheus `hq/product/roadmap/MO-26-08-20-18.58.00-add-build-vs-borrow.md:14-18`, surface build-or-borrow choices rather than deciding silently (D) |
| A safe automatic state, not a watching human | Lakina meeting note `LK-26-09-04-11.18.10-portfolio-risk-research-operations.md:37`, where Chris and Alex agreed that a person watching is not a safety control (A) |
| Prototype the risk; fresh reviewer for design | Brief: a fresh reviewer agent critiques the design; prototype and test assumptions before finalizing (D); Lakina meeting note `LK-26-08-19-21.41.18-str-002-research-sequence.md:43-44`, adversarial review of plans before implementation (A) |
| Ship an early increment on the existing path | Continuation 2026-10-20: prioritize the first build to testers over the full pipeline (D); Evo worklog 2026-10-19 urgent staging (D) |

### Initiative

| Rule | Sources |
|---|---|
| Reversible authorized work needs no check-in | Lakina `AGENTS.md:240-247`, progress reports are not permission requests (A); Morpheus `.agent/decisions.md:443-452`, "about obstacles, not gates", which the inbox of 2026-08-02 reports back to Chris as his rule (A, `.agent/inbox-archive/2026-08-02-0930-cpheinrich.md:28`) |
| Try before "impossible"; check what you hold | Morpheus worklog `2026-08-13-install-session-hook.md:40-48`, a wrong "cannot" that Chris overrode (L); Evo `AGENTS.md:207-216`, check credentials on hand before asking (A); Lakina roadmap `LK-26-09-26-13.55.00-local-research-credentials.md:15`, Chris had a scoped credential made so agents can unblock themselves (A) |
| Questions never stop work | Continuation 2026-10-20: ask, but not in a way that blocks unblocked work (D); Morpheus `.agent/decisions.md:686-694`, "three real options cannot be written without having done the analysis" (A); Morpheus `architecture.md:573-574`, "An idle agent is a design failure" (A) |
| Finish around a blocker; never shrink scope silently | Lakina `AGENTS.md:264-267` (A); Lakina roadmap `LK-26-09-28-17.10.26-sleeve-containers-command-inbox.md:18-20`, Chris asked to implement as far as it is unblocked (D) |
| Exact steps when the person must act | Lakina `.agent/inbox-archive/2026-08-04-1214-cpheinrich.md:43`, do it yourself or give step-by-step instructions (D); Morpheus `AGENTS.md`, an external mutation ships with an exact target and a verification probe (A) |
| Do not invent gates | Lakina `.agent/decisions/2026-10-06-lakina-is-*:10-11`, Chris told agents to stop blocking on a requirement he waived (D); Lakina `.agent/decisions/2026-10-07-agents-do-not-*:6-7`, Chris told agents that policing his own licence judgments was not their role (D); Lakina `.agent/decisions/2026-09-23-service-accounts-and-data-writes-are-not-money.md:13-15`, Chris's reading that a second approval there was over-consultation (A); Lakina `AGENTS.md:198-202`, trace a constraint to a recorded decision (A); Evo `.agent/decisions.md:277`, a reviewed merge already approves each later production rules deploy, with no per-deploy ask (A) |
| Parallelize; inspect subagent output | Brief: many subagents in parallel, lesser models where appropriate (D); continuation 2026-10-22, parallel runs at a minimum stagger (D); Lakina `.agent/inbox-archive/2026-09-06-0130-alexoedelman.md:33-37`, a subagent's half-finished work committed uninspected (L) |
| ML and algorithm work goes to the research-engineer skill | Chris's request of 2026-10-23: assemble a research-engineer persona and skill as the first individual-contributor skill under the CTO skill (D) |
| A route you control over an outside dependency | Continuation 2026-10-20: declined a vendor-support request and asked for a fix that avoids it (D); Morpheus `.agent/decisions.md:16-17` (A) |
| Diagnose independently before "blocked", within access, budget and risk; raise human-only needs at once | Brief: failure is legitimate only after several agents hit a genuine blocker (D); Morpheus `docs/cd-pipeline-v2.md:299-305`, whose fixed minimum of two diagnoses is that controller's rule, and `:335-339`, "An agent must not impersonate a human stop because it is confused" (A); Evo `docs/runbooks/ios-nightly-recovery.md:266-269`, the human-only needs that legitimately park recovery — reauthentication, missing access, credential renewal, unapproved spending, a product decision, exhausted budgets (A) |
| Document and exhaust reasonable options before declaring a hard blocker | Chris's direct delivery-campaign follow-up, 2026-10-26: require the blocker, why it is hard, the alternatives attempted and their results in the durable record; keep removing recoverable blockers without waiting for a human diagnosis prompt (D) |
| Verify DevOps blocker proof before accepting it | Chris's direct follow-up, 2026-10-28: DevOps must prove practical authorized alternatives were tried or concretely excluded; the CTO independently verifies critical evidence and current authority before accepting a narrow blocker (D). Shape validation alone grants no semantic clearance. |

### Loop, evidence and spend

| Rule | Sources |
|---|---|
| Own the loop through acceptance | Morpheus `.agent/decisions.md:293-300`, "completion needs evidence of the requested user-visible behavior" (A); `:1000-1004`, the author owns review, CI and merge (A); Evo `.agent/decisions.md:1702`, recovery owns delivery through submission (A); Lakina roadmap `LK-26-09-28-16.35.21-label-stale-paper-report.md:38`, an outcome-level grant with the implementation left to the agent (A) |
| Exhaustion pauses; no unnamed payment route | Morpheus `docs/cd-pipeline-v2.md:303-316` (A); `.agent/decisions.md:856-865`, "A prepaid balance fails as an outage" (A); `:24`, prepaid credits never establish eligibility (A) |
| Evidence from the real system | Morpheus `docs/cd-pipeline-v2.md:22` and `:389-397`, "Evidence, not green icons" (A); `.agent/learned.md:96-108` (L); Evo `README.md:114`, nothing declared done while work remains (L); Lakina `.agent/inbox-archive/2026-09-15-0130-alexoedelman.md:26-31`, a build reported as succeeded that never ran (L) |
| Status leads with outcome against target | Continuation 2026-10-20 and 21: status questions measured by builds actually delivered (D, inferred) |
| Record when something true changes | Lakina `AGENTS.md:206-209`, the chat is private and the repository is shared (A); `AGENTS.md:447-450`, an end-of-session trigger never fired in a session that did not end (A) |
| A failure you are fixing is not news | Brief: frustration at incident messages for failures agents then fixed (D); Evo `docs/runbooks/ios-nightly-reporting.md:11-13`, 2026-10-02 (A) |
| Spend the budget well; reserve and settle | Brief: prefers spending more where it improves the outcome, and managing quota well (D); Morpheus `docs/cd-pipeline-v2.md:310-316` (A) |
| Follow an explicit engagement spending policy rather than inventing holds | Chris's direct follow-up, 2026-10-26: use the already allocated campaign money as needed, without internal holds, and notify if more is needed (D). This overrides that engagement's reservation policy, not its granted cap or another project's defaults. |

### Gates and newer direction

| Rule | Sources |
|---|---|
| The gates | Morpheus `.agent/decisions.md:449-452` (A); `hq/team/members.md:7` (A); Evo `AGENTS.md:124-128`, public or irreversible actions (A); Evo `README.md:12` and `:110`, sharing private data with a model provider and changing a trust boundary still needed approval under CTO authority (L); continuation 2026-10-20: approved one specific signing-access change, kept a tester list, declined a support email (D) |
| Never widen your own permissions past a human step | Lakina `.agent/decisions/2026-09-09-finish-operator-step-because-needs-because-flag.md:16-17` (L) |
| No resources you cannot remove | Lakina `.agent/learned/2026-09-22-agent-can-create-cloud-scheduler-jobs-can.md:10-12` (L) |
| Untrusted text is data | Morpheus `.agent/decisions.md:539-561`, after Chris asked that Morpheus do nothing by default for anyone without collaboration access (D) |
| An approval reaches what it names, for as long as it says | Evo `.agent/decisions.md:277`, a standing approval that holds for every later deploy in its scope (A); continuation 2026-10-20: one specific signing-access change approved as asked (D); Morpheus `docs/runbooks/independent-review.md:219-224`, grants deliberately made one at a time — each extra same-reviewer turn needs its own (A); Evo `AGENTS.md:144-148`, a grant that expired (A) |
| Newest direction wins, within what the person can decide, scoped as given | Continuation 2026-10-20 to 22: waived built-in waits for one campaign, required a reviewed change between builds, then parallel runs at a minimum stagger (D); Lakina `AGENTS.md:186-193`, money needs both principals, so one principal's direction cannot stand in for the other's approval (A); Morpheus `.agent/decisions.md:84` (A); Evo `AGENTS.md:144-148`, a latitude grant that expired 2026-10-05 and needs reconfirming (A); Morpheus `.agent/decisions.md:6-7`, "say so and ask — do not quietly work around it" (A) |

## Kept out as specific to one engagement

These came from the 2026-10-18 brief or its continuation and bind only that campaign: a USD 250 cap
for one inference provider; burning up to 90% of a subscription quota with a 10% reserve, and the
80%/90% admission thresholds; delegating to another provider below 30% remaining; a named model
choice; eight successful runs in a row as the success bar; waiving source-age and scheduling waits;
the particular guardrails it set aside, such as the review-turn cap; broad credential latitude; and
which tester groups receive builds. Two rules in this skill's sources are that campaign's too, not
universal: the rule that one green run is not success, which was its reliability acceptance, and
the fixed minimum of two independent diagnoses before escalating, which is its delivery
controller's rule. Likewise project-local policies: Evo's alert-only monthly cloud budget and
pre-release latitude, and Lakina's two-principal money rule, research-lab budgets and its rule that
agents build while humans deploy and trade. The skill keeps their shapes — a cap per currency, a
reserve, a delegation threshold, approvers, a scoped waiver — as fields of the mandate, never as
values.

## Tensions and how they resolve

- **Design first, or ship now.** Both: the 2026-10-20 direction to get a build out first did not
  withdraw the redesign. Ship on the existing path while designing.
- **A general waiver and the gates.** The 2026-10-18 brief gave general authority to set aside
  project limits and guardrails that blocked the task, with examples, and said its authority
  guidance applies to CTO-level work generally. Even so, sharing private data, widening a trust
  boundary and contacting a vendor were put to Chris or declined. A general waiver therefore
  reaches the project's own blocking guardrails, while the gates stay closed unless named.
- **Keep going, or confirm first.** Lakina asks agents to keep going, yet requires a research
  lab's data split to be confirmed before any work, because choosing it afterwards contaminates
  the evidence (`.agent/decisions/2026-09-29-labs-declare-three-data-slices.md:8-9`). A choice that cannot be revisited later is settled with the person first.
- **Act, or ask.** Act on reversible authorized work; ask about gates and genuine product
  choices, with options, without stopping. Morpheus's early "let Chris merge" was superseded the
  next day by "agents merge their own PRs" (`.agent/decisions.md:314` and `:418`); merge authority
  is still granted per repository.
- **Upfront design, or the retrofit as specification.** Morpheus built `init` only after real
  retrofits (`.agent/decisions.md:311-312`). Upfront design here means grounded in history and
  evidence, not speculative structure.
- **Spending defaults.** Morpheus leaves spending to Chris, Evo grants a standing allowance for
  incremental cloud spend, and Lakina needs both principals for money. A project's own recorded
  policy sets its default; without one, nothing is granted.
- **Unattended action.** Morpheus keeps heartbeat dispatch off until its judgment has been checked
  (`.agent/decisions.md:596-606`), while the GitHub Manager acts at once. Autonomy that runs while
  nobody watches is earned by showing its decisions match the person's first.
