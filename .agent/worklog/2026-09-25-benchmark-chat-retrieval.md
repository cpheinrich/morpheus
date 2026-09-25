---
roadmap: MO-26-09-24-03.27.53
agent: codex
date: 2026-09-25
---

# Historical-chat retrieval follow-up

Chris requested one more optimization round using historical chat requests to
make the questions representative of actual work. This is an explicitly expanded
research scope on the same open PR; earlier reviews remain historical and do not
approve the new deliverable.

Read available Evo Codex task messages and top-level Claude user messages.
Two native task reads failed; one long task required pagination. No unrelated
personal chats were inspected. Thirty derived retrospective documentation
questions were frozen before source labeling, with original requests and task
provenance retained only in the ignored private experiment directory.

The experiment retains the prior frozen 437-file Evo documentation snapshot.
Its new protocol is qa/benchmarks/document-retrieval/history-protocol.md.
No production configuration, private project changes or frontend are authorized.

Graph tools remain unavailable. The local CLI's prescribed installation repair
again refused because active CBM sessions could not be stopped safely; those
sessions were left alone. Research uses exact benchmark and pinned upstream
source files without claims of graph completeness.

For the non-QMD control, reused the existing MiniSearch 7.2.0 package rather than
writing a search engine. Registry verification found zero runtime dependencies
and the published 7.2.0 release dated 2025-09-16. This is a research-only comparator,
not a new dependency or a production adoption decision. The custom code is limited
to corpus-specific presentation, experiment orchestration, scoring and redaction.

Completed forty backend measurements, thirty development agent trials and 160
validation trials. The validation had no timeouts, invalid source quotations or
database errors. Retained the development CLI timeout. All 190 final outcomes were
manually audited against source; a publication guard caught an incorrect alternative
group index in the private audit, corrected to the existing group without changing
the evidence or trial. The frozen labels remain untouched.

Warm vector prefetch improved paired completion 1.34x / 5.35 seconds versus ordinary
navigation, but only 1.10x / 1.69 seconds versus the preceding CLI recipe on the same
questions. MiniSearch prefetch achieved 1.33x / 5.74 seconds. Neither meets the median
2x hurdle. Main audited evidence recall was 96.25% baseline/CLI, 92.50% vector and
97.50% MiniSearch. Large adjustments from narrow frozen labels and ambiguity-sensitive
answer judgments are disclosed; excluding both sensitive questions does not produce
a 2x result. No production integration or frontend was added.

Private questions, chat provenance, source paths, audit reasons and transcripts remain
in ignored local storage. Published exports contain only opaque IDs and allowlisted
numeric/hash metadata. The exporter verifies all corpus hashes, complete cells,
counterbalance order, source-valid passages and actual alternative citations.

Verification: `pnpm typecheck` passed; `pnpm test` passed all 1,445 tests in 57 files,
including fifteen new history-retrieval tests; `pnpm compile` passed with no generated
changes; `pnpm morpheus pm index` left indexes unchanged. Merged the documentation-only
trunk update before review, with no conflicts. Its auto-update hook refused the dirty
checkout without installing anything. The study discloses concurrent light authoring
and shared-host activity rather than claiming an isolated timing environment.
