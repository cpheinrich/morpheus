# MO-26-09-25-09.07.49 — Optional XCTest worker set

Lakina run36157574532 passed its unit/UI tests and removed its owned base device. The post action then failed with `Provided set path does not exist: /Users/runner/Library/Developer/XCTestDevices`. That directory has never been created on a fresh serial runner. Cleanup must regard an absent optional worker set as empty.

The exception is restricted to simctl stderr's specific missing-set line and the testing selector. Default inventory, permission failures, malformed JSON and actual deletion failures still surface. Tests cover those boundaries and the default device's successful deletion. Native simctl against an explicitly absent temporary set reproduced status1 and the exact stderr line. Full Morpheus checks run before merge. No app code changes.
