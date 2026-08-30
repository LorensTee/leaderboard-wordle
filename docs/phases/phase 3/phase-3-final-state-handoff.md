# Phase 3 — Final State Handoff (post-implementation, authoritative)

> **Status: PHASE 3 COMPLETE — do not reimplement.** This document is the FINAL
> authoritative snapshot of the repository AFTER the entire Phase-3 implementation
> AND its post-implementation corrections and correctness audit. It supersedes the
> planning-time handoffs for the purpose of starting Phase 4 planning: the current
> repository is the source of truth; where this document and any earlier document
> disagree, this document (or the repository) wins.
>
> Companion documents: `phase-3-plan.md` (the plan — binding decisions D1–D17),
> `phase-3-planning-state-handoff.md` (planning-time state — historical),
> `phase-3-implementation-handoff-final.md` (implementation receipts — historical),
> `docs/contradictions-and-gaps.md` (DECISIONS + DEVIATIONS — authoritative log).
>
> **Post-implementation UI note (2026-08-30):** a `make-ui-not-ai` visual review
> made UI-only corrections after this handoff (`1de4c02`): leaderboard column
> headers, period-aware callout captions, FAILED/FORFEITED penalty-line contrast,
> and a long-name truncation verification. Domain/API/test statements below remain
> accurate; full record: `docs/phases/phase 3 + 4 vision/phase-3-and-4-visual-review-final.md`.

## 1. Exact repository identity (final)

| Item | Value |
|---|---|
| Branch | `main` (tracks `origin/main`) |
| **Exact HEAD** | `45bc9ff1c9f7ada2acb5ea53841c32e902052924` — `fix(phase3): correctness audit — sweep lock semantics documented + cron failures surfaced` |
| Commit lineage (Phase 3) | `d80764e` (client) · `f435830` (server) — note: order in history is `f435830` → `d80764e` → `2ce34e8` (tests/CI) → `2c454c5` (docs) → `929ec44` (CI fix #1) → `a41bfd7` (docs) → `0c00094` (I5c fix) → `9b33235` (I9 batching) → `45bc9ff` (audit) |
| Phase-3 baseline (pre-implementation) | `1d9186519b6bf62c3c07cb375db3c8686b4c5475` |
| Working tree | Only the user's pre-existing IDE file `.idea/material_theme_project_new.xml` is modified (user-owned, not committed). |

## 2. Phase-3 scope — COMPLETE

Everything in the implementation prompt §2 (seven slices) is implemented and verified:

1. **Leaderboard domain** — `src/server/leaderboard/constants.ts`, `service.ts`, `handlers.ts`.
2. **Settlement domain** — `src/server/puzzle/settlement.ts` + `scheduled-entry.ts`.
3. **Cron wiring** — `scripts/patch-worker-scheduled.ts` + vite `closeBundle` hook.
4. **API wiring** — `src/server/routes.ts` (`requireAuth` on `/api/leaderboard/*`, chained registration).
5. **Client** — `src/lib/shared/api/leaderboard.ts`, FSD feature `src/lib/features/leaderboard/{rank-row,position-callout}.svelte`, `position-copy.ts`, `leaderboard-format.ts`.
6. **`/leaderboard` page** — shadcn Tabs (bits-ui), per-period TanStack queries, highlight/callouts/states.
7. **`/play` result block** — position + penalty line + navigation.

## 3. Final architecture / domain state

- **Leaderboard aggregation**: SQL `DENSE_RANK()` window functions over raw facts; NO leaderboard table. Single-day rank key `(completion_time_ms ASC, guess_count ASC, completed_at ASC)`; multi-day key `(avg_time ASC, avg_guesses ASC, earliest_qualifying_completion_at ASC NULLS LAST)`; `user_id` appears ONLY in the final display `ORDER BY rank, user_id` (NG14/M2). Dense cutoff `rank <= limit` (default 10, cap 50, NG11) applied server-side.
- **MISSED derivation**: LEFT-JOIN absence of a `games` row per `(user_id, puzzle_id)` on finalized eligible days; `COALESCE` to the frozen `non_completion_penalty_ms` + 6 guesses. No fake rows ever; raw game data never overwritten.
- **Qualification**: `QUALIFIED ⇔ completedDays >= threshold` (PROVISIONAL 3 weekly / 8 monthly — P1); `completedDays` counts COMPLETED games on finalized eligible days only (today never counts); FAILED/FORFEITED/MISSED never count. Constants in `constants.ts` with `>= 1` invariant.
- **Ranking/tiebreakers**: dense ranks; equal (avg time, avg guesses) tiebreak on `earliest_qualifying_completion_at = MIN(completed_at)` over the same day set used for the score average (D5 — today's completion participates when today is in the player's average); full ties → same rank, stable display by `user_id`. Verified with constructed raw timestamps (I13 — see deviations).
- **Settlement/finalization**: `finalizeExpired` sweep selects expired-ACTIVE puzzles with `FOR UPDATE SKIP LOCKED` (SOFT selection filter — autocommit; see Audit A) and finalizes each through the existing idempotent `finalizePuzzle` (puzzle-row lock FIRST, `transaction_timestamp()` anchor, NG9; ACTIVE→FORFEITED conversion; frozen averages + 20-minute penalty; `alreadyFinalized` write-free re-entry). Per-row error isolation; one failing row never aborts the sweep.
- **Activation**: `activateToday` mirrors startGame's M3 lazy-activation guards (today's date, SCHEDULED branch, no other ACTIVE for today, puzzle lock); missing row ⇒ fail-closed `missingToday: true` + structured `[settlement] missing puzzle for date=YYYY-MM-DD` marker (D15). No puzzle is ever fabricated.
- **Lazy reconciliation**: week/month leaderboard reads run `finalizeExpired()` (own transactions) BEFORE aggregating; today/yesterday never finalize. Rows skipped by a concurrent lock holder self-heal on the next sweep/read (bounded, documented).
- **Cron worker wiring**: adapter has no entrypoint → `scripts/patch-worker-scheduled.ts` esbuild-bundles `scheduled-entry.ts` → `.svelte-kit/cloudflare/_settlement.js` and appends `import { scheduled } from "./_settlement.js"; export { scheduled };` to `_worker.js` (idempotent, exactly-once verified); a vite `closeBundle` plugin runs it on every `bun run build` AFTER the adapter writes the worker (deferral-tolerant for the client-phase closeBundle — CI failure #1 fix). Failure surfacing: `scheduled()` logs AND rethrows (Audit B).
- **API surface**: exactly `GET /api/leaderboard/{today,yesterday,week,month}` + optional `?limit=`; `requireAuth` on `/api/leaderboard/*`; onboarding NOT enforced at API level; NG21 envelope; response carries `currentUser: { rank, qualified, completedDays, entry }`. NO `/api/game/history`, NO `/api/stats`, NO manual settlement endpoint, NO `/api/leaderboard/me`.
- **Frontend leaderboard**: Today/Yesterday/This week/This month tabs (local state); `['leaderboard', period]` TanStack keys; `['me']`-based current-user highlight + "You" badge; pinned viewer position callout for completed/qualified-but-outside-cutoff; unqualified explanation using only `currentUser` server facts (no duplicated threshold knowledge); loading skeletons (`aria-busy`), error+retry, per-period empty copy; responsive (390×844 verified), dark/light tokens.
- **Result-position UI (/play)**: COMPLETED → `Current position: #N` (dense rank from the shared `['leaderboard','today']` query, enabled only when terminal-completed) + "Position may change as others finish today" + "View leaderboard" (→ `/leaderboard`, Today tab); hidden silently on fetch failure/unranked; FAILED/FORFEITED → penalty line ("The daily penalty counts toward weekly and monthly standings"), never a position.

## 4. Database / schema status

- **byte-identical to the Phase-2 baseline** — verified on the final tree:
  `git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` → EMPTY.
- **No schema migration, no new tables, no new indexes** (D1/D16; the existing
  `daily_puzzles(puzzle_date)` unique, `games(puzzle_id, status)`, `games(user_id, puzzle_id)` unique
  cover every Phase-3 query shape).
- `auth:check` parity gate green on the final tree.

## 5. Final test/verification receipts (ALL actually run on the final tree `45bc9ff`)

| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | OK (574 packages) |
| `bun run lint` | clean |
| `bun run check` | 0 errors / 0 warnings |
| `bun run test:unit` | **161 passed** / 56 skipped (DB-gated) — U1–U6 incl. the audit's scheduled-failure unit test |
| `bun run build` | ✔ (client + server) + `[patch-worker-scheduled] patched .svelte-kit/cloudflare/_worker.js` |
| `grep -c "export { scheduled }" .svelte-kit/cloudflare/_worker.js` | **1** (exactly once) |
| `bun run verify:bundle` | bundle secrecy OK (115 files scanned) |
| `bun run types:check` | up to date (hermetic: `.env`/`.dev.vars` absent — see deviations) |
| `bun run auth:check` | auth schema parity OK |
| `bun run word-list` + `bun run avatar-list` | byte-identical (diff gates empty) |
| schema/migrations diff | EMPTY |
| `bun run test:integration` | **56/56** (7 files) against live non-production Neon — I1–I16 incl. **I5d ×5** and **I5c ×6** concurrent-sweep runs; existing NG9 lock-order/lazy-activation/game/profile/db suites untouched |
| `bun run test:e2e` | **23/23** (E1–E10 + all existing specs) |
| `bunx wrangler deploy --dry-run` | ✔ (worker + assets; exits normally) |

GitHub Actions: the most recent complete run on `main` (run #22, at `9b33235`+1 commit range) was **green for all three jobs** (`unit-and-build`, `integration`, `e2e`), including the Phase-3-specific CI steps (schema purity, patched-worker assertion). The audit commit `45bc9ff` has not yet been pushed; all its gates above are re-verified locally on the final tree.

## 6. Implementation deviations / corrections — ALL recorded in `docs/contradictions-and-gaps.md`

Planning resolutions table (2026-08-27) + **implementation deviations** (2026-08-30):

1. **Calendar-adaptive integration fixtures** — day frames anchored to the real DB clock; on frame-poor calendar days the PROVISIONAL thresholds cannot be reached by any fixture, so suites assert the deepest semantics the calendar allows, ALWAYS asserting scored-level facts (completedDays, the documented empty-board rule; never a silent skip).
2. **I13 constructed timestamps** — `completed_at` is a raw fact; in real wall-clock a today-dated completion is always later than past days, so "today participates" is validated with constructed instants. Domain rule unchanged.
3. **Structural Cloudflare platform types** in `scheduled-entry.ts` — the project's TS program deliberately does not load `@cloudflare/workers-types` (hermetic `types:check`; DOM conflicts); runtime behavior identical.
4. **Serialized E2E runner** (`workers: 1`, `fullyParallel: false`) — multiple fixture-using specs share ONE TRUNCATE'd non-production DB; parallelism was a real race.
5. **U5 answer-material assertion form** — module-identifier markers + private-pool scan when seed files exist; bare word scanning is impossible (library substrings).
6. **Hermetic `types:check` condition** — `wrangler types` picks up `.env`/`.dev.vars` if present; the parity gate must run with both absent (the committed generated file is hermetic).
7. **E5 rank pinning** — 200ms rival + deliberate typing delays bound the real play's elapsed to (200ms, 10m); the exact rank number is display behavior, the block's presence/copy is the asserted contract.
8. **Client never sends `?limit=`** — the wire supports the dense cutoff; the UI uses the server default (10); no semantics change.
9. **CI failure #1 — closeBundle ordering (fixed `929ec44`)** — vite 8 fires `closeBundle` once per build environment; the client phase runs before the adapter writes `_worker.js` (fresh checkout). `patchWorker` now DEFERS (`skipped`/`reason:'deferred'`); direct operator runs keep `failIfMissing`. U5 regression added; `.ts` import extension added (clears the native-configLoader warning).
10. **I5c concurrency-test rewrite (fixed `0c00094`)** — the original asserted ≥1 finalization racing a lock-holding guess; under SKIP LOCKED both sweeps may legitimately skip. Now deterministic: sentinel-pinned skip behavior, guess never succeeds, ≤1 real finalization, self-healing next-sweep finalization, raw facts untouched.
11. **Month-fixture batching / timeout (fixed `9b33235`)** — I9/I11/I12 seeded up to 30 days per-row (~60+ Neon round trips; CI cross-region latency blew the 30s budget). `seedFinalizedDays`/`insertGamesBatched` now use one parameterized multi-row INSERT per table; `testTimeout` 30s→60s (documented headroom). I9: 27s → <2s; full suite 314s → 58s.
12. **Correctness audit A — sweep `FOR UPDATE SKIP LOCKED` semantics (resolved, no mechanism change)** — the sweep SELECT runs in autocommit, so SKIP LOCKED is a SOFT selection filter; the authoritative guard is `finalizePuzzle` (puzzle-first re-lock in its own transaction; write-free `alreadyFinalized` re-entry) — exactly the plan §6 contract. Holding sweep locks across finalization was evaluated and REJECTED (pooled driver + per-row own transaction ⇒ deadlock). Comments rewritten to the precise semantics; **I5d** pins the concurrent-sweep guarantee.
13. **Correctness audit B — cron failure propagation (resolved, changed)** — `scheduled()` previously caught+logged without rethrowing, so a failed settlement looked successful. Now logs AND rethrows → invocation marked FAILED in the dashboard. Recorded deviation from plan §7.3's literal "errors are caught and logged" wording (its parenthetical about marking runs failed is the operative intent). Risk-free: at-most-once cron delivery + retry-safe `runSettlement`. Pinned by a DB-free unit test.

## 7. Remaining product decisions — P1–P6 (NOT resolved; do not silently resolve in Phase 4)

| # | Decision | Current state |
|---|---|---|
| P1 | Weekly/monthly qualification thresholds | PROVISIONAL 3 / 8 in `src/server/leaderboard/constants.ts` (⚠ marked); `>= 1` invariant pinned; must be confirmed before Phase-6 deploy |
| P2 | MISSED penalty for pre-join days | Spec-literal UNIFORM penalty implemented (no join-date carve-out) |
| P3 | Missing-puzzle alert channel | Log-only (`[settlement] missing puzzle for date=…` + failed-invocation surfacing); notification infra deferred to Phase 6 |
| P4 | Average-guesses display precision | 2 decimals, display-only (`formatAverageGuesses`) |
| P5 | `?limit=` guardrail cap | 50; dense cutoff default 10 |
| P6 | Result-block copy | Wording free; meaning fixed ("position may change") |

## 8. Known operator / deployment notes

- **Scheduled worker**: every `bun run build` emits the patched `_worker.js` (vite closeBundle plugin). The CI `unit-and-build` job asserts `grep -q "export { scheduled }" .svelte-kit/cloudflare/_worker.js` — keep that assertion. The `_settlement.js` chunk contains no answer material (U5) and no secrets.
- **Cron smoke (local, not CI)**: `bun run build && wrangler dev --test-scheduled`, then `POST /__scheduled?cron=0+16+*+*+*` and observe the `[settlement] run complete` log. A failed run now logs `[settlement] run failed` AND marks the invocation failed in the dashboard.
- **Missed-cron recovery is by design**: any depth of missed runs reconciles on the next sweep; week/month reads lazily finalize expired historical days; today's game start lazily activates a SCHEDULED puzzle. A swept-away row self-heals on the next sweep.
- **Hermetic gates**: `bun run types:check` must run with `.env`/`.dev.vars` absent (or in CI).
- **E2E/integration**: require the non-production `DATABASE_URL` (+ `BETTER_AUTH_SECRET` + `ALLOW_DB_WIPE` for E2E); the E2E runner is serialized (`workers: 1`) because specs share one TRUNCATE'd DB.
- **`wrangler deploy --dry-run`** is green on the final tree.

## 9. Phase-4 starting assumptions

1. **Phase 3 is COMPLETE — do not reimplement it.** No leaderboard model, API, schema, settlement, or cron work belongs in Phase 4 unless a NEW decision says so.
2. **Preserve all Phase-3 invariants**: puzzle-row-first lock order + `transaction_timestamp()` anchor (NG9); no `clock_timestamp()`; MISSED by absence (no fake rows — raw game data never overwritten); no ranking table; day-set semantics (today completed-only until finalization; finalized days frozen); dense ranks with `user_id` only in display order; `requireAuth` on `/api/leaderboard/*`; NG21 envelopes; answer secrecy (answers never in new payloads); the settlement chunk stays answer-free; schema remains pristine (`git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` stays EMPTY).
3. **Intentionally deferred from Phase 3** (candidates for Phase-4 product planning, NOT promises): real alerting/notification for missing puzzles (P3); a personal history/statistics surface (planned non-goal in Phase 3 — `GET /api/game/history` / `/api/stats` remain explicitly NOT added); confirmation of P1 threshold values; any admin-facing settlement tooling (a manual settlement trigger was explicitly not added in Phase 3).
4. **Files/services Phase 4 must treat as existing dependencies** (inspect, don't recreate):
   - `src/server/leaderboard/{constants,service,handlers}.ts`
   - `src/server/puzzle/{settlement,finalize,manila,scheduled-entry}.ts`
   - `src/server/routes.ts`, `src/server/game/*`, `src/server/profile/*`, `src/server/middleware/*`, `src/server/db/*`
   - `scripts/patch-worker-scheduled.ts`, `vite.config.ts` (closeBundle hook), `.github/workflows/ci.yml`
   - `src/lib/shared/api/{client,game,me,leaderboard}.ts`, `src/lib/features/leaderboard/*`, `src/routes/leaderboard/*`, `src/routes/play/+page.svelte`
   - `tests/unit/leaderboard-*`, `tests/unit/settlement.test.ts`, `tests/unit/worker-patch.test.ts`, `tests/integration/{leaderboard,settlement}.test.ts`, `tests/e2e/{leaderboard.spec.ts,game-flow.spec.ts}`
   - `docs/contradictions-and-gaps.md` (decision + deviation log — read it before writing any new Phase-4 decision).

## 10. Final status block

```text
PHASE 3 STATUS: COMPLETE

Implementation:
  Leaderboard domain (DENSE_RANK aggregation over raw facts; MISSED by LEFT-JOIN
  absence; qualification constants PROVISIONAL; viewer rank at any position;
  lazy finalization for week/month), settlement domain (finalizeExpired sweep +
  activateToday + runSettlement; SKIP LOCKED soft filter + idempotent
  finalizePuzzle as the authoritative guard), post-build cron worker patch,
  API wiring, typed client + FSD feature components, /leaderboard rebuild,
  /play result block. All recorded in docs/contradictions-and-gaps.md.

Verification (final tree 45bc9ff):
  lint clean · check 0 errors · unit 161 · integration 56/56 (live Neon,
  incl. I5d/I5c concurrency pins) · e2e 23/23 · build + patched worker
  (single 'export { scheduled }') · verify:bundle (115 files) · types:check
  (hermetic) · auth:check · word/avatar lists byte-identical · schema purity
  EMPTY · wrangler deploy --dry-run OK. GitHub Actions run #22 (pre-audit
  commits) green for all three jobs; the audit commit's gates re-verified
  locally on the final tree.

Known open product decisions:
  P1 thresholds (PROVISIONAL 3/8), P2 pre-join MISSED (uniform), P3 alert
  channel (log + failed invocation), P4 2dp display, P5 limit cap 50, P6 copy.

Phase 4 starting point:
  See §9. Phase 3 is complete; do not reimplement; preserve the invariants;
  the deferred items are §9.3; existing dependencies are §9.4.

Important invariants (do not break):
  puzzle-row-first locks + transaction_timestamp() anchor (NG9); no
  clock_timestamp(); MISSED derived, never materialized; no ranking table;
  dense ranks, user_id display-only; requireAuth on /api/leaderboard/*;
  NG21 envelopes; answer secrecy incl. the settlement chunk; zero schema
  migration; CI patched-worker + schema-purity assertions stay.
```

---

*Prepared from the actual repository at `45bc9ff1c9f7ada2acb5ea53841c32e902052924` after the
full gate sweep was re-run on the final tree (2026-08-30). Every receipt in §5 was actually
obtained; nothing was inferred.*