---
agent: codex
date: 2026-09-04
roadmap: MO-26-09-04-18.23.16
outcome: review
---

# Install pinned asccli binary on Intel TestFlight runners

## What changed

- Replaced Homebrew's architecture-dependent `asccli` install and 17m45s Intel source build with
  the upstream v0.18.2 macOS arm64 or x86_64 binary.
- Pinned and verified the publisher's SHA-256 checksum before the executable enters `PATH`.
- Applied the same installer to the reusable workflow's built-in lane and the shared composite
  action used by cross-repository callers.
- Kept all release credentials out of the installer process.
- Captured App Store Connect's upload id and now poll that resource for terminal processing errors.
  Evo 1.0.1 (5) proved why: Apple reported error 90683 on the upload while the builds collection
  remained empty until the action's 20-minute deadline.

## Verification

- `pnpm vitest run tests/workflows.test.ts`: 124 passed.
- `pnpm test`: 1,101 passed.
- `pnpm typecheck`: passed.
- `bash -n .github/actions/ios-testflight-upload/upload-testflight.sh`: passed.
- `morpheus pm validate`: passed.
- `morpheus pm index --check`: passed.
- `git diff --check`: passed.
