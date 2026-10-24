The reusable CD V2 controller owns durable delivery, provider evidence and repair
work. App identities, native settings and backend hooks belong in consumer config.
Read [the contract](../../docs/cd-pipeline-v2.md) and [CLI guide](../../docs/cd-v2-controller.md)
before changing operation claims: an expired lease never permits replaying upload. The
reviewed macOS host wakeup templates live in [host](./host/README.md); consumer-specific
rendering and activation are documented in [the host runbook](../../docs/cd-v2-host-macos.md).
Explicit source-only budget grants live in `source-finance.ts`; read
[their contract](../../docs/cd-source-finance.md) before changing that boundary.
They do not change native configuration or admission policy.
