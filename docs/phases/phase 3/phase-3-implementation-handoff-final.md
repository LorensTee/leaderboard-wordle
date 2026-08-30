# Phase 3 — Implementation Handoff (final)

> **Status: IMPLEMENTED + VERIFIED.** Companion to the authoritative plan
> (`phase-3-plan.md`) and the planning handoff (`phase-3-planning-state-handoff.md`).
> Every §4 gate of the implementation prompt has actually run on the final tree;
> receipts are listed in §5. Deviations are recorded in
> `docs/contradictions-and-gaps.md` (Phase 3 implementation deviations section).
> The repository wins over this document on any conflict.

## 1. What was implemented (per slice)

1. **Leaderboard domain** — `src/server/leaderboard/constants.ts` (PROVISIONAL
   thresholds + `>= 1` invariant + limit schema), `service.ts` (dense-rank window
   SQL over raw facts; MISSED derived by LEFT-JOIN absence; today/yesterday
   completed-only; week/month finalized-day frozen penalties + today completed-only;
   `completedDays` qualification; viewer rank extracted at ANY position; lazy
   finalization before week/month reads; deterministic `ORDER BY rank, user_id`),
   `handlers.ts` (4 GETs, `?limit=` dense cutoff validation, chained registration).
2. **Settlement domain** — `src/server/puzzle/settlement.ts` (`finalizeExpired`
   FOR UPDATE SKIP LOCKED sweep with per-row error isolation, `activateToday` under
   the puzzle lock with lazy-activation guards, `runSettlement` orchestration,
   fail-closed missing-puzzle marker) + `scheduled-entry.ts` (portable cron shell).
3. **Cron wiring** — `scripts/patch-worker-scheduled.ts` (esbuild bundle →
   `.svelte-kit/cloudflare/_settlement.js`; idempotent import/export append) + vite
   `closeBundle` plugin (after sveltekit, so every `bun run build` ships the cron
   handler). Verified: the final `_worker.js` contains exactly one
   `export { scheduled }`.
4. **API wiring** — `src/server/routes.ts`: `requireAuth` on `/api/leaderboard/*` +
   chained `registerLeaderboardRoutes` (AppType/RPC schema preserved).
5. **Client** — `src/lib/shared/api/leaderboard.ts` (`['leaderboard', period]` keys),
   `src/lib/features/leaderboard/{rank-row,position-callout}.svelte` (real reuse
   between `/leaderboard` and `/play`), `position-copy.ts` + `leaderboard-format.ts`.
6. **`/leaderboard` page** — shadcn Tabs (added via CLI; bits-ui 2.16.3), per-period
   TanStack queries, current-user highlight via `['me']`, pinned viewer position
   callout, unqualified callout (server facts only), skeleton/error/empty states,
   mobile + dark/light.
7. **`/play` result block** — COMPLETED → `Current position: #N` + "Position may
   change as others finish today" + "View leaderboard" (navigates to the Today tab);
   hidden silently on fetch failure/unranked; FAILED/FORFEITED → penalty line, never
   a position.
8. **Tests** — U1–U6 unit, I1–I16 integration (live Neon), E1–E10 (Playwright).
9. **CI** — `unit-and-build` gained the schema-purity diff step + the patched-worker
   assertion; no new jobs.

## 2. Verification receipts (final tree; each actually ran)

| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | OK (574 packages; bits-ui added) |
| `bun run lint` | clean |
| `bun run check` | 0 errors / 0 warnings |
| `bun run test:unit` | 159 passed / 55 skipped (DB-gated integration) |
| `bun run build` | ✔ done + `[patch-worker-scheduled] patched …/_worker.js` |
| `bun run types:check` | up to date (hermetic: `.env`/`.dev.vars` absent — see deviations) |
| `bun run verify:bundle` | bundle secrecy OK (115 files scanned) |
| `bun run auth:check` | auth schema parity OK |
| `bun run word-list` + `bun run avatar-list` | byte-identical (diff gates empty) |
| `git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` | EMPTY (schema purity) |
| `bun run test:integration` | 55 passed (7 files) on live Neon — incl. I1–I16 + untouched NG9 lock-order/lazy-activation suites |
| `bun run test:e2e` | 23 passed — E1..E10 + all existing specs |
| `bunx wrangler deploy --dry-run` | ✔ (worker + assets; exits normally) |
| `grep -q "export { scheduled }" .svelte-kit/cloudflare/_worker.js` | OK |
| `git diff --exit-code -- src/lib/shared/data/valid-guesses.json src/server/data/valid-guesses.generated.ts src/lib/shared/config/avatar-emojis.generated.ts` | EMPTY |

GitHub Actions CI (unit-and-build / integration / e2e) runs on the pushed branch —
see the Actions tab for the post-commit runs.

## 3. Open product decisions (unchanged — NOT resolved by this implementation)

- **P1** — weekly/monthly qualification thresholds: PROVISIONAL values (3 / 8) in
  `src/server/leaderboard/constants.ts`, marked ⚠ PROVISIONAL; must be confirmed
  before Phase-6 deployment.
- **P2** — MISSED penalty for days before a player joined: spec-literal uniform
  penalty implemented (no join-date carve-out).
- **P3** — missing-puzzle alert channel: log-only (`[settlement] missing puzzle
  for date=YYYY-MM-DD`); notification infra deferred to Phase 6.
- **P4** — average-guesses display precision: 2 decimals, display-only
  (`formatAverageGuesses`).
- **P5** — `?limit=` guardrail cap: 50; dense cutoff default 10.
- **P6** — result-block copy: wording free, meaning fixed ("position may change").

## 4. Known follow-ups / operator notes

- `wrangler dev --test-scheduled` + `POST /__scheduled?cron=0+16+*+*+*` is the local
  cron smoke (documented, NOT in CI — plan §12). The settlement domain is covered
  by integration I4/I5/I15 + runSettlement.
- The `_settlement.js` chunk contains no answer material (U5) and no secrets.
- The leaderboard reads reconcile expired days lazily (week/month); today/yesterday
  never finalize.

## 5. New HEAD

See the git log after the final commits (implementation commits are on `main`;
the exact new HEAD is reported in the implementation chat summary).