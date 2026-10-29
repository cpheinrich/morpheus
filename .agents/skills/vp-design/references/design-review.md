# Design-review contract

Review the actual implementation against the product outcome and the design decisions. A clean
component screenshot does not prove the page, shell and content work together.

## Before implementation

Provide:

- user task, audience and current evidence;
- baseline captures and the diagnosed failure class;
- selected direction and rejected alternatives;
- content hierarchy and full state inventory;
- shared versus project-owned component boundary;
- desktop/mobile behavior, keyboard order and accessibility requirements;
- acceptance evidence and the screens/states that require final captures.

Label assumptions and open product/technical decisions. Do not hide them inside annotations.

## Final-build review

Inspect representative and worst-case data at desktop, compact desktop/tablet and mobile. Traverse
by keyboard. Where semantics or announcements matter, inspect the accessibility tree or use the
project's screen-reader checks.

Compare:

1. first-screen purpose, takeaway, state and action;
2. reading and interaction order;
3. type measure, spacing, truncation and overflow;
4. normal, loading, empty, error, permission, stale and long-content states that changed;
5. contrast, focus visibility, target size, reduced motion and non-color distinctions;
6. shared token/component use and any page-level overrides;
7. exact content and data against the canonical source.

## Finding format

For each actionable finding state:

- severity and affected task;
- evidence in the final build;
- violated product/design decision or accessibility requirement;
- smallest correct owner for the fix;
- acceptance probe.

Separate required corrections from optional exploration. Reinspect final pixels after corrections.
Close with the reviewed build/ref, capture locations, remaining debt and whether the design outcome
is cleared, conditionally cleared, or not cleared.
