---
roadmap: MO-26-10-25-16.46.47
tags: [engineering, devops, infrastructure]
agent: codex
---

# Standalone HQ deployment packaging

Mandate: parent delegated this bounded DevOps repair under Chris's existing authenticated HQ
pilot, with an additional <=0.8 shared Codex percentage point reserve, global70% used at start
and hard75% used. No cloud deploy, native worker, provider inference, IAM change or paid fallback
is authorized here. Parent owns exact provider attempts and redeployment. Retain the original
HQ worktree while parent needs its compiled libraries, and preserve primary's unrelated intake.

Incident: reviewed source74870ac5 passed source CI, but all nine consumer Cloud Builds failed
before runtime on pnpm11.9 production install with ERR_PNPM_IGNORED_BUILDS for @firebase/util
and protobufjs. Standalone compilation also lacked the root workspace's TypeScript/Node types.
Parent retained provider build identities/logs; no cloud attempt was retried from this task.

Repair: explicit standalone pnpm11 ignoreScripts policy, pinned existing TypeScript5.9.3 and
@types/node22.20.1 development tools, and empty gcp-build for the already compiled upload.
No callable business source changes. pnpm11 removed ignoreDepScripts and reads build settings
from pnpm-workspace.yaml; do not substitute legacy package.json/.npmrc settings. Registry/runtime
dependencies are unchanged. The small domain-specific operational check uses Node facilities.

Verification: `node scripts/paperclip-hq/check-package.mjs` passed clean development install and
local-toolchain build, then plain `pnpm install --prod --frozen-lockfile` in a separate upload
directory with fresh stores and no compiler/source. All nine compiled definitions loaded against
demo settings without credentials/RPCs. CI now runs that same operational boundary check on22.
Root typecheck/compile/PM index and diff check passed before source review. No local full suite: shared
core/business behavior unchanged. Actual Cloud Build acceptance remains parent-owned evidence.

References checked: pnpm's official build settings and Google Buildpacks' empty gcp-build contract.
Graph Tier2 generation2026-10-25T23:46:55Z: existing packaging configs metadata_match/no recorded
issue; new policy/check missing from primary index, read directly in the isolated worktree.

The fresh independent reviewer cleared the packaging repair with no findings and independently
passed the clean standalone operational check. Cloud Build and consumer activation remain
parent-owned acceptance evidence.

```morpheus-review
{
  "version": 2,
  "base": "74870ac5c822985694ba9133cfbc0f93ae0e315d",
  "reviewed": "9413e4813326ff794178e678a55c6399935892a2",
  "covered": "9413e4813326ff794178e678a55c6399935892a2",
  "authorSession": "01a1755a-96c3-7c41-860e-c5178e43bae6",
  "reviewerSession": "/root/hq_connector_projection/review_hq_packaging",
  "risk": "normal",
  "elapsedMinutes": 1.4666666666666666,
  "timing": {
    "source": "clock",
    "durationMs": 88000,
    "evidence": "Initial packaging review /root/hq_connector_projection/review_hq_packaging: author clock 2026-10-25T23:48:50Z before spawn_agent, receipt clock 2026-10-25T23:50:18Z immediately after final response."
  },
  "outcome": "complete",
  "summary": "The fresh independent reviewer cleared the packaging repair with no findings and independently passed the clean standalone operational check.",
  "findings": []
}
```
