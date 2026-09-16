---
roadmap: MO-26-09-09-19.40.49
date: 2026-09-09
---

# TestFlight upload decodes the profile with the release keychain

## What changed

`upload-testflight.sh` now creates the ephemeral release keychain before it reads the
distribution profile, and decodes the profile with `security cms -D -k <that keychain>` instead
of whatever the runner user's default keychain happens to be.

## Why

Five out of five TestFlight uploads on Evo's Mac mini runners (`zoe-mac-mini-evo`,
`zoe-mac-mini-evo-2`) failed between 2026-09-07 and 2026-09-09 at the profile decode:

```
security: cert import failed: Write permissions error.
security: problem decoding
The decoded distribution profile is not a valid provisioning profile.
```

Every upload on GitHub-hosted runners in the same window succeeded, and the Morpheus test gate
passes on the mini, so this was the upload lane only. The action's own message blames the
profile, which is misleading: the secret is fine. `security cms -D` imports the profile's signer
certificates to verify the CMS signature, and with no `-k` it imports into the default keychain.
The `github-runner` user on the mini has never logged into a GUI session, so it has no login
keychain and its default is `/Library/Keychains/System.keychain`, which a non-root user cannot
write.

## How it was confirmed

No SSH to the mini from this session, so the diagnosis was reproduced locally with an installed
profile:

- `security cms -D -i profile` against the login keychain: succeeds.
- `security cms -D -i profile -k /Library/Keychains/System.keychain`: prints exactly the two
  `security:` lines seen in CI, exit 1.
- `security cms -D -i profile -k <fresh temporary keychain>`: succeeds, exit 0.
- A *locked* temporary keychain also succeeds, and a missing one fails with a different message
  ("The specified keychain could not be found"), so the CI string pins the read-only case.

`bash -n` and `shellcheck -S warning` pass on the edited script.

## Dead ends and notes

- The first mini failure (2026-09-07 01:36) was a different, earlier problem: Homebrew's Cellar
  was not writable by `github-runner`, so `brew install sentry-cli` failed. That was fixed on the
  machine by the next run; every later failure is the keychain one.
- Creating a login keychain for `github-runner` on the mini would also work, but it is a
  per-machine fix that the next self-hosted Mac would need again. Making the script independent
  of the runner's keychain state is the durable version.
- The reorder is safe for the later steps: the keychain password is still unset only after
  `set-key-partition-list`, and cleanup already deletes the keychain on every exit path.
