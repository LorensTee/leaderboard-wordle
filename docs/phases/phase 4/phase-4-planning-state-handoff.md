# Phase 4 — Planning-State Handoff (planning complete; ready for implementation)

> This document lets a fresh implementation chat start Phase 4 WITHOUT the reasoning
> history of the planning chat. It is the state snapshot; the authoritative plan is
> `phase-4-plan.md`; the standalone executable prompt is `phase-4-implementation-prompt.md`.
> The **repository is the ultimate source of truth** — where any document conflicts with
> the current tree, the tree wins.

## 1. Repository / branch / HEAD

| Item | Value |
|---|---|
| Repo | `https://github.com/LorensTee/leaderboard-wordle` |
| Local path | `/home/greant/WebstormProjects/leaderboard-wordle` |
| Branch | `main` (tracks `origin/main`) |
| **HEAD (planning baseline)** | `b2bca18685520d7975add8a559ade726601020d8` — `docs(phase3): final-state handoff for the Phase-4 planning chat` |
| Phase-3 final-state dependency | `docs/phases/phase 3/phase-3-final-state-handoff.md` — PHASE 3 COMPLETE at `45bc9ff` (no source delta to `b2bca18`) |
| Working tree | User-owned `.idea/material_theme_project_new.xml` modified; `docs/phases/phase 4/` untracked (this planning package) |

## 2. What Phase 4 is (determined from repository evidence, not assumed)

**Phase 4 = Admin: puzzle scheduling & management** — Architecture-v3 §Phase 4
(calendar view for future puzzles; answer validation against the approved dictionary;
duplicate detection; puzzle locking (first player start — already implemented, surfaced
only); admin-only access), Specifications-v1 §16 (Admin tab, calendar view, scheduling
window, atomic same-day replacement, scheduling validation example states, lifecycle),
and the contradiction-log items explicitly assigned to Phase 4:

- **NG2** (hint validated + persisted at scheduling time — membership in answer),
- **NG8** (delete/edit rules for SCHEDULED puzzles: future + unstarted + SCHEDULED only,
  else 403),
- **NG15** (mutability state model + atomic same-day replacement as a single recovery
  transaction),
- **M5** (scheduling window + date-move semantics: recompute `expires_at`, re-check
  `UNIQUE(puzzle_date)`, gap alert).

Dependencies the phase needs: the private answer-pool import tooling
(`scripts/seed/README.md`: "Phase 3/4 admin scheduling work" — the script does not exist
yet; the `answer_dictionary` table is populated by it).

**Explicitly OUT of scope**: leaderboard/settlement/cron changes; admin bootstrap (Phase 2,
N4); onboarding/profile/auth; game domain; manual settlement tooling (Phase-3 handoff §9.3
"NOT promises" — record the exclusion, do not add it); history/statistics; rate
limiting/CSP/security hardening (Phase 5); real alerting (Phase 6, P3); P1–P6 product
decisions.

## 3. Current architecture summary (verified)

- **Stack**: SvelteKit 2 (Cloudflare adapter) + Hono bridge (`src/routes/api/[...path]/+server.ts`)
  + Drizzle ORM + Neon (WebSocket driver) + Better Auth. Bun (`bun.lock`). TanStack Query
  for durable state; TanStack Form for forms; shadcn-svelte (badge/button/input/tabs
  installed); Tailwind v4 tokens.
- **API**: single composed Hono app (`src/server/routes.ts`), chained registration
  preserving `AppType`; `hc<AppType>` typed client (`src/lib/shared/api/client.ts`); NG21
  error envelope (`AppError` + `errorEnvelope`); middleware chain: requestId → timeout(30s)
  → bodyLimit(64KB) → security headers → CSRF (Origin/Sec-Fetch-Site, excludes
  `/api/auth/*`) → `authContext` → `requireAuth` on `/api/game/*`, `/api/me/*`,
  `/api/admin/*`, `/api/leaderboard/*`.
- **Puzzle domain**: `daily_puzzles` (SCHEDULED→ACTIVE→FINALIZED + `locked_at` mutability
  flag), lazy activation in `startGame` (M3), cron `activateToday`, `finalizePuzzle`
  (idempotent), settlement sweep (FOR UPDATE SKIP LOCKED), all NG9 puzzle-row-first lock
  discipline with `transaction_timestamp()` anchors. Manila date helpers:
  `src/server/puzzle/manila.ts` (`todayManilaDateExpr`, `expiresAtExpr`).
- **Admin surface today**: empty `src/server/admin/` (Phase-0 home), guarded placeholder
  `/admin` page, `requireAuth` already mounted on `/api/admin/*`, header Admin tab for
  admins (Phase-2 D6), `applyAdminBootstrap` role provisioning (Phase 2).
- **Secrecy**: answer pool private/gitignored (`scripts/seed/*.txt`); build-time
  `verify:bundle` scan; U5-style unit pins; answers never in client bundles or non-admin
  payloads.
- **Tests**: unit (DB-free) / integration (live non-production Neon, SQL-computed Manila
  dates, `waitForLockWaiters` for deterministic lock races, serialized
  `fileParallelism: false`, 60s timeout) / E2E (Playwright, serialized `workers: 1`,
  deterministic Better Auth session fixture with `role` support, TRUNCATE fixtures).
- **CI**: three jobs (`unit-and-build`, `integration`, `e2e`); schema-purity step
  (`git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations`) +
  patched-worker assertion (`grep -q "export { scheduled }"`).

## 4. Phase-4 objective

Add admin-only puzzle scheduling and management with the spec/architecture state model:

- calendar view (each date = puzzle slot; word + state; schedule/edit/delete for future
  SCHEDULED puzzles; atomic same-day replacement for today-SCHEDULED-never-started);
- server-authoritative validation (approved-dictionary membership, duplicate detection,
  hint validation at scheduling time, date window rules, DB-clock "today");
- `/api/admin/*` role-gated API (401/403), client under TanStack Query; page rebuilt;
- answer-pool import tooling as the validation dependency;
- zero schema migration; all Phase-1/2/3 behavior preserved.

## 5. Decisions already made (binding — D1–D10 from the plan)

| # | Decision (short) |
|---|---|
| D1 | `requireAdmin` middleware (403 FORBIDDEN when `role !== 'admin'`) after `requireAuth` on `/api/admin/*`; page guard unchanged. |
| D2 | Admin UI is page-owned (components under `src/routes/admin/`); no `$lib/features/admin/` slice (single consumer, FSD "extract when needed"). Only shared pure helpers → `src/lib/shared/lib/`. |
| D3 | `hintLetter` is scheduling input, validated server-side (single ASCII letter occurring in the answer, uppercase-normalized); UI pre-fills first letter as default. Persisted at scheduling time only (NG2). |
| D4 | List window: `GET /api/admin/puzzles?from&to`, defaults `today−30 … today+90` (Manila), window ≤ 120 days. |
| D5 | Validation feedback is server-computed via `POST /api/admin/puzzles/validate`; client never receives the answer pool. |
| D6 | DELETE/PATCH guards: `locked_at IS NULL AND status='SCHEDULED' AND puzzle_date > today` else 403 (`PUZZLE_IMMUTABLE`/`NOT_SCHEDULED`/`NOT_FUTURE`); today never plain-deleted. |
| D7 | Gap alerting on delete/move: structured `[admin] puzzle gap` log marker + `gaps` in the response; UI warns; settlement cron stays the operational detector; no new notification infra. |
| D8 | Same-day replacement = `POST /api/admin/puzzles/:id/replace-today` — single transaction: today (SQL) + SCHEDULED + `locked_at IS NULL` under the puzzle lock; update answer/hint/expires_at in place. Never delete+reschedule. |
| D9 | Date moves recompute `expires_at`, re-check `UNIQUE(puzzle_date)` (409 `DATE_TAKEN`), destination must be future. |
| D10 | New `ERROR_CODES`: `ANSWER_NOT_APPROVED`, `INVALID_HINT`, `ANSWER_ALREADY_SCHEDULED`, `DATE_TAKEN`, `PUZZLE_IMMUTABLE`, `NOT_SCHEDULED`, `NOT_FUTURE`, `INVALID_DATE_WINDOW`. All NG21 envelopes. |

## 6. Unresolved decisions and product-tunable choices (do NOT invent; record and surface)

The items below are NOT all open — respect each item's status:

1. **D3 hint provision — CHOSEN/BINDING.** The plan selected D3 (admin input + UI
   default first letter). The alternative (server-only derivation, no input) would change
   the contract; it was NOT chosen. Implement D3; only a product-owner veto changes it.
2. **D4 calendar-window defaults — CHOSEN, PRODUCT-TUNABLE.** `today−30 … today+90`,
   window ≤ 120 days; parameterized, so the UI default can change later without re-planning.
3. **Admin settlement tooling — EXPLICITLY DEFERRED (scope change).** Excluded per the
   Phase-3 handoff ("NOT promises"); adding it requires a product decision.
4. **P1–P6** (Phase-3 product decisions) — untouched, PROVISIONAL markers stay.

## 7. Files inspected (planning audit)

- Docs: `Architecture-v3.md`, `Specifications-v1.md`, `docs/contradictions-and-gaps.md`,
  `docs/phases/phase 1+2 vision/*`, `docs/phases/phase 1/{phase-1-api,phase-1-implementation-handoff}.md`,
  `docs/phases/phase 2/{phase-2-plan,phase-2-implementation-handoff-final}.md`,
  `docs/phases/phase 3/{phase-3-plan,phase-3-implementation-prompt,phase-3-final-state-handoff}.md`,
  `scripts/seed/README.md`, `README.md`.
- Source: `src/server/routes.ts`, `src/server/db/schema.ts`,
  `src/server/db/migrations/0000_init.sql`, `src/server/db/{client,memo}.ts`,
  `src/server/middleware/{auth,csrf}.ts`, `src/server/lib/errors.ts`,
  `src/server/game/{service,handlers}.ts`, `src/server/puzzle/{manila,finalize,settlement}.ts`,
  `src/server/profile/{service,handlers}.ts`, `src/server/leaderboard/{constants,handlers}.ts`,
  `src/server/data/valid-guesses.generated.ts`, `src/lib/shared/api/{client,me,leaderboard}.ts`,
  `src/lib/shared/ui/header.svelte`, `src/lib/app/guards.ts`,
  `src/hooks.server.ts` (session resolution), `src/routes/admin/+page.{server,}svelte`,
  `src/routes/leaderboard/+page.svelte`, `src/routes/play/+page.svelte` (result block;
  full file read was limited to the position/leaderboard parts),
  `src/routes/profile/+page.svelte` and `src/routes/onboarding/+page.svelte` (form-pattern
  grep only), `scripts/{build-word-list,verify-bundle-secrecy,patch-worker-scheduled,ci-migrate}.ts`,
  `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `package.json`,
  `.gitignore`, `.github/workflows/ci.yml`, `wrangler.toml`.
- Tests: `tests/unit/leaderboard-routes.test.ts`, `tests/integration/{helpers,lazy-activation,settlement}.test.ts`,
  `tests/e2e/helpers/auth-fixture.ts`.

## 8. Important code paths (reuse, don't recreate)

- `src/server/puzzle/manila.ts` — `todayManilaDateExpr`, `expiresAtExpr(puzzleDate)`
  (date rules + `expires_at` recompute). **Do not duplicate.**
- `src/server/game/service.ts` — NG9 lock discipline + M3 lazy activation reference;
  `startGame` is the invariant the scheduler must not fight.
- `src/server/routes.ts` — single composition point; chain
  `registerAdminRoutes` after `registerLeaderboardRoutes` the same way.
- `src/server/leaderboard/handlers.ts` — the chained-registration + zValidator +
  `authenticatedUser` pattern to mirror.
- `tests/integration/helpers.ts` — `waitForLockWaiters` for deterministic admin-vs-game
  race tests; `createIntegrationDb`/TRUNCATE discipline.
- `tests/e2e/helpers/auth-fixture.ts` — `createAuthenticatedUser({ role:'admin' })`;
  add `seedScheduledPuzzle(date, word)` (SCHEDULED variant incl. today's SQL date).
- `src/lib/shared/api/me.ts` — TanStack client pattern for `src/lib/shared/api/admin.ts`.
- `src/routes/onboarding/+page.svelte` / `profile/+page.svelte` — TanStack Form patterns.

## 9. Implementation slices (from the plan §6; dependencies explicit)

1. **S1 Answer-pool import tooling** — `scripts/seed/import-answer-pool.ts`,
   `package.json` `seed:answers`, README update; enforces `answers ⊂ valid guesses`;
   conditional (skips when private file absent). → nothing.
2. **S2 Admin domain** — `src/server/admin/{validation,service}.ts` + `ERROR_CODES`;
   full state model + transactions (schedule/edit/move/delete/replace/list/validate).
   → S1.
3. **S3 API** — `requireAdmin` in `src/server/middleware/auth.ts`; `routes.ts` composition;
   `src/server/admin/handlers.ts` (6 endpoints). → S2.
4. **S4 UI** — `src/lib/shared/api/admin.ts`; rebuild `/admin` page + page-local
   components (calendar, forms, dialogs/confirm, validation chips, states). → S2+S3.
5. **S5 Secrecy + regression pins** — admin-secrecy unit test; auth-fixture
   `seedScheduledPuzzle`; E2E `admin.spec.ts`. → S1–S4.
6. **S6 Docs + gates** — contradiction log (D1–D10 + deviations FIRST),
   `phase-4-implementation-handoff-final.md`, full gate sweep. → all.

## 10. Constraints (hard; violations are blockers)

- **Zero migration** — schema/migrations byte-identical at the end (proof in plan §7).
- **NG9 discipline preserved** — puzzle-row-first locks; `transaction_timestamp()`;
  never `clock_timestamp()`; admin code never changes lifecycle status.
- **Answer secrecy** — no answer-pool material in tracked source, generated artifacts,
  client bundles, or non-admin API responses (the private local seed file may exist only
  uncommitted and gitignored); `word` only in admin API responses; E-A1 403 boundary
  pinned; `verify:bundle` green.
- **No changes** to: game domain, auth/onboarding/profile/theme, leaderboard,
  settlement/cron/wrangler, CSRF, existing tests (never weakened).
- **Composition rule**: admin routes only in `routes.ts`, chained; typed client only via
  `hc`; no SvelteKit form actions for mutations.
- **No new endpoints** beyond the §8 contract (no pool dump; no settlement tooling).
- **Fixtures**: dates from the DB clock in SQL; "today" never fabricated; serialized
  runners.

## 11. Test / deployment requirements

- Test: unit (DB-free) incl. admin-validation, admin-routes (401/403/200 with fake
  service), answer-pool parser, admin-secrecy; integration against live non-production
  Neon — I-A1…I-A10 (matrix in plan §10.2) incl. NG9 lock-order races via
  `waitForLockWaiters`; E2E — `admin.spec.ts` E-A1…E-A6 (plan §10.3).
- Deployment: none — no wrangler/cron/env/binding changes; `wrangler deploy --dry-run`
  must stay green. `package.json` changes limited to `seed:answers` (+ optional shadcn
  Dialog add, with lockfile update).

## 12. Risks (top)

Concurrency (admin mutation vs lazy activation/cron/start/finalize — mitigated by NG9
lock-first + post-lock re-check + I-A7); answer leakage (role gating + bundle scans +
no static answers); DB duplicate races (UNIQUE + 23505 mapping); clock skew (SQL
"today"); fixture calendar adaptivity; CI without private seed files (conditional
tests); typing/AppType regression (chained registration pattern).

## 13. Exact next-step instructions for the implementation chat

1. Read, in order: `docs/phases/phase 4/phase-4-implementation-prompt.md` (the prompt
   IS your first message), `docs/phases/phase 4/phase-4-plan.md`, this file,
   `docs/phases/phase 3/phase-3-final-state-handoff.md` §9–§10,
   `docs/contradictions-and-gaps.md` (decision-log rule).
2. Verify the baseline: `git rev-parse HEAD` → expect `b2bca18...`; `git status`.
3. Record D1–D10 in `docs/contradictions-and-gaps.md` BEFORE implementing (repo rule).
4. Execute slices S1→S6 with TDD; keep every preserved suite green.
5. Run the §12 gates of the plan on the final tree (every command actually run).
6. Write `docs/phases/phase 4/phase-4-implementation-handoff-final.md` (receipts,
   deviations first, exact new HEAD); update `scripts/seed/README.md` provenance;
   leave P1–P6 and the §6 product-tunable/deferred items visibly open.