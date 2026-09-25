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

## ✅ 1. Transactional mail: Resend for customers, Cloudflare for admins · `claude`

Settled 2026-08-19, decided by Chris in session — a sharper cut than any option below: the split
is by **audience**. Resend is canonical for anything a *customer* receives (auth mail, receipts,
product email); Cloudflare Email Sending keeps *admin and internal* mail. Architecture §6, the
2026-08-01 decision entry, the consumer-auth runbook and the scaffold's seam comment all updated
in the same change. The scaffold's Resend default is therefore canonical, not a deviation.

