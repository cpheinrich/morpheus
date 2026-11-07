---
roadmap: MO-26-11-07-07.58.53
tags: [engineering, devops]
---
# Rank Factory subscription pools by available quota

The sub2api Simple Mode scheduler already handles sticky sessions, account load
and failover. Factory reads the existing admin inventory and usage APIs and ranks
worker providers by the roomiest eligible account. No dependency or second account
scheduler is needed. A provider's worker continues to use the shared gateway key.
A pinned task rechecks the pool score. Standard explicit model IDs constrain the
provider before route selection.

Focused regression tests cover an exhausted first account, a transient usage
failure, a usable account on the second page, disabled or ineligible accounts,
the routing cutoff and model conflicts with an existing pin.
