# Nightly iOS runner-context dispatch — 2026-09-01

## Reproduction

Dispatching Evo's `testflight.yml` returned HTTP 422 while GitHub parsed the called workflow:

`Unrecognized named-value: 'runner' ... runner.temp`

The failure happened before job creation, credential access, or App Store Connect upload.

## Resolution

- Removed `runner.temp` from the upload job's static environment.
- Constructed `SOURCE_PACKAGES_PATH` from `$RUNNER_TEMP` inside the validated runner step.
- Exported the result through `$GITHUB_ENV` for the caller-owned upload script.

## Validation

- `vitest run tests/workflows.test.ts` — 100 passed
- `tsc --noEmit` — passed
- real Evo workflow dispatch parse — pending merge
