---
owner: cpheinrich
date: 2026-08-19
agents:
  - claude
previous: .agent/inbox-archive/2026-08-19-0140-cpheinrich.md
---
# Inbox — 2026-08-19

Evo's consumer-auth work is lifted upstream, complete: [#135](https://github.com/cpheinrich/morpheus/issues/135)
is the taxonomy and motivation, [#136](https://github.com/cpheinrich/morpheus/pull/136) landed the
reusable `firebase-tests.yml` (with Evo's late lessons: no `--with-deps`, timeouts, per-job
cancel-in-progress) and the manifest staging fields, and
[#137](https://github.com/cpheinrich/morpheus/pull/137) landed `morpheus web add-consumer-auth` —
Evo's files as templates (47/52 byte-identical, the other five are deliberate comment
generalisations), the three emulator-backed suites travelling as the contract, `--check` drift
reporting, and `docs/runbooks/consumer-auth.md` for the console half. Rung 2 reviewed twice and
found eight real problems in the fresh scaffold layer; all eight are fixed with tests. One decision
survived both rounds and is yours:

## ❗ 1. Transactional mail: the scaffold ships Resend, the canon says Cloudflare · `claude`

Your 2026-08-01 decision names Cloudflare Email Sending as the canonical transactional provider.
Evo's consumer accounts shipped on Resend, verified end to end on launch day — and the new scaffold
extracts Evo faithfully, so it now makes Resend the default mail path (and the runbook's procedure)
for every future project. The reviewer flagged that this quietly generalises a per-project
deviation into a template default. Everything sits behind one `deliver()` seam, so any answer is
one function; the seam files are exempt from drift checking either way.

- **A — adopt Resend as canon for auth mail (recommended).** It is the implementation that has
  actually delivered verification and reset mail to real users, including the burned-link and
  console-fallback semantics the tests pin. Record the 2026-08-01 entry as superseded for
  transactional *auth* mail, keep Cloudflare canonical elsewhere.
- **B — keep Cloudflare canon.** One follow-up item: a Cloudflare Email Sending `deliver()`
  template swapped in as the scaffold default, verified on the next project that scaffolds; Evo
  records its Resend as a `deviations` entry.
- **C — explicitly per-project.** The scaffold keeps Resend as the reference implementation, the
  runbook presents both, and each project records its choice in `deviations`.
- **Other —** something else, or the framing is wrong.

~
