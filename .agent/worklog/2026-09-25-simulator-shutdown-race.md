# MO-26-09-25-08.59.44 — Simulator shutdown race

Cross-project review of local wrappers found the shared CI helper had the same shutdown-before-delete coupling. If XCTest transitions a device to Shutdown after inventory, simctl shutdown may reject an already-shutdown device and skip deletion. The action now warns on shutdown failure, still attempts deletion, and treats deletion failure as the actual cleanup failure. Exact ownership and both device sets are unchanged.

Validation: focused Node tests cover both device sets, preserving unrelated devices, failed deletion and continued cleanup. Full Morpheus tests/typecheck/compile are run before merge. This changes only the action error path and does not require an app build. No new package; existing Apple simctl boundary.

## Independent review

Independent reviewer cleared the exact-owned cleanup correction with no findings. Nine focused tests and an additional two-set deletion-failure injection passed; full Morpheus tests passed1381/1381, typecheck and compile passed. Ownership selectors are unchanged; no native app build was needed.

```morpheus-review
{
  "version": 1,
  "base": "f47a3536fab26c9729ec34d805e7a9e2e3dda900",
  "reviewed": "94877c872317243b019ca5d14207e395255c7914",
  "covered": "94877c872317243b019ca5d14207e395255c7914",
  "authorSession": "01a0d8cb-5b59-7261-978f-19fd9976dc80",
  "reviewerSession": "01a0d94d-058f-7c32-b380-525842bd3f85",
  "risk": "high",
  "elapsedMinutes": 2,
  "outcome": "complete",
  "summary": "Independent reviewer cleared the exact-owned cleanup correction with no findings. Nine focused tests and an additional two-set deletion-failure injection passed; full Morpheus tests passed1381/1381, typecheck and compile passed. Ownership selectors are unchanged; no native app build was needed.",
  "findings": []
}
```
