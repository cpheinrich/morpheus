# Recover QA preview from accessibility crashes

Issue #397 records an Evo QA preview SIGSEGV in Apple's AX bridge. The browser's AX subscription ran inside the launchd supervisor, so the native crash also killed serve-sim and its MJPEG stream. Evo's worklog had already verified that removing the AX subscription let the overlay show live frames and persist batches.

I added explicit `--no-ax` to standalone and managed iOS previews. It suppresses AX stream, proxy and placement routes while retaining screenshot-frame pins, HID input and batch submission. Managed previews now launch the overlay in a child process. If it exits unexpectedly, the supervisor leaves serve-sim running and retries once with AX disabled; a second exit is logged rather than retried indefinitely. The overlay remains owned by the preview supervisor for stop and lease expiry.

Focused tests: `pnpm exec vitest run tests/qa-preview.test.ts tests/qa-comments.test.ts` (preview lifecycle, fallback restart and comment routes/batches). Typecheck: `pnpm typecheck`. No local full suite: this change stays in QA/CLI code, outside the shared core paths that require it. CI runs the full suite. No macOS simulator was launched in this worktree; the native SIGSEGV is not reliably reproducible in a unit test, so the tests exercise the process-exit boundary and the screenshot fallback contract.
