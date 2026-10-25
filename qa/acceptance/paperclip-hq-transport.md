# Private HQ transport prototype

- Strict company/profile/action inputs; actual Firebase user supplies role and human identity.
- Reused operation UUID/content returns one intent; changed content or actor refuses.
- One fenced claimant; an expired pre-application or replaced claim cannot apply or acknowledge. A saved receipt may publish under its original applying fence after expiry. Applying work never requeues automatically.
- Revoked/disabled human or connector refuses before application; configuration changes require reconciliation.
- Connector intent precedes bridge call. Lost acknowledgement republishes receipt without another bridge invocation.
- Interrupted applying work and unknown outcomes stay unknown; prepared intent must pass fresh fencing/authorization.
- Direct Firestore access denied even with HQ admin claims. Transport outside broad /hq namespace.
- Completed delivery receipt distinguishes native terminal/stop evidence and never advances PM.
- Demo-only real Auth/Functions/Firestore test passes with fake bridge, no model calls or production data.
- Actual consumer deployment, continuous connector authentication, UI streaming, cross-company routing, native launch and inbox migration are explicitly unqualified until separate evidence exists.
