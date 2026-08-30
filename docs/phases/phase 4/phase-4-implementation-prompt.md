# Phase 4 — Implementation Prompt (standalone start prompt for a NEW chat)

> Copy everything below the line into the first message of the Phase-4 implementation chat.
> The chat must work from the **actual repository**; the plan and handoff documents are
> authoritative companions — the repository wins on any conflict. Do not re-plan; execute the
> plan. All plan decisions (D1–D10) are binding unless the repository or a newer recorded
> decision supersedes them.

---

You are implementing **Phase 4 — Admin (Puzzle Scheduling & Management)** of the Leaderboard
Wordle project.

**Repository:** `https://github.com/LorensTee/leaderboard-wordle`
**Local path:** `/home/greant/WebstormProjects/leaderboard-wordle`
**Branch:** `main`. Baseline HEAD: `b2bca18685520d7975add8a559ade726601020d8` (Phase-3
complete; the `/admin` page is the intentional Phase-4 placeholder).

## 1. Read these first (in order)

1. `docs/phases/phase 4/phase-4-plan.md` — the AUTHORITATIVE implementation plan (scope §2,
   decisions D1–D10 §5, slices §6, API contract §8, UI/UX §9, test matrix §10, gates §12,
   invariants §14).
2. `docs/phases/phase 4/phase-4-planning-state-handoff.md` — exact repository state, code
   paths to reuse, slice dependencies, constraints.
3. `docs/phases/phase 3/phase-3-final-state-handoff.md` — §9 (Phase-4 starting assumptions)
   and §10 (status block): Phase 3 is COMPLETE; its invariants are your invariants.
4. `Architecture-v3.md` §Phase 4, §Admin scheduling window and same-day replacement,
   §Admin answer validation, §Puzzle lifecycle/locking, §Hono RPC + type boundary rule,
   §Validation (Zod).
5. `Specifications-v1.md` §16 (Admin) and §4–§5 (hint rules).
6. `docs/contradictions-and-gaps.md` — the decision + deviation log. **Your FIRST repo
   write must record plan decisions D1–D10 there** (the repo rule), and ANY deviation from
   the plan must be recorded there BEFORE proceeding.
7. Current code to mirror: `src/server/leaderboard/{handlers,service,constants}.ts` and
   `src/server/profile/handlers.ts` (chained Hono registration + AppType discipline),
   `src/server/game/service.ts` (NG9 lock discipline, M3 activation — your invariant),
   `src/server/puzzle/manila.ts` (`todayManilaDateExpr`, `expiresAtExpr` — reuse, don't
   duplicate), `src/server/middleware/auth.ts` (`requireAuth` — add `requireAdmin` next to
   it), `src/server/routes.ts` (composition point), `src/server/lib/errors.ts`
   (`ERROR_CODES`), `src/lib/shared/api/{client,me,leaderboard}.ts` (typed RPC client),
   `src/routes/admin/+page.svelte` (placeholder to rebuild; keep `+page.server.ts`),
   `src/routes/onboarding/+page.svelte` / `src/routes/profile/+page.svelte` (TanStack Form
   patterns), `scripts/seed/README.md` (import-tooling contract), `scripts/build-word-list.ts`
   (parser conventions), `tests/unit/leaderboard-routes.test.ts` (route unit pattern),
   `tests/integration/helpers.ts` (`waitForLockWaiters`), `tests/e2e/helpers/auth-fixture.ts`
   (`createAuthenticatedUser({ role: 'admin' })`, extend seeding), `.github/workflows/ci.yml`
   (no new jobs; keep the schema-purity and patched-worker assertions).

## 2. Mission

Implement, in this order, using TDD (write the failing test first at each slice):

1. **S1 — Answer-pool import tooling**: `scripts/seed/import-answer-pool.ts` + a
   `seed:answers` package script. Reads the gitignored `scripts/seed/answer-pool.source.txt`
   (absent file → exit with a clear message), parses like `build-word-list.ts`
   (5-letter lowercase, one per line, comments/blank ignored), **fails on any word not in
   `VALID_GUESS_SET`** (`answers ⊂ valid guesses`), dedupes, upserts into `answer_dictionary`
   with a report. Extend `scripts/seed/README.md` with usage + provenance. Never import into
   `src/lib`; `verify:bundle` already scans the seed dir.
2. **S2 — Admin domain**: `src/server/admin/validation.ts` (pure: word normalization,
   hint validation — single ASCII letter occurring in the answer, date-window guards) and
   `src/server/admin/service.ts` (list/schedule/update/delete/replace/validate per plan §8,
   D6/D7/D8/D9; every mutation locks the puzzle row FIRST in its own transaction and
   re-checks guards under the lock; SQL-computed Manila "today"; UNIQUE violations
   (SQLSTATE 23505) mapped to the D10 409 codes). Add the D10 error codes to
   `src/server/lib/errors.ts`.
3. **S3 — API**: `requireAdmin` (403 `FORBIDDEN` envelope when `role !== 'admin'`) in
   `src/server/middleware/auth.ts`; compose `.use('/api/admin/*', requireAuth)` then
   `.use('/api/admin/*', requireAdmin)` in `src/server/routes.ts`; `src/server/admin/handlers.ts`
   with exactly these six endpoints: `GET /api/admin/puzzles` (list, `?from&to`),
   `POST /api/admin/puzzles` (schedule), `PATCH /api/admin/puzzles/:id` (edit/move),
   `DELETE /api/admin/puzzles/:id` (delete future SCHEDULED only),
   `POST /api/admin/puzzles/:id/replace-today` (atomic same-day replacement),
   `POST /api/admin/puzzles/validate` (D5 validation feedback) — strict zod bodies,
   `UUID_RE` short-circuit, chained registration EXACTLY like `registerLeaderboardRoutes`
   (AppType must keep growing; verify `bun run check` and the client compile).
4. **S4 — Client + page**: `src/lib/shared/api/admin.ts` (typed RPC + `['admin']` /
   `['admin','puzzles']` query keys, `apiErrorFromResponse`); rebuild
   `src/routes/admin/+page.svelte` (keep the guard) with page-local components (D2):
   month calendar grid (each day = puzzle slot; word + hint + state badges; locked/live/
   finalized states; today highlight; month navigation), schedule/edit forms (TanStack
   Form; hint pre-filled with the word's first letter — D3), delete with explicit
   confirmation, the same-day replacement panel for today-SCHEDULED (D8), live
   server-computed validation chips (`✓ Approved answer` / `⚠ Already scheduled/used` /
   `✕ Not in approved answer list` — D5), loading/error/empty states and toasts per the
   repo's existing patterns, responsive + light/dark.
5. **S5 — Secrecy + regression pins**: unit test asserting no answer-pool material in the
   admin feature/build when seed files exist (U5-style, conditional); extend
   `tests/e2e/helpers/auth-fixture.ts` with `seedScheduledPuzzle(date, word)` (SCHEDULED
   status; SQL-computed Manila dates) and write `tests/e2e/admin.spec.ts` (E-A1…E-A6 per
   plan §10.3).
6. **S6 — Documentation + gates**: `docs/contradictions-and-gaps.md` updates (decisions
   first, deviations as they happen), `scripts/seed/README.md` provenance, final handoff
   `docs/phases/phase 4/phase-4-implementation-handoff-final.md`, full gate sweep.

## 3. What Phase 4 means (binding scope)

Admin-only puzzle scheduling and management: calendar view; schedule/edit/delete of
FUTURE SCHEDULED puzzles; atomic same-day replacement for today-SCHEDULED-never-started
only; server-authoritative validation (approved-dictionary membership, duplicates, hint
at scheduling time, date window, DB-clock today); `/api/admin/*` role gate (401/403);
answer-pool import tooling; zero schema migration. Everything else is OUT of scope
(plan §2.2) — especially: no leaderboard/settlement/cron changes, no admin bootstrap
work, no manual settlement tooling, no history/statistics, no rate limiting/CSP, no
changes to game/auth/profile/onboarding/theme surfaces, no new endpoints beyond plan §8.

## 4. Binding decisions (implement exactly; from plan §5)

D1 role gate middleware; D2 page-owned UI (no `$lib/features/admin/`); D3 hint input +
UI default first letter; D4 list window defaults `today−30…today+90` ≤120 days; D5
server-side validation feedback endpoint; D6 delete/edit guards (else 403); D7 gap
marker + response `gaps` + UI warning (no notification infra); D8 replace-today single
transaction (today+SCHEDULED+`locked_at IS NULL`, update answer/hint/expires_at in
place, never delete+reschedule); D9 date-move recomputes `expires_at` + `UNIQUE` guard;
D10 error codes. Do NOT invent final values for P1–P6 (they stay PROVISIONAL/untouched)
and do NOT silently change the binding decisions: D3 and the D4 defaults are CHOSEN —
implement them as-is. The genuinely open items are limited to: D4's defaults being
product-tunable (changing the UI default later does not re-plan this phase), the admin
settlement tooling exclusion (a scope change requiring a product decision), and P1–P6.

## 5. What must remain unchanged (invariants — plan §14)

- `src/server/db/schema.ts` + `migrations/` byte-identical (zero migration; CI
  schema-purity step stays EMPTY).
- NG9: puzzle-row-first lock order, `transaction_timestamp()` anchors, no
  `clock_timestamp()`; admin code never changes lifecycle status (SCHEDULED→ACTIVE is
  exclusively `activateToday`/`startGame`; ACTIVE→FINALIZED exclusively
  `finalizePuzzle`).
- Answer secrecy: no answer-pool material in tracked source, generated artifacts,
  client bundles, or non-admin API responses — the private local seed file may exist only
  uncommitted and gitignored; `word` only in admin API responses behind the role gate;
  settlement chunk answer-free; `verify:bundle` green.
- Phase-1/2/3 behavior and the full existing test suites — intact, never weakened.
- API composition rule: all admin routes registered ONLY in `routes.ts`, chained;
  typed client only through `hc`; no SvelteKit form actions for mutations.
- CSRF middleware untouched (it already covers `/api/admin/*`).
- CI: no new jobs; patched-worker + schema-purity assertions stay.

## 6. How to test each slice (details in plan §10)

- **S1**: unit tests for the parser + subset invariant (conditional on seed files);
  manual `bun run seed:answers` against the non-production DB with a local fixture file.
- **S2**: unit tests for pure validation + state-guard mapping; integration I-A1…I-A10
  (plan §10.2) against live Neon — schedule/edit/move/delete/replace matrix, UNIQUE
  races, lock-order races with `waitForLockWaiters` (concurrent replace vs `startGame`,
  delete vs `activateToday`, replace vs `activateToday`), gap markers, `expires_at`
  recomputation.
- **S3**: unit route tests — 401 no session, 403 player role, 200/201 admin
  pass-through, strict-body rejection, uuid 404, NG21 envelopes.
- **S4**: E2E `admin.spec.ts` E-A1…E-A6 (admin nav + calendar, schedule flow, validation
  states, delete guards, same-day replacement, responsive/dark smoke) with the
  deterministic session fixture.
- **S5**: secrecy unit pins; `verify:bundle` with local seed files present.
- **S6**: the complete §12 gate list.

## 7. Final verification gates (all must actually pass on your final tree)

`bun install --frozen-lockfile` · `bun run lint` · `bun run check` (0 errors) ·
`bun run test:unit` · `bun run build` (patched-worker log appears) ·
`grep -c "export { scheduled }" .svelte-kit/cloudflare/_worker.js` → **1** ·
`bun run verify:bundle` · `bun run types:check` (hermetic — no `.env`/`.dev.vars`) ·
`bun run auth:check` · `bun run word-list` + `bun run avatar-list` (byte-identical) ·
`git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` (EMPTY) ·
`bun run test:integration` (live non-production Neon; I-A1…I-A10 + all preserved suites) ·
`bun run test:e2e` (admin spec + all preserved specs) · `bunx wrangler deploy --dry-run` ·
full GitHub Actions run green (three jobs) with the schema-purity and patched-worker
steps still passing. Optional local: `bun run seed:answers` with a fixture file.

## 8. Finish (documentation/receipt requirements)

Report:
- per-slice implementation + exact test/verification receipts (commands as actually run);
- the D1–D10 records and ANY deviations added to `docs/contradictions-and-gaps.md`
  (deviations recorded FIRST, before the code that deviates);
- the answer-pool provenance record in `scripts/seed/README.md` (source, version,
  license, import date, filtering rules) with the private file itself left uncommitted;
- P1–P6 and the state-handoff §6 product-tunable choices (D4 defaults) and deferred
  scope items (admin settlement tooling), visible and untouched;
- a new `docs/phases/phase 4/phase-4-implementation-handoff-final.md` with the same
  structure as `docs/phases/phase 3/phase-3-implementation-handoff-final.md` (what was
  implemented, receipts, deviations, open items, exact new HEAD);
- the exact new HEAD after your commits.

Do not claim completion without the §7 gates (every listed command must actually have run
and passed on your final tree).