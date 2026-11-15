---
date: 2026-11-15
agent: codex
roadmap: MO-26-11-15-05.28.53
tags: [engineering, research, agent-workflow]
outcome: review
summary: "Propose a local two-week measurement pilot for accepted work and operator leverage."
---

The [proposal](../../docs/morpheus-leverage-pilot.md) separates search latency from
acceptable delivery and distinguishes agent attention, human wait and operator active
minutes. It reuses PM, Context MCP, profile and Factory metadata before adding fields.
Compare the architecture's work loop and Markdown authority, and the
[existing retrieval evaluation](../../qa/evals/context-retrieval/README.md).
Product analytics and this operator scorecard serve different audiences and use
different event vocabularies.

The initial audit exposed missing role/build attribution, partial-result detail and
acceptance and human-time denominators. No instrumentation or monitoring was enabled.
The draft proposes coverage thresholds and a readout before any rollout; the intake
item covers the design, not implementation.
