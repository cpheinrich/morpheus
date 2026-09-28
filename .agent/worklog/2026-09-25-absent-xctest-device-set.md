# MO-26-09-25-09.07.49 — Optional XCTest worker set

Lakina run36157574532 passed its unit/UI tests and removed its owned base device. The post action then failed with `Provided set path does not exist: /Users/runner/Library/Developer/XCTestDevices`. That directory has never been created on a fresh serial runner. Cleanup must regard an absent optional worker set as empty.

The exception is restricted to simctl stderr's specific missing-set line and the testing selector. Default inventory, permission failures, malformed JSON and actual deletion failures still surface. Tests cover those boundaries and the default device's successful deletion. Native simctl against an explicitly absent temporary set reproduced status1 and the exact stderr line. Full Morpheus checks run before merge. No app code changes.

## Independent review

Independent review cleared the narrowly scoped missing-testing-set exception with no findings. All11 focused tests passed; additional reviewer probes confirmed malformed inventory and deletion failures remain fatal. Full Morpheus tests passed1381/1381, typecheck and compile passed. The observed Lakina failure diagnostic and native absent-set probe match the exception.

```morpheus-review
{
  "version": 1,
  "base": "1577797f84ed4fff182bc2ba63294f8a72012c55",
  "reviewed": "eca6f36ad6df920c8dfeb56cff28a0a0ddd95a13",
  "covered": "eca6f36ad6df920c8dfeb56cff28a0a0ddd95a13",
  "authorSession": "01a0d8cb-5b59-7261-978f-19fd9976dc80",
  "reviewerSession": "01a0d954-a648-7541-8f38-c01d80834940",
  "risk": "normal",
  "elapsedMinutes": 2,
  "outcome": "complete",
  "summary": "Independent review cleared the narrowly scoped missing-testing-set exception with no findings. All11 focused tests passed; additional reviewer probes confirmed malformed inventory and deletion failures remain fatal. Full Morpheus tests passed1381/1381, typecheck and compile passed. The observed Lakina failure diagnostic and native absent-set probe match the exception.",
  "findings": []
}
```
