---
roadmap: MO-26-11-07-07.35.26
tags: [engineering, devops]
---
# Bind Factory workers to their gateway

A short Codex probe completed with gateway binding in the Factory record, but the gateway had no matching request. Its exact quota reset and credit balance matched the local controller. The bridge targeted the built-in OpenAI provider and enabled native auth. A separate provider with a required environment key reached a loopback endpoint with only a synthetic bearer credential. The default tier override omitted the premium tier from that request even with a Fast controller configuration.

Both Factory entrypoints use pinned worker defaults and an opt-in speed override. The unattended worker uses the same gateway arguments as desktop delegation, preserving its separate credential home and explicit model. Claude disables Fast per child launch. No dependency or shared user settings change is required.

Live qualification matched the Codex reviewer session to gateway requests at the default tier. The Claude launcher also returned Opus 5.5 with a provider-reported Standard speed, and its session matched a gateway usage row. These are pre-installation proofs.

The initial independent review was incomplete when it reached the output cap. The same read-only gateway reviewer resumed with a larger cap and cleared the complete diff without substantive findings. The reviewer passed 11 focused configuration tests, 10 in-memory launch cases, and syntax and diff checks. The installed CLI wire probes were verified separately by the author. The same reviewer also cleared the bounded compatibility correction for no-reasoning controllers after both gateway tests passed.

```morpheus-review
{
  "version": 2,
  "base": "e6a8b8b11c4d96bb382801ade908f75989355662",
  "reviewed": "0ac3ee787c89d10639fc689939f8a6cb7833dade",
  "covered": "1447b7471bc6fa6af5638a44987a5814107bb327",
  "authorSession": "01a1b244-c206-7223-bf72-b1ffdf4821f7",
  "reviewerSession": "01a1b6ab-bbb4-7a52-ba2b-24c656b375d1",
  "risk": "high",
  "elapsedMinutes": 0.11568333333333333,
  "timing": {
    "source": "runner",
    "durationMs": 6941,
    "evidence": "Guardian process.json for admission 1f8d9046-fae0-4b2c-aabb-c0ab6f241e38; monotonic duration includes owned cleanup."
  },
  "initialOutcome": "incomplete",
  "outcome": "complete",
  "summary": "The initial independent review was incomplete when it reached the output cap. The same read-only gateway reviewer resumed with a larger cap and cleared the complete diff without substantive findings. The reviewer passed 11 focused configuration tests, 10 in-memory launch cases, and syntax and diff checks. The installed CLI wire probes were verified separately by the author. The same reviewer also cleared the bounded compatibility correction for no-reasoning controllers after both gateway tests passed.",
  "findings": [],
  "followUps": [
    {
      "reviewerSession": "01a1b6ab-bbb4-7a52-ba2b-24c656b375d1",
      "commit": "0ac3ee787c89d10639fc689939f8a6cb7833dade",
      "outcome": "cleared",
      "elapsedMinutes": 2.65355,
      "timing": {
        "source": "runner",
        "durationMs": 159213,
        "evidence": "Guardian process.json for admission 76e365ec-8c75-4515-b0dc-908cc3bb494b; monotonic duration includes owned cleanup."
      },
      "summary": "Cleared the complete high-risk change on the same commit. No substantive findings."
    },
    {
      "reviewerSession": "01a1b6ab-bbb4-7a52-ba2b-24c656b375d1",
      "commit": "1447b7471bc6fa6af5638a44987a5814107bb327",
      "outcome": "cleared",
      "elapsedMinutes": 0.43811666666666665,
      "timing": {
        "source": "runner",
        "durationMs": 26287,
        "evidence": "Guardian process.json for admission 16ef8938-6aca-4ef9-b3c4-c6f2cc7008c6; monotonic duration includes owned cleanup."
      },
      "scopeReason": "The new fixed Sol default must handle a controller that reports none reasoning effort, which Sol does not support. The installed CLI emitted none without normalization.",
      "summary": "Cleared the compatibility correction and its focused gateway regression. No substantive findings."
    }
  ]
}
```
