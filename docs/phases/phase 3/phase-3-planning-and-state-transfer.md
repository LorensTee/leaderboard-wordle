# Phase 3 — Planning and State Transfer

You are now preparing **Phase 3** of the Leaderboard Wordle project.

Repository:

`https://github.com/LorensTee/leaderboard-wordle`

Local repository:

`/home/greant/WebstormProjects/leaderboard-wordle`

Branch:

`main`

## Mission

Do **not** begin Phase-3 implementation yet.

Your task is to perform a complete Phase-3 planning pass against the **actual current repository**, resolve the remaining design/implementation questions, and produce the authoritative Phase-3 planning and state-transfer documents that a separate implementation chat can use.

The repository is currently past Phase 2.

Phase 1 and Phase 2 are already implemented and functionally verified. The current `main` branch must be treated as the source of truth.

The current leaderboard page is intentionally only a placeholder and is expected to become the real Phase-3 surface.

---

# 1. Repository is the source of truth

Before making any decision:

1. Run:

```sh
git status
git log -10 --oneline
git branch --show-current
```

2. Inspect the full current source tree.

3. Read in full:

```text
Architecture-v3.md
Specifications-v1.md
docs/contradictions-and-gaps.md
docs/phases/phase 2/phase-2-implementation-handoff-final.md
```

4. Inspect the current:

```text
src/server/game/
src/server/puzzle/
src/server/leaderboard/
src/server/db/
src/server/middleware/
src/server/routes.ts
src/routes/play/
src/routes/leaderboard/
```

5. Inspect the current tests and CI workflow.

6. Inspect the current schema and migration rather than assuming the schema described by historical documents exactly matches the repository.

7. Treat historical handoffs as state-transfer evidence only. If they conflict with actual code, the repository wins.

---

# 2. Determine the exact Phase-3 scope

Use the authoritative architecture and specification to define exactly what Phase 3 must deliver.

At minimum, investigate and plan for:

### Daily settlement

- finalization of expired puzzles
- conversion of remaining ACTIVE games to FORFEITED
- daily completed-game average
- non-completion penalty
- frozen historical penalty values
- finalization timestamp
- idempotent finalization

### Daily activation

- activation of today's scheduled puzzle
- missed-cron recovery
- lazy activation where the architecture permits it
- missing-puzzle fail-closed behavior
- operational alerting semantics

### Leaderboards

- Today
- Yesterday
- This week
- This month
- top 10 dense ranks
- viewer's own rank even outside the top 10
- current-day behavior
- historical finalized-day behavior
- participation minimums
- deterministic ranking

### Result position

- current position after a completed game
- no claim that the rank is final
- leaderboard navigation from result state

### History/statistics

Determine exactly which history/statistics surfaces belong to Phase 3 based on the authoritative specification. Do not invent additional features.

---

# 3. Resolve the ranking model explicitly

The plan MUST document exactly how ranking works.

The authoritative specification states:

### Single day

Actual completed-game result values.

### Multi-day

Average completion/penalty time.

Average guess count.

### Ranking

Primary:

```text
average time ascending
```

First tiebreaker:

```text
average guesses ascending
```

Final deterministic tiebreaker:

```text
earliest qualifying completion timestamp
```

Dense rank cutoff:

```text
rank <= 10
```

Ties may therefore produce more than 10 displayed players.

The implementation plan must define how these rankings will be expressed in PostgreSQL/Drizzle queries without introducing an unnecessary ranking-results table.

---

# 4. Resolve the current-day vs finalized-day rules

This is mandatory.

Document the exact query semantics for:

### Today

Only completed games count.

### Yesterday

Only completed games from the finalized previous puzzle count.

### This week / This month

- finalized historical days use their frozen penalty data;
- today's active day contributes completed games only;
- today's FAILED/FORFEITED/MISSED results are ignored until finalization;
- zero-completion finalized days contribute nothing.

Do not allow the UI layer to become responsible for competitive aggregation semantics. The server/domain layer must own these rules.

---

# 5. Resolve MISSED / FAILED / FORFEITED handling

The authoritative specification states:

```text
COMPLETED → actual completion time + actual guesses
FAILED    → finalized daily penalty + 6 guesses
FORFEITED → finalized daily penalty + 6 guesses
MISSED    → finalized daily penalty + 6 guesses
```

MISSED is derived from absence of a game row after finalization.

The plan must explicitly determine how SQL derives MISSED for each applicable leaderboard period without creating fake game rows.

Do not alter the raw game data model merely to make the leaderboard query easier.

---

# 6. Resolve participation thresholds

The specification requires a minimum number of successfully COMPLETED daily puzzles for weekly/monthly qualification.

The exact thresholds are product constants.

The Phase-3 plan must decide:

- where these constants live;
- how they are named;
- how weekly/monthly qualification counts completed days;
- how edge cases behave when not enough qualifying days exist;
- how this is represented in the API response.

Do not invent threshold values unless they are already specified elsewhere in the repository. Mark unresolved product values explicitly rather than silently guessing.

---

# 7. Resolve settlement concurrency

This is a critical security/correctness requirement.

The architecture requires the puzzle row to be the serialization point.

Preserve the lock order:

```text
puzzle row → game row
```

The Phase-3 plan must explicitly preserve and test:

### Race A

Guess acquires the puzzle lock first.

Expected:

- guess remains eligible;
- terminal completion may commit;
- finalization subsequently forfeits only remaining ACTIVE games.

### Race B

Finalization acquires the puzzle lock first.

Expected:

- puzzle becomes FINALIZED;
- later guess observes FINALIZED;
- guess is rejected.

Use PostgreSQL:

```text
transaction_timestamp()
```

as the authoritative transaction-start eligibility anchor.

Do not replace it with `clock_timestamp()`.

The plan must include the required integration tests for both lock orders and the midnight boundary.

---

# 8. Resolve settlement execution architecture

Inspect the current Cloudflare Worker entrypoint and decide the correct Phase-3 implementation location for:

- Cron Trigger handling
- finalization
- activation
- retry/idempotency
- lazy fallback

Do not create a second competing API/server architecture.

Do not move domain logic into SvelteKit route files.

Preserve the existing Hono/domain separation.

---

# 9. Resolve API contracts

Define the Phase-3 API contract before implementation.

At minimum determine the appropriate endpoints for:

- leaderboard queries
- viewer rank
- result/current-position lookup
- any history/statistics data
- settlement/activation execution if externally invokable or internally triggered

Use the existing Hono RPC architecture.

Define:

- request parameters
- response shape
- authentication requirement
- onboarding requirement
- admin-only requirements where applicable
- error codes
- empty states
- current-day vs finalized-day semantics

Do not invent unnecessary endpoints.

---

# 10. Resolve frontend behavior

Inspect the existing Phase-2 shell, leaderboard placeholder, play page, and result behavior.

Plan the Phase-3 UI using the existing visual/product direction.

The leaderboard must feel like the natural continuation of the existing Wordle application, not a generic SaaS dashboard.

Preserve:

- SvelteKit
- Svelte 5
- Tailwind v4
- shadcn-svelte where useful
- Lucide
- existing theme system
- existing application shell
- existing accessibility conventions

Do not redesign unrelated Phase-1/Phase-2 surfaces.

Determine:

- leaderboard tabs/filter behavior
- ranking rows
- current-user highlighting
- current-position treatment
- loading/error/empty states
- mobile behavior
- dark/light behavior

---

# 11. Determine whether the result screen needs Phase-3 changes

The specification says that after a game the player should see:

- win/loss state
- elapsed time
- guess count
- current leaderboard position where applicable
- route/action to view the leaderboard

Inspect the current result/game implementation and determine the minimum Phase-3 changes necessary.

Do not rewrite the game UI merely because Phase 3 touches results.

---

# 12. Database and query plan

Inspect the current schema and determine whether Phase 3 actually needs a schema migration.

Do not assume a migration is required.

Prefer deriving leaderboard values from the existing raw game/puzzle data and frozen finalization values.

For every non-trivial query, document:

- tables involved
- joins
- filters
- grouping
- ranking/window functions
- index requirements
- timezone/date semantics
- whether current-day and finalized-day paths differ

If an index is needed, justify it from an actual query shape rather than adding speculative indexes.

---

# 13. Test strategy

Produce a detailed Phase-3 test matrix.

At minimum include:

### Unit

- ranking calculations
- dense ranks
- tiebreakers
- period boundaries
- participation thresholds
- penalty rules
- current-day semantics
- finalized-day semantics

### Integration against live Neon

- finalization
- idempotent finalization
- forfeiture conversion
- average/penalty freezing
- activation
- missing-puzzle handling
- current-day leaderboard
- yesterday leaderboard
- weekly aggregation
- monthly aggregation
- MISSED derivation
- FAILED/FORFEITED handling
- ranking and viewer rank
- concurrency races

### E2E

- leaderboard navigation
- Today/Yesterday/Week/Month
- mobile layout
- authenticated/onboarded guard behavior
- current-user highlighting
- result → current position
- result → leaderboard navigation
- loading/error/empty states
- light/dark theme

Preserve all existing Phase-1 and Phase-2 tests.

Do not weaken tests to make implementation pass.

---

# 14. CI and operational verification

Determine what Phase 3 needs to add to CI.

Consider:

- existing unit/build job
- live Neon integration gate
- E2E
- any Cron/worker-specific verification
- idempotency verification
- migration verification if a migration is required

Do not introduce a fake/local database substitute when the real Phase-3 correctness depends on PostgreSQL behavior.

---

# 15. Produce these artifacts

Do not implement Phase 3 yet.

Create:

```text
docs/phases/phase 3/phase-3-plan.md
```

This must be the authoritative Phase-3 implementation plan.

Also create:

```text
docs/phases/phase 3/phase-3-planning-state-handoff.md
```

This must document:

- final current repository state
- exact HEAD
- relevant Phase-2 state
- decisions made during Phase-3 planning
- resolved contradictions
- open questions that genuinely remain
- files/components/services expected to change
- test matrix
- verification gates

Also create:

```text
docs/phases/phase 3/phase-3-implementation-prompt.md
```

This must be a complete standalone start prompt for a NEW implementation chat.

---

# 16. Critical planning rules

Do NOT:

- begin implementation;
- invent requirements;
- redesign unrelated features;
- create speculative FSD layers;
- introduce a ranking table unless the evidence requires it;
- change authentication;
- change answer secrecy;
- weaken concurrency guarantees;
- change timestamp authority;
- change existing game lock ordering;
- change the existing Hono bridge;
- weaken tests;
- silently resolve missing product decisions by guessing.

When the authoritative documents contain ambiguity, reconcile it using repository evidence and the contradiction log.

Record every new Phase-3 decision explicitly.

---

# 17. Final planning output

Before finishing, provide a concise planning verdict:

```text
PHASE 3 PLANNING STATUS: READY / BLOCKED

Blocking issues:
...

Resolved decisions:
...

Remaining product decisions:
...

Expected implementation slices:
...

Required verification gates:
...
```

Do not claim Phase 3 is implementation-ready until the repository has been inspected and the plan documents are complete.

Do not implement code in this task.