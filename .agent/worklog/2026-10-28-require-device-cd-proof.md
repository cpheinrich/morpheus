---
roadmap: MO-26-10-28-17.37.16
tags: [engineering, devops, ios]
---

# Required physical-device CD evidence

## Mandate and design

Chris authorized implementation of the audited physical-device release gate; the parent assigned this bounded upstream extension. Acceptance: an opted-in policy requires hardware evidence in the existing full-test envelope and ledger, upload admission refuses absent or conflicting proof before owner/fence mutation, and accepted-upload proof reuse checks the same requirement before Apple. Existing consumers' normalized configuration bytes/digests and ordinary/typed post-resume ownership remain unchanged. No host, phone, runtime adoption, provider release or consumer pin changes are authorized here.

Initial implementation allowance: 30 minutes, ordinary shared Codex subscription only, shared weekly ceiling85%; no paid API/overage fallback. Parent owns consumer adoption and final rollout. Author owns these source/test/doc changes and one fresh independent reviewer. Public records use synthetic device/host/account identities only.

Add an optional strict physical-device policy containing a profile, device/host identifiers and exact expected test IDs. Add a nested child evidence/proof bound to every existing aggregate identity and input/configuration digest. The configured test IDs, not the report's chosen count, define completeness. Raw results must be exact, passing first attempts with verified payload references. Record the complete aggregate once after both lanes finish. Compact proof retains the policy/inventory/report bindings and passes the same validation at upload admission and accepted-proof reuse. A public capability constant plus executable config round-trip probe lets consumers refuse an old runtime that strips policy. Opt-in changes configuration identity and requires normal lossless migration; absent policy introduces no default field.

This is existing CD-domain validation using the installed Zod, canonical hash and CAS reducer; no generic module, scheduler, lease, parser or dependency is added.

## Evidence and progress

Initial graph Tier2: main project generation2026-10-28T21:29:13Z, source paths metadata matched with no recorded gaps. Related test partial ranges were read directly. Read the current task checkout records and refreshed context. No runtime/service/provider release actions.

Implemented the existing-envelope design and compiled public API. Exact configured test IDs are checked before storing any child proof. Upload admission validates required proof before run-identity/fence/lease mutation; terminal accepted-proof reuse validates before artifact or Apple access. Identical test recording is now a no-op: the new typed-release regression exposed an existing replay that reset nextAction to await-upload-claim after an upload was already claimed. This correction preserves the immutable stored proof and reconciliation progress.

Validation:
- Focused native evidence/state/controller/adapter/post-resume/store command: 398 tests passed across8 files. This scope covers the changed admission/reuse reducer paths and their immediate identity/ownership dependents.
- Direct recorder-dependent external/repair-control/repair-diagnostic suites:120 tests passed across3 files, selected because they use recordTests/claimUpload and immutable replay.
- pnpm typecheck and pnpm compile passed; generated dist is included.
- Compiled morpheus-kit/cd API exposes capability1 and strict synthetic physical policy round-trip.
- Legacy normalized fixture configuration digest remains b71edea032bd39142b1cd27b61c211a9864e46f38f7d2d39463c89daf4f77127.
- A synthetic mutation removing the upload hardware guard caused the six compact-proof refusal tests to fail; original source restored. No mutation or failed test state is retained.
- No full local suite, phone use, runtime adoption or release dispatch. CI owns the full suite.

Public evidence uses synthetic identifiers. Upstream issue551 records the gap; source/API publication remains separate from consumer pin/migration and operational acceptance.
