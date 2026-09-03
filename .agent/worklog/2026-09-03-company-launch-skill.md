---
date: 2026-09-03
roadmap: MO-26-09-03-02.13.44
agent: codex
---

# Company launch skill

Added a cross-provider skill for the greenfield workflow proven while launching
Morpheus Enterprises: optional domain purchase, Morpheus repository bootstrap,
GCP/Firebase provisioning, Google Auth and allowlist sync, Vercel monorepo setup,
DNS, deployment, and end-to-end acceptance.

The workflow keeps deterministic work in existing Morpheus commands and records
the non-obvious boundaries: inventory before create, Firebase Terms before IAM
debugging, explicit Vercel Root Directory, credentials staying out of project
repositories, and human gates for payments, passwords, MFA, and legal identity.
