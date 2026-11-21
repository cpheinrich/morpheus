---
date: 2026-11-20
agent: codex
roadmap: MO-26-11-20-16.32.36
tags: [engineering]
---

# Check Firestore first for submitted QA feedback

A submitted live web comment was absent from checkout-local preview queues. The matching batch
was available through an authorized, read-only Firestore query in the Firebase project
of the site that received it.

The shared skill and CLI guide now start with Firestore for submitted live web and in-app iOS
feedback, using the submitting site's or reporting build's Firebase project. They preserve
direct local lookup for an explicitly named desktop overlay. The detailed guide covers bounded
lookup and matching, batch Notes, and reporting what evidence was stored.

Verified 130 focused tests for QA guide and skill parity, scaffolding, and project skill discovery.
Typecheck, compile, the roadmap index, complexity, and both skill frontmatter checks passed.
Read the compiled QA guide to verify both Firestore routes and the local overlay exception.

## Review corrections

Lookup-only requests now use the existing read-only pending and show commands in the checkout
that hosted the overlay. Claim and resolve remain for authorized batch handling. Added a focused
test for Firestore-first intake, the two Firebase project choices and the read-only local route.
The test failed when run against the previous guide, then passed with the corrected guide.
All 131 focused tests passed. Typecheck, compile, roadmap index, complexity and both skill
validators passed again.
