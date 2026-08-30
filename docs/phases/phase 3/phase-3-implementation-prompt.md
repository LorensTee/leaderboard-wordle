# Phase 3 — Implementation Prompt (standalone start prompt for a NEW chat)

> Copy everything below the line into the first message of the Phase-3 implementation chat.
> The chat must work from the **actual repository**; the plan and handoff documents are
> authoritative companions — the repository wins on any conflict. Do not re-plan; execute the
> plan. All plan decisions (D1–D17) are binding unless the repository or a newer recorded
> decision supersedes them.

---

You are implementing **Phase 3 — Leaderboard / History / Settlement** of the Leaderboard
Wordle project.

**Repository:** `https://github.com/LorensTee/leaderboard-wordle`
**Local path:** `/home/greant/WebstormProjects/leaderboard-wordle`
**Branch:** `main`. Baseline HEAD: `1d9186519b6bf62c3c07cb375db3c8686b4c5475` (Post-Phase-2,
pre-Phase-3; the leaderboard page is the intentional Phase-3 placeholder).

## 1. Read these first (in order)

1. `docs/phases/phase 3/phase-3-plan.md` — the AUTHORITATIVE implementation plan. Its §15
   verdict block lists the resolved decisions, remaining product decisions, slices, and gates.
2. `docs/phases/phase 3/phase-3-planning-state-handoff.md` — exact repository state (HEAD,
   verified facts, decisions D1–D17, files to change, verification gates).
3. `Architecture-v3.md` §Settlement, §Ranking model, §Core API shape, §Concurrency,
   §Expiry deadline contract, §Phase 3.
4. `Specifications-v1.md` §10–§13 (result states, penalty, leaderboards, result screen).
5. `docs/contradictions-and-gaps.md` — especially the Phase-3 planning resolutions section
   and the "Frontend/recorded-deviation" rule: any deviation from the plan MUST be recorded
   there before proceeding.
6. The current `src/server/game/service.ts`, `src/server/puzzle/finalize.ts`,
   `src/server/puzzle/manila.ts`, `src/server/routes.ts`, `src/server/profile/handlers.ts`
   (chaining pattern), `src/routes/play/+page.svelte`, `src/routes/leaderboard/+page.svelte`,
   `tests/integration/midnight-lock-order.test.ts`, `tests/e2e/helpers/auth-fixture.ts`,
   `.github/workflows/ci.yml`.

## 2. Mission

Implement, in this order, using TDD (write the failing test first at each slice):

1. **Leaderboard domain**: `src/server/leaderboard/constants.ts` (thresholds marked
   PROVISIONAL — do NOT treat the provisional numbers as final product values), `service.ts`
   (day-frame SQL aggregation per plan §2–§4, §10.4; viewer-rank extraction; lazy
   finalization call for week/month per plan §7.1/D9), `handlers.ts` (4 GET routes:
   `/api/leaderboard/today|yesterday|week|month`, `?limit=` dense-rank cutoff, NG21 errors,
   chained registration exactly like `registerProfileRoutes`).
2. **Settlement domain**: `src/server/puzzle/settlement.ts` (`finalizeExpired` with
   `FOR UPDATE SKIP LOCKED`, `activateToday`, `runSettlement`; missing puzzle ⇒ fail-closed +
   structured `console.error` marker — no fabricated puzzle, no notification infra) and
   `src/server/puzzle/scheduled-entry.ts` (platform shell exporting `scheduled`).
3. **Cron wiring**: `scripts/patch-worker-scheduled.ts` (esbuild-bundle the entry to
   `.svelte-kit/cloudflare/_settlement.js`; append `import { scheduled } from "./_settlement.js";
   export { scheduled };` to `.svelte-kit/cloudflare/_worker.js` — idempotent) + vite
   `closeBundle` hook in `vite.config.ts` so every `bun run build` emits the patched worker.
4. **API wiring**: `src/server/routes.ts` — `requireAuth` on `/api/leaderboard/*` + chained
   `registerLeaderboardRoutes`.
5. **Client**: `src/lib/shared/api/leaderboard.ts` (typed RPC client); FSD feature
   `src/lib/features/leaderboard/{rank-row,position-callout}.svelte` (real reuse between
   `/leaderboard` and `/play` — plan §9.3); rebuild the `/leaderboard` page (shadcn `Tabs`
   add via CLI; TanStack keys `['leaderboard', period]`; current-user highlight via `['me']`;
   viewer callout for rank-outside-top-10 and unqualified states; loading/error/empty per the
   plan; mobile + dark/light per existing conventions); terminal result block on `/play`
   (COMPLETED ⇒ `Current position: #N` + "may change" caption + "View leaderboard"
   navigation; FAILED/FORFEITED ⇒ penalty line, NO position; block hides silently on error).
6. **Tests**: plan §11 matrix — U1–U6 (unit), I1–I16 (integration against the live
   non-production Neon `DATABASE_URL`; fixtures derive dates from the DB clock in SQL), E1–E10
   (Playwright with the deterministic auth fixture; seed puzzles/games relative to Manila
   today). Preserve every existing test; never weaken a test to make code pass.
7. **CI**: extend `unit-and-build` with the schema-purity step
   (`git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations`) and the
   patched-worker assertion. No new jobs needed.

## 3. Hard constraints (from the plan; violations are blockers)

- **NO schema migration** — `src/server/db/schema.ts` and `migrations/` must end this phase
  byte-identical to the baseline.
- **NO ranking/leaderboard table** — aggregation is SQL window functions over raw facts.
- **MISSED is derived by LEFT JOIN absence** — never insert fake game rows; raw game data is
  never overwritten; frozen penalty values come from `daily_puzzles` only.
- **Lock order `puzzle row → game row` and the `transaction_timestamp()` eligibility anchor
  are preserved exactly** — never introduce `clock_timestamp()`; never alter
  `submitGuess`/`startGame` semantics; the existing NG9 A/B lock-order tests must stay green
  untouched.
- **No changes to authentication, answer secrecy, the SvelteKit↔Hono bridge, or the Hono
  composition/chaining typing rule.** The answer never appears in any new payload; the
  settlement chunk contains no answer material (asserted by a test).
- **No `/api/game/history`, no `/api/stats`, no manual settlement/activation endpoint.**
- **The UI never owns aggregation semantics** — the server service owns all period/penalty/
  qualification rules.
- **Do not redesign Phase-1/Phase-2 surfaces** beyond the `/play` terminal result block.
- **Do not silently resolve product decisions P1–P6** (plan §13): implement the plan
  defaults, mark PROVISIONAL things PROVISIONAL, and surface the open questions in your final
  handoff note — do not invent final values.

## 4. Verification gates (all must pass before you finish)

`bun install --frozen-lockfile` · `bun run lint` · `bun run check` (0 errors) ·
`bun run test:unit` · `bun run build` · `bun run types:check` (hermetic clean-checkout
condition) · `bun run verify:bundle` · `bun run auth:check` · `bun run word-list` +
`bun run avatar-list` (byte-identical) ·
`git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` (EMPTY) ·
`bun run test:integration` (live Neon; I1–I16 incl. idempotent finalization, forfeiture
conversion, frozen averages, MISSED derivation, qualification, dense ties > 10, viewer rank,
lazy finalization, midnight boundary) · `bun run test:e2e` (E1–E10) ·
`bunx wrangler deploy --dry-run` ·
`grep -q "export { scheduled }" .svelte-kit/cloudflare/_worker.js` (patched-worker proof) ·
full GitHub Actions run green (unit-and-build, integration, e2e).

Optional local cron smoke (not CI): `bun run build && wrangler dev --test-scheduled`, then
`POST /__scheduled?cron=0+16+*+*+*` and observe the settlement log output.

## 5. Finish

Report:
- what was implemented per slice, with the exact test/verification receipts;
- any deviation from the plan, recorded in `docs/contradictions-and-gaps.md` FIRST;
- the remaining open product decisions (P1–P6) unchanged and visible;
- the exact new HEAD after your commits.

Do not claim completion without the §4 gates (every listed command must actually have run and
passed on your final tree).