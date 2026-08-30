We are now starting **Phase 4** of this repository:

https://github.com/LorensTee/leaderboard-wordle

You are working in the repository itself. Do NOT implement Phase 4 yet.

Your job in this chat is to perform a deep repository review and produce the complete **Phase 4 planning package** that a separate implementation pass can execute safely.

## 1. Source-of-truth hierarchy

Treat the repository itself as the ultimate source of truth.

For Phase 3, the authoritative starting point is:

`docs/phases/phase 3/phase-3-final-state-handoff.md`

Also inspect and cross-reference:

* `Architecture-v3.md`
* `Specifications-v1.md`
* `docs/contradictions-and-gaps.md`
* all relevant Phase 0/1/2/3 planning, handoff, and implementation documents
* current source code
* database/schema/migrations
* tests
* CI workflows
* package scripts/configuration
* current README where relevant

Important:

* Phase 3 is COMPLETE.
* Do NOT reimplement or redesign Phase 3.
* Where older planning documents conflict with the final Phase 3 handoff or current code, the final repository state wins.
* Do not silently resolve unresolved product decisions from the Phase 3 handoff.
* Do not invent requirements that are not supported by the specification, architecture, existing product direction, or repository evidence.

## 2. First task: determine exactly what Phase 4 is

Do not assume what Phase 4 means.

Derive the intended Phase 4 scope by tracing the project's architecture, specifications, previous phase structure, deferred work, current implementation state, and future-phase references.

Explicitly answer:

1. What is Phase 4 intended to accomplish?
2. What user-visible and system-level capabilities belong in Phase 4?
3. What is explicitly OUT of scope for Phase 4?
4. Which Phase 3 decisions/invariants must remain untouched?
5. Which existing deferred items belong to later phases instead of Phase 4?
6. Are there contradictions between the architecture/specification and the current implementation that affect Phase 4?

If Phase 4 scope is ambiguous, resolve it from repository evidence rather than guessing. Record any genuinely unresolved ambiguity instead of silently choosing.

## 3. Perform a deep implementation audit before planning

Review the current implementation that Phase 4 will build on.

At minimum inspect:

* frontend routes/components/features
* server routes/handlers/services
* authentication and authorization
* database schema and migrations
* shared API contracts/types
* TanStack Query usage
* Svelte/FSD boundaries
* tests and fixtures
* CI workflow
* build/deployment configuration
* Cloudflare worker/scheduled-task integration
* existing performance/reliability constraints
* known deviations in `docs/contradictions-and-gaps.md`

Identify:

* reusable existing code
* code that should be extended rather than duplicated
* interfaces Phase 4 must preserve
* technical risks
* hidden coupling
* test-fixture constraints
* deployment constraints
* anything that could cause Phase 4 implementation to regress existing functionality

Do not modify code during this audit.

## 4. Produce a Phase 4 plan

Create:

`docs/phases/phase 4/phase-4-plan.md`

The plan must be implementation-grade, not a vague feature list.

Include:

### A. Phase goal

The precise objective of Phase 4.

### B. Scope

A definitive in-scope / out-of-scope boundary.

### C. Existing-state summary

What already exists and exactly where Phase 4 connects to it.

### D. Architectural design

Describe the intended architecture and data/control flow.

### E. Implementation slices

Break the work into small, independently verifiable slices.

For each slice specify:

* purpose
* files/components likely affected
* backend changes
* frontend changes
* shared-contract changes
* database changes, if any
* tests required
* dependencies on earlier slices
* acceptance criteria

### F. Data model / migration plan

If schema changes are needed, specify them precisely.
If no migration is needed, explicitly prove why.

### G. API contract

Document endpoints, inputs, outputs, auth behavior, validation, error behavior, and compatibility constraints.

### H. UI/UX behavior

Document states, navigation, loading/error/empty states, responsive behavior, accessibility considerations, and reuse of existing components.

### I. Testing strategy

Separate:

* unit
* integration
* E2E
* regression
* build/CI verification

Use the repository's existing testing patterns rather than inventing a parallel system.

### J. Risks and mitigations

Especially concurrency, database, auth, deployment, Cloudflare, caching, and test-fixture risks where applicable.

### K. Verification gates

Define exact commands and success criteria required before Phase 4 is considered complete.

### L. Deferred decisions

List anything intentionally deferred to later phases.

### M. Explicit invariants

List existing behavior that Phase 4 MUST NOT break.

## 5. Produce a planning-state handoff

Create:

`docs/phases/phase 4/phase-4-planning-state-handoff.md`

This should contain enough information for a fresh implementation chat to continue without needing the entire reasoning history of this chat.

Include:

* repository/branch/HEAD
* Phase 3 final-state dependency
* current architecture summary
* Phase 4 objective
* decisions already made
* unresolved decisions
* files inspected
* important code paths
* planned implementation slices
* constraints
* test/deployment requirements
* risks
* exact next-step instructions for the implementation pass

## 6. Produce the implementation prompt

Also create:

`docs/phases/phase 4/phase-4-implementation-prompt.md`

This must be the executable handoff for the next chat.

It should tell the implementation agent:

* what to read first
* what Phase 4 means
* exactly what to implement
* which decisions are binding
* which decisions must NOT be invented
* which files to modify
* which existing behavior must remain unchanged
* how to test each slice
* final verification gates
* documentation/receipt requirements
* how to produce the final implementation handoff

## 7. Do not implement code yet

This is a PLANNING-ONLY task.

You may inspect everything and create/update the planning documents above, but do NOT implement Phase 4 source-code changes.

Before finishing, perform a final consistency review:

* Does the Phase 4 plan actually follow the architecture/spec?
* Does it accurately reflect the current code?
* Does it avoid reimplementing Phase 3?
* Are all dependencies between slices explicit?
* Are database/API/UI changes internally consistent?
* Are test requirements sufficient?
* Are unresolved decisions clearly marked?
* Could another agent implement Phase 4 from these documents without guessing?

Finally, give me a concise planning summary and identify any blockers that must be resolved before implementation.
