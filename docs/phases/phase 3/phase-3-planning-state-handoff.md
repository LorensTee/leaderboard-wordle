# Phase 3 — Planning and State Transfer Handoff

> **Status: PLANNING COMPLETE — implementation NOT started.** This document transfers the
> exact current repository state and every Phase-3 planning decision to a separate
> implementation chat. The authoritative plan is `docs/phases/phase 3/phase-3-plan.md`;
> the implementation chat should be started with
> `docs/phases/phase 3/phase-3-implementation-prompt.md`.
>
> Planning pass performed read-only on 2026-08-27 against the actual repository. No
> implementation code was written, no schema was changed, no tests were modified.

## 1. Final repository identity (verified this pass)

| Item | Value |
|---|---|
| Repository | `https://github.com/LorensTee/leaderboard-wordle` |
| Branch | `main` (up to date with `origin/main`) |
| **Exact HEAD** | `1d9186519b6bf62c3c07cb375db3c8686b4c5475` — `fix(ui): polish Phase 1+2 game screen composition (make-ui-not-ai)` (2026-08-27 01:24 +0800) |
| Working tree | Clean except: user's IDE file `.idea/material_theme_project_new.xml` (modified, pre-existing) and untracked `docs/phases/phase 3/` (this planning package) |
| Recent history | `1d91865` (HEAD) · `0c7e4ad` docs path fixes · `63dc93c` phase-2 final handoff docs · `afd3f91` admin bootstrap fix · `38c158a` (Phase-2 handoff documented HEAD) |
| Phase | Post-Phase-2, pre-Phase-3. Leaderboard page is the intentional Phase-3 placeholder with real guards. |

## 2. What was verified in this planning pass

- `git status` / `git log -10` / `git branch --show-current` — state above.
- Full source inspection: `Architecture-v3.md`, `Specifications-v1.md`,
  `docs/contradictions-and-gaps.md` (all sections incl. Phase 0/1/2 resolution tables),
  `docs/phases/phase 2/phase-2-implementation-handoff-final.md` (CURRENT handoff; the older
  `phase-2-implementation-handoff.md` is historical).
- Server: `src/server/routes.ts`, `game/{service,handlers,evaluate}.ts`,
  `puzzle/{finalize,manila}.ts`, `db/{schema,client,memo}.ts` + `migrations/0000_init.sql`,
  `middleware/{auth,csrf,request-id,security-headers}.ts`, `lib/errors.ts`,
  `profile/{service,handlers,display-name}.ts`, `auth/auth.ts` (via middleware/handoff docs).
- Frontend: `src/routes/play/*`, `src/routes/leaderboard/*`, `src/routes/+layout.server.ts`,
  `src/hooks.server.ts`, `src/routes/api/[...path]/+server.ts`, `src/lib/app/guards.ts`,
  `src/lib/shared/api/{client,game}.ts`, `src/lib/shared/lib/format-duration.ts`.
- Tooling: `.github/workflows/ci.yml`, `wrangler.toml`, `package.json`, `vitest.config.ts`,
  `playwright.config.ts`, `tests/integration/{helpers,midnight-lock-order}.ts`,
  `tests/e2e/helpers/auth-fixture.ts`.
- Baseline run: `bun run test:unit` → **121 passed / 35 skipped** (skips = integration
  suites without `DATABASE_URL`; identical count to the Phase-2 handoff baseline).

### 2.1 NOT re-verified this pass (honesty)

- No integration (Neon) or E2E run (requires live `DATABASE_URL` / preview server + secrets;
  the last documented green state is GitHub Actions **run #16 on `38c158a`** — pre-dating the
  three later commits `63dc93c`/`0c7e4ad`/`1d91865`, which are docs/UI-polish only).
- No GitHub API re-check of CI runs for the current HEAD, no network calls at all.
- No visual inspection of the UI (image tooling unavailable — same limitation as Phase 2).

## 3. Relevant Phase-2 state (as documented by its final handoff, `63dc93c`)

- All Phase-2 work is on `main` since `2fc1be1`; suites at the documented handoff:
  unit 121, integration 35 (live Neon), E2E 15 — all green at `38c158a` (CI run #16).
- API surface (Hono RPC = wire source of truth): `POST /api/game/start`,
  `GET /api/game/current`, `POST /api/game/:gameId/guess`, `GET /api/me`,
  `PATCH /api/me/profile`, Better Auth at `/api/auth/*`.
- Auth: Better Auth only; Hono `authContext` independent of `event.locals`; `requireAuth`
  on `/api/game/*` `/api/me/*` `/api/admin/*`; NG18 promote-only admin bootstrap
  (case-insensitive email compare); CSRF fail-closed on unsafe JSON mutations.
- Schema: **unchanged since Phase 0** (`0000_init` only); `auth:check` parity gate green.
- Guards: `/play` `/profile` `/leaderboard` `/admin` SSR-require onboarding; `/admin` role-guards.
- Shell: header tabs Play | Leaderboard | Profile (+ Admin); theme system (light/dark →
  `localStorage['theme']` + `data-theme` attr, Tailwind v4 `@custom-variant dark`); shadcn
  Button/Input/Badge in use; TanStack Query `['me']`; no optimistic mutations.

## 4. Decisions made during Phase-3 planning (each is binding for the implementation chat)

| # | Decision | Where documented |
|---|---|---|
| D1 | **No schema migration.** All needed columns already exist; schema-purity diff gate stays mandatory. | plan §10.1 |
| D2 | **No ranking table.** Ranking via SQL window functions (`DENSE_RANK`) over raw facts. | plan §2 |
| D3 | **MISSED derived by LEFT JOIN absence** — no fake game rows, raw model untouched. | plan §4 |
| D4 | **Day-set semantics** (§3 of the plan): finalized days frozen/penalty-contributing; today completed-only; FAILED/FORFEITED/MISSED ignored until finalization; zero-completion days excluded. Week = ISO Monday (`WEEK_START = MONDAY`) through today; month = `date_trunc('month')` through today; boundaries in Asia/Manila from `transaction_timestamp()`. | plan §3 |
| D5 | **Tiebreaker day set** = "the same day set used for the score average" (spec-literal over NG12 wording), so today's completion participates for players whose average includes today. | plan §2.2 |
| D6 | **Rank order/display separation** (NG14/M2): `user_id` only in final display ORDER BY, never in the window. Dense ranks; ties share rank; `rank <= limit` dense cutoff (default 10, max 50). | plan §2, §8 |
| D7 | **Qualification** = `completedDays >= threshold` over finalized eligible days only; constants live in `src/server/leaderboard/constants.ts` with names above; **values PROVISIONAL** (product decision P1). | plan §5 |
| D8 | **Settlement domain** in `src/server/puzzle/settlement.ts` (`finalizeExpired` + `activateToday` + `runSettlement`); **cron wiring via post-build worker patch** (`scripts/patch-worker-scheduled.ts` + vite `closeBundle` hook) because `@sveltejs/adapter-cloudflare@7.2.9` has no entrypoint and its template exports only `fetch` (verified in `node_modules` this pass). | plan §7.3 |
| D9 | **Lazy finalization** = read-path reconciliation (`finalizeExpired()` before Week/Month aggregation) in its own transactions; never inside the read transaction; bounded acceptance of the tiny unreconciled window (excluded-day, self-healing). | plan §7.1, §8.2 |
| D10 | **Lock discipline preserved**: puzzle row first, `transaction_timestamp()` anchor, no `clock_timestamp()`; sweep uses `FOR UPDATE SKIP LOCKED` + existing idempotent `finalizePuzzle`. Existing NG9 A/B tests untouched. | plan §6 |
| D11 | **API**: exactly four GET endpoints `/api/leaderboard/{today,yesterday,week,month}`, `?limit=` dense cutoff, viewer rank inline (`currentUser`), `requireAuth` on `/api/leaderboard/*`, onboarding NOT enforced at API level. Registration uses the phase-2 chaining pattern. | plan §8 |
| D12 | **No `/api/game/history`, no `/api/stats`, no manual settlement/activation endpoint, no leaderboard-`me` endpoint.** Result position rides the today-board response. | plan §1.1, §8.4 |
| D13 | **Result screen**: COMPLETED → `Current position: #N` + "may change" caption + "View leaderboard" (Today default); FAILED/FORFEITED → penalty-line notice, no position. Block hides silently on fetch failure. | plan §9.2 |
| D14 | **Leaderboard UI**: shadcn Tabs; TanStack keys `['leaderboard', period]`; row + position-callout extracted to `src/lib/features/leaderboard/` (real reuse across `/play` and `/leaderboard`; FSD extraction rule satisfied); fallback shared/ui + recorded deviation if the implementer disagrees. | plan §9.3 |
| D15 | **Missing-puzzle alert** = fail-closed + structured `console.error` marker; notification infrastructure explicitly deferred (no invented infra). | plan §7.2 |
| D16 | **No new indexes** — justified from the actual query shapes (§10.2 of the plan). | plan §10.2 |
| D17 | **CI**: extend the existing three jobs in place — add schema-purity step + patched-worker assertion to `unit-and-build`; new unit/integration/e2e files are picked up automatically. `wrangler dev --test-scheduled` documented for local/operator use, not CI. | plan §12 |

## 5. Contradictions/ gaps resolved by this planning pass

- NG11 (dense-rank cutoff + count), NG12 (earliest-qualifying-completion day set), NG13
  (viewer rank outside top-N), NG14/M2 (rank vs display key separation), M1 (Monday week
  start) — all converted from "open items" to concrete implemented-by-this-plan semantics.
- NC1 (MISSED derived) — satisfied structurally by the LEFT-JOIN derivation; no placeholder rows.
- No previously-open item is blocking Phase 3. All Phase-3 decisions are recorded in §4 and in
  the new "Phase 3 planning resolutions" section appended to `docs/contradictions-and-gaps.md`.

## 6. Open questions that genuinely remain (product decisions, not technical)

1. **P1 — weekly/monthly qualification thresholds** (absolute completed days). Provisional
   values are compiled in `src/server/leaderboard/constants.ts` with explicit PROVISIONAL
   markers; must be confirmed by the product owner before Phase-6 deployment.
2. **P2 — penalty for days before a player joined/onboarded.** Plan default: spec-literal
   uniform MISSED penalty (no row ⇒ penalty) for every finalized eligible day, including
   pre-join days. A join-date carve-out would require a product decision and a rule change.
3. **P3 — missing-puzzle alert channel.** Phase 3 ships log-only alerting (fail-closed
   already implemented); email/webhook notification is a Phase-6 ops decision.
4. **P4 — average-guesses display precision** (plan default: 2 decimals, display-only).
5. **P5/P6** — `?limit=` cap (50) and result-block copy (meaning fixed, wording free).

## 7. Files / components / services expected to change (Phase 3)

**New (server):**
- `src/server/leaderboard/constants.ts` — thresholds (PROVISIONAL), week start, cutoff, limit cap.
- `src/server/leaderboard/service.ts` — day-frame aggregation SQL + viewer-rank extraction
  (+ lazy finalization call for week/month).
- `src/server/leaderboard/handlers.ts` — 4 GET routes, chained registration, `limit` validator.
- `src/server/puzzle/settlement.ts` — `finalizeExpired` / `activateToday` / `runSettlement`.
- `src/server/puzzle/scheduled-entry.ts` — the `scheduled` export source (platform shell).
- `scripts/patch-worker-scheduled.ts` — esbuild chunk + `_worker.js` append (idempotent).

**Modified (server/wiring):**
- `src/server/routes.ts` — `requireAuth` on `/api/leaderboard/*`; chained
  `registerLeaderboardRoutes` (after profile routes).
- `vite.config.ts` — `closeBundle` hook running the worker patch.

**New (client):**
- `src/lib/shared/api/leaderboard.ts` — typed RPC client (game/me pattern).
- `src/lib/features/leaderboard/rank-row.svelte`, `position-callout.svelte`.

**Modified (client):**
- `src/routes/leaderboard/+page.svelte` — real leaderboard (tabs, rows, highlight, viewer
  callout, empty/error/loading). `+page.server.ts` guard stays.
- `src/routes/play/+page.svelte` — terminal result block (position/penalty/navigation).
- `src/lib/components/ui/tabs/…` — added via shadcn CLI, if Tabs is chosen (D14).

**Tests:**
- `tests/unit/leaderboard-routes.test.ts`, `leaderboard-constants.test.ts`,
  `leaderboard-aggregation.test.ts` (if pure helpers exist), `settlement.test.ts`,
  `worker-patch.test.ts`, `leaderboard-ui-format.test.ts`.
- `tests/integration/leaderboard.test.ts`, `settlement.test.ts` (I1–I16 of the plan).
- `tests/e2e/leaderboard.spec.ts`; result-position addition to `tests/e2e/game-flow.spec.ts`.

**CI:** `.github/workflows/ci.yml` — two new steps in `unit-and-build` (schema-purity diff,
patched-worker assertion). No new jobs.

**Docs:** this package + the "Phase 3 planning resolutions" section in
`docs/contradictions-and-gaps.md`; any implementation-time deviation recorded there too.

**Not changing:** `wrangler.toml` (cron declaration already present), `src/server/db/*`
(schema/migrations), `src/server/auth/*`, `src/server/middleware/*`, the bridge
(`src/routes/api/[...path]/+server.ts`), `src/server/game/*` logic, `src/server/profile/*`,
Phase-1/2 UI beyond the play-page result block, all existing tests.

## 8. Test matrix (summary — details in plan §11)

- **Unit (DB-free)**: response shaping/dense-rank pass-through (fake services, `app.request`);
  constants invariants; pure aggregation helpers; settlement orchestration with injected
  deps (order, missing-alert, error isolation, idempotency); worker-patch output
  (import/export appended once, no answer material); result-block mapping.
- **Integration (live Neon — the real semantic gate)**: finalization + idempotency +
  zero-completion NULLs; activation + missing-puzzle fail-closed; sweep reconciliation;
  today/yesterday/week/month boards incl. completed-only current day, frozen penalties for
  FAILED/FORFEITED/MISSED, ties/dense ranks > 10 at cutoff, viewer rank any position;
  qualification edges; tiebreaker determinism incl. today-participation; lazy finalization;
  midnight-boundary fixture; raw-facts retention; existing NG9 A/B lock-order suite preserved.
- **E2E (Playwright)**: navigation + four tabs; guards; seeded today board order/ties;
  current-user highlight; result → position (real game flow); result → leaderboard link;
  FAILED penalty line; empty states; unqualified-week scene; mobile 390×844; light/dark.

## 9. Verification gates (implementation chat must pass all)

```text
bun install --frozen-lockfile
bun run lint
bun run check               (0 errors)
bun run test:unit           (all, incl. new U1–U6)
bun run build               (must emit the patched worker — asserted in CI step)
bun run types:check         (hermetic clean-checkout condition)
bun run verify:bundle       (answer secrecy unaffected)
bun run auth:check          (unchanged)
bun run word-list && bun run avatar-list   (byte-identical)
git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations   (EMPTY)
bun run test:integration    (live non-prod Neon; incl. I1–I16)
bun run test:e2e            (incl. E1–E10)
bunx wrangler deploy --dry-run
grep -q "export { scheduled }" .svelte-kit/cloudflare/_worker.js   (patched-worker proof)
GitHub Actions: unit-and-build + integration + e2e all green
```

## 10. Planning-verdict pointer

Full verdict (READY, blocking issues none, resolved decisions, remaining product decisions
P1–P6, implementation slices, verification gates) is the `PHASE 3 PLANNING STATUS` block at
the end of `docs/phases/phase 3/phase-3-plan.md` (§15).