# Incident guide

Use the existing ticket/controller record. Keep a compact current brief pointing to immutable raw
evidence rather than copying the entire history into each prompt:

- profile/channel and applicable mandate, deadline, authority and remaining budget;
- last accepted receipt, current source/configuration/run-attempt/build and observed time;
- controller/worker/repair owner, lease/fence and supported continuation route;
- the latest successful boundary and the first failed or unknown boundary;
- actions already attempted, outcomes, uncertain effects and identities that must not be reused;
- next bounded action, evidence it must produce, escalation condition and next wake time/event.

## Follow the failing boundary

| Observation | Next useful evidence |
|---|---|
| A due release never appears | Effective eligibility, exact expected wake, controller heartbeat and initial discovery/dispatch for the same intent. An in-flight continuation is not initial discovery. |
| Job waiting for a runner | Exact current queued jobs and assignment/start fields, registration/labels and competing demand. A missing/error page is not an empty fleet; hosted fallback alone does not prove local runners are down. |
| Backend preflight fails | Exact deployed/source rules and indexes, protected repair source and normal propagation/readback evidence. Do not rerun native tests to fix a preflight mismatch. |
| Tests pass but evidence staging fails | Selected artifact roots, actual byte/file bounds, admission errors and downstream barrier. Keep the complete required test proof; raising a cap or deleting evidence is not a diagnosis. |
| A repair waits on subscription capacity | Reader result, freshness, ordinary-subscription eligibility and exact existing session. Timeout, exhausted quota and forbidden paid fallback are different outcomes. |
| Upload or group call loses its reply | Saved claim and provider identity, accepted upload/build state and exact group readback. Unknown is not failure and does not authorize a duplicate upload, reset or invitation. |
| Workflow green, no usable build | Qualification, accepted binary identity, provider processing and exact internal availability. External review may remain pending independently. |
| Observer exits or times out | Preserve/reconcile its exact process/output, then read the provider's actual terminal state; monitor status is not workflow status. |

Choose the smallest action that discriminates the competing causes. After repeated same-route
failure, change the diagnostic route rather than polling unchanged data. Turn an established cause
into a regression at its real boundary, including a representative retained provider shape when
possible. Keep source/synthetic evidence distinct from live delivery proof.

## Supervision contract

For a future automated deployment, specify who computes eligibility and deadlines, which events
wake work, how missed events reconcile, who owns the single incident and how host liveness is
observed independently. Bound model runs and resume from durable records. Test duplicate events,
missed wakeups, owner loss, provider uncertainty and budget exhaustion before claiming unattended
reliability. A plan to build this contract is not evidence it is running.
