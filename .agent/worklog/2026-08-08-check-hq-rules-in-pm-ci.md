---
date: 2026-08-08
agent: codex
roadmap: MO-26-08-08-22.20.35
outcome: review
summary: "Made the reusable PM workflow optionally verify generated Firestore role helpers."
---

# Put the data-gate check beside the other generated-state checks

The missing command was cheap; its duplicated environment was not. Downstream projects had to copy
two checkouts, package-manager selection, Node setup, dependency installation and a build in order to
reach `hq rules --check`. `pm-check` already performs every expensive and fragile step.

The input is deliberately opt-in. `hq rules --check` correctly fails when no `firestore.rules`
exists, while most Morpheus projects have no data gate. Default-on would turn instantaneous `@main`
workflow propagation into a fleet-wide failure. The path is the opt-in value: it makes the relevant
projects name both the capability and the file Firebase actually deploys without asking each one to
reproduce the implementation.

The workflow test parses YAML and locates the executable step. A raw-text assertion could pass on
the explanatory comment while the input or step was disconnected, the same class of decorative
workflow test that has failed this repository before.

The independent review found that the original implementation hard-coded a root-level file while
the architecture places it at `infra/firebase/firestore.rules`. That was safe for a manual command
someone would notice, but unsafe as an advertised CI check: the suggested remedy could create a
second, undeployed rules file. The CLI and reusable workflow now share an explicit rules path, and
CLI-level tests cover missing, unmarked, stale and current states. The follow-up review tightened
that boundary: a stale helper block is exercised through the CLI in both read-only and refresh
modes, and a missing parent directory is refused so a path typo cannot create a second security file
that Firebase never deploys.

The final integration review followed the documented command from a fresh scaffold and found that
`infra/firebase/` did not yet exist. Company scaffolds now carry the deny-by-default starter rules
file, which makes the first check green and gives the local refresh command a real target. The CLI
also requires a non-empty path, removing the undocumented root fallback entirely.

For established repos, `init` treats an existing root `firestore.rules` as the current gate: it
does not create a canonical-path duplicate, and its result explains that `hq-rules-path` must name
the file Firebase actually deploys. This preserves the non-overwriting migration contract while
fresh company repos get the canonical layout.
The generated infra README therefore names the deployed path generically rather than teaching the
canonical fresh-project path to an established root-layout repository.
Fresh company scaffolds also pass the canonical path into their generated PM workflow, closing the
loop in the same operation that chooses the file. Established root-layout repos deliberately do not:
their deployment configuration remains the source that must be confirmed before enabling the check.
If migration creates the canonical gate but preserves an existing CI file, the result now prints the
exact input block to add. The workflow contract test also parses generated remote-form callers and
compares every passed input to the reusable workflow declaration, so the two templates cannot rename
the contract independently.
