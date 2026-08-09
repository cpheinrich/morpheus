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
CLI-level tests cover missing, unmarked, current, and nested-path creation states.
