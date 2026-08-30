# Phase 3 — Leaderboard / History / Settlement: Implementation Plan (AUTHORITATIVE)

> **Status: PLANNED (not implemented).** This document is the authoritative Phase-3
> implementation plan. It was produced by a read-only planning pass over the actual
> repository at HEAD `1d9186519b6bf62c3c07cb375db3c8686b4c5475` (branch `main`).
>
> Companion documents:
> - `docs/phases/phase 3/phase-3-planning-state-handoff.md` — final repository state, decisions, open questions.
> - `docs/phases/phase 3/phase-3-implementation-prompt.md` — standalone start prompt for the implementation chat.
>
> The plan resolves every design question it can from the repository + authoritative
> documents; genuine product values that remain open are **marked clearly** and must
> not be silently guessed by the implementer.

---

## 0. Verified repository state (source of truth)

| Item | Value |
|---|---|
| Branch | `main`, up to date with `origin/main` |
| HEAD | `1d9186519b6bf62c3c07cb375db3c8686b4c5475` — `fix(ui): polish Phase 1+2 game screen composition (make-ui-not-ai)` |
| Phase-2 baseline | Phase 2 implemented and verified up to `38c158a` (handoff); three later commits (`63dc93c` docs final handoff, `0c7e4ad` docs path fixes, `1d91865` UI polish) are docs/UI-only |
| Working tree | Clean except the user's IDE file (`.idea/material_theme_project_new.xml`) and the untracked `docs/phases/phase 3/` directory |
| Unit suite (this pass) | `bun run test:unit` → 121 passed / 35 skipped (skips = DB integration without `DATABASE_URL`) |
| Schema/migrations | `src/server/db/schema.ts` + `migrations/0000_init.sql` — **already contain everything Phase 3 needs** (see §10) |

### 0.1 What Phase 3 inherits (already implemented, do not re-implement)

- `finalizePuzzle(puzzleId)` — atomic, idempotent, puzzle-lock-first (`src/server/puzzle/finalize.ts`) with frozen `average_completion_time_ms` / `non_completion_penalty_ms`, ACTIVE→FORFEITED conversion, `transaction_timestamp()` finalization stamp. (Phase 1 shipped it for the NG9 tests; **cron wiring is Phase 3**.)
- `NON_COMPLETION_PENALTY_MS = 20 * 60 * 1000` + `todayManilaDateExpr` / `expiresAtExpr` (`src/server/puzzle/manila.ts`).
- Lazy activation (M3) inside `startGame` (SCHEDULED→ACTIVE under the puzzle lock, missing-puzzle fail-closed `PUZZLE_UNAVAILABLE`).
- Lock discipline puzzle-row-first everywhere; `transaction_timestamp()` eligibility anchor (NG9); both midnight lock-order integration tests green on Neon.
- `wrangler.toml` `[triggers] crons = ["0 16 * * *"]` (NG1) — declaration exists; **no `scheduled` handler exists yet**.
- Hono app composition (`src/server/routes.ts`), chained RPC typing rule, NG21 error envelope, `requireAuth` mounts for `/api/game/*`, `/api/me/*`, `/api/admin/*`.
- Leaderboard placeholder page with real guards (`src/routes/leaderboard/`), phase-2 shell, theme system, `formatDuration`, `avatarEmoji`/display-name data on `user`.

### 0.2 Infrastructure finding that shapes §8 (cron execution)

`@sveltejs/adapter-cloudflare` **7.2.9** (installed) generates the worker from a fixed
template (`node_modules/@sveltejs/adapter-cloudflare/files/worker.js`) and exposes
**no `entrypoint`/custom-module option**. The generated `.svelte-kit/cloudflare/_worker.js`
exports only `fetch`. Therefore a `scheduled` export cannot be authored in SvelteKit
source; it must be **appended to the built worker by a deterministic post-build patch**
(see §8.3). This is the ONLY platform wart; the domain code itself stays fully portable.

---

## 1. Exact Phase-3 scope

Per Architecture-v3 §Phase 3 + Specifications-v1 §10–§13, Phase 3 delivers:

1. **Daily settlement** — cron-triggered finalization of expired puzzles, activation of
   today's puzzle, missed-cron reconciliation, idempotent/retryable operations, missing-puzzle
   alert, lazy finalization where the architecture permits it.
2. **Leaderboards** — Today / Yesterday / This week / This month; top-10 dense-rank cutoff;
   viewer's own rank outside the top 10; current-day vs finalized-day semantics (§4);
   deterministic ranking (§3); participation minimums (§6).
3. **Result position** — current position after a completed game on the result surface,
   explicitly non-final, with leaderboard navigation.
4. **History/statistics** — **only what the leaderboard needs.** Determination (see §1.1):
   no separate history page and no `/api/game/history` / `/api/stats` endpoints in Phase 3.

### 1.1 History/statistics determination (explicit)

- Specifications-v1 §22 lists V1 scope as "basic statistics/history **needed to support the
  leaderboard**". It never specifies a personal history page, a per-day result list, or a
  statistics dashboard. Architecture's Core API shape (`GET /api/game/history`, `GET /api/stats`)
  is explicitly "Illustrative, not immutable".
- The statistics the leaderboard needs ARE the multi-day aggregations (avg time, avg guesses,
  completed days) — they are computed from persisted raw facts, exactly one query surface.
- **Decision: Phase 3 implements no separate history/statistics screen and no
  `/api/game/history` or `/api/stats` endpoint.** The per-game result data the spec requires on
  the result screen (win/loss, elapsed time, guess count) is already returned by the game API
  and rendered from the existing game state; only the **current position + leaderboard link**
  are added. A dedicated history/statistics surface is a deliberate non-goal, to be driven by a
  real product need in a later phase (candidates: play-page "past days", profile stats).

### 1.2 Explicit non-goals

- No ranking-results table, no materialized leaderboard (raw facts stay the source of truth; a
  materialized table is allowed later only if measurement justifies it — Architecture §Spec §14).
- No changes to authentication, answer secrecy, expiry/anchor timing authority, lock ordering,
  game mutation semantics, or the SvelteKit↔Hono bridge.
- No new admin endpoints (including no manual settlement-trigger endpoint — see §8.4).
- No schema migration (see §10).
- No redesign of Phase-1/Phase-2 surfaces beyond the terminal result block on `/play`.

---

## 2. Ranking model (exact)

Source: Specifications-v1 §12 + Architecture-v3 §Ranking model + NG11–NG14 + M1–M2.

### 2.1 Single-day periods (Today, Yesterday)

Only COMPLETED games contribute (Spec §11: "Today and Yesterday leaderboards exclude all
non-completed results"). Actual stored values are displayed:

```
rank key:  DENSE_RANK() OVER (ORDER BY completion_time_ms ASC, guess_count ASC, completed_at ASC)
display:   ORDER BY rank, user_id        -- user_id is display-order only, NEVER in the rank window (NG14/M2)
```

### 2.2 Multi-day periods (Week, Month) — per-player period values

For each player and each eligible day (day set defined in §4):

```
day_contribution:
  COMPLETED → completion_time_ms (actual)                + guess_count (actual)
  FAILED    → puzzle.non_completion_penalty_ms (frozen)  + 6
  FORFEITED → puzzle.non_completion_penalty_ms (frozen)  + 6
  MISSED    → puzzle.non_completion_penalty_ms (frozen)  + 6   (derived — no game row)

playerPeriodAverageTime     = ROUND( SUM(day_time)  / COUNT(eligible days for this player) )
playerPeriodAverageGuesses  = SUM(day_guesses) / COUNT(eligible days for this player)   -- exact numeric for ranking
```

- **Ranking order** (spec §12): `average time ascending` → `average guesses ascending` →
  `earliest qualifying completion timestamp ascending` (final deterministic tiebreaker).
- **`earliest_qualifying_completion_at`** = `MIN(completed_at)` over the player's COMPLETED
  games on **the same day set used for the score average** (spec §12 + Architecture §Ranking;
  NG12). This includes today's completion when today contributed to the player's average
  (explicit resolution: the operative clause is "the same day set used for the score average";
  NG12's "eligible finalized days" wording describes the finalized majority of that set).
- **Rank key** (NG14/M2): `DENSE_RANK() OVER (ORDER BY avg_time, avg_guesses, earliest_qualifying_completion_at)`.
- **Display order**: `ORDER BY rank, user_id`. Ties share a rank; next distinct result gets the
  immediately following rank (1, 1, 2, 3 …) — dense, per spec.
- **Qualification filter applied BEFORE ranking**: only players with
  `completedDays >= threshold` (see §6) are rankable. `count` = number of qualified players.

### 2.3 SQL expression (PostgreSQL, no new tables)

The aggregation is expressed as one window query over a cross-joined day frame; **MISSED is
derived by LEFT JOIN absence, never inserted**. Framework: Drizzle `sql`/`sqlx` templates for
the window part (documented in §10.4). Rounding: `ROUND(avg, 0)` for time; guesses carried as
`numeric` exact and formatted only at display (2 decimals; provisional, see §13 open items).

---

## 3. Current-day vs finalized-day rules (mandatory resolution)

The server/domain layer owns these rules — no competitive aggregation logic in the UI (§15 rule).

### 3.1 Eligible-day set per period

Computed in SQL from `transaction_timestamp()` (DB clock authority, same anchor as NG9):

| Period | Day set (Asia/Manila calendar) |
|---|---|
| Today | `{ today }` — COMPLETED games only, always (finalization never affects Today) |
| Yesterday | `{ today - 1 }` — COMPLETED games only, regardless of finalization (Spec §11) |
| Week | ISO week starting Monday (`WEEK_START = MONDAY`, M1) through today: **finalized days with non-NULL averages** (zero-completion finalized days contribute nothing, Spec §11) **+ today (completed-only until finalization)** |
| Month | `date_trunc('month', today)` through today: same finalized + today rule |

Historical days inside Week/Month that are expired but still `ACTIVE` (cron missed) are
**reconciled by lazy finalization before the aggregation reads** (§8.2). In the rare window
where reconciliation has not yet committed, such a day is excluded from the day set (bounded,
self-healing on the next read — recorded behavior, §8.2).

### 3.2 Per-player participation in the day set

- **Finalized eligible day**: EVERY player participates — MISSED players receive
  `non_completion_penalty_ms` + 6 guesses (this is how MISSED is derived for aggregation;
  Spec §11 §12). The day's denominator slot exists for every player.
- **Today (active, unfinalized)**: only players with a COMPLETED game today receive a day
  slot (their real values). Today's FAILED/FORFEITED/MISSED results are **ignored until
  finalization** — they add no slot and no value (Spec §12). After finalization (which happens
  after the period ends), the day is just another finalized day.
- **Zero-completion finalized day**: excluded for everyone (NULL averages ⇒ no frozen penalty
  ⇒ contributes nothing, Spec §11).
- `completedDays` (threshold basis, §6): count of the player's COMPLETED games on **finalized
  eligible days only** — today never counts (Architecture §Participation threshold).

### 3.3 Consequence table (documented semantics)

| Player state | Today board | Yesterday board | Week/Month (today's slot) | Week/Month (finalized slots) |
|---|---|---|---|---|
| COMPLETED | listed (actual values) | listed | contributes real values | contributes real values |
| FAILED | absent | absent | **ignored (no slot)** | frozen penalty + 6 |
| FORFEITED | absent | absent | **ignored (no slot)** | frozen penalty + 6 |
| MISSED | absent | absent | **ignored (no slot)** | frozen penalty + 6 |
| no puzzle that day | — | — | — | day excluded (zero-completion) |

---

## 4. MISSED / FAILED / FORFEITED handling (SQL derivation, no fake rows)

- **MISSED is never materialized.** The aggregation derives it as the LEFT JOIN absence of a
  `games` row for `(user_id, puzzle_id)` on a finalized eligible day
  (`COALESCE(..., penalty)`), exactly as the day frame in §10.4 does. The raw data model is
  untouched (rule: "Do not alter the raw game data model merely to make the leaderboard query
  easier").
- FAILED/FORFEITED are stored statuses; their aggregation values come from the **frozen**
  `daily_puzzles.non_completion_penalty_ms` (+ 6 guesses), never from live recomputation, and
  never from their raw `completion_time_ms`/`guess_count` (`leaderboard_guess_count` rule:
  `COMPLETED ? guess_count : 6`).
- Raw facts (status, timestamps, actual guess counts) remain untouched on `games` — historical
  ranking changes stay possible (Architecture "Raw game facts").
- **Guess-count placeholder `0` is not needed**: the aggregation COALESCEs to 6 explicitly;
  no fake rows are constructed anywhere (NC1 satisfied by construction, not by placeholder rows).

---

## 5. Participation thresholds (product constants — values UNRESOLVED)

- **Location/names** (new file `src/server/leaderboard/constants.ts`):

```ts
export const WEEK_START = 'MONDAY' as const;              // M1 — resolved product constant
export const WEEKLY_QUALIFICATION_COMPLETED_DAYS = 3;     // ⚠ PROVISIONAL — product decision open (§14)
export const MONTHLY_QUALIFICATION_COMPLETED_DAYS = 8;    // ⚠ PROVISIONAL — product decision open (§14)
export const LEADERBOARD_DENSE_CUTOFF_DEFAULT = 10;       // NG11 — dense-rank cutoff (rank <= N)
export const LEADERBOARD_LIMIT_MAX = 50;                  // guardrail cap for ?limit= (no invented limit semantics)
```

- **Semantics**: `QUALIFIED ⇔ completedDays >= threshold`, where `completedDays` counts
  COMPLETED games on finalized eligible days (today excluded — Architecture §1309; §3.2).
  FAILED/FORFEITED/MISSED never count (Spec §12).
- **Edge cases (documented behavior, no silent guessing)**:
  - threshold > eligible finalized days in period ⇒ no qualified players ⇒ `entries: []`,
    `count: 0`, viewer `qualified: false` (normal empty state, §9.5).
  - threshold = 0 would qualify everyone including never-played users (all-penalty averages) —
    **not used**; final product values are expected ≥ 1 and the constants file asserts `>= 1`.
  - A player who joined mid-period is treated per the raw rule: days before joining are MISSED
    (penalty) — spec-literal, **flagged as an open product decision** (§14) because it burdens
    recent joiners; do not invent a join-date carve-out without a product decision.
- **API representation**: `entries` carry `completedDays`; `currentUser` carries
  `qualified` + `completedDays` so the UI can explain non-qualification (§9.3).
- **Implementation gate**: the provisional numeric values must be confirmed by the product
  owner before the Phase-6 production deployment; a unit test pins the `>= 1` invariant and
  the constant names (rename-with-usages check).

---

## 6. Settlement concurrency (preserve and extend the existing guarantees)

The existing puzzle-row serialization point and lock order (`puzzle row → game row`) are
**preserved exactly**; Phase 3 adds no new lock order.

- **Race A (guess wins)** and **Race B (finalize wins)** — already implemented + tested
  (`tests/integration/midnight-lock-order.test.ts`, real services, sentinel-lock queueing).
  They remain mandatory and are untouched.
- **Eligibility anchor**: `transaction_timestamp()` remains the authoritative transaction-start
  anchor everywhere; `clock_timestamp()` is never introduced (NG9).
- **Midnight boundary**: `expires_at <= transaction_timestamp()` is the only expiry comparison;
  cron time is UTC (`"0 16 * * *"`); the Manila calendar date is computed in SQL
  (`todayManilaDateExpr`).
- **Settlement sweep vs concurrent game start/guess**:
  - The sweep (`finalizeExpired`) locks each expired ACTIVE puzzle row `FOR UPDATE SKIP LOCKED`
    and calls the existing `finalizePuzzle` per row (idempotent, own transaction). SKIP LOCKED
    prevents two concurrent sweep invocations from double-processing; `finalizePuzzle`'s
    already-FINALIZED re-entry covers the rest.
  - A concurrent `startGame` for today locks today's row — today's row is never in the
    finalize sweep because its `expires_at` is in the future; no new interaction.
  - A concurrent `submitGuess` vs sweep on the day boundary serializes on the puzzle row
    exactly as NG9 A/B — no new code path, no new test needed beyond the existing A/B (plus the
    explicit sweep-level test listed in §11.2).
- **Idempotency/retry**: `finalizePuzzle` re-entry returns the frozen record
  (`alreadyFinalized: true`) without writes; `activateToday` is a no-op when already ACTIVE;
  the cron handler may be retried safely (Cloudflare guarantees at-most-once delivery with
  overlap prevention by default; the handler is written to be overlap-safe regardless —
  SKIP LOCKED + idempotent operations).

---

## 7. Settlement execution architecture

### 7.1 Where it runs

- **Domain logic**: `src/server/puzzle/settlement.ts` (new) — pure service:
  - `finalizeExpired(): Promise<SettlementPuzzleResult[]>` — sweep + per-puzzle `finalizePuzzle`.
  - `activateToday(): Promise<ActivationResult>` — today's SCHEDULED → ACTIVE under the puzzle
    lock with the same guards as lazy activation (today's date, no other ACTIVE for today);
    missing row ⇒ fail-closed + operational alert marker (no puzzle fabricated).
  - `runSettlement(): Promise<SettlementReport>` — finalizeExpired → activateToday → structured
    report (finalized ids, forfeited/completed counts, activated flag, missingToday flag).
  - All timestamps/date logic via `src/server/puzzle/manila.ts` expressions (DB time).
- **Platform shell (cron entry)**: appended `scheduled` export on the built worker (§7.3),
  translating `ScheduledController` + env into `runSettlement()` — the only place Cloudflare
  plumbing appears; mirrors the bridge philosophy.
- **Lazy finalization (read-path recovery)**: the leaderboard service calls
  `finalizeExpired()` before computing Week/Month aggregations (idempotent; bounded to expired
  ACTIVE rows; see §8.2). Today/Yesterday need no finalization.
- **No second API/server architecture.** No SvelteKit route files host domain logic. The Hono
  bridge is unchanged. No manual/admin settlement endpoint (decision §8.4).

### 7.2 Operational alerting semantics (missing puzzle)

- `activateToday` detecting no SCHEDULED puzzle for today returns `missingToday: true` and
  writes a structured `console.error` (`[settlement] missing puzzle for date=YYYY-MM-DD` —
  visible in Cloudflare dashboard logs; correlatable).
- **Decision:** no notification (email/webhook) binding in Phase 3 — no such binding exists in
  the repo and adding hosted infrastructure is out of scope. Real alerting is a Phase-6
  operational decision (recorded in §14). Fail-closed behavior itself is already implemented
  (startGame returns `PUZZLE_UNAVAILABLE`).

### 7.3 Worker cron wiring (verified against the installed adapter)

The adapter-generated worker exports only `fetch`. The established, deterministic wiring:

1. **Settlement entry source**: `src/server/puzzle/scheduled-entry.ts` exporting
   `export const scheduled: ExportedHandlerScheduledHandler<HonoBindings>` that calls
   `runSettlement(getDb(env))` and logs the report (errors are caught and logged — a thrown
   error still marks the run failed in the dashboard).
2. **Post-build patch** (`scripts/patch-worker-scheduled.ts`):
   - bundles `scheduled-entry.ts` with esbuild (`platform: 'browser'`, `format: 'esm'`,
     `bundle: true`, `external: ['cloudflare:workers']`) → `.svelte-kit/cloudflare/_settlement.js`;
   - appends to `.svelte-kit/cloudflare/_worker.js`:
     `import { scheduled } from "./_settlement.js"; export { scheduled };`
     (idempotent: skip when already patched).
   - `wrangler` bundles the `main` module graph at deploy/dev time, so the sibling chunk is
     deployed as part of the worker script, not as a static asset. The chunk contains no answer
     material and no secrets (it imports only puzzle/game services and manila helpers).
3. **Hookup**: a Vite plugin hook (`vite.config.ts`, `apply: 'build'`, `closeBundle`) runs the
   patch script after every production build, so `bun run build` alone always yields a worker
   with the cron handler — no separate build command to forget. (`vite preview` used by E2E is
   unaffected: it does not load `_worker.js` and never fires crons.)
4. **Verification**: `wrangler dev --test-scheduled` + `POST /__scheduled?cron=0+16+*+*+*`
   locally; `wrangler deploy --dry-run` succeeds with the patched main; unit test asserts the
   patch output (see §11.1 counter-test `worker-patch.test.ts`).

### 7.4 Missing-cron recovery

The cron is a reconciliation job (Architecture §Settlement): each run (a) finalizes every
expired non-finalized puzzle (any depth of missed runs), (b) activates today if SCHEDULED,
(c) reports the missing-puzzle alert. Independent retryability per operation is preserved.

---

## 8. API contracts

### 8.1 Endpoints (Hono RPC; chained registration per the Phase-1/2 typing rule)

```
GET /api/leaderboard/today
GET /api/leaderboard/yesterday
GET /api/leaderboard/week
GET /api/leaderboard/month
```

- Four explicit endpoints (matches Architecture Core API shape verbatim; no invented endpoint).
- Common optional query: `?limit=N` — integer `1..50` (constants), default `10`.
  **Dense-rank cutoff** (`rank <= limit`; ties may exceed the limit — NG11). It is NOT a row cap.
- Registration: `registerLeaderboardRoutes<S extends Schema = BlankSchema>(app: Hono<AppEnv, S>, deps)`
  — the exact phase-2 profile chaining pattern (`src/server/profile/handlers.ts`); mounted in
  `src/server/routes.ts` after profile routes; `requireAuth` added on `/api/leaderboard/*` in
  the same file.

### 8.2 Response shapes

Single-day (today/yesterday):

```ts
type LeaderboardEntry = {
  rank: number;                  // dense rank over (completion_time_ms, guess_count, completed_at)
  userId: string;
  displayName: string;           // user.name (app-wide display name)
  avatarEmoji: string;           // user.avatar_emoji
  completionTimeMs: number;
  guessCount: number;
  completedAt: string;           // ISO
};

type LeaderboardResponse = {
  entries: LeaderboardEntry[];   // rank <= cutoff, ties included
  count: number;                 // total COMPLETED players that day
  currentUser: {
    rank: number | null;         // viewer's rank when completed that day, else null
    qualified: boolean;          // = completed that day
    completedDays: number;       // 1 | 0
    entry: LeaderboardEntry | null;
  };
};
```

Multi-day (week/month):

```ts
type LeaderboardEntry = {
  rank: number;                  // dense rank over (avg_time, avg_guesses, earliest_qualifying_completion_at)
  userId: string;
  displayName: string;
  avatarEmoji: string;
  averageTimeMs: number;         // ROUND(avg,0) — ms
  averageGuesses: number;        // exact numeric (display 2dp — provisional)
  completedDays: number;         // finalized-day COMPLETED count (threshold basis)
  earliestQualifyingCompletedAt: string | null;  // ISO
};

type LeaderboardResponse = {
  entries: LeaderboardEntry[];   // qualified players through the dense cutoff
  count: number;                 // total qualified players
  currentUser: {
    rank: number | null;         // viewer's rank when qualified
    qualified: boolean;          // completedDays >= period threshold (§5)
    completedDays: number;       // always present (explains qualification to the UI)
    entry: LeaderboardEntry | null;
  };
};
```

### 8.3 Auth / error contract

- **Authentication**: required (401 `UNAUTHORIZED` via NG21 envelope) — `requireAuth` on
  `/api/leaderboard/*`. **Onboarding is NOT enforced at the API level** (consistent with
  `/api/game/*`, `/api/me/*`; leaderboard data is non-sensitive group data; the page guard
  `requireOnboarded` already gates the UI).
- **Errors**: `BAD_REQUEST` (invalid limit), `UNAUTHORIZED`. No other failure modes are
  expected on the read path; unexpected DB errors flow through the existing centralized
  `onErrorHandler` (sanitized `INTERNAL`).
- **Empty states** (valid 200 responses, not errors): today/yesterday with no completions;
  a period with no qualified players; viewer unqualified. UI renders per §9.4.
- **Read-only**: no CSRF applicability (GET); no mutation.

### 8.4 Explicitly NOT added

`POST /api/admin/settlement/run`, `/api/game/history`, `/api/stats`, a `GET /api/leaderboard/me`
endpoint. Viewer-rank data rides in every leaderboard response (NG13). A manual settlement
trigger can be revisited with Phase-4 admin work if operations need it; verification is
already covered by integration tests calling the services directly.

---

## 9. Frontend behavior

### 9.1 Leaderboard page (`/leaderboard`)

- Keep `+page.server.ts` guard unchanged (`requireOnboarded`).
- **Period tabs**: Today | Yesterday | This week | This month, implemented with shadcn-svelte
  `Tabs` (add via the CLI during implementation — the library is already a devDependency;
  accessible, keyboard-native) styled to the existing Wordle aesthetic (rounded segmented
  control, lowercase-friendly friendly text: "Today", "Yesterday", "This week", "This month").
  Default period: **Today**. Tab selection is local state; TanStack Query keys
  `['leaderboard', period]` per tab (no refetch storms; `staleTime` short / refetchOnWindowFocus).
- **Ranking rows** (shared component — see 9.3): rank numeral (dense rank; crown/medal accent
  only for #1–3, restrained), avatar emoji, display name, values:
  - Today/Yesterday: `formatDuration(completionTimeMs)` + `N/6` guesses.
  - Week/Month: `formatDuration(averageTimeMs)` + avg guesses (2dp) + completed-days chip
    (`N days`). "May change" affordance on multi-day rows is NOT needed (spec's caveat belongs
    to the result screen).
- **Current-user highlighting**: row with `userId === me.id` gets an accent ring + "You" badge
  (from `['me']` cache — already present via header flow).
- **Viewer rank outside top 10**: when the viewer is qualified/completed but not in `entries`,
  render a pinned "Your position: #N" callout below the list (rank + values, no duplicate row).
- **Unqualified viewer (week/month)**: callout explains "Play at least N completed days to
  qualify" using `currentUser.completedDays` + the threshold constant (client may import the
  constant via a shared module or receive it in the response — **decision: constant lives
  server-side; the UI uses `currentUser` fields only**, no duplicated threshold knowledge).
- **Loading/error/empty** (mirror play-page conventions):
  - loading: skeleton rows (`aria-busy`);
  - error: message + retry button (refetch), same styling as play page;
  - empty per period: "No completed results yet today" / "No results yet for yesterday" /
    "No qualified players this week/month" (never fabricated data).
- **Mobile**: rows keep ≥40px tap targets, rank+name left, values right; the tabs scroll
  horizontally if needed; no desktop-only hover for essential actions.
- **Dark/light**: existing tokens (`text-black/60 dark:text-white/60`, tile colors); no new
  theme machinery.

### 9.2 Result screen changes on `/play` (minimal, spec §13)

After a **terminal** game (state shown once, non-editable):

- COMPLETED: keep existing "Solved in N/6 · time" line; add a **position block**:
  - fetch `['leaderboard', 'today']` (shared query key with the leaderboard page — cache is
    naturally shared); render `Current position: #N` from `currentUser.rank` (dense rank,
    ties included); caption "Position may change as others finish today" (spec: no claim the
    rank is final).
  - "View leaderboard" button → `navigate('/leaderboard')` (Today is the default tab).
  - If the fetch fails or the viewer is uncompleted/unranked: hide the block silently (never
    block the result).
- FAILED (six guesses) / FORFEITED: keep the existing status line; add one line:
  "The daily penalty counts toward weekly and monthly standings" (spec: clearly show the
  result and that the competitive penalty applies). No position (single-day boards exclude
  non-completed results; multi-day ignores today until finalization — "if applicable").
- No changes to board/keyboard/timer; no rewrite of the game UI.

### 9.3 FSD placement (conservative, reuse-driven)

- `src/lib/shared/api/leaderboard.ts` — typed RPC client (mirrors `game.ts`/`me.ts`).
- **Real reuse exists**: the leaderboard row and the position callout are used by BOTH
  `/leaderboard` and `/play` ⇒ extract `src/lib/features/leaderboard/` with
  `rank-row.svelte` and `position-callout.svelte` (FSD: extract when real reuse emerges —
  Architecture §FSD). If the implementer judges the extraction heavier than the duplication,
  the fallback is `src/lib/shared/ui/` + a recorded deviation in the contradictions log (same
  discipline as the Phase-2 banned-words decision). No other new slices.

### 9.4 TanStack state

- New queries `['leaderboard', period]`; no optimistic mutations (nothing mutates); result
  position reuses `['leaderboard', 'today']`; `['me']` untouched.

---

## 10. Database and query plan

### 10.1 Schema/migration decision

**NO migration is required.** Verified against `0000_init.sql` + `schema.ts`: `daily_puzzles`
already has `puzzle_date` (DATE, unique), `status`, `locked_at`, `expires_at`,
`average_completion_time_ms` (nullable, frozen), `non_completion_penalty_ms` (nullable, frozen),
`finalized_at`; `games` has `status`, `started_at`, `completed_at`, `completion_time_ms`,
`guess_count` + `UNIQUE(user_id, puzzle_id)`; `guesses` unchanged; `user` exposes
`name`/`avatar_emoji` for row rendering. **Schema-purity proof stays mandatory**:
`git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` (empty).

### 10.2 Index requirements

**No new indexes.** Justification from actual query shapes:

- Today/Yesterday: `daily_puzzles` lookup by `puzzle_date` (unique index) → `games` by
  `puzzle_id` (+`status` filter and/or `games_puzzle_status_idx`) → `user` PK. Covered.
- Week/Month: `daily_puzzles` range scan on `puzzle_date` (unique index supports ranges) →
  `games` by `puzzle_id` (`games_puzzle_status_idx`) → `user` PK. Covered.
- Day-frame JOIN: `games(user_id, puzzle_id)` — the existing `games_user_puzzle_uidx`.
- The two NG3 candidate indexes already exist. Group size is small (private friends); revisit
  only if Phase-6 measurement justifies it (Architecture §Performance).

### 10.3 Timezone/date semantics

- All boundaries computed in SQL from `transaction_timestamp()` AT TIME ZONE `'Asia/Manila'`:
  `today` / `date_trunc('week', …)` (Monday per PG/ISO, matching `WEEK_START = MONDAY`) /
  `date_trunc('month', …)`. Date-type columns are ISO strings; no JS Date arithmetic at the
  Manila boundary (NG1/NG3 discipline preserved).
- Integration fixtures derive dates from the DB clock the same way (see §11.2).

### 10.4 Query sketches (PostgreSQL; rendered via Drizzle `sql` where window parts are needed)

**Today** (`GET /api/leaderboard/today`):

```sql
SELECT u.id AS user_id, u.name, u.avatar_emoji,
       g.completion_time_ms, g.guess_count, g.completed_at,
       DENSE_RANK() OVER (ORDER BY g.completion_time_ms ASC, g.guess_count ASC, g.completed_at ASC) AS rank
FROM games g
JOIN daily_puzzles p ON p.id = g.puzzle_id
JOIN "user" u ON u.id = g.user_id
WHERE p.puzzle_date = (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date
  AND g.status = 'COMPLETED';
-- display: ORDER BY rank, u.id ;  entries: rank <= :limit ;  count: total qualified rows
-- viewer: same row set filtered by u.id = :viewerId
```

**Yesterday**: identical with `puzzle_date = ((transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date - 1)`.

**Week/Month** (multi-day, MISSED-by-absence, no fake rows):

```sql
WITH frame AS (                                     -- eligible days (§4)
  SELECT p.id AS puzzle_id, p.puzzle_date,
         p.average_completion_time_ms, p.non_completion_penalty_ms,
         (p.status = 'FINALIZED') AS finalized
  FROM daily_puzzles p
  WHERE p.puzzle_date BETWEEN
          date_trunc('week', (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date)::date
        AND (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date          -- month: date_trunc('month', …)
    AND ( (p.status = 'FINALIZED' AND p.average_completion_time_ms IS NOT NULL)
          OR p.puzzle_date = (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date )
),
day_rows AS (                                       -- every user × every eligible day, MISSED = LEFT JOIN absence
  SELECT u.id AS user_id, f.puzzle_id, f.finalized, f.non_completion_penalty_ms,
         g.status, g.completion_time_ms, g.guess_count, g.completed_at
  FROM frame f
  CROSS JOIN "user" u
  LEFT JOIN games g ON g.puzzle_id = f.puzzle_id AND g.user_id = u.id
),
scored AS (
  SELECT user_id,
    SUM(CASE WHEN finalized THEN COALESCE(
          CASE WHEN status = 'COMPLETED' THEN completion_time_ms END,
          non_completion_penalty_ms)               -- FAILED/FORFEITED/MISSED → frozen penalty
        WHEN status = 'COMPLETED' THEN completion_time_ms  -- today: COMPLETED only
        ELSE NULL END) AS total_time,               -- today non-completed ⇒ NULL ⇒ no slot
    COUNT(CASE WHEN finalized OR status = 'COMPLETED' THEN 1 END) AS days_count,
    SUM(CASE WHEN finalized THEN COALESCE(
          CASE WHEN status = 'COMPLETED' THEN guess_count END, 6)
        WHEN status = 'COMPLETED' THEN guess_count
        ELSE NULL END) AS total_guesses,
    COUNT(CASE WHEN finalized AND status = 'COMPLETED' THEN 1 END) AS completed_days,
    MIN(completed_at) FILTER (WHERE status = 'COMPLETED') AS earliest_qualifying_completion_at
  FROM day_rows
  GROUP BY user_id
)
SELECT user_id, completed_days,
       ROUND(total_time / days_count)  AS average_time_ms,
       total_guesses / days_count       AS average_guesses,       -- exact numeric
       earliest_qualifying_completion_at,
       DENSE_RANK() OVER (ORDER BY total_time/days_count ASC,
                                   total_guesses/days_count ASC,
                                   earliest_qualifying_completion_at ASC) AS rank
FROM scored
WHERE days_count > 0 AND completed_days >= :threshold;            -- qualification FIRST (NG14: user_id never in window)
-- display: ORDER BY rank, user_id ;  count = rows after qualification
```

Notes:
- `days_count > 0` excludes players with no slot at all (safe with any threshold ≥ 1).
- Zero-completion finalized days are excluded at the `frame` level → the prior-day rule
  "contribute nothing" is structural, not per-player.
- Drizzle: the pure-drizzle parts (joins/filters/grouping) can be ORM calls; window/rank parts
  use `sql<number>`` templates; if awkward, the whole aggregation is one `sql` block in
  `src/server/leaderboard/service.ts` — the service owns the SQL, the UI never sees it.
- Lazy finalization (`finalizeExpired()`) runs BEFORE the week/month aggregation, in its own
  transactions (see §7.1/§8.2) — never nested inside the read transaction.

---

## 11. Test strategy (detailed matrix)

All existing Phase-1/Phase-2 tests are preserved unchanged; new tests follow the established
patterns (route unit tests with `app.request` + fake services; integration suites gated on
`DATABASE_URL` with `describe.skip` fallback; Playwright with the deterministic auth fixture).

### 11.1 Unit (DB-free)

| # | Coverage | File |
|---|---|---|
| U1 | Response shaping: dense-rank pass-through, `limit` parsing/clamping, viewer row extraction (fake service) for all four periods | `tests/unit/leaderboard-routes.test.ts` |
| U2 | Constants: names/values, `>= 1` invariant, `WEEK_START = 'MONDAY'`, cutoff default/max | `tests/unit/leaderboard-constants.test.ts` |
| U3 | Pure aggregation helpers if extracted (rounding of avg time, 2dp guesses display, tie-break ordering comparator) | `tests/unit/leaderboard-aggregation.test.ts` |
| U4 | Settlement orchestration with injected fake finalize/activate/log: order (finalize → activate), missing-puzzle alert marker, error isolation (one failing finalize does not stop the sweep), idempotent re-entry | `tests/unit/settlement.test.ts` |
| U5 | Worker patch: `scripts/patch-worker-scheduled.ts` output — appends the import + export exactly once, skips when already patched, chunk bundle contains no answer material (grep) | `tests/unit/worker-patch.test.ts` |
| U6 | Constants/format helpers reused by the result block (`formatDuration` — existing; position-block mapping rank/qualified → copy) | `tests/unit/leaderboard-ui-format.test.ts` |

### 11.2 Integration (live Neon — mandatory semantics)

| # | Coverage |
|---|---|
| I1 | **Finalization**: ACTIVE + expired → FORFEITED conversions; frozen averages from COMPLETED only; penalty = avg + 20 min; `transaction_timestamp()` stamp |
| I2 | **Idempotent finalization**: second call → `alreadyFinalized`, zero writes, same frozen values |
| I3 | **Zero-completion day**: averages NULL, day excluded from week/month aggregation |
| I4 | **Activation**: cron `activateToday` on SCHEDULED → ACTIVE; no-op when ACTIVE; missing row → `missingToday` (fail-closed, no fabricated puzzle) |
| I5 | **Sweep (`finalizeExpired`)**: multiple expired ACTIVE puzzles finalized in one run; expired-but-SCHEDULED untouched; already-FINALIZED skipped; concurrent sweep + guess serializes (existing NG9 A/B preserved) |
| I6 | **Today board**: completed-only; FAILED/FORFEITED players absent; dense ranks + ties on equal (time, guesses); viewer rank in/out of top-10 cutoff (rank > 10 still returned via `currentUser`) |
| I7 | **Yesterday board**: completed-only, unaffected by finalization |
| I8 | **Week aggregation**: fixtures built from DB-clock dates (relative to `now() AT TIME ZONE 'Asia/Manila'`); finalized days contribute frozen penalty to FAILED/FORFEITED/MISSED players (derived-by-absence); **today contributes COMPLETED only; today's FAILED/MISSED ignored**; averages = totals / day slots; rounding |
| I9 | **Month aggregation**: same semantics over `date_trunc('month', …)` incl. month-start boundary |
| I10 | **MISSED derivation**: player with no rows receives penalty+6 per finalized eligible day; no fake rows created (assert `games` count unchanged) |
| I11 | **Qualification**: completed_days vs threshold (below → absent from entries/count, `qualified:false` + completedDays in `currentUser`; at/above → rankable); threshold > available days → empty board |
| I12 | **Ranking determinism**: equal (avg time, avg guesses) → earlier `earliest_qualifying_completion_at` ranks first; full tie → same dense rank, stable display order by `user_id`; more than 10 rows when rank-10 tie |
| I13 | **Tiebreaker day set**: today's completion participates in the tiebreaker for players whose average includes today |
| I14 | **Lazy finalization**: week/month read triggers `finalizeExpired` before aggregation (assert frozen values present on the returned board after a missed cron) |
| I15 | **Midnight boundary (one run)**: fixture with an ACTIVE puzzle whose `expires_at` crosses "now" (constructed via SQL), sweep/board behavior at the exact boundary; both NG9 lock orders re-asserted (existing suite untouched) |
| I16 | **FORFEITED retention**: raw `guess_count`/timestamps untouched after finalization (raw-facts rule) |

### 11.3 E2E (Playwright, deterministic auth fixture)

| # | Scenario |
|---|---|
| E1 | Leaderboard navigation: header tab → page renders; all four tabs switch + fetch |
| E2 | Guard behavior: unauthenticated → landing; unonboarded → onboarding (existing guard loops extended to the leaderboard page — already covered by Phase-2 spec, keep) |
| E3 | Today board with seeded completions (fixture inserts COMPLETED games relative to Manila today): order + values correct; ties show shared rank |
| E4 | Current-user highlight + "You" badge |
| E5 | Result → position: complete a seeded game through the real flow → position block shows `Current position: #N` + "may change" caption + leaderboard link navigates |
| E6 | Result → leaderboard: link lands on `/leaderboard` with Today tab |
| E7 | FAILED result: penalty line rendered, no position block |
| E8 | Empty states: no-completions day, unqualified week viewer scene |
| E9 | Mobile (390×844): tabs usable, rows fit, no horizontal overflow |
| E10 | Light/dark: leaderboard rows legible in both themes (computed-contrast audit, same as Phase-2) |

E2E seeding uses the Manila-date derivation pattern from §10.3 in the fixture.

### 11.4 Preserved suites

All 121 unit + 35 integration + 15 E2E tests remain; the CI config's existing jobs/steps are
extended, never weakened.

---

## 12. CI and operational verification

No new jobs; **extend the existing three** (`unit-and-build`, `integration`, `e2e`):

- `unit-and-build`:
  - new unit files are picked up automatically; add **schema-purity step**
    `git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations`
    (Phase 3 must ship with zero migration — mirrors the Phase-2 local proof);
  - add **worker-patch verification**: after `bun run build`, assert the patched
    `_worker.js` contains the `scheduled` export (the U5 test or a shell check) — without this,
    a missed hookup silently ships a cron-less worker.
- `integration` (mandatory non-prod Neon gate, unchanged mechanics): new suites
  `tests/integration/leaderboard.test.ts` + `tests/integration/settlement.test.ts` run in the
  existing job; both TRUNCATE app tables like the existing suites; keep `fileParallelism: false`
  (already set) and the jobs' sequential dependency (already set).
- `e2e`: `leaderboard.spec.ts` + the result-position additions to `game-flow.spec.ts`.
- **Cron-specific verification**: local `wrangler dev --test-scheduled` is documented for the
  implementer/operator (not CI — CI cannot rely on an interactive wrangler loop); the
  settlement DOMAIN is fully covered by integration tests; `wrangler deploy --dry-run` remains
  a local/Phase-6 gate (include in the implementer's local verification list).
- **No fake/local database substitute** anywhere: the real PostgreSQL semantics (window
  functions, `FOR UPDATE SKIP LOCKED`, `transaction_timestamp()`, LEFT-JOIN absence) are only
  verified against the non-production Neon DB, matching the Phase-0/1/2 policy.

---

## 13. Open product decisions (must NOT be silently guessed)

| # | Decision | Default/plan stance | Owner |
|---|---|---|---|
| P1 | Weekly/monthly qualification thresholds (absolute completed days) | Provisional values in `constants.ts` marked PROVISIONAL; must be confirmed before Phase-6 deploy | Product owner |
| P2 | MISSED penalty for days **before a player joined/onboarded** (uniform penalty per spec-literal vs join-date carve-out) | Spec-literal uniform penalty (documented §5); carve-out requires a product decision | Product owner |
| P3 | Missing-puzzle alert channel (dashboard logs only vs notification binding) | Log-only in Phase 3; notification infra deferred to Phase 6 | Product owner/ops |
| P4 | Average-guesses display precision | 2 decimal places (display-only; ranking uses exact value) | Product owner |
| P5 | `?limit=` guardrail max | 50 (cap protects the response; dense cutoff default 10 unchanged) | — (technical) |
| P6 | Rank-block copy ("Position may change as others finish") | Exact copy free during implementation, meaning fixed | — (design) |

---

## 14. Deliverable checklist (implementation chat)

1. `src/server/leaderboard/constants.ts`, `service.ts`, `handlers.ts` (4 GET routes, chained).
2. `src/server/puzzle/settlement.ts` (+ `finalizeExpired`/`activateToday`/`runSettlement`) and
   `src/server/puzzle/scheduled-entry.ts`.
3. `scripts/patch-worker-scheduled.ts` (+ vite `closeBundle` hookup in `vite.config.ts`).
4. `src/server/routes.ts`: `requireAuth` on `/api/leaderboard/*` + chained registration.
5. `src/lib/shared/api/leaderboard.ts`; `src/lib/features/leaderboard/{rank-row,position-callout}.svelte`.
6. `/leaderboard` page rebuild (tabs, rows, highlight, viewer callout, empty/error/loading).
7. `/play` terminal result block (position + penalty line + navigation).
8. Tests: U1–U6, I1–I16, E1–E10; keep all existing suites green.
9. CI: schema-purity step + worker-patch step in `unit-and-build`; nothing else structural.
10. Docs: this plan + handoff + implementation prompt; record any implementation-time
    deviation in `docs/contradictions-and-gaps.md` (Phase 3 resolutions section).

## 15. Planning verdict

```text
PHASE 3 PLANNING STATUS: READY

Blocking issues:
  None. No schema migration needed; no unresolved technical blocker.
  (The only infra finding — adapter-cloudflare has no entrypoint for a `scheduled`
   export — has a concrete, deterministic post-build patch solution: §7.3.)

Resolved decisions:
  - No ranking table; aggregation via SQL window functions over raw facts (§2, §10).
  - MISSED derived by LEFT JOIN absence; no fake rows; raw model untouched (§4).
  - Day-set semantics for today/yesterday/week/month with completed-only current day (§3).
  - Qualification constants location/naming; values PROVISIONAL (P1) (§5).
  - Lock order + transaction_timestamp() anchor preserved; sweep uses FOR UPDATE SKIP LOCKED
    + idempotent finalizePuzzle (§6).
  - Settlement runs in a post-build-patched `scheduled` export; domain stays portable (§7.3).
  - Lazy finalization = read-path reconciliation for week/month only (§8.2).
  - API: 4 GET endpoints with dense-rank cutoff, viewer rank inline, NG21 errors (§8).
  - No history/statistics endpoints or pages beyond the leaderboard itself (§1.1).
  - Result screen: position block (COMPLETED) + penalty line (FAILED/FORFEITED) (§9.2).
  - No schema migration; no new indexes (§10.1–10.2).
  - Test matrix U1–U6 / I1–I16 / E1–E10; CI extended in-place (§11–12).

Remaining product decisions:
  P1 threshold values, P2 pre-join MISSED, P3 alert channel, P4 avg-guesses precision,
  P5 limit cap (technical), P6 copy (design) — §13.

Expected implementation slices:
  leaderboard service/routes/constants → settlement domain + cron patch →
  API wiring (routes.ts) → shared API client → FSD leaderboard feature →
  /leaderboard page → /play result block → tests (unit/integration/e2e) → CI steps → docs.

Required verification gates:
  bun run lint / check / test:unit / build / types:check (hermetic) / verify:bundle /
  test:integration (live Neon, incl. I1–I16) / test:e2e (E1–E10) /
  git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations (empty) /
  patched-worker assertion + wrangler deploy --dry-run /
  GitHub Actions run green (unit-and-build, integration, e2e).
```