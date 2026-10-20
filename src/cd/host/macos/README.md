# macOS local CD V2 supervisor

The local controller has two independent wakeups: `tick` reconciles delivery state, while `worker` runs due local repair work. Copy these templates from one reviewed Morpheus commit into an operator-owned directory and render every placeholder against reviewed consumer paths and file digests. Keep runtime/control, app source and the credential exec wrapper in separate paths.

The credential wrapper must load values only into its child environment and `exec` the controller; it must never print them. Both launchd jobs wake every five minutes. Begin with the tick's rendered observe flag enabled and inspect real status/evidence before authorizing active mode. The worker enforces controller leases, pauses and quota; a wakeup alone does not establish that its work succeeded.

This integration does not initialize consumer state, load launchd jobs, change environment policy, fence an existing delivery service, activate uploads, or prove a TestFlight delivery. Those are consumer-owned operations and require their own reviewed evidence. In particular, no local file can prove Apple, GitHub or host-side process state.

See [the CD V2 host runbook](../../../../docs/cd-v2-host-macos.md) for rendering, verification, installation and rollback steps.
