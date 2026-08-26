# Phase 1 — Authenticated Game Vertical Slice: START PROMPT

> ⚠️ **HISTORICAL.** Phase-1 start prompt. Phase 1 is complete (`2fc1be1`,
> 2026-08-25). For current state read the repository +
> `docs/phase-2-implementation-handoff.md`.

Paste the entire contents of this file into a **NEW chat**. Do not include this
header line — start from `You are implementing Phase 1`.

---

You are implementing **Phase 1** of Leaderboard Wordle, a Wordle-style game for a
private group of friends, in the repository at:

`/home/greant/WebstormProjects/leaderboard-wordle`

Branch: `main`

The authoritative architecture is the repository's current `../../Architecture-v3.md`,
with `../contradictions-and-gaps.md` governing any superseding decisions.

## 0. Phase-0 handoff gate — mandatory before Phase-1 coding

A separate **Phase-0 completion prompt is run immediately before this prompt**.
That Phase-0 prompt is responsible for finishing and re-verifying the foundation.
Therefore, do **not** blindly trust stale Phase-0 claims in this handoff file.

Before writing Phase-1 application code:

1. Read `../../Architecture-v3.md` in full, especially the Phase-1 section and the
   database/concurrency/expiry/auth sections.
2. Read `../contradictions-and-gaps.md` and identify the final Phase-0
   resolutions and any remaining intentionally deferred items.
3. Inspect the actual current repository state, not historical commit messages.
4. Verify the Phase-0 foundation is actually complete, including the Hono-side
   authentication helper required by Architecture-v3 (`../../src/server/middleware/auth.ts`:
   `authContext` + `requireAuth` + typed `c.get('auth')`).
5. Run the Phase-0 sanity checks that are practical in the current environment:

```sh
bun install --frozen-lockfile
bun run lint
bun run check
bun run test:unit
bun run build
bun run types:check
bun run verify:bundle
bun run auth:check
```

For DB-dependent verification, confirm that `DATABASE_URL` points to the
**dedicated non-production Neon database**, then run:

```sh
bun run test:integration
```

6. If any mandatory Phase-0 requirement is missing, broken, insecure, or not
   reproducible, **fix Phase 0 first and do not begin Phase-1 gameplay work**.
7. Do not paper over Phase-0 failures by weakening tests, skipping mandatory
   gates, or changing the architecture merely to make this prompt proceed.
8. Once the Phase-0 gate is green, treat the resulting repository state as the
   actual starting point for Phase 1. Do not rely on stale version numbers,
   stale file contents, or historical test counts in this prompt.

**Important:** Phase 0 must be fully closed by the preceding prompt. This Phase-1
prompt is deliberately defensive so that Phase 1 cannot silently inherit an
incomplete foundation.

---

# 1. Read these first — authoritative order

Read these before making implementation decisions:

1. `../../Architecture-v3.md` — full architecture; especially the `Phase 1 —
   Authenticated game vertical slice` section and the database sections covering
   schema, invariants, concurrency, expiry, answer secrecy, and authentication.
2. `../contradictions-and-gaps.md` — decision log. Record every new Phase-1
   decision here. If the architecture and this document differ, follow the
   latest documented decision.
3. `../proposed-repo-tree.md` — directory ownership rules:
   - `../../src/routes` = SvelteKit routing/composition only
   - `../../src/lib` = frontend/application code using the minimal FSD structure
   - `../../src/server` = Hono/domain/backend code
4. `../../src/server/routes.ts` — the single Hono composition point. New API routes are
   registered here.
5. `../../src/server/db/schema.ts` + `../../src/server/db/client.ts` — database schema and
   Neon WebSocket client/transaction path.
6. `../../src/server/auth/auth.ts` plus the Phase-0 Hono auth helper/middleware,
   `../../src/hooks.server.ts`, and `src/routes/api/[...path]/+server.ts` — preserve the
   established authentication boundaries.
7. `tests/integration/*` — especially the transaction-contract tests that must be
   re-pointed at the real application services.
8. `../proposed-dependencies.md` — package intent; `../../bun.lock` is authoritative
   for actual installed versions.
9. `phase-1-handoff-prompt.md` — this file, but treat the repository and
   authoritative docs as higher-trust than historical statements in this prompt.

---

# 2. Stack and environment rules

Do not assume package versions from memory. Use the versions actually resolved in
`../../bun.lock` after the Phase-0 gate. Do not upgrade dependencies opportunistically.
Only add a dependency when Phase 1 genuinely needs it and record the exact version
and reason.

The intended stack is:

- Bun runtime + package manager
- SvelteKit + Svelte 5 / runes
- Vite
- TypeScript
- Hono v4
- Better Auth
- Drizzle ORM
- Neon PostgreSQL using the WebSocket-capable `drizzle-orm/neon-serverless`
  path for interactive transactions
- Zod v4
- `@tanstack/svelte-query` for server state
- `@tanstack/svelte-form` only where structured forms genuinely benefit from it
- `@lucide/svelte` for icons
- `svelte-sonner` for toasts
- Anime.js for richer coordinated game animations
- Tailwind CSS v4
- shadcn-svelte where its components fit the UI
- Cloudflare Workers through `@sveltejs/adapter-cloudflare`

Do **not** introduce React packages, React router, React Query, or React-only UI
libraries.

Before adding Tailwind/shadcn configuration, inspect the current repository. If the
preceding Phase-0 work already configured any portion of the UI stack, extend it;
do not re-scaffold or overwrite working configuration.

Use the Svelte-specific libraries already selected by the project. Do not substitute
similarly named libraries without an explicit architectural reason.

---

# 3. Environment and secrets — critical

- Real credentials live only in gitignored environment files/bindings.
- Never print, echo, commit, or place credentials in source, fixtures, snapshots,
  tests, logs, screenshots, or documentation.
- Local Worker bindings flow through the project's existing platformProxy/
  `.dev.vars` path. Do not reintroduce import-time `process.env` configuration for
  application runtime bindings.
- Preserve the production-safe Better Auth secret policy established by Phase 0.
- The dev server may require the existing `XDG_CONFIG_HOME="$PWD/.cache/xdg-config"`
  workaround in this environment. Preserve the repository's documented behavior.
- The dedicated non-production Neon database is reset-safe by explicit user
  decision. Do not point integration tests at production.
- Never place private answer-pool seed files in the repository.

---

# 4. Phase-1 scope — implement exactly this vertical slice

Build the complete authenticated Wordle gameplay vertical slice described by
Architecture-v3:

1. **Daily puzzle UI**
   - 6 rows × 5 columns board
   - in-app keyboard on all devices
   - physical keyboard support on desktop
   - timer display
   - persisted hint-letter display
   - clear pre-game/start state
   - clear in-progress state
   - clear completed/failed/expired state

2. **Six guesses**
   - green/yellow/gray feedback
   - server-authoritative evaluation
   - correct duplicate-letter semantics
   - sequential guess numbers 1–6
   - no seventh guess

3. **Local dictionary UX**
   - the public `valid-guesses.json` may be used for instant client-side feedback
   - client-side validation is strictly a UX optimization
   - server re-validates every submitted guess against its authoritative dictionary
   - the client never receives the answer dictionary or current answer text

4. **Server-authoritative timer**
   - `started_at` is generated server-side
   - `completed_at` is generated server-side
   - `completion_time_ms` is computed server-side
   - the browser never submits authoritative timing values
   - reload/leave/re-entry must reconstruct elapsed time from server data

5. **Resume**
   - reloading restores the current server state
   - leaving the page does not reset the game
   - `started_at` never moves after initial game creation
   - the same game is resumed rather than creating a second attempt

6. **Daily expiration**
   - expired puzzles reject new guesses
   - expired games cannot be mutated
   - `MISSED` remains a derived state: absence of a game row for a finalized puzzle
   - do not create a stored `MISSED` game status

7. **One attempt per user/puzzle**
   - preserve `UNIQUE(user_id, puzzle_id)` as the database invariant
   - game start is idempotent
   - concurrent starts must converge to one game

8. **Ownership**
   - every protected game read/mutation is authenticated in Hono
   - resource ownership is checked server-side using the authenticated identity
   - a user can never read or mutate another user's game
   - return the standard 403 application error when ownership fails

9. **Responsive/mobile UX**
   - usable on small screens
   - touch-friendly keyboard
   - no desktop-only interaction requirement
   - physical keyboard support on desktop
   - accessible labels/focus behavior where relevant

10. **Animations/game feel**
    - tile flips for submitted rows
    - invalid-word shake
    - useful keyboard state transitions
    - restrained success/failure celebration
    - prefer CSS for trivial transitions and Anime.js for coordinated sequences

11. **Authentication UI**
    - Google sign-in button
    - signed-in state in the shell/header
    - logout affordance where appropriate
    - unauthenticated access to protected gameplay UI must follow the SvelteKit
      page-level auth behavior established by Phase 0

12. **Typed API client**
    - use Hono RPC via `hc<AppType>`
    - keep the client in `../../src/lib/shared/api`
    - do not create a parallel manually typed fetch wrapper for the same endpoints

---

# 5. Explicitly out of scope — do not build these yet

Do **not** implement unrelated later-phase features:

- leaderboard/history/statistics (Phase 3)
- daily settlement/finalization infrastructure beyond the Phase-0/Phase-1
  contract needed for expiry and concurrency tests
- onboarding/display-name/avatar editing (Phase 2)
- profile editing (Phase 2)
- admin puzzle management (Phase 4)
- admin UI (Phase 4)
- full rate-limiting system beyond what already exists in the baseline
- CSP hardening (Phase 5)
- achievements, friends, groups, social activity, or other future features

Do not create speculative FSD layers just to satisfy a folder pattern.
Extract `features/` or `entities/` only when actual reuse and responsibility justify it.

---

# 6. Non-negotiable invariants

These invariants must never be weakened.

## 6.1 Server authority

The browser is untrusted.

Hono/server code must independently:

- authenticate the request
- establish the authenticated user
- check ownership
- verify game status
- verify puzzle state
- verify expiration eligibility
- validate the submitted word
- evaluate the guess
- determine terminal state
- persist authoritative results

Never trust client-provided:

- user ID
- game ID for ownership purposes
- score
- win/loss result
- answer
- started time
- completed time
- completion time
- guess count
- role/authorization

## 6.2 Authentication boundary

Better Auth remains the identity/session owner.

SvelteKit hooks are for page-level session resolution and navigation behavior.

Hono remains the authoritative API authentication/authorization boundary.

All Phase-1 application API routes must use the Phase-0 Hono authentication
helper/middleware rather than trusting `event.locals` or duplicating session logic.

Do not create a second session system.

Do not import SvelteKit `RequestEvent` into `../../src/server`.

## 6.3 Answer secrecy

The answer must never be exposed to browser JavaScript.

Specifically, do not expose it through:

- API JSON responses
- SvelteKit `load` data
- form/action results
- serialized page data
- HTML
- `window` globals
- client stores
- hydration payloads
- browser-visible errors
- source maps/client bundles
- server data accidentally imported into browser code

The hint letter may be exposed only where the architecture permits it. The answer
itself must remain server-only.

Keep `bun run verify:bundle` passing and add a Phase-1 regression test that verifies
an actual scheduled answer is absent from relevant client payloads.

## 6.4 Guess evaluation

Implement a pure, deterministic `evaluateGuess(answer, guess)` function.

It must correctly implement standard Wordle duplicate-letter semantics.

It must be unit tested with repeated-letter cases, including cases where:

- a guessed letter occurs multiple times but the answer has fewer occurrences
- the answer contains repeated letters and the guess distributes them differently
- a correct-position match must consume the available letter before yellow matching

Do not implement a naive `includes()`-only algorithm.

## 6.5 Transaction/locking order

Every game mutation that can race with daily finalization must use the established
puzzle-first lock ordering:

1. `BEGIN`
2. establish transaction-start eligibility using `transaction_timestamp()`
3. lock puzzle row with `SELECT ... FOR UPDATE`
4. re-check current puzzle state after the lock
5. lock game row where required
6. validate current state
7. mutate authoritative rows
8. `COMMIT`

Do **not** use `clock_timestamp()` as the eligibility authority.

Do not change the established lock ordering.

## 6.6 Expiry contract

Eligibility and serialization are separate concepts.

A mutation is eligible only when its transaction starts before `expires_at`.
After eligibility is established, the puzzle-row lock determines serialization
against finalization.

Never replace this with a client clock, Worker clock, HTTP arrival time, or a simple
late `now()` check that changes the established semantics.

## 6.7 Lazy activation (M3)

If today's puzzle is `SCHEDULED` because cron activation was missed, legitimate
`POST /api/game/start` may activate it inside the same transaction after acquiring
the puzzle row lock and verifying all documented guards:

- puzzle date is today's Asia/Manila date
- current status is `SCHEDULED`
- `expires_at > transaction_timestamp()`
- no other puzzle for the date is `ACTIVE`

Do not invent another activation path.

## 6.8 Error contract

All API errors must use the established envelope:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "requestId": "...",
    "issues": []
  }
}
```

Use the project's existing error utilities/types.

Do not leak:

- SQL errors
- stack traces
- secrets
- answer text
- internal filesystem paths
- provider credentials

## 6.9 CSRF/security middleware

Do not bypass or weaken the existing Hono middleware chain.

New mutation endpoints must pass through the existing global middleware.

Do not add ad-hoc CSRF exceptions for gameplay routes.

Do not add a GET endpoint that changes game state.

## 6.10 Architecture boundaries

- SvelteKit routes compose pages and navigation.
- `src/routes/api/[...path]/+server.ts` remains the thin platform bridge.
- `../../src/server/routes.ts` remains the single Hono composition point.
- `../../src/server/game` owns game domain logic.
- `../../src/server/puzzle` owns puzzle lifecycle logic.
- `../../src/server/db` owns database access/schema/migration concerns.
- frontend code may import server **types** where explicitly allowed, but must never
  import server runtime code into the browser bundle.

## 6.11 One attempt invariant

Do not rely only on an application `SELECT` before insertion.

The database `UNIQUE(user_id, puzzle_id)` remains the final concurrency guard.

Concurrent start requests must be safely handled.

## 6.12 Game mutation sequencing

A submitted guess must:

- authenticate the user
- authorize game ownership
- acquire the correct transaction locks
- validate expiry and puzzle state
- validate the dictionary
- validate guess number
- evaluate feedback
- insert the guess
- update `guess_count`
- transition to `COMPLETED` or `FAILED` when terminal
- store `completed_at` and `completion_time_ms` exactly once on completion

There must be no path that allows:

- duplicate guess numbers
- guesses after completion
- guesses after failure
- guesses after expiration
- guesses beyond six
- modification of another user's game

---

# 7. API contract — define before UI becomes dependent on it

Before building substantial frontend components, settle and document the Phase-1
API contract in the repository.

The exact endpoint naming may follow the architecture/current code, but the Phase-1
API must provide clear equivalents for:

### Start/resume

`POST /api/game/start`

Must:

- require authentication
- start today's game or return the existing user's game
- perform lazy activation when appropriate
- return only safe puzzle/game state
- never return the answer
- be idempotent for the same user/puzzle

### Current game

Provide a safe authenticated read endpoint equivalent to:

`GET /api/game/current`

It should return enough state to reconstruct the UI after reload, including:

- game status
- puzzle identity/date where appropriate
- safe hint data
- guess history/feedback
- guess count
- authoritative timestamps needed for rendering
- terminal state

It must never return the answer.

If the application chooses a different current-game endpoint name, document the
choice and keep it consistent everywhere.

### Guess submission

Provide a mutation endpoint equivalent to:

`POST /api/game/:gameId/guess`

It must:

- require authentication
- enforce ownership
- accept one guess
- validate the request with Zod
- reject invalid/unknown words
- reject attempts outside 1–6
- reject terminal/expired games
- evaluate feedback server-side
- persist the authoritative result
- return the feedback and updated safe state
- never return the answer

### API documentation requirements

For each endpoint, document:

- request schema
- response schema
- auth requirement
- ownership behavior
- idempotency behavior
- expiry behavior
- error codes
- answer-secrecy guarantees

Use Hono RPC types as the source of truth rather than maintaining parallel manual
response-type declarations.

---

# 8. Frontend architecture

Use Svelte 5 runes style consistently with the current project.

Use `@tanstack/svelte-query` for durable server state such as:

- current user/session
- current game
- game start/resume
- guess submission

Keep ephemeral UI state local to Svelte where appropriate:

- currently typed letters
- transient animation state
- keyboard visual state before server confirmation
- modal/open state

Do not put the authoritative answer into a client-side store.

Use the minimal FSD structure already established.

Prefer:

```text
src/lib/app/
src/lib/shared/
```

and extract `features/`/`entities/` only when real reuse warrants them.

Use shadcn-svelte components when useful, but do not turn the game into a component
library exercise.

---

# 9. Authentication UX

Use the Better Auth Svelte client for browser-side auth interactions.

The frontend must not implement session cookies manually.

Provide:

- Google sign-in button
- loading state
- authentication error state
- signed-in state
- logout action where appropriate
- protected gameplay behavior

Page-level behavior:

- unauthenticated users should not be treated as authenticated merely because a
  client store says so
- SvelteKit hooks/page logic may handle redirects/navigation
- Hono independently authenticates all protected API requests

Do not make `/api/game/*` depend on `event.locals`.

---

# 10. Timer design and verification

The browser timer is display-only.

Server timestamps are authoritative.

Required behavior:

- game creation sets `started_at` once
- reload does not reset `started_at`
- elapsed time is reconstructed from server state
- completion stores `completed_at` once
- completion time is computed server-side
- clients cannot submit authoritative completion times
- terminal states do not continue mutating time

Required tests:

1. start → record `started_at`
2. reload/resume → `started_at` unchanged
3. complete → `completed_at` + `completion_time_ms` set once
4. repeated completion attempt does not rewrite completion time
5. client-supplied timing fields are ignored/rejected

---

# 11. Integration/concurrency tests — re-point to real services

The existing Phase-0 transaction tests proved the database semantics.
Phase 1 must prove that the **actual application services preserve those semantics**.

Rework:

- `../../tests/integration/midnight-lock-order.test.ts`
- `../../tests/integration/lazy-activation.test.ts`

so they call the real game/puzzle/application services rather than reproducing the
business behavior directly with raw SQL.

Preserve the underlying concurrency assertions.

Required cases:

### NG9 order A — guess wins

- transaction eligible before expiry
- guess transaction acquires puzzle lock first
- guess completes/commits
- finalization waits
- finalization observes the committed game state

### NG9 order B — finalization wins

- finalization acquires puzzle lock first
- finalization commits `FINALIZED`
- guess subsequently acquires the puzzle lock
- guess re-reads current state
- guess is rejected
- no guess is inserted

### M3 lazy activation

- today's puzzle is `SCHEDULED`
- start request acquires the puzzle lock
- all documented guards pass
- puzzle becomes `ACTIVE`
- game is created/returned in the same transaction

Also add service-level integration coverage for:

- game-start idempotency
- concurrent game starts
- one attempt per user/puzzle
- ownership denial
- expired-game rejection
- resume/current-game retrieval
- guesses 1–6
- seventh guess rejection
- completed-game mutation rejection
- failed-game mutation rejection
- server-side timing

The integration suite must continue to run against the real Neon WebSocket path when
`DATABASE_URL` is present. Do not silently replace it with local `pg` for CI proof.

---

# 12. E2E requirements — mandatory, not optional

Phase 1 is a **vertical slice**, so an authenticated game-flow E2E is mandatory.
Do not leave it as "if feasible."

Google's interactive OAuth challenge/consent may remain user-assisted/manual, but
once an authenticated session exists, Playwright must cover the gameplay flow.

At minimum, an E2E path must demonstrate:

1. authenticated session
2. game start/resume
3. board rendering
4. entering a valid guess
5. server-returned feedback rendered correctly
6. another guess or terminal completion path
7. reload/resume behavior
8. safe handling of terminal state

Where practical, add security/regression E2E coverage for:

- unauthenticated protected-page access
- user A cannot use user B's game ID
- expired game rejects a guess
- no answer appears in browser-visible payloads

Do not make E2E depend on an external live Google OAuth flow for every CI run unless
the repository already has a safe deterministic mechanism for that. Use a testable
authenticated state/fixture or other documented approach for CI, while preserving the
real OAuth flow as a manual verification gate where appropriate.

---

# 13. TDD / unit-test requirements

Use TDD for pure/domain logic where practical: write the failing test first, then
implement.

At minimum, cover:

- `evaluateGuess`
- duplicate-letter handling
- valid-word validation
- guess-number validation
- expiry eligibility
- completion-time calculation
- terminal-state rules
- hint display safety
- game-start idempotency behavior where unit-level logic exists
- answer-secrecy serialization helpers where applicable

Do not test only the happy path.

---

# 14. Word-list and answer-pool rules

The public `valid-guesses.json` is a generated client artifact.

If you change the source:

```sh
bun run word-list
```

and commit the resulting generated artifact when appropriate.

The private approved-answer source remains gitignored.

Do not:

- create a public answer pool
- import answer data into `../../src/lib`
- put future answers into fixtures that ship to clients
- use the public guess list as proof that a value is a valid answer

Phase 1 should consume the existing database `answer_dictionary` abstraction rather
than inventing a new answer source.

---

# 15. Skills/docs/tooling

Use the repository's indexed documentation and current installed-package APIs.

If the project has a documented TanStack skill/intention workflow, use it. Do not
make the Phase-1 task fail solely because an optional documentation helper command
is unavailable.

For API/library uncertainty, inspect the installed package/version and project docs
before inventing an API.

Do not use historical package APIs simply because they appear in examples online.

---

# 16. Commit/documentation discipline

Keep commits small and conventionally prefixed, for example:

```text
phase1(game): add server guess evaluation
phase1(api): add game endpoints
phase1(ui): add board and keyboard
phase1(test): add authenticated game-flow coverage
```

Do not commit secrets, private answer pools, caches, build output, or debug artifacts.

When a meaningful architecture decision is made:

- update `../contradictions-and-gaps.md`
- update `../../Architecture-v3.md` only when the implementation/decision genuinely
  changes the architecture

Do not create documentation noise for trivial implementation choices.

---

# 17. Known Phase-0 lessons to preserve

These are safeguards, not invitations to repeat Phase-0 work unnecessarily.

- `types:check` must run after `build` because of the project's Wrangler-generated
  main-module typing behavior.
- The migration journal/snapshot under `../../src/server/db/migrations/meta` is versioned.
- Neon transaction tests that span `BEGIN`/`COMMIT` require a dedicated connection;
  do not accidentally use a pooled dispatch pattern that can move statements across
  connections.
- The application's WebSocket Neon driver is `drizzle-orm/neon-serverless`.
- The SvelteKit→Hono bridge is a platform translation boundary, not a business-logic
  location.
- Hono auth must be independent from SvelteKit `locals`.
- CSRF is fail-closed for ambiguous/browser-less mutation requests under the current
  policy; do not loosen it for convenience.
- Production must never silently select the development Better Auth secret.
- Do not use `auth@latest` for reproducible schema generation; preserve the pinned
  Phase-0 solution.
- Do not assume historical test counts. Report the actual current count.

---

# 18. Mandatory verification before declaring Phase 1 complete

Run the checks in this order and report actual outputs/results.

First, re-run the Phase-0 sanity checks after implementation changes:

```sh
bun install --frozen-lockfile
bun run check
bun run test:unit
bun run build
bun run types:check
bun run verify:bundle
bun run auth:check
```

Then regenerate the public word-list artifact and re-check the build if the source
was changed:

```sh
bun run word-list
```

Then run the real Neon integration suite against the dedicated non-production DB:

```sh
bun run test:integration
```

Then run E2E:

```sh
bun run test:e2e
```

If any command changes generated output that can affect later checks, re-run the
relevant downstream checks. Do not report an earlier green result as proof of the
final repository state.

Validate Wrangler using the repository's documented command, as applicable:

```sh
wrangler deploy --dry-run
```

Finally:

1. inspect `git status`
2. inspect the tracked file tree for accidental secrets/artifacts
3. push the intended commits to `main`
4. confirm the **current HEAD's** GitHub Actions run is green
5. report the actual run/commit checked

Do not claim CI is green based solely on an older historical run.

---

# 19. Phase-1 exit criteria — every item is mandatory

Phase 1 is complete only when **all** of the following are true:

1. An authenticated user can start today's game through the actual Hono API.
2. Lazy activation works when today's puzzle is still `SCHEDULED` and all M3 guards
   pass.
3. Game start is idempotent.
4. Concurrent starts cannot create multiple games.
5. The current game can be fetched/resumed after reload.
6. `started_at` remains unchanged across resume.
7. Valid guesses are evaluated server-side.
8. Duplicate-letter Wordle semantics are correct and unit tested.
9. Invalid words are rejected server-side.
10. Guesses 1–6 work; guess 7 is rejected.
11. COMPLETED/FAILED games cannot receive additional guesses.
12. Expired games/puzzles reject mutation according to the established expiry contract.
13. `completion_time_ms` is computed server-side and stored exactly once on successful
    completion.
14. Client-supplied timing/score/state fields cannot override server truth.
15. User A cannot read or mutate user B's game.
16. The Phase-0 Hono auth helper is used by protected game routes; gameplay does not
    depend on SvelteKit `event.locals`.
17. The answer never appears in browser-visible responses or serialized client state.
18. `bun run verify:bundle` passes for the final build.
19. The actual Phase-0 NG9/M3 integration tests call the real services and pass on
    Neon.
20. Game-flow E2E coverage exists and passes.
21. Unit, integration, E2E, `check`, build, `types:check`, `verify:bundle`, and
    `auth:check` all pass on the final repository state.
22. The current GitHub Actions run for the final pushed HEAD is green.
23. No Phase-1 implementation violates the Architecture-v3 phase boundaries.
24. Relevant Phase-1 decisions are recorded in the decision log and architecture
    document only where appropriate.
25. No unresolved **Phase-1 blocking issue** remains.

Do not declare completion with phrases like "mostly done," "should work," or "tests
passed earlier." The evidence must refer to the final repository state.

---

# 20. Required final report

When you finish, provide a concrete report with these sections:

## Phase-1 verdict

Choose exactly one:

- `PHASE 1 COMPLETE`
- `PHASE 1 COMPLETE WITH NON-BLOCKING FOLLOW-UPS`
- `PHASE 1 NOT COMPLETE`

## Scope delivered

List:

- API routes
- server/domain modules
- frontend routes/components
- auth UI
- query/mutation state
- tests added/changed

## Packages added/changed

For every dependency change:

- exact resolved version
- why it was needed
- whether it was already intended by the architecture

## Test delta

Give actual counts for:

- unit
- integration
- E2E

Distinguish passing, skipped, and failing tests.

## Transaction/service verification

Report the actual results of:

- NG9 order A
- NG9 order B
- M3 lazy activation
- concurrent start/idempotency
- expiry
- ownership

## Security/secrecy verification

Report:

- auth enforcement
- ownership enforcement
- CSRF behavior
- answer-secrecy checks
- bundle verification
- timer authority

## Command verification

Report actual final outputs/results for:

```text
bun install --frozen-lockfile
bun run check
bun run test:unit
bun run build
bun run types:check
bun run verify:bundle
bun run auth:check
bun run test:integration
bun run test:e2e
wrangler deploy --dry-run
```

## CI verification

Report the exact final commit and the current GitHub Actions run/result.
Do not rely on an older successful run.

## Remaining issues

Separate:

- blockers
- non-blocking follow-ups
- explicitly deferred later-phase work

Do not conceal deviations from the architecture. Explain them explicitly.

---

# Final working rules

1. **Audit before editing.**
2. **Use the actual repository as the implementation source of truth.**
3. **Use Architecture-v3 and the decision log as the design authority.**
4. **Finish any mandatory Phase-0 gap before Phase-1 gameplay if one remains.**
5. **Do not start Phase 2/3/4/5 features.**
6. **Do not weaken tests or security to make the suite green.**
7. **Do not trust the browser.**
8. **Do not expose the answer.**
9. **Do not duplicate authentication/session systems.**
10. **Do not bypass the Hono middleware chain.**
11. **Do not change transaction lock ordering or the `transaction_timestamp()` expiry contract.**
12. **Do not use `auth@latest` for reproducible schema generation.**
13. **Do not invent speculative FSD layers.**
14. **Do not introduce React packages.**
15. **Do not commit secrets, answer pools, caches, or debug artifacts.**
16. **Do not claim completion without final-state evidence.**
17. **When uncertain, inspect the installed version/current project docs and verify empirically before choosing an implementation.**
18. **The goal is a complete, production-sensible authenticated Wordle vertical slice,
    not merely a demo that works on the happy path.**
