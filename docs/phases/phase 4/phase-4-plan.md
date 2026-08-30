# Phase 4 — Admin (Puzzle Scheduling & Management): Implementation Plan (AUTHORITATIVE)

> Status: **PLANNING COMPLETE** — this is the authoritative plan for the Phase-4
> implementation chat. Companion documents: `phase-4-planning-state-handoff.md`
> (exact repository state + handoff), `phase-4-implementation-prompt.md` (standalone
> start prompt for the implementation chat), `docs/contradictions-and-gaps.md`
> (DECISIONS + DEVIATIONS log — read it before writing any new decision).
> The **repository wins** on any conflict with older documents.

## Table of contents

1. [Verified repository state](#1-verified-repository-state)
2. [Exact Phase-4 scope](#2-exact-phase-4-scope)
3. [Existing-state summary](#3-existing-state-summary)
4. [Architecture design](#4-architecture-design)
5. [Binding decisions (D1–D10)](#5-binding-decisions-d1d10)
6. [Implementation slices](#6-implementation-slices)
7. [Data model / migration plan](#7-data-model--migration-plan)
8. [API contract](#8-api-contract)
9. [UI/UX behavior](#9-uiux-behavior)
10. [Testing strategy](#10-testing-strategy)
11. [Risks and mitigations](#11-risks-and-mitigations)
12. [Verification gates](#12-verification-gates)
13. [Deferred to later phases](#13-deferred-to-later-phases)
14. [Explicit invariants (must not break)](#14-explicit-invariants-must-not-break)
15. [Planning verdict](#15-planning-verdict)

---

## 1. Verified repository state

| Item | Value |
|---|---|
| Branch | `main` (tracks `origin/main`) |
| **Exact HEAD (planning baseline)** | `b2bca18685520d7975add8a559ade726601020d8` — `docs(phase3): final-state handoff for the Phase-4 planning chat` |
| Phase-4 planning artifacts | `docs/phases/phase 4/` — `phase-4-planning-prompt.md` (this planning chat's task), `phase-4-plan.md` (this file), `phase-4-planning-state-handoff.md`, `phase-4-implementation-prompt.md` |
| Working tree at audit time | Only the user-owned `.idea/material_theme_project_new.xml` modified (not committed). `docs/phases/phase 4/` untracked (planning outputs). |

Verified facts (audited directly, 2026-08-30):

- Phase 3 COMPLETE at `45bc9ff`; the audit commit's gates were re-verified locally, then
  `b2bca18` (docs-only commit) added the Phase-3 final-state handoff. No source change
  between `45bc9ff` and `b2bca18`.
- All Phase-3 receipts in `phase-3-final-state-handoff.md` §5 are trusted as-is (they were
  actually run on `45bc9ff`); nothing in Phase 4 planning depends on re-running them.
- `docs/contradictions-and-gaps.md` marks **NG2 (hint scheduling validation), NG8 (admin
  delete/edit of SCHEDULED puzzles), NG15 (atomic same-day replacement), M5 (scheduling
  window + date-move semantics)** as **Phase 4** work. These are the architecture-level
  requirements Phase 4 must satisfy. N4 (admin bootstrap) was REMOVED from Phase 4 back in
  the v8 review — the admin role/bootstrap work is Phase 2 and is complete.
- `src/server/admin/` exists as an empty Phase-0 skeleton home (`.gitkeep` only);
  `src/routes/admin/` is a guarded placeholder page ("arrives in a later phase").
- `scripts/seed/` contains only `README.md` (private answer-pool input contract); the
  import tooling does not exist yet. `docs/contradictions-and-gaps.md` NC3/NG16 recorded
  the provenance rules; `scripts/verify-bundle-secrecy.ts` already scans
  `scripts/seed/*.txt` when present.

## 2. Exact Phase-4 scope

### 2.1 What Phase 4 is (determined)

Phase 4 is **Admin — puzzle scheduling and management** (Architecture-v3 §Phase 4,
Specifications-v1 §16, NG2/NG8/NG15/M5):

1. **Admin-only access** — the `/admin` page and `/api/admin/*` are gated by the `admin`
   role (page guard exists; API role guard must be added).
2. **Calendar view** — a calendar where each date is a puzzle slot; future dates show the
   scheduled word and relevant state (SCHEDULED/ACTIVE/FINALIZED, locked); admins queue
   words in advance.
3. **Scheduling** — create puzzles for FUTURE dates only. Server-side validation:
   normalize the word → must exist in the server-side approved answer list
   (`answer_dictionary`) → must not already be scheduled/used (`UNIQUE(answer_id)` +
   pre-check) → basic word constraints → hint validation (NG2: exactly one ASCII letter
   that occurs in the answer, persisted at scheduling time, never at activation).
4. **Editing / date moves** — edit future SCHEDULED puzzles (word, hint, or date). Moving
   recomputes `expires_at`, re-checks `UNIQUE(puzzle_date)`; resulting date gaps trigger
   the missing-puzzle alert path (existing mechanism — see D7).
5. **Delete** — only for future, unstarted, SCHEDULED puzzles (`locked_at IS NULL AND
   status = 'SCHEDULED' AND puzzle_date > current Asia/Manila date`); everything else is
   rejected (403). Today's SCHEDULED puzzle can never be plain-deleted.
6. **Atomic same-day replacement** (NG15/M5) — when a puzzle is still SCHEDULED on its own
   date and no player has started it (cron missed), an admin may swap answer + hint in
   ONE recovery transaction: lock the row, verify `puzzle_date` = today (Manila),
   `status = 'SCHEDULED'`, `locked_at IS NULL`, then UPDATE `answer_id`/`hint_letter` in
   place (re-checks `UNIQUE(answer_id)`, regenerates/persists the hint, recomputes
   `expires_at`). Never delete+reschedule; no transient gap; no spurious missing-puzzle
   alert.
7. **Answer-pool import tooling (dependency)** — the scheduling validation requires the
   approved-answer dictionary to exist in Neon. The private seed input
   (`scripts/seed/answer-pool.source.txt`, gitignored) plus an import script are required
   (`scripts/seed/README.md` designates this as "Phase 3/4 admin scheduling work").
   Enforces `approved answers ⊂ valid guesses` at import time (NG13/G16/Architecture
   §Answer pool deployment).

### 2.2 What is explicitly OUT of scope

- **Anything leaderboard/settlement/cron** — Phase 3 is complete; no changes to
  `src/server/leaderboard/*`, `src/server/puzzle/*`, `scripts/patch-worker-scheduled.ts`,
  the cron wiring, or `wrangler.toml` triggers.
- **Lazy activation / first-player locking** — already implemented in
  `startGame` (M3 + `locked_at`). Phase 4 only *surfaces* the locked state in the UI and
  enforces immutability; it does not reimplement activation or locking.
- **Admin bootstrap / role provisioning** — Phase 2 (N4), complete.
- **Onboarding, profile, theme, auth** — Phase 2/0, unchanged.
- **Game domain** — Phase 1, unchanged.
- **Manual settlement trigger / admin settlement tooling** — explicitly NOT promised by
  Phase 3 (`phase-3-final-state-handoff.md` §9.3: "candidates for Phase-4 product
  planning, NOT promises"); no spec/architecture Phase-4 item names it. Stays OUT (see
  §13 and the unresolved-decision record).
- **Personal history/statistics surface** — Phase-3 non-goal; not a Phase-4 item.
- **Rate limiting, CSP/security headers hardening, OWASP/ZAP, Dependabot** — Phase 5.
- **Real alerting/notification for missing puzzles** — Phase 6 (P3).
- **P1 threshold values, P2 pre-join penalty, P4/P5** — Phase-3 product decisions,
  untouched.
- **NO schema change** — see §7 (proven zero-migration).

### 2.3 Phase-3 decisions/invariants that must remain untouched

See §14 (full list). Highlights: puzzle-row-first lock order + `transaction_timestamp()`
anchor (NG9); no `clock_timestamp()`; zero schema migration; answer secrecy (no answers in
public artifacts; the settlement chunk stays answer-free); MISSED stays derived; no
ranking table; `requireAuth` on `/api/leaderboard/*`; NG21 envelopes; CSRF middleware
unchanged; the CI patched-worker + schema-purity assertions stay.

### 2.4 Planning decisions and remaining product ambiguities (recorded, NOT silently resolved)

Three items are recorded here for the implementation chat's clarity. They are NOT all the
same kind of item — do not treat the chosen decisions as open:

1. **D3 — hint provision: CHOSEN/BINDING.** NG2 says "generate and persist the hint at
   scheduling time"; Spec §16's pipeline says "validate hint_letter". Both readings are
   satisfied by **D3: the hint letter is part of the scheduling input; the server validates
   it (single ASCII letter occurring in the answer); the UI pre-fills the answer's first
   letter as a default that the admin may change.** The alternative (server derives the hint
   with no input) is viable and would be a one-line contract change, but it was NOT chosen —
   the spec's example states and "validate" wording imply an input. The implementation
   implements D3 as-is; only a product owner veto changes it.
2. **D4 — calendar-window defaults: CHOSEN, PRODUCT-TUNABLE.** No spec value exists;
   default `from = today − 30 days`, `to = today + 90 days` (Manila), cap `to − from ≤ 120
   days` (D4). The API is parameterized, so changing the UI default later is a one-line
   change — no rerun of this phase needed.
3. **Admin settlement tooling: EXPLICITLY DEFERRED / SCOPE CHANGE.** Phase-3's handoff
   listed it as "candidates for Phase-4 product planning, NOT promises"; no spec/architecture
   Phase-4 item names it. This plan excludes it. If the product owner wants it, it is a
   scope change, not an implementation detail.

### 2.5 Contradiction check (architecture/spec vs implementation) affecting Phase 4

- The architecture's illustrative API shape lists `GET/POST/PATCH /api/admin/puzzles/*`
  (no DELETE); Spec §16 and NG8 REQUIRE delete (future-only). The plan adds `DELETE`
  (illustrative ≠ immutable; spec + NG8 govern).
- `docs/contradictions-and-gaps.md` NG2's "Phase 0 (CHECK)" part is done (`hint_letter_shape`
  CHECK exists and is integration-tested); only the "Phase 4 (schedule validation)" part
  remains — Phase 4 must not touch the CHECK.
- Architecture §Admin scheduling window says moves/gaps "trigger the missing-puzzle
  alert"; the only alert channel in the repo is the settlement's structured log marker +
  failed-invocation surfacing (P3). Phase 4 adds a structured **admin-side marker** on
  gap-creating operations and keeps the settlement path as the operational detector
  (D7) — no new notification infra (Phase 6).

## 3. Existing-state summary

Everything Phase 4 builds on already exists and is verified:

| Concern | Where it is today | Phase-4 relationship |
|---|---|---|
| `daily_puzzles` schema (date/answer/hint/status/locked_at/expires_at, UNIQUE date + answer, hint CHECK, status/date index) | `src/server/db/schema.ts` + `0000_init.sql` (byte-identical since Phase 0) | Consumed as-is; zero migration (§7) |
| `answer_dictionary` (UNIQUE word + normalized_word) | `src/server/db/schema.ts` | Populated by the new import tooling (S1); read by scheduling validation |
| Approved-answer pool input contract | `scripts/seed/README.md` (gitignored `*.txt`) | Import script (S1) implements it; `verify:bundle` already scans it |
| Manila date/expiry helpers | `src/server/puzzle/manila.ts` — `todayManilaDateExpr`, `expiresAtExpr(puzzleDate)` | Reused verbatim for date rules + `expires_at` recomputation on move/replace |
| Puzzle-row lock discipline (NG9) | `src/server/game/service.ts` (`startGame`/`submitGuess`), `src/server/puzzle/finalize.ts`, `settlement.ts` | Reused pattern: every admin mutation locks the puzzle row FIRST in its own transaction |
| Lazy activation + first-start locking | `startGame` (SCHEDULED→ACTIVE + `lockedAt`) | Invariant to preserve; the scheduler must check `lockedAt`/status and never fight it |
| API composition + RPC typing | `src/server/routes.ts` (`Hono<AppEnv>`, chained registration), `hc<AppType>` client | Admin routes chain in exactly like `registerLeaderboardRoutes`; `requireAuth` already mounted on `/api/admin/*` |
| API auth/role primitives | `src/server/middleware/auth.ts` (`authContext`, `requireAuth`, `applyAdminBootstrap`) | Add `requireAdmin` (role check) next to `requireAuth` |
| NG21 errors / Zod validation | `src/server/lib/errors.ts` (`AppError`, `errorEnvelope`, `ERROR_CODES`), `@hono/zod-validator` patterns in game/profile/leaderboard handlers | Reuse; add admin-specific error codes |
| CSRF protection | `src/server/middleware/csrf.ts` (mounted `*`, excludes `/api/auth/*`) | Covers `/api/admin/*` automatically; no change |
| Role field + admin bootstrap | `user.role`, `applyAdminBootstrap`, `src/lib/app/guards.ts` `requireAdmin` (page), header Admin tab | Consumed; the API gets its own role check |
| Admin placeholder page | `src/routes/admin/+page.svelte` + guarded `+page.server.ts` | Rebuilt in S6; guard kept |
| FSD conventions + TanStack Query | `src/lib/shared/api/{client,me,leaderboard}.ts`, `src/lib/features/leaderboard/`, pages calling `createQuery`/`createMutation` | Mirror for the admin feature (page-local UI per FSD — D2) |
| Form conventions | `@tanstack/svelte-form` in `onboarding/+page.svelte`, `profile/+page.svelte` | Schedule/edit/replace forms follow this pattern |
| DB/date fixtures | `tests/integration/{helpers,lazy-activation,settlement,...}.test.ts` (SQL-computed Manila dates), `tests/e2e/helpers/auth-fixture.ts` (`createAuthenticatedUser` supports `role`, `seedTodayPuzzle`) | Extend with SCHEDULED-seeding + admin fixtures; never fabricate "today" |
| CI | `.github/workflows/ci.yml` (3 jobs; schema-purity + patched-worker assertions) | No new jobs; assertions stay |

## 4. Architecture design

### 4.1 Data/control flow

```text
Admin browser (/admin, role-gated page)
   │  TanStack Query (['admin','puzzles']) + mutations
   ▼
src/lib/shared/api/admin.ts  (hc<AppType> typed RPC; error-envelope unwrap)
   │  /api/admin/*  (cookie session)
   ▼
SvelteKit bridge (src/routes/api/[...path]/+server.ts) → Hono app
   │
   ├── middleware chain: requestId → timeout → bodyLimit → security headers
   │     → CSRF (origin/site check) → authContext (session resolve)
   │     → requireAuth (401) → requireAdmin (403 role check, NEW)
   │
   ▼
src/server/admin/handlers.ts  (zValidator strict bodies; NG21 AppError mapping)
   │
   ▼
src/server/admin/service.ts  (domain rules; every mutation: lock puzzle row FIRST)
   │  sql today (transaction_timestamp() AT TIME ZONE 'Asia/Manila')
   │  answer_dictionary membership + duplicate pre-checks
   │  UNIQUE constraints (23505) as the final guard
   ▼
Neon (existing schema — zero migration)
```

### 4.2 Concurrency model (extends the Phase-3 model, does not change it)

- Every admin mutation runs in its **own transaction**, locking the puzzle row with
  `FOR UPDATE` FIRST (NG9 lock order). This serializes admin mutations against
  `startGame`'s lazy activation, `submitGuess`, cron `activateToday`, and
  `finalizePuzzle` — the same serialization point the whole app uses.
- An admin mutation NEVER flips lifecycle status. It only edits SCHEDULED rows
  (`status` stays `SCHEDULED`; activation remains the exclusive job of
  `activateToday`/`startGame` M3).
- **Immutability is re-checked under the lock after acquisition** (READ COMMITTED
  re-read, same discipline as `submitGuess`): a puzzle whose status flipped to ACTIVE or
  whose `locked_at` was set meanwhile is rejected (403) — the first player start wins.
- **Same-day replacement** re-verifies inside its transaction: `puzzle_date` = today
  (Manila, SQL), `status = 'SCHEDULED'`, `locked_at IS NULL` — a concurrent
  `activateToday`/`startGame` that won the lock first makes the replacement fail closed.
- **Delete/move gaps** are detected over the mutated window and reported via a
  structured `[admin]` log marker + returned in the response; the settlement cron remains
  the operational detector for a missing TODAY (existing P3 mechanism) — D7.

### 4.3 Answer secrecy in the admin plane

- The approved-answer pool is private: no answer-pool material in tracked source,
  generated artifacts, client bundles, or non-admin responses. The private local seed
  file (`scripts/seed/*.txt`) may exist only uncommitted and gitignored; never in
  `src/lib`; `verify:bundle` scans build output for seed words when present.
- Admin API responses include the answer word ONLY behind `requireAuth`+`requireAdmin`
  (403 for every non-admin; non-admin code paths never receive `word`).
- The client bundle contains no answer material statically: admin pages fetch word data
  at runtime from the protected API. The U5-style secrecy tests in the repo must be
  extended to pin that the admin feature sources/import tooling never ship answer words
  (see §10.5).

### 4.4 Domain service shape

`src/server/admin/` (Phase-0 skeleton home — use it, don't invent a new folder):

- `validation.ts` — pure, DB-free helpers: `normalizeAnswerWord()`, `validateHintLetter()`
  (single ASCII letter, occurs in the answer), `validateDateWindow()`; unit-testable.
- `service.ts` — `createAdminPuzzleService(db)` returning:
  `listPuzzles(from, to)`, `validateWord(word)`, `schedulePuzzle(input)`,
  `updatePuzzle(id, patch)`, `deletePuzzle(id)`, `replaceTodayPuzzle(id, input)`.
- `handlers.ts` — `registerAdminRoutes` (chained, identical typing discipline to
  `registerLeaderboardRoutes`).
- `middleware` — `requireAdmin` lives in `src/server/middleware/auth.ts` (next to
  `requireAuth`; both are composed in `routes.ts`).

## 5. Binding decisions (D1–D10)

These are binding for the implementation chat unless the repository or a NEWER recorded
decision supersedes them. Record them in `docs/contradictions-and-gaps.md` when
implementing (per the project's decision-log rule).

| # | Decision |
|---|---|
| **D1** | **API role gate**: add `requireAdmin` middleware (403 `FORBIDDEN` envelope when the authenticated user's `role !== 'admin'`) composed as `.use('/api/admin/*', requireAuth)` then `.use('/api/admin/*', requireAdmin)` in `routes.ts`. The PAGE guard (`requireAdmin` in `src/lib/app/guards.ts`) stays as-is; page and API check independently. |
| **D2** | **FSD placement**: the admin UI is page-owned (single consumer). Components live under `src/routes/admin/` (e.g. `src/routes/admin/puzzle-calendar.svelte`, `src/routes/admin/…`); no speculative `$lib/features/admin/` slice. Only genuinely reusable pure helpers (e.g. date formatting) go to `src/lib/shared/lib/`. This matches the FSD "start simple, extract when needed" rule and the Phase-3 precedent (extraction happened ONLY because /play and /leaderboard shared components). |
| **D3** | **Hint contract**: scheduling/replacement input carries `hintLetter`; server validation: `^[A-Z]$` (normalized to uppercase) AND the letter must occur in the answer word; persisted at scheduling time, never at activation (NG2). UI pre-fills the answer's first letter as the default; the admin may change it. |
| **D4** | **List window**: `GET /api/admin/puzzles?from&to` — YYYY-MM-DD, `from ≤ to`, window ≤ 120 days; defaults `from = today − 30 days`, `to = today + 90 days` (Asia/Manila, computed in SQL). Response ordered by `puzzle_date`. |
| **D5** | **Validation UX**: scheduling validation feedback (Spec §16 example states: "Approved answer" / "Already scheduled/used" / "Not in approved answer list") is computed SERVER-side via `POST /api/admin/puzzles/validate`. The client never receives the answer pool. Invalid/duplicate answers are flagged by the calendar row + the form; submission is rejected server-side regardless of client checks. |
| **D6** | **Delete/edit state guards**: DELETE and PATCH — allowed ONLY when `locked_at IS NULL AND status = 'SCHEDULED' AND puzzle_date > today (Manila)`; any violation → 403 `FORBIDDEN` (NG8 literal) with a specific code (`PUZZLE_IMMUTABLE` for locked/ACTIVE/FINALIZED, `NOT_SCHEDULED` for non-SCHEDULED, `NOT_FUTURE` for non-future). Today's SCHEDULED puzzle: no plain delete/edit; PATCH with a today's date on today's SCHEDULED puzzle is NOT the replacement path. |
| **D7** | **Gap alerting**: move/delete operations that create a date gap log a structured marker (`[admin] puzzle gap created dates=…` via the existing logger seam) and return the gap dates in the response body; the UI warns + shows the affected dates. No new notification infrastructure (P3 defers real alerting to Phase 6). The settlement cron remains the operational detector for a missing TODAY. |
| **D8** | **Same-day replacement endpoint**: `POST /api/admin/puzzles/:id/replace-today { word, hintLetter }` — the ONLY way to change today's puzzle. Guards (inside the transaction, under the puzzle-row lock): `puzzle_date` = today (Manila), `status = 'SCHEDULED'`, `locked_at IS NULL`; then UPDATE `answer_id`+`hint_letter`+`expires_at` (recomputed via `expiresAtExpr`). Never delete+reschedule. |
| **D9** | **Date moves**: PATCH `puzzleDate` on a future SCHEDULED puzzle recomputes `expires_at`, re-checks `UNIQUE(puzzle_date)` (pre-check + 23505 → 409 `DATE_TAKEN`), destination must be > today. |
| **D10** | **Error codes**: add to `ERROR_CODES`: `ANSWER_NOT_APPROVED` (400), `INVALID_HINT` (400), `ANSWER_ALREADY_SCHEDULED` (409), `DATE_TAKEN` (409), `PUZZLE_IMMUTABLE` (403), `NOT_SCHEDULED` (403), `NOT_FUTURE` (403), `INVALID_DATE_WINDOW` (400). All responses use the NG21 envelope. |

## 6. Implementation slices

TDD discipline (failing test before code) at every slice. Slices are independently
verifiable; each ends green (unit suite for the slice + the full preserved suite).

### S1 — Answer-pool import tooling (dependency slice)

- **Purpose**: make `answer_dictionary` populate-able so scheduling validation has an
  approved list. Implements the contract in `scripts/seed/README.md`.
- **Files**: `scripts/seed/import-answer-pool.ts` (new); `scripts/seed/README.md`
  (extend with exact usage + provenance record); `package.json` (`seed:answers` script);
  `.gitignore` already covers `scripts/seed/*.txt`.
- **Behavior**: reads `scripts/seed/answer-pool.source.txt` (private; when absent the
  script exits with a clear message — CI never runs it); parses one 5-letter lowercase
  word per line (blank/# comments ignored — same rules as `build-word-list.ts`);
  **enforces `answers ⊂ valid guesses`** (fails on any answer not in
  `VALID_GUESS_SET`), rejects duplicates in-source; writes rows
  `{ word, normalizedWord }` `ON CONFLICT DO NOTHING`/upsert with a report (inserted /
  already present); verifies `answer_dictionary` never leaks into client artifacts
  (relies on `verify:bundle`, already wired).
- **Backend**: standalone `bun` script using `src/server/db/client.ts` +
  `process.env.DATABASE_URL` (same seam as `scripts/ci-migrate.ts`).
- **Tests**: unit — parser rules (lowercase/5-letter/dedupe/comment handling;
  mirror `tests/unit/build-word-list.test.ts`); subset-invariant test (any answer file
  present → every word ∈ `VALID_GUESS_SET`); integration — optional (against live DB,
  guarded by `DATABASE_URL`, small fixture file).
- **Depends on**: nothing new.
- **Acceptance**: `bun run seed:answers` with a fixture file inserts rows idempotently
  and reports; a word not in valid guesses exits non-zero; no client artifact contains
  pool words (existing `verify:bundle` gate).

### S2 — Admin domain validation (pure) + service

- **Purpose**: the full server-side scheduling/management domain with the state model.
- **Files**: `src/server/admin/validation.ts`, `src/server/admin/service.ts` (new);
  `src/server/lib/errors.ts` (D10 codes); `src/server/db/memo.ts` unchanged.
- **Backend changes**:
  - Pure validation: word normalization (trim/lowercase, `^[a-z]{5}$`), hint guard,
    ISO date + window guards.
  - `listPuzzles(from,to)` — SELECT over `daily_puzzles` (join `answer_dictionary` for
    `word`) in the window, ordered by date; returns rows incl. `{ id, date, status,
    hintLetter, lockedAt, expiresAt, word }` (admin-only surface).
  - `validateWord(word)` — membership in `answer_dictionary` (by normalized word) +
    "already scheduled/used" (exists in `daily_puzzles`) → machine-readable result for
    D5.
  - `schedulePuzzle({puzzleDate, word, hintLetter})` — transaction: SQL today; reject
    `puzzle_date <= today` (400/403 per D6); normalize + membership (400
    `ANSWER_NOT_APPROVED`); duplicate date pre-check (409 `DATE_TAKEN`); duplicate
    answer pre-check (409 `ANSWER_ALREADY_SCHEDULED`); hint validation (400
    `INVALID_HINT`); INSERT `{puzzleDate, answerId, hintLetter, status:'SCHEDULED',
    expiresAt: expiresAtExpr(date)}`; UNIQUE violations (23505) mapped to the same
    409s.
  - `updatePuzzle(id, patch)` — transaction: lock row `FOR UPDATE`; guards D6; apply
    word/hint/date changes; date-move computes new `expires_at` + duplicate-date
    guard (D9); gaps logged/returned (D7).
  - `deletePuzzle(id)` — transaction: lock row; guards D6; DELETE; gap marker over the
    future window (D7).
  - `replaceTodayPuzzle(id, {word, hintLetter})` — transaction: lock row; verify today
    (SQL) + SCHEDULED + `locked_at IS NULL` (D8); update answer/hint/expires_at;
    `UNIQUE(answer_id)` violation → 409.
- **Tests (unit, DB-free)**: validation pure functions (hint membership, word
  normalize, window), state-guard matrix (D6) as pure predicates where possible,
  error-code mapping. **(integration, live Neon)** — I-series below (§10.2): full
  schedule/edit/move/delete/replace matrix incl. `UNIQUE` guards, lock-order races
  (replace vs startGame lazy activation; delete vs activateToday; replace vs
  activateToday), past/today/future rejection, gap marker content, `expires_at`
  recomputation on move.
- **Depends on**: S1 (dictionary availability for integration runs).
- **Acceptance**: every D6/D8/D9 rule pinned by at least one integration test; preserved
  suites green.

### S3 — `requireAdmin` middleware + API wiring + handlers

- **Purpose**: secure `/api/admin/*` and expose the contract.
- **Files**: `src/server/middleware/auth.ts` (+`requireAdmin`), `src/server/routes.ts`
  (compose + chain), `src/server/admin/handlers.ts` (new).
- **Backend changes**:
  - `requireAdmin`: after `requireAuth`, `c.get('auth').user.role !== 'admin'` → NG21
    403 `FORBIDDEN` envelope (defense-in-depth re-check inside handlers like
    `authenticatedUser`).
  - Routes (contract in §8): `GET /api/admin/puzzles`, `POST /api/admin/puzzles`,
    `PATCH /api/admin/puzzles/:id`, `DELETE /api/admin/puzzles/:id`,
    `POST /api/admin/puzzles/:id/replace-today`, `POST /api/admin/puzzles/validate`.
    Strict zod bodies; uuid-shaped path ids (reuse `UUID_RE` from game handlers);
    chained registration (typed like `registerLeaderboardRoutes`).
- **Tests (unit)**: route contract with a fake service + fake resolver — 401 without
  session, 403 for `role:'player'`, 200/201 pass-through for `role:'admin'`, strict-body
  rejection, NG21 envelopes, uuid-404 short-circuit. Mirror
  `tests/unit/{leaderboard-routes,profile-routes}.test.ts`.
- **Depends on**: S2 service shape.
- **Acceptance**: the middleware chain unit suite proves 401/403/200 per role.

### S4 — Client API surface + admin page rebuild (calendar, forms, states)

- **Purpose**: the product-facing admin UI replacing the placeholder.
- **Files**:
  - `src/lib/shared/api/admin.ts` (new) — `adminKeys = { all: ['admin'], puzzles:
    ['admin','puzzles'] }`; `adminApi` methods for the six endpoints (typed RPC,
    `apiErrorFromResponse`).
  - `src/routes/admin/+page.svelte` (rebuild; keep `+page.server.ts` guard) + page-local
    components (D2): calendar month grid, day cell (state/word/locked badge), schedule
    form, edit form, delete confirmation, same-day replacement panel, validation
    feedback (D5).
- **Frontend changes**:
  - Calendar: month navigation (ChevronLeft/Right), days = Manila dates; today
    highlighted; each future SCHEDULED day shows the word + hint; ACTIVE/FINALIZED/
    locked days show state badges and are immutable in the UI; missing days = empty
    slots.
  - Schedule/edit/replace via `@tanstack/svelte-form` (pattern: onboarding/profile);
    hint field pre-filled with the word's first letter (D3); live "check answer"
    (debounced `validate` call) rendering the Spec §16 example states.
  - Mutations via TanStack `createMutation` + `['admin','puzzles']` invalidation;
    optimistic-update NOT required (keep server truth; refetch on settle — no invented
    behavior).
  - States: loading skeletons (`aria-busy`), error + retry (existing pattern), empty
    window copy, per-action toasts (svelte-sonner — already used for profile), delete
    with inline confirmation (Dialog add is allowed — bits-ui is already a dependency;
    if the Dialog component is not added, use an accessible inline confirm; either way
    destructive actions need an explicit confirm step).
- **Tests (E2E)** — E-series (§10.3): admin tab visibility only for admins; calendar
  renders seeded SCHEDULED words; schedule succeeds + appears; duplicate answer shows
  the Spec example "⚠ Already scheduled/used" state and is rejected; non-approved word
  shows "✕ Not in approved answer list"; delete of an ACTIVE/today puzzle is rejected
  in the UI; same-day replacement of a seeded today SCHEDULED puzzle succeeds and the
  word updates; non-admin user cannot navigate to `/admin` (page redirect) nor call
  `/api/admin/*` (403).
- **Depends on**: S2+S3 (services + API), S1 (seeded dictionary for non-approved vs
  approved words in fixtures).
- **Acceptance**: E2E admin spec green; visual states match §9; responsive
  (390×844 + desktop) and dark/light per existing tokens.

### S5 — Secrecy + regression hardening

- **Purpose**: prove the admin plane leaks no answer material and regresses nothing.
- **Files**: tests only — extend `tests/unit/worker-patch.test.ts`-style secrecy
  coverage with an **admin-secrecy unit test** (module-identifier assertions: the admin
  feature sources contain no pool words — runs when `scripts/seed/*.txt` exists, same
  conditional approach as U5); `tests/e2e/helpers/auth-fixture.ts` (+
  `seedScheduledPuzzle(date, word, opts)` helper — SCHEDULED variant incl. today's
  date).
- **Depends on**: S1–S4 code shapes.
- **Acceptance**: `verify:bundle` green with a populated pool file present locally;
  new unit pin both the presence- and absence-conditional behavior.

### S6 — Documentation + contradiction log + final gates

- **Purpose**: record decisions/deviations and produce the implementation handoff.
- **Files**: `docs/contradictions-and-gaps.md` (record D1–D10 + any deviations BEFORE
  they are implemented per the repo rule), `scripts/seed/README.md` (import usage +
  provenance), `docs/phases/phase 4/phase-4-implementation-handoff-final.md` (new —
  receipts, exact new HEAD).
- **Depends on**: all slices.
- **Acceptance**: §12 gates all run green on the final tree; contradiction log updated
  first; deviations (if any) recorded; new HEAD reported.

**Dependency graph**: S1 → S2 → S3 → S4; S5 runs alongside S2–S4; S6 last.

## 7. Data model / migration plan

**No migration. Zero schema change. Proof:**

- All columns Phase 4 writes are already in `0000_init` and `schema.ts` (audited):
  `daily_puzzles.puzzle_date`, `answer_id`, `hint_letter`, `status`, `locked_at`,
  `expires_at`, `created_at` (+ Phase-3 frozen `average_completion_time_ms`,
  `non_completion_penalty_ms`, `finalized_at`).
- All constraints Phase 4 relies on already exist: `UNIQUE(puzzle_date)` (one puzzle per
  day), `UNIQUE(answer_id)` (one use per answer — the DB-level duplicate guard),
  `hint_letter_shape` CHECK (single uppercase ASCII letter; membership stays app-level
  per NG2), `UNIQUE word/normalized_word` on `answer_dictionary`.
- All query shapes are covered by existing indexes: range scans by `puzzle_date` use the
  `UNIQUE(puzzle_date)` btree; `daily_puzzles_status_date_idx` covers state+date scans;
  `answer_dictionary` uniqueness indexes cover membership lookups. (Small private group;
  same reasoning as the Phase-3 no-index verdict.)
- Nothing new is stored: MISSED stays derived; no ranking table; no admin audit table
  (not specified anywhere — do not invent one).

**Invariant**: the schema-purity gate stays mandatory end-to-end:
`git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` → EMPTY
(both locally and as CI step 52).

## 8. API contract

All responses use the NG21 envelope on errors (`{ error: { code, message, requestId,
issues? } }`). Base: same-origin `/api`; cookie session; CSRF middleware already applies.
Onboarding is NOT enforced at API level (consistent with `/api/game/*`,
`/api/leaderboard/*` — the page guards the UI; the role gate is the admin boundary).

### 8.1 Endpoints

**`GET /api/admin/puzzles?from=&to=`** — admin only.
- Query: `from`, `to` — `YYYY-MM-DD`, `from ≤ to`, window ≤ 120 days (D4 defaults).
- 200: `{ puzzles: [{ id, date, status, hintLetter, lockedAt, expiresAt, word }] }`
  ordered by date. `word` is the answer text — admin-only surface; NEVER sent to
  non-admins; never statically bundled.
- Errors: 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 400 `INVALID_DATE_WINDOW`/`BAD_REQUEST`.

**`POST /api/admin/puzzles`** — admin only. Schedule a future puzzle.
- Body (strict): `{ puzzleDate: string(YYYY-MM-DD), word: string(1..64), hintLetter:
  string(1) }`. Word normalized server-side (`trim().toLowerCase()`; must match
  `^[a-z]{5}$` after normalization).
- Rules (server, in-transaction, DB clock): `puzzleDate > today(Manila)`; word ∈
  `answer_dictionary` (by normalized word); answer not already scheduled/used; hint
  single ASCII letter occurring in the answer (D3); `puzzleDate` free (UNIQUE).
- 201: `{ puzzle }` (the created row incl. `word`); 400 `ANSWER_NOT_APPROVED` /
  `INVALID_HINT` / `BAD_REQUEST`; 403 `NOT_FUTURE`; 409 `DATE_TAKEN` /
  `ANSWER_ALREADY_SCHEDULED`.

**`PATCH /api/admin/puzzles/:id`** — admin only. Edit a future SCHEDULED puzzle.
- Body (strict, ≥1 field): `{ puzzleDate?, word?, hintLetter? }`.
- Rules: row exists; `locked_at IS NULL AND status = 'SCHEDULED' AND puzzle_date >
  today` (D6); changed word/hint revalidated exactly as in POST; `puzzleDate` must stay
  future, recomputes `expires_at`, duplicate-date guard (D9); gaps reported (D7).
- 200: `{ puzzle, gaps: string[] }`; 403 `PUZZLE_IMMUTABLE` / `NOT_SCHEDULED` /
  `NOT_FUTURE`; 404 `NOT_FOUND`; 400/409 as POST.

**`DELETE /api/admin/puzzles/:id`** — admin only.
- Rules: row exists; `locked_at IS NULL AND status = 'SCHEDULED' AND puzzle_date >
  today` (D6). Today's SCHEDULED puzzle → 403 (use replace-today).
- 200: `{ deleted: true, gaps: string[] }` (gaps per D7); 403/404 as PATCH.

**`POST /api/admin/puzzles/:id/replace-today`** — admin only. Atomic same-day
replacement (NG15).
- Body (strict): `{ word, hintLetter }` (same validation as POST).
- Rules (single transaction, puzzle-row lock first, SQL today): `puzzle_date` = today,
  `status = 'SCHEDULED'`, `locked_at IS NULL`; UPDATE `answer_id`/`hint_letter`/
  `expires_at` in place. No transient gap; no missing-puzzle alert.
- 200: `{ puzzle }`; 403 `PUZZLE_IMMUTABLE` (ACTIVE/FINALIZED/locked) /
  `INVALID_STATE` (not today / not SCHEDULED); 404; 400/409 per POST validation.

**`POST /api/admin/puzzles/validate`** — admin only. Live scheduling validation (D5).
- Body (strict): `{ word }`.
- 200: `{ approved: boolean, previouslyUsed: boolean | null, usedOn:
  string|null }` — `approved=false` ⇒ not in the approved list; `previouslyUsed=true`
  ⇒ already scheduled/used (with the date). Spec §16 example states render from this
  response.
- Errors: 400 `BAD_REQUEST`; 401/403.

### 8.2 Auth / roles / validation / error summary

| Concern | Behavior |
|---|---|
| Unauthenticated | 401 `UNAUTHORIZED` (requireAuth — already mounted on `/api/admin/*`) |
| Authenticated, role ≠ admin | 403 `FORBIDDEN` (`requireAdmin`) — e.g. `role:'player'`; onboarding NOT enforced at API level |
| Authenticated admin | Full access; `word` visible |
| CSRF | Existing `csrfProtection` (Origin/Sec-Fetch-Site) covers all unsafe admin mutations; no change |
| Body limit | Existing 64 KB `bodyLimit` applies (word/hint payloads are tiny) |
| Timeout | Existing 30 s timeout applies |
| IDs | `:id` must match `UUID_RE` — otherwise 404 without DB round-trip (game-handler pattern) |
| Compatibility | No existing endpoint changes; `/api/auth/*`, `/api/game/*`, `/api/me/*`, `/api/leaderboard/*` untouched; Hono AppType grows via chaining only |

## 9. UI/UX behavior

- **Navigation**: existing header Admin tab (Phase-2 D6) — visible only for
  `role === 'admin'`; `/admin` SSR guard redirects non-admins to `/`.
- **Calendar** (page-owned component, D2): month grid with weekday headers; day cells:
  - empty slot (no puzzle) — tappable "Schedule" affordance;
  - future SCHEDULED — word + hint letter + edit affordance + delete affordance;
  - today SCHEDULED (never started) — "Needs replacement" panel (cron missed) with a
    Replace action (D8) — the ONLY today mutation;
  - ACTIVE — "Live" badge; immutable (no edit/delete);
  - FINALIZED — state + (no word? decision: word shown as "—" or shown? **keep the
    word visible to admins** — the leaderboard already reveals history state, and
    spec only restricts pre-play exposure to players. Simpler + consistent: FINALIZED
    days show the word, since admins may see any date's word; the secrecy boundary is
    player-facing.)
  - locked (`locked_at != null`) — Lock badge; immutable.
  - Clear month navigation (ChevronLeft/Right), today highlight, responsive grid
    (narrow screens keep usable cells — Spec §17).
- **Forms** (TanStack Form): schedule/edit/replace dialogs or inline panels; fields:
  date (edit/move only), word, hint (pre-filled default D3); per-field errors; the
  validate call renders live status chips: `✓ Approved answer` / `⚠ Already
  scheduled/used` / `✕ Not in approved answer list` (Spec §16 examples).
- **States**: loading skeleton (`aria-busy`), error + retry (existing pattern), empty
  copy, success/error toasts (svelte-sonner), delete requires explicit confirmation;
  destructive action buttons disabled while a mutation is in flight (one in flight at a
  time — no invented concurrency).
- **Accessibility**: focus management in dialogs, `aria-current` on the active month? no —
  `aria-label` on nav controls; each day cell is a `<button>`/`<a>` with accessible
  name (date + state); color not the only state indicator (badge + text); the existing
  token system (light/dark) is used; no desktop-only hover for essential actions
  (Spec §17).
- **Reuse**: Badge (state), Button, Input, existing tabs pattern if needed; shadcn
  Dialog may be added via CLI (allowed; bits-ui present); no new styling system.

## 10. Testing strategy

Uses the repo's existing three-level architecture; no parallel framework.

### 10.1 Unit (DB-free — `tests/unit/`)

- `admin-validation.test.ts` — word normalization, hint validation (shape + membership),
  date-window validation.
- `admin-service-guards.test.ts` — pure state-guard predicates (D6 matrix) if extracted;
  error mapping helpers.
- `admin-routes.test.ts` — full middleware chain with fake service/resolver: 401
  (no session), 403 (`role:'player'`), pass-through (`role:'admin'`), strict-body
  rejection, `UUID_RE` 404, NG21 envelopes (mirror `leaderboard-routes.test.ts`).
- `answer-pool-import.test.ts` — parser rules + `answers ⊂ valid guesses` invariant
  (conditional on seed files, like U5).
- `admin-secrecy.test.ts` — no answer-pool words/identifiers in admin sources/build
  output when seed files present (extends the U5 approach).
- **Preserved**: every existing unit suite must stay green untouched.

### 10.2 Integration (live non-production Neon — `tests/integration/`)

New `admin-service.test.ts` (calendar-adaptive fixtures, dates from DB clock in SQL —
the Phase-3 fixture discipline; future dates are free, "today" is SQL-computed):

- I-A1 schedule future puzzle → row created with correct `expires_at`
  (`(date + 1) AT TIME ZONE 'Asia/Manila'`), status SCHEDULED.
- I-A2 schedule rejects past/today dates (403 `NOT_FUTURE`), non-approved word (400),
  invalid hint (400), duplicate date (409), duplicate answer (409, incl. a direct
  UNIQUE-violation race path).
- I-A3 edit word/hint on future SCHEDULED; hint revalidated; locked puzzle → 403.
- I-A4 date move: `expires_at` recomputed; move onto an occupied date → 409
  `DATE_TAKEN`; move to past/today → 403.
- I-A5 delete: future SCHEDULED ok; ACTIVE / FINALIZED / locked / today / past → 403;
  today SCHEDULED → 403 (replacement is the only path).
- I-A6 same-day replacement: seed today's SCHEDULED puzzle → replace succeeds, word +
  hint updated, `expires_at` = today+1 Manila; after a player started (locked_at set)
  → 403; after `activateToday` (ACTIVE) → 403; after finalize → 403.
- I-A7 lock-order races (NG9 discipline, `waitForLockWaiters` helper): concurrent
  replace vs `startGame` lazy activation — exactly one wins, the loser fails closed,
  no corruption; concurrent `deletePuzzle` vs `activateToday`; concurrent schedule of
  the same date/answer — UNIQUE constraints win, no duplicates.
- I-A8 gap reporting: delete/move creates gaps → structured `[admin]` marker + gaps in
  the response; settlement marker behavior unchanged (`[settlement] missing puzzle…`
  tests preserved).
- I-A9 list window: from/to filtering, ordering, defaults; invalid windows rejected.
- I-A10 idempotency: `validate` never mutates; schedule failure leaves no partial rows.

### 10.3 E2E (Playwright — `tests/e2e/`)

New `admin.spec.ts` (serialized runner; deterministic session fixture with
`role:'admin'`; extend `auth-fixture.ts` with `seedScheduledPuzzle(date, word)`):

- E-A1 admin sees the Admin tab and the populated calendar; a player user does not see
  the tab, is redirected from `/admin`, and gets 403 from `/api/admin/*`.
- E-A2 schedule flow: fill word + hint → success toast → row appears in the month grid.
- E-A3 validation states: non-approved word → "✕ Not in approved answer list";
  already-scheduled answer → "⚠ Already scheduled/used"; submission rejected.
- E-A4 delete future SCHEDULED with confirmation; delete controls absent/disabled for
  ACTIVE and today.
- E-A5 same-day replacement for a seeded today-SCHEDULED puzzle; board word updates.
- E-A6 responsive smoke (390×844) + dark/light state render (existing audit patterns).
- **Preserved**: all existing specs (smoke, game-flow, onboarding, profile,
  leaderboard) untouched.

### 10.4 Regression

- Full preserved suites (unit/integration/E2E) must pass UNCHANGED.
- Phase-3 pins re-run: settlement idempotency/concurrency, leaderboard aggregations,
  NG9 lock-order A/B, lazy activation, worker-patch unit, schema purity.

### 10.5 Build/CI verification

- `bun run build` + patched-worker assertion + `verify:bundle` (with a populated local
  seed file, prove no pool word enters the client bundle).
- Schema purity CI step stays and must be EMPTY at the end.
- No new CI jobs; no wrangler/cron changes; `wrangler deploy --dry-run` green.
- New generated artifacts: none (calendar UI is runtime-rendered; no build step).

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Concurrency**: replacement/edit/delete racing lazy activation, cron activation, first-player start, or finalize | All admin mutations lock the puzzle row FIRST in their own transactions (NG9); immutability is re-checked under the lock (READ COMMITTED re-read); I-A7 pins both lock orders deterministically with `waitForLockWaiters`. |
| **Answer leakage**: future answers in build output / to non-admins / in SSR | `requireAdmin` on every admin route; `word` only in admin responses; no static answer text in `src/lib` or routes (runtime fetch only); `verify:bundle` + new unit secrecy pin; E-A1 asserts the 403 boundary. The seed file stays gitignored (`.gitignore` re-verified). |
| **DB duplicate races** (same date/answer submitted concurrently) | Pre-checks are UX; `UNIQUE(puzzle_date)` + `UNIQUE(answer_id)` + 23505 → 409 mapping are the final guard; I-A7 covers the direct conflict. |
| **Clock skew** (client claims a date; admin UI at midnight) | "Today"/future are computed in SQL (`transaction_timestamp() AT TIME ZONE 'Asia/Manila'`) inside the mutation transaction — client-supplied dates are only data; same authority as NG9. |
| **Fixture constraints** | Future/past dates are freestanding; "today" must be SQL-derived and cannot be fabricated (Phase-3 discipline). Calendar-adaptive assertions where a frame is short. Serialized E2E runner (already enforced). |
| **Test DB wipe races** | Existing serialization (workers:1, sequential jobs) covers the new spec; the admin spec uses the same TRUNCATE fixture. |
| **CI without private seed files** | `seed:answers` and pool-dependent unit tests are conditional (skip with explicit reason when `scripts/seed/*.txt` absent) — mirroring U5; `verify:bundle` is a no-op scan without files. Mandatory DB gates unchanged. |
| **NG21/typing regression** | Chained registration exactly like `registerLeaderboardRoutes`; the AppType grows; `hc` client typed; unit route tests compile against the real chain. |
| **Timeouts on Neon round-trips** | Admin mutations are one- or few-statement transactions (no month-seeding); batching precedent (Phase 3) applies only to fixtures. |
| **UI scope creep** (settlement tooling, stats, etc.) | §2.2 boundary is explicit; implementation prompt says NOT to add anything not listed. |
| **Dialog/Calendar dependency churn** | bits-ui + `@internationalized/date` already installed; if shadcn Dialog is added, regenerate via CLI and lock the lockfile; custom month grid avoids Calendar-component API fights. |

## 12. Verification gates

All must pass on the FINAL tree before Phase 4 is considered complete (each command
actually run):

```text
bun install --frozen-lockfile
bun run lint
bun run check                       # 0 errors / 0 warnings
bun run test:unit                   # incl. new admin/validation/secrecy suites; 0 regressions
bun run build                       # client + server + patched worker
grep -c "export { scheduled }" .svelte-kit/cloudflare/_worker.js   # exactly 1
bun run verify:bundle               # answer-pool secrecy (with local seed files present where available)
bun run types:check                 # hermetic clean-checkout condition (no .env/.dev.vars)
bun run auth:check
bun run word-list && bun run avatar-list   # byte-identical artifacts
git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations   # EMPTY (zero migration)
bun run test:integration            # live non-production Neon; incl. I-A1..I-A10 + all preserved suites
bun run test:e2e                    # incl. admin.spec.ts + all preserved specs
bunx wrangler deploy --dry-run
```

Also: full GitHub Actions run green (unit-and-build, integration, e2e); the CI
schema-purity + patched-worker assertions unchanged; `docs/contradictions-and-gaps.md`
updated with D1–D10 BEFORE implementation and with any deviations FIRST; final
implementation handoff written.

## 13. Deferred to later phases

- **Real alerting/notification for missing puzzles** (P3) — Phase 6.
- **P1 thresholds confirmation** — Phase 6.
- **Admin-facing settlement tooling / manual settlement trigger** — NOT promised
  (Phase-3 handoff §9.3); requires a product decision to enter scope.
- **Personal history/statistics surface** — not on any phase roadmap (Phase-3 non-goal).
- **Rate limiting, CSP, ZAP, Dependabot, adversarial testing** — Phase 5.
- **Answer-pool content** — the pool itself is the product owner's private input; the
  tooling (S1) ships without any answer words.

## 14. Explicit invariants (must not break)

1. **Zero schema change**: `src/server/db/schema.ts` + `migrations/` byte-identical
   (`git diff --exit-code` EMPTY, locally + CI).
2. **NG9 lock order** — puzzle row first, `transaction_timestamp()` eligibility anchor;
   never introduce `clock_timestamp()`; admin mutations follow the same discipline.
3. **Lifecycle ownership**: only `activateToday`/`startGame` (M3) flip SCHEDULED→ACTIVE;
   only `finalizePuzzle` flips ACTIVE→FINALIZED. Admin code never changes status.
4. **Immutability**: `locked_at != null` or ACTIVE/FINALIZED ⇒ answer/hint immutable;
   same-day replacement is the only today-path and only when SCHEDULED + unlocked.
5. **Answer secrecy**: no answer-pool material in tracked source, generated artifacts,
   client bundles, or non-admin API responses — the private local seed file
   (`scripts/seed/*.txt`) may exist only uncommitted and gitignored; the settlement chunk
   stays answer-free.
6. **Phase-3 model untouched**: MISSED derived (no fake rows); no ranking table; dense
   ranks; `requireAuth` on `/api/leaderboard/*`; NG21 envelopes; lazy finalization;
   sweep semantics; cron wiring + `_settlement.js` patching unchanged.
7. **Phase-1/2 surfaces untouched**: game domain, auth, onboarding, profile, theme,
   header, guards — no redesigns.
8. **API composition rule**: admin routes registered ONLY in `routes.ts`, chained
   (AppType preserved); no second client; no SvelteKit form actions for mutations.
9. **No new endpoints outside the §8 contract** (no `/api/stats`, no
   `/api/game/history`, no manual settlement, no `/api/admin/answers`-pool-dump).
10. **No new dependencies beyond what §6 lists** (Dialog optional); lockfile changes
    only from that.
11. **Existing tests are never weakened** to make new code pass.

## 15. Planning verdict

- Phase 4 = **Admin puzzle scheduling & management** per Architecture-v3 §Phase 4 +
  Spec §16 + NG2/NG8/NG15/M5. Fully consistent with the current code; nothing is
  reimplemented from Phase 3 or earlier.
- Zero migration proven (§7). Six slices, explicit dependencies (§6), full API contract
  (§8), UI/UX spec (§9), test matrix (§10), gates (§12).
- Open items recorded, not guessed: hint input flow (D3 chosen), calendar window
  defaults (D4), admin settlement tooling exclusion (§2.4), alert channel for gaps (D7).
- The implementation chat can execute from
  `docs/phases/phase 4/phase-4-implementation-prompt.md` + this plan + the state handoff
  without re-deriving anything.

---

*Prepared from the actual repository at `b2bca18` (planning audit 2026-08-30). All
statements about existing code/behavior were verified against the tree; nothing was
inferred.*