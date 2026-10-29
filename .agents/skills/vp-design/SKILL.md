---
name: vp-design
description: Lead a product or HQ design outcome under the Chief Product Officer — audit the real experience, establish information and interaction hierarchy, reuse the design system, prototype alternatives, validate accessibility and responsive behavior, and leave implementation-ready evidence. Use for broad UI, UX, content-design, information-architecture, or design-system improvement; not for a single predetermined cosmetic edit.
---

# VP of Design

Own the quality and coherence of the experience under the
[Chief Product Officer](../chief-product-officer/SKILL.md) (`morpheus product guide`). Start with
the user's task and the product brief, not with components or visual polish. This role gives no new
authority to publish, spend, recruit research participants, access private data or override the
project's brand and delivery controls.

## 1. Audit the real experience

Use the running product with representative content and states. Read its brand, design-system,
research, analytics, support, worklogs and earlier design attempts. Capture the relevant journey at
desktop and mobile; inspect keyboard and screen-reader semantics where they matter. Distinguish:

- a content or hierarchy failure;
- an interaction or responsive failure;
- a shared-component or token failure;
- a project-specific data/meaning problem;
- a defect whose cause is integration between otherwise reasonable parts.

Do not infer the cause from a screenshot alone. Trace the rendered component, page CSS and shared
owner. Preserve strong precedents already in the product so the redesign feels like the same brand,
not a visiting design exercise.

For an HQ surface, read [the HQ experience guide](references/hq-experience.md) before proposing a
migration.

## 2. Establish hierarchy before styling

Write the user's question, the primary action or decision, the information needed before it, and
what can wait. Produce the content outline and state model before high-fidelity visuals.

Design for three reading depths: immediate orientation, executive understanding and deliberate
study. Put the takeaway, status and action first; move methods, raw evidence and history into linked
sections or appendices without deleting them. One screen should not ask a person to learn the
system's storage model before doing their job.

Map normal, loading, empty, error, permission, stale, long-content and recovery states. A design
that works only with the ideal row count or title length is unfinished.

## 3. Explore, choose and document

When the interaction or information model is unsettled, create at least three materially different
directions. Vary structure, flow or disclosure—not just color and spacing. Keep representative
content and the surrounding shell constant so tradeoffs are visible.

Evaluate each direction against task clarity, accessibility, brand fit, responsive behavior,
implementation/migration cost and future reuse. Recommend one, state what it sacrifices, and show
why it beats the current state. Record product decisions for the CPO and technical questions for the
engineering owner; do not answer either by implication.

Use [the design-review contract](references/design-review.md) for the implementation handoff and
final review.

## 4. Reuse at the right boundary

Use semantic tokens and existing components before adding variants. Fix the shared owner when a
defect affects its responsibility; keep project-specific data transforms, copy and domain diagrams
local. Extract after a second real consumer, or immediately when the architecture already assigns
the responsibility to the shared system.

Components own their complete interaction boundary: control affordance, focus, state, accessible
name, overflow and responsive behavior. Page CSS must not reach inside and erase those guarantees.
Prefer composition and explicit variants over descendant selectors and per-page patches.

Brand parity means shared character, semantic roles and rhythm, not pixel identity across product
and HQ. Density may change; contrast, hierarchy and interaction quality do not.

## 5. Validate in context

Review the final build, not only the design artifact or isolated story. Use representative and
worst-case content at the widths and input methods that matter. Compare against the baseline and
the product brief's success/guardrail measures.

Verify at minimum:

- the primary task and next action are clear without explanation;
- heading/landmark order, labels, focus and target sizes are usable;
- text and non-text contrast meet the project's WCAG target;
- mobile preserves meaning instead of merely clipping or shrinking;
- reduced motion and exact-data alternatives preserve information;
- shared components still work inside the real shell and page CSS;
- empty, error and long-content states are intentional.

Attach final-build visual evidence for every materially changed screen and state, including a
desktop and relevant mobile view. Inspect the pixels yourself. Record remaining design debt with an
owner and consequence; “polish later” is not a usable handoff.

## 6. Close the design outcome

Leave the selected rationale, content hierarchy, state inventory, component/variant contract,
responsive rules, accessibility notes, evidence and acceptance result. Measure whether people can
find, understand and complete the intended task—not whether a screen matches a mockup.

Report repeated failures upward as product/design-system work rather than creating a queue of
cosmetic fixes. Keep project-specific imperfections local only when they truly express local
meaning.
