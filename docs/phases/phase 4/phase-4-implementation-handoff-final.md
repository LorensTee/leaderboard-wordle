# Phase 4 — Final Implementation Handoff (post-implementation, authoritative)

> **Status: PHASE 4 COMPLETE.** This document is the FINAL authoritative snapshot
> of the repository AFTER the Phase-4 implementation (Admin — puzzle scheduling &
> management). Companion documents: `docs/phases/phase 4/phase-4-plan.md` (the
> authoritative plan — decisions D1–D10), `phase-4-implementation-prompt.md` (the
> executable prompt), `phase-4-planning-state-handoff.md` (planning-time state), and
> `docs/contradictions-and-gaps.md` (DECISIONS + DEVIATIONS — authoritative log;
> D1–D10 recorded FIRST, deviations recorded before their code).

## 1. Exact repository identity (final)

| Item | Value |
|---|---|
| Branch | `main` (tracks `origin/main`) |
| **Exact new HEAD (implementation)** | `3d2251910eebd770f3951cc5dc92198b55124548` — `feat(phase4): admin puzzle scheduling & management` (the commit that contains ALL Phase-4 code/tests; docs-only commits follow — see §7) |
| Phase-4 baseline (pre-implementation) | `b2bca18685520d7975add8a559ade726601020d8` — `docs(phase3): final-state handoff for the Phase-4 planning chat` |
| Working tree | Only the user-owned IDE file `.idea/material_theme_project_new.xml` remains modified (user-owned, never committed). |

## 2. Phase-4 scope — COMPLETE

Everything in the implementation prompt §2 (six slices) is implemented and verified:

1. **S1 — Answer-pool import tooling** — `scripts/seed/import-answer-pool.ts` +
   `bun run seed:answers` (`package.json`). Reads the gitignored
   `scripts/seed/answer-pool.source.txt` (absent → clear message, exit 1; no
   `DATABASE_URL` → exit 2); parses like `build-word-list.ts` (5-letter lowercase,
   one per line, `#` comments/blank ignored); **fails on any word not in
   `VALID_GUESS_SET`** (`answers ⊂ valid guesses`, NG13); rejects duplicates;
   idempotent upsert (`ON CONFLICT DO NOTHING` on the UNIQUE word index) with a
   report (inserted / already present); one parameterized multi-row INSERT per
   batch (Phase-3 batching precedent). `scripts/seed/README.md` extended with
   exact usage, exit codes, and the provenance record table. Never imports into
   `src/lib`; `verify:bundle`/U5-style pins scan the seed dir.
2. **S2 — Admin domain** — `src/server/admin/validation.ts` (pure: word
   normalization/shape, D3 hint validation — single ASCII letter occurring in the
   answer, ISO date + D4 window guards, D6 edit/replace guard matrices,
   `mapUniqueViolation` 23505 → D10 409s) and `src/server/admin/service.ts`
   (list/schedule/update/delete/replace/validate per plan §8; every mutation locks
   the puzzle row FIRST in its own transaction and re-checks guards under the lock
   (NG9 READ COMMITTED re-read); SQL-computed Manila "today"
   (`transaction_timestamp() AT TIME ZONE 'Asia/Manila'`); D7 gap detection over
   the mutated window with `[admin] puzzle gap created dates=…` structured markers;
   `expires_at` recomputation via the shared `expiresAtExpr`). D10 codes added to
   `src/server/lib/errors.ts`.
3. **S3 — API** — `requireAdmin` (NG21 403 `FORBIDDEN` envelope when
   `role !== 'admin'`) next to `requireAuth` in `src/server/middleware/auth.ts`;
   composed in `src/server/routes.ts` as `.use('/api/admin/*', requireAuth)` then
   `.use('/api/admin/*', requireAdmin)`. `src/server/admin/handlers.ts` exposes
   EXACTLY the six §8 endpoints (`GET /api/admin/puzzles`, `POST
   /api/admin/puzzles`, `PATCH/DELETE /api/admin/puzzles/:id`, `POST
   /api/admin/puzzles/:id/replace-today`, `POST /api/admin/puzzles/validate`) with
   strict zod bodies (unknown fields → 400), `UUID_RE` short-circuit (404 without a
   DB round-trip), chained registration EXACTLY like `registerLeaderboardRoutes`
   — `registerAdminRoutes` chains LAST so the AppType keeps growing; verified by
   `bun run check` and the typed client compile.
4. **S4 — Client + page** — `src/lib/shared/api/admin.ts` (typed RPC via `hc`;
   `adminKeys = { all: ['admin'], puzzles: ['admin','puzzles'], window(from,to) }`);
   `src/routes/admin/+page.svelte` rebuilt (SSR guard kept) with page-local
   components (D2): `puzzle-calendar.svelte` (month grid, weekday headers Mon-first,
   today highlight `aria-current`, `data-date` hooks for tests, state badges:
   Scheduled / Live / Finalized / Locked / Needs replacement; empty future slots →
   "Schedule"; today-SCHEDULED → "Replace"), `puzzle-form.svelte` (schedule/edit/
   replace via `@tanstack/svelte-form`; D3 hint pre-filled with the word's first
   letter; D5 live validation chips `✓ Approved answer` / `⚠ Already
   scheduled/used (date)` / `✕ Not in approved answer list` — debounced, event-
   driven), delete with an explicit confirmation dialog, D7 gap warning banner,
   loading skeleton (`aria-busy`) / error+retry / toasts (svelte-sonner), one
   mutation in flight at a time, no optimistic updates (server truth), responsive
   + light/dark tokens.
5. **S5 — Secrecy + regression pins** — `tests/unit/admin-secrecy.test.ts`
   (U5-style conditional pin: when `scripts/seed/*.txt` exists, NO pool word
   appears as a literal in `src/server/admin/*`, the client admin surface, or
   non-admin client API modules); `tests/e2e/helpers/auth-fixture.ts` extended with
   `seedScheduledPuzzle(date, word)` (SCHEDULED status; SQL-computed Manila dates;
   date optional → today) and `seedApprovedAnswer(word)`; `tests/e2e/admin.spec.ts`
   E-A1…E-A7 (E-A1 admin tab + populated calendar; player: no tab, page redirect,
   403 from `/api/admin/*`; E-A2 schedule flow + toast + grid row; E-A3 validation
   states incl. submission rejection; E-A4 delete with confirmation + gap warning +
   no delete for ACTIVE/today; E-A5 same-day replacement with in-place word update;
   E-A6 responsive 390×844 + dark/light; E-A7 unauthenticated redirect).
6. **S6 — Documentation + gates** — `docs/contradictions-and-gaps.md` updated
   (D1–D10 recorded FIRST, then the Phase-4 deviations section); `scripts/seed/
   README.md` provenance; this handoff; full gate sweep (§6).

## 3. Final architecture / domain state (Phase-4 additions)

- **Admin service** (`src/server/admin/service.ts`): every mutation = own
  transaction; `SELECT … FOR UPDATE` on the puzzle row FIRST (NG9); guards
  re-checked under the lock; never flips lifecycle status (SCHEDULED→ACTIVE is
  exclusively `activateToday`/`startGame`; ACTIVE→FINALIZED exclusively
  `finalizePuzzle`); `todayManilaDateExpr`/`expiresAtExpr` reused from
  `src/server/puzzle/manila.ts` (never duplicated).
- **D6**: DELETE/PATCH allowed ONLY when `locked_at IS NULL AND status =
  'SCHEDULED' AND puzzle_date > today`; violations map 403 `PUZZLE_IMMUTABLE`
  (locked/ACTIVE/FINALIZED), `NOT_SCHEDULED`, `NOT_FUTURE`. Today's SCHEDULED
  puzzle is never plain-deleted/edited.
- **D7**: move/delete gap detection over the mutated window — only dates that
  BECAME empty are reported (`before`/`after` scans); structured
  `[admin] puzzle gap created dates=…` log marker (Logger seam, `console.error`
  default like the settlement seam) + `gaps` in responses; UI warning banner; the
  settlement cron remains the operational detector for a missing TODAY.
- **D8**: `replace-today` = single recovery transaction — lock row; verify
  `puzzle_date` = today (SQL) + `status = 'SCHEDULED'` + `locked_at IS NULL`;
  UPDATE `answer_id`/`hint_letter`/`expires_at` in place (never delete+reschedule;
  no transient gap).
- **D9**: PATCH date-move recomputes `expires_at` via `expiresAtExpr`; destination
  must be future; `UNIQUE(puzzle_date)` pre-check + 23505 → 409 `DATE_TAKEN`.
- **UNIQUE races**: pre-checks are UX; `UNIQUE(puzzle_date)`/`UNIQUE(answer_id)` +
  `mapUniqueViolation` (SQLSTATE 23505 → 409 `DATE_TAKEN` /
  `ANSWER_ALREADY_SCHEDULED`) are the final guards. Driver note: the
  @neondatabase/serverless driver wraps PG errors as `{ query, params, cause }` —
  the mapper unwraps `.cause`.
- **`expiresAtExpr` corrected** (recorded deviation, see §5): the naive
  `(date + 1) AT TIME ZONE 'Asia/Manila'` resolves to `timestamp without time
  zone` and stores an instant 8h late on Neon (GMT session) — now
  `((${date}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')` (verified
  `timestamptz`, `2026-09-04 16:00:00+00`).
- **`verify:bundle` scan rule corrected** (recorded deviation, see §5): the pool
  ⊆ public guesses subset rule makes every compliant pool word EXPECTED in the
  client bundle via the public artifact; the whole-build scan now hard-fails only
  for pool words NOT in the public guesses list (a genuinely private word), and
  documents public-list words as by-design.
- **Reactivity note (deviation-adjacent)**: `@tanstack/svelte-form` state is
  `@tanstack/store`-backed; the D5 chip is driven from the input event handler
  (debounced) rather than `$effect`/`$derived` over `form.state` (whose tracking
  inside Svelte runes is not reliable); `field.handleChange`/`form.setFieldValue`
  are the reactive write paths (documented in the component).

## 4. Database / schema status

- **byte-identical to the Phase-2/3 baseline** — verified on the final tree:
  `git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` →
  EMPTY (zero migration; `answer_dictionary` + `daily_puzzles` consumed as-is).
- No new tables, no new indexes, no new columns.

## 5. Implementation deviations / corrections — ALL recorded FIRST in `docs/contradictions-and-gaps.md`

1. **`expiresAtExpr` corrected inside `src/server/puzzle/manila.ts` (off-by-8h bug)** — the
   helper (previously unused; Phase 4 is its first consumer) produced a naive
   `timestamp without time zone`, storing `2026-09-05T00:00:00Z` instead of the
   NG1 Manila-midnight instant `2026-09-04T16:00:00Z` on Neon's GMT sessions, and
   shifting with any non-UTC session timezone. Fixed with an explicit `::timestamp`
   cast; verified live against Neon; I-A1/I-A4/I-A6 pin the corrected instant.
2. **`verify:bundle` whole-build scan vs the subset rule (fixed)** — the plan
   requires both the pool-⊂-guesses rule and the gate green with populated seeds;
   the client bundle legitimately contains the PUBLIC guesses list, so a raw scan
   can never pass with a compliant pool. The tool now scans only pool words NOT in
   the public list (genuine leaks); word-level secrecy is additionally pinned by
   the U5 settlement-chunk scan + the new admin-secrecy unit pins; response-level
   secrecy by the role gate (E-A1).
3. **Test-fixture corrections (not domain changes)** — duplicate/invalid-date
   schedule tests seed the dictionary first; `expires_at` comparisons normalize
   driver values (`new Date(...)`) and use the corrected SQL expression.
4. **E2E calendar-adaptive framing** — today+1 when in the current Manila month,
   else the 1st of the next month (no fabricated dates); schedule-forms open from
   the first EMPTY future cell (E-A3) or the target cell (E-A2).

Deferred/product-open items (unchanged, visible): P1–P6 stay PROVISIONAL (§8);
the D4 calendar-window defaults are product-tunable (parameterized API — the UI
default is a one-line change); the admin settlement tooling exclusion remains a
scope decision (Phase-3 handoff "NOT promises").

## 6. Final test/verification receipts (ALL actually run on the final tree)

| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | OK (434 installs across 574 packages, no changes) |
| `bun run lint` | clean (0 errors / 0 warnings) |
| `bun run check` | 0 errors / 0 warnings |
| `bun run test:unit` | **206 passed** / 89 skipped (DB-gated) — incl. admin-validation (16), admin-service-guards (4), admin-routes (15), answer-pool-import (6), admin-secrecy (5); 0 regressions |
| `bun run test:integration` | **89/89** (8 files) against live non-production Neon — I-A1…I-A10 (33 tests: schedule/edit/move/delete/replace matrix, D6/D8/D9 guards, UNIQUE races, NG9 lock-order races via `waitForLockWaiters`, gap markers, `expires_at` recomputation, D5 validate read-only) + all preserved suites (settlement/lazy-activation/midnight/game/profile/leaderboard/db) untouched |
| `bun run test:e2e` | **30/30** (admin.spec.ts E-A1…E-A7 + all preserved specs: smoke, onboarding, profile, game-flow, leaderboard) |
| `bun run build` | ✔ (client + server) + `[patch-worker-scheduled] patched` |
| `grep -c "export { scheduled }" .svelte-kit/cloudflare/_worker.js` | **1** (exactly once) |
| `bun run verify:bundle` | bundle secrecy OK — 119 build files scanned; exercised BOTH modes: (a) populated compliant fixture pool (`flame`/`river`) → non-public scan empty + public-list words documented as by-design; (b) fixture removed (final tree) → OK |
| `bun run seed:answers` (fixture) | inserted 1 + 1 already present → second run 0 + 2 (idempotent, subset-verified) — fixture removed before the final tree |
| `bun run types:check` | up to date (hermetic: `.env`/`.dev.vars` temporarily stashed → restored) |
| `bun run auth:check` | auth schema parity OK |
| `bun run word-list` + `bun run avatar-list` | byte-identical (no artifact diff) |
| schema/migrations diff | **EMPTY** |
| `bunx wrangler deploy --dry-run` | ✔ (worker + assets; exits normally) |

GitHub Actions: no workflow changes; the three existing jobs run the same
assertions (schema purity + patched-worker) — a green CI run requires the push
(see §7).

## 7. Commit / push status

Phase-4 changes are committed on `main` as:

- `3d2251910eebd770f3951cc5dc92198b55124548` — `feat(phase4): admin puzzle
  scheduling & management` (S1–S6 source/tests/docs; 28 files, +5110/−41).
- Docs-only tail on top of it (this document + its HEAD-citation fixes):
  `18bd91d` (handoff) → `3d972a7` (receipt contents) → `8f8316f` (exact HEAD
  record, amended). The exact final commit of the Phase-4 work is the one this
  file is committed in; `git log --oneline -5` from the HEAD of `main` shows
  the full lineage.
- CI: the workflow is unchanged; a full green GitHub Actions run requires pushing
  `main` (three jobs, schema-purity + patched-worker assertions intact).

## 8. Remaining product decisions — P1–P6 (NOT resolved; do not silently resolve)

| # | Decision | Current state |
|---|---|---|
| P1 | Weekly/monthly qualification thresholds | PROVISIONAL 3 / 8 in `src/server/leaderboard/constants.ts` (⚠ marked) — untouched |
| P2 | MISSED penalty for pre-join days | Spec-literal UNIFORM penalty — untouched |
| P3 | Missing-puzzle alert channel | Log-only (`[settlement] missing puzzle…` + `[admin] puzzle gap…` markers); notification infra deferred to Phase 6 — untouched |
| P4 | Average-guesses display precision | 2 decimals, display-only — untouched |
| P5 | `?limit=` guardrail cap | 50; dense cutoff default 10 — untouched |
| P6 | Result-block copy | Wording free; meaning fixed — untouched |

Product-tunable / deferred scope (per plan §2.4): D4's calendar-window UI default
(changing it later needs no re-plan); the admin settlement tooling exclusion
(scope change → requires a product decision).

## 9. Known operator / deployment notes (new)

- **Answer pool import**: `DATABASE_URL=… bun run seed:answers` after placing the
  private `scripts/seed/answer-pool.source.txt` (gitignored; provenance record in
  `scripts/seed/README.md`). The tool fails loud on subset violations; re-runs are
  idempotent.
- **Admin gate**: `/admin` page + `/api/admin/*` are admin-role gated (SSR guard +
  `requireAuth`/`requireAdmin`); the calendar shows answers ONLY to admins; the
  client never fetches the pool.
- **Same-day replacement** is the only way to change today's puzzle (cron-missed
  recovery); it is atomic (single transaction) and never leaves a gap.
- **`verify:bundle`** now distinguishes public-list pool words (by design in the
  bundle) from non-compliant private words (hard leaks); the settlement chunk
  stays answer-free (U5).
- **Hermetic gates**: `bun run types:check` must run with `.env`/`.dev.vars`
  absent (or in CI).
- **E2E/integration**: unchanged requirements (non-production `DATABASE_URL`,
  `BETTER_AUTH_SECRET`, `ALLOW_DB_WIPE=1`); serialized runners unchanged; local
  runs need a writable `$HOME` (sandboxed environments: `HOME`/`BUN_TMPDIR` under
  `.cache/`).

## 10. Final status block

```text
PHASE 4 STATUS: COMPLETE

Implementation:
  S1 answer-pool import tooling (seed:answers; answers ⊂ valid guesses
  enforced; idempotent upsert + report; provenance in seed README),
  S2 admin domain (pure validation + service: schedule/edit/move/delete/
  replace/list/validate; every mutation locks the puzzle row FIRST in its
  own transaction and re-checks guards under the lock — NG9; SQL Manila
  today; D6/D7/D8/D9; UNIQUE 23505 → 409 mapping),
  S3 role-gated API (requireAdmin 403 FORBIDDEN; six §8 endpoints; strict
  zod bodies; UUID 404 short-circuit; chained AppType-preserving
  registration),
  S4 typed client + rebuilt /admin page (calendar, schedule/edit/replace
  forms, D3 hint prefill, D5 validation chips, delete confirmation, gap
  warnings, states, responsive + dark/light),
  S5 secrecy pins (admin-secrecy unit conditional scans; verify:bundle
  semantic fix) + E2E E-A1…E-A7 with SQL-derive
  d fixture dates,
  S6 decisions/deviations recorded first in docs/contradictions-and-gaps.md
  (D1–D10 + 2 deviations), final handoff.

Verification (final tree):
  lint clean · check 0 errors · unit 206 · integration 89/89 (live Neon,
  incl. I-A1…I-A10 with lock-order races) · e2e 30/30 (incl. admin
  E-A1…E-A7) · build + patched worker (single 'export { scheduled }') ·
  verify:bundle OK (both populated-pool and final-tree modes) ·
  seed:answers idempotent · types:check (hermetic) · auth:check ·
  word/avatar lists byte-identical · schema purity EMPTY · wrangler
  deploy --dry-run OK.

Known open product decisions:
  P1 thresholds (PROVISIONAL 3/8), P2 pre-join MISSED (uniform), P3 alert
  channel (log + failed invocation), P4 2dp display, P5 limit cap 50,
  P6 copy. D4 defaults product-tunable; admin settlement tooling deferred
  (scope decision).

Phase 5 starting point:
  Security hardening gate (rate limiting, CSP, ZAP, Dependabot) —
  Phase-3/4 invariants above continue to hold.

Important invariants (do not break):
  puzzle-row-first locks + transaction_timestamp() anchor (NG9); no
  clock_timestamp(); admin code never changes lifecycle status; zero
  schema migration; answer secrecy (pool gitignored; word admin-only;
  settlement chunk answer-free); NG21 envelopes; CSRF unchanged;
  composition rule (admin routes only in routes.ts, chained); no new
  endpoints beyond the §8 contract; CI assertions stay.
```

---

*Prepared from the actual repository after the full gate sweep on the final tree
(2026-08-30). Every receipt in §6 was actually obtained; nothing was inferred.*