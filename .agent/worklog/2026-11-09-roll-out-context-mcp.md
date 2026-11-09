---
roadmap: MO-26-11-09-13.57.39
tags: [engineering, devops]
---

# Roll out Context MCP with Morpheus auto-update

Use the device's existing opt-in and local client settings for all checkout roots.
The existing explicit project setup continues to own portable checked-in settings.
Reuse the installer and TOML/JSON parsing. No package lifecycle script or new
dependency is needed. User settings are replaced atomically after a fresh read;
existing server entries and unsupported file shapes are preserved.

A first pull using a legacy hook runs the old process through the whole update.
The reviewed compile step is the only new code it runs before npm installation.
It can register the stable executable when the existing live lock, private
staging directory and exact canonical checkout verify an automatic update.
Startup also retries local configuration. A client that already snapshotted its
configuration needs a reload. No npm package lifecycle script is added.

## Verification

- Focused self-update, context setup and MCP tests cover opted-in device settings,
  disabled opt-out, a disabled entry, idempotence, and unmodified project files.
- Type checking, compile, PM index and complexity checks run on the candidate.
- A physical Studio fast-forward through its opted-in Git hook advanced the
  existing CLI from the prior build to the then-current reviewed main. This is
  baseline evidence. Existing Codex entries on both qualification machines served
  cited searches. These preexisting entries cannot prove candidate setup.
