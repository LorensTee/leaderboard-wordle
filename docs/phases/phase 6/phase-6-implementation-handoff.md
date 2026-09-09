# Phase 6 — Implementation Handoff (Deployment)

Written by the Phase-6 implementation pass from the repository at `main` @
**`780ae15`** (+ this pass's uncommitted changes), per
`docs/phases/phase 6/phase-6-implementation-prompt.md` and the authoritative
plan `docs/phases/phase 6/phase-6-plan.md`.

> **Status — RECONCILED 2026-09-11 (post-provisioning).** The operator (John) has
> since manually performed the production provisioning, deployment, and most
> production verification. **Production is live and working**: the Worker is
> deployed, the Neon Singapore production DB is migrated + seeded (2,315), and
> Google OAuth sign-in/out, both admins, gameplay, security headers, Web
> Analytics (J-A1), and J-A2 telemetry are all verified — see
> **§7 "Current production operator state — September 2026"** for the receipts
> and **§6** for what deliberately remains (CSRF probe, definitive cron
> evidence + idempotency, the ≥ 7-day PH baseline — mostly time-gated, not
> implementation work). The §1–§2 records below describe the implementation
> pass as it ran (BEFORE provisioning); the plan §B
> "Production-provisioning readiness: ⏳ NOT REACHED" read quoted there was
> true only at that time and is now stale.

---

## 1. What this pass changed (planned files only)

| File | Change | Slice |
|---|---|---|
| `src/server/game/handlers.ts` | `[game-guess]` start/done markers redacted: no guess `word`, no `user.id`; now `game=<uuid> requestId=<uuid>` (+ `guess`/`status`/`duration_ms` on done). 15 s timeout untouched. | 2 |
| `src/server/middleware/auth.ts` | `ADMIN_EMAIL` **comma-separated allowlist** (D-ADMINSEP): `parseAdminEmailAllowlist` (trim + lowercase + dedupe + ignore empty), `applyAdminBootstrap` promotes when the verified email matches ANY entry; never demotes; empty → no admin (NG18). | 3 |
| `src/server/telemetry/handlers.ts` (new) | J-A2 beacon: strict `POST /api/telemetry` (zod `.strict()` — `{ endpoint: 'game-current'\|'game-guess', durationMs, status? }`), 401 defense-in-depth, writer seam → `writeLatencyDataPoint` (Analytics Engine `LATENCY` binding, `cf-ipcountry = PH` filter). | 8 |
| `src/server/routes.ts` | `LATENCY?: AnalyticsEngineDatasetBinding` on `HonoBindings`; `.use('/api/telemetry', requireAuth)` + `me`-class rate limiter; `registerTelemetryRoutes` composed last (schema-carrying `S extends Schema` chain, repo convention). | 8 |
| `src/lib/shared/api/game.ts` | Client timing for `GET /api/game/current` + `POST /api/game/:gameId/guess` (`performance.now()`), posted via `navigator.sendBeacon` to `/api/telemetry` (timings only; abort → synthetic `status: 504` so CI-15 timeout frequency is measurable). No wire change to guesses. | 8 |
| `wrangler.toml` | `[[analytics_engine_datasets]]` `LATENCY` → `latency` (operator-created dataset); `[secrets] required` with the six names (defense-in-depth, plan F.1 — enforced at deploy, warning-only in preview). Rate-limit placeholders intentionally UNCHANGED (operator substitutes real IDs — never invented). | 1, 8 |
| `worker-configuration.d.ts` | Regenerated (`wrangler types`): `LATENCY` + the six required secrets; committed with the change; `types:check` byte-identical. | 1 |
| `.github/workflows/deploy.yml` (new) | Plan §K.2 verbatim: `workflow_dispatch` (`ref` hard-enforced `main`), exact checked-out SHA = dispatch-time main SHA = green `ci.yml` run (`head_sha` on the workflow-specific endpoint, `actions: read`), build + patched-worker + `verify:bundle`, placeholder gate, credential gate, **pre-deploy** `wrangler secret list` name gate, `wrangler deploy --dry-run`, deploy, post-deploy secret receipt, smoke (`PRODUCTION_URL/` 200 + `/api/game/current` 401 + nosniff). Permissions `contents: read` + `actions: read`, no write. | 4 |
| `docs/contradictions-and-gaps.md` | Records added (recorded FIRST, Phase-4 discipline): D-ADMINSEP (`,`), CI-15 production assessment + redaction decision, J-A2 addition + contract, `[secrets] required` adoption, deploy-workflow facts. | all |
| `tests/unit/admin-allowlist.test.ts` (new) | 12 tests: parser (empty/single/two/mixed-case/whitespace/dedupe) + bootstrap (any-entry promote, both addresses, case-insensitive, non-match, empty, never-demote). | 3 |
| `tests/unit/telemetry.test.ts` (new) | 12 tests: 401 without auth, CSRF 403, 202 + writer called, extra-field/guess-word rejection (writer never called), string body rejected, invalid endpoint, non-numeric duration, out-of-range status, PH-write / JP-drop / no-header-drop / no-binding no-op. | 8 |
| `docs/phases/phase 6/phase-6-runbook.md` (new) | Operator runbook: pre-deploy checklist (Neon migrate+seed receipts, namespaces, first-bootstrap §I.3, secrets, OAuth, GitHub creds, dataset), deploy paths, broken-deploy detection table, rollback/recovery (wrangler rollback, secrets are environment-level), latency evidence gate, cron verification + "Run now" idempotency procedure, incident template. | 9 |

**Untouched (verified byte-identical/empty diff)**: `.github/workflows/ci.yml`
(N13), `src/server/db/schema.ts` + `src/server/db/migrations/` (N4, zero NEW
migrations), `package.json`/`bun.lock` (no new dependencies — P12), CSP/
headers, `vite.config.ts`, seed tooling, `.github/dependabot.yml`.

Pre-existing worktree noise (`.idea/material_theme_project_new.xml`,
`game-flow-authenticated-ga-5f333--rendered-NO-position-block-app/`) left
untouched/untracked per the prompt.

---

## 2. Verification receipts (actually run in this pass)

| Gate | Command | Result |
|---|---|---|
| Unit tests (incl. new 12+12) | `bun run test:unit` | **284 passed / 98 integration skipped** (36 files) — `telemetry.test.ts` 12 ✓, `admin-allowlist.test.ts` 12 ✓ |
| Typecheck | `bun run check` | **0 errors, 0 warnings** |
| Lint | `bun run lint` | clean |
| Build | `bun run build` | OK (adapter-cloudflare output) |
| Patched-worker assertion (N2) | `grep -q "export { scheduled }" .svelte-kit/cloudflare/_worker.js` | found |
| Schema purity (N4) | `git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` | empty |
| Wrangler types sync | `bun run types:check` | up to date (byte-identical) |
| Bundle secrecy (N3) | `bun run verify:bundle` | **bundle secrecy OK: 0 non-public pool words** (120 build files; dev-secret advisory is the pre-existing runtime-conditional fallback) |
| ci.yml untouched (N13) | `git diff --exit-code -- .github/workflows/ci.yml` | **empty — byte-identical** |
| Marker redaction (N12 server-side) | `grep -rn "word=" src/ \| grep game-guess` | none; markers carry only `game`/`requestId`/`guess`/`status`/`duration_ms` |
| deploy.yml structure | YAML parse (yaml pkg) | 15 steps exactly per §K.2; permissions `contents: read` + `actions: read` |
| Binding validation (Gate 6 local equivalent) | `npx wrangler deploy --dry-run` | **all bindings resolve**: `env.LATENCY` (Analytics Engine) + `AUTH/GAME/ME/ADMIN_RATE_LIMITER` + `ASSETS` |
| Diff review (N14) | manual review of the full diff (`git diff --check` clean) | one issue found + fixed: the client beacon fired TWICE on error responses (success-path beacon before the throw + catch-path beacon) → moved the success beacon after the `ok` check so each request posts exactly one sample; re-ran `check` + `test:unit` green after the fix |
| Placeholder state (N5 — deployment-time) | `grep '00000000-' wrangler.toml` | placeholders still present **by design** (operator substitutes real namespace ids before any deploy; deploy.yml Gate 3 fails loudly meanwhile) |

**Not run locally (environment lacks the prerequisite, covered by CI/deployed
state)**: integration suite (needs Postgres; docker + local postgres unavailable
in this sandbox — CI-7 ephemeral-postgres job covers it on push), e2e suite,
and every deployed-state gate (N5 serverside substitution, N6 secret list, N7
prod DB, N8–N11).

---

## 3. A-goal status (reconciled 2026-09-11 — receipts in §7)

| Goal | Status | Evidence |
|---|---|---|
| 1. Deployed | ✅ **COMPLETE** | Worker `leaderboard-wordle` live at `https://leaderboard-wordle.leaderboardwordle.workers.dev`; controlled deploy workflow green (one earlier attempt failed transiently at the Gate 5 `wrangler secret list` call — Cloudflare 503 upstream error, before any deploy — and was rerun, §7.C); smoke green: `/` 200 + `/api/game/current` 401 `UNAUTHORIZED` envelope + nosniff (§7.D; smoke 401 handling fixed in `5111e82`). Deployed version id not recorded in repository docs — obtain from `wrangler deployments list` when needed (never invent one). |
| 2. Migrated + Seeded | ✅ **COMPLETE** | Neon `production` branch (Singapore; project `leaderboardwordle`, id `tiny-haze-64643097`), intentionally wiped, then migrated with the **existing** `0000_init` → `migrations applied successfully (programmatic)`; `drizzle.__drizzle_migrations` row `id=1`, `hash=344afde9…`, `created_at=1787492127258` (matches the repo journal's `when` exactly); `SELECT COUNT(*) FROM answer_dictionary` = **2,315** (§7.A). Zero NEW migrations (invariant preserved). |
| 3. Verified (origin/CSRF/OIDC) | 🟡 **MOSTLY COMPLETE** | Google OAuth sign-in works (after `redirect_uri_mismatch` was fixed operator-side, §7.E); login/signup/sign-in redirect/session persistence ✅ (§7.F–G); **both** admin addresses show the Admin tab ✅ (§7.H); sign-out ✅ (§7.I); security headers observed over HTTPS ✅ (§7.D). REMAINING: one explicit CSRF negative probe (cross-origin-style mutation → expected `403`, §6.1) + one final clean header-contract receipt command (§6.4). |
| 4. Measured | ⏳ **PENDING (intentionally time-gated)** | Instruments live and verified: J-A1 Web Analytics receiving data (dashboard showed `1 visit` — collection proof, not baseline, §7.K) and J-A2 `POST /api/telemetry` observed in the live tail (§7.L). Baseline = **≥ 7 consecutive production days** of PH-filtered P50/P75/P95 + sample counts from BOTH sources (§6.5). Optimization only when the J evidence gate fires — not before. |
| 5. Cron verified | ⏳ **PENDING DEFINITIVE EVIDENCE** | Schedule unchanged `0 16 * * *`; patched-worker assertion green. The FIRST rollover was **not** definitively proven (tail disconnect before midnight; no 2026-09-08 puzzle existed to finalize; `startGame()` lazy activation confound — §7.M). The NEXT scheduled rollover is the clean production proof (§6.2–6.3). |

---

## 4. N-gate status (reconciled 2026-09-11)

N1 (CI green on deployed HEAD) — ✅ the deployed SHA passed the deploy workflow's
Gate 2 (a green `ci.yml` push run for the exact SHA) [operator receipt]. N2, N3,
N4, N12 (server-side), N13, N14 — **green** (§2, unchanged). **N5 — ✅** real
namespace ids `1001`–`1005` committed (`8df0f74`; placeholder policy dropped
`d94628e`, S1k-D). **N6 — ✅** six Worker secret NAMES verified pre- and
post-deploy by the deploy workflow (values never in GitHub; the one transient
503 on an earlier attempt is described in §7.C). **N7 — ✅** migrate + seed
receipts (§7.A). **N8 — ✅** deployed smoke green (§7.D). **N9 — ✅** real
Google OIDC round-trip + BOTH admin emails verified (§7.E–H). **N10 — ⏳** first
rollover not definitive; next scheduled run + idempotency (§6.2–6.3).
**N11 — ⏳** ≥ 7-day PH baseline (§6.5).

---

## 5. Decisions recorded (see `docs/contradictions-and-gaps.md`)

D-ADMINSEP = **comma**; CI-15 production assessment (server may commit after
client abort; retries non-idempotent ≤1 extra attempt; 15 s stays; duplicate-
word guard deferred D-GUARD); J-A2 contract (endpoint/shape/PH filter/me class/
202/504-synthetic); `[secrets] required` adopted (worker-configuration.d.ts
regenerated); deploy.yml facts. Deferred (unchanged): D-ORIGIN, D-AUTODEPLOY,
D-ALERT, D-TARGET, D-LIMITS, D-JA2KEEP, visual review (not a Phase-6 gate).

---

## 6. What remains (Phase-6 completion checklist — current)

Everything below is operator verification/observation; **no repository code
change is required or permitted for these** (do not weaken or modify the
CSRF/cron/telemetry implementations to make a test easier). Statuses use the
operator prompt's terminology.

1. **Explicit CSRF same-origin verification (A-goal 3 residue)** — one
   deliberately invalid cross-origin-style mutation attempt against production
   that demonstrates the server rejects it, expected `HTTP 403` (fail-closed
   NG4 rejection; the code already implements the contract). Example probe
   shape (record the full response as the receipt):
   `curl -i -X POST https://leaderboard-wordle.leaderboardwordle.workers.dev/api/game/start -H 'Content-Type: application/json' -H 'Origin: https://attacker.example' -d '{}'`.
   Do NOT change the CSRF implementation just to create the test.
   **Status: PENDING OPERATOR VERIFICATION.**
2. **Definitive cron evidence (A-goal 5)** — at the NEXT scheduled rollover:
   keep `npx wrangler tail leaderboard-wordle` running before midnight; watch
   specifically for `[settlement] run complete`; record the report fields
   `finalized`, `forfeitedCount`, `completedCount`, `activatedToday`,
   `alreadyActive`, `missingToday`; then verify the resulting `daily_puzzles`
   state (yesterday FINALIZED exactly once, today ACTIVE). Do not modify the
   cron schedule simply for testing. **Status: PENDING** (first rollover was
   not definitive — §7.M).
3. **Cron idempotency evidence (A-goal 5)** — with the next run: no duplicate
   finalization, consistent `activatedToday`/`alreadyActive`. The available
   Cloudflare dashboard does NOT expose a usable cron execution history /
   "Run now" control — do not keep directing the operator to a nonexistent
   dashboard feature. If no safe second invocation is available, document that
   limitation and rely on the idempotent implementation + the integration
   lock-order tests + consecutive scheduled observations. Do NOT invent an
   artificial cron endpoint. **Status: PENDING.**
4. **Security-header contract receipt (A-goal 3 residue)** — the headers were
   already observed manually (§7.D: HTTPS, HSTS, CSP, nosniff, XFO DENY,
   Referrer-Policy); record ONE clean final receipt covering the complete
   expected contract, e.g.
   `curl -sI https://leaderboard-wordle.leaderboardwordle.workers.dev/ | grep -iE 'strict-transport-security|content-security-policy|x-content-type-options|x-frame-options|referrer-policy'`.
   Do NOT introduce new security headers. **Status: PENDING (receipt only).**
5. **Seven-day PH latency baseline (A-goal 4)** — intentionally time-based:
   **≥ 7 consecutive production days** with J-A1 (Cloudflare Web Analytics,
   PH-filtered page-load/Core Web Vitals) and J-A2 (game-API timings from
   `/api/telemetry`, PH-filtered in Analytics Engine). For EACH day record
   P50, P75, P95, and sample count for BOTH sources. Do NOT start performance
   optimization before the J evidence gate fires. The current Web Analytics
   `1 visit` and the observed `POST /api/telemetry` requests prove the
   instruments work — they are NOT the baseline. **Status: PENDING
   (time-gated).**
6. **Keep this handoff current** — append each new receipt (CSRF probe, cron
   log + DB state, idempotency observation, daily baseline rows) and mark
   Phase 6 complete only after all five A-goals are evidenced.

---

## 7. Current production operator state — September 2026

Recorded 2026-09-11 from the operator's (John's) manual production work. Every
item below is either an **[operator receipt]** (fact supplied by the operator)
or **[repo-verified]** (checked against the repository/`git log` in this
reconciliation pass). **A future agent/session must treat this section as the
current baseline — do not re-perform this work.** Secret VALUES are never
recorded here, only names and identifiers the operator designated as safe.

### A. Production Neon database — DONE, VERIFIED

**[operator receipt]**
- Neon project `leaderboardwordle`, project id `tiny-haze-64643097`.
- Production branch: **`production`**, **Singapore** region, created from the
  existing `non-production (CI)` branch as **Branch schema only**.
- The production schema was intentionally wiped before the first production
  migration (`BEGIN; DROP TABLE IF EXISTS drizzle.__drizzle_migrations,
  "guesses", "games", "daily_puzzles", "answer_dictionary", "session",
  "account", "verification", "user" CASCADE; DROP TYPE IF EXISTS
  "public"."game_status"/"puzzle_status" CASCADE; COMMIT;`).
- Migration: `DATABASE_URL="<production DATABASE_URL>" bun ./scripts/ci-migrate.ts`
  → `migrations applied successfully (programmatic)` (the existing `0000_init`
  — zero NEW migrations; invariant preserved).
- Verified: 8 public tables (`account`, `answer_dictionary`, `daily_puzzles`,
  `games`, `guesses`, `session`, `user`, `verification`);
  `drizzle.__drizzle_migrations` exists with row `id = 1`,
  `hash = 344afde9e4c8d7e2bc29d21bd38813e8ef7d539ca64a04e92b039b1ee9c6e94a`,
  `created_at = 1787492127258`. [repo-verified cross-check] the repo journal
  `src/server/db/migrations/meta/_journal.json` carries the identical `when`
  timestamp.
- Seed: the production answer seed was run; `SELECT COUNT(*) FROM
  answer_dictionary` → **2,315**.
- The local `.env` was NOT changed to production: the production `DATABASE_URL`
  was supplied as a one-off environment override for production commands, and
  the local `.env` remains pointed at non-production. The temporary local
  `.env.production` created for the Worker bootstrap contained production-only
  values, is untracked/gitignored, and must remain outside the repository
  (`git check-ignore` confirms `.env.*` coverage [repo-verified]).

### B. Cloudflare account / Worker — DONE

**[operator receipt]**
- Cloudflare account: `leaderboardwordle`; account id
  `b662a33f5a1de7da983bc0b6fd3325df`; account workers.dev subdomain
  `leaderboardwordle.workers.dev`.
- Production Worker: `leaderboard-wordle`; production origin
  `https://leaderboard-wordle.leaderboardwordle.workers.dev`.
- GitHub deployment configuration (manually added): secrets
  `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (the token is named
  `leaderboard-wordle-github-deploy`, scoped to the account with Workers
  Scripts edit permission and no IP restriction — value never documented);
  repository variable `PRODUCTION_URL=https://leaderboard-wordle.leaderboardwordle.workers.dev`.
- The Worker was bootstrapped manually because the Worker record did not
  previously exist (the first normal version-upload path failed for that
  reason). A temporary local `.env.production` (untracked/gitignored) was
  created for the bootstrap. The bootstrap was initially blocked because
  **Cloudflare Analytics Engine was not enabled**; the operator enabled
  Cloudflare Analytics Engine, then the bootstrap deployment succeeded.
- Worker runtime secret NAMES currently present (do NOT document their
  values): `ADMIN_EMAIL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- The deployed Worker has: Workers Static Assets (`ASSETS`), the `LATENCY`
  Analytics Engine binding, the rate-limit bindings, and the cron trigger
  `0 16 * * *` (midnight Asia/Manila = 16:00 UTC).
- **Rate-limit reconciliation:** the deployed `wrangler.toml` (commit
  `8df0f74`; placeholder policy dropped in `d94628e`) contains **FIVE**
  rate-limit bindings with real namespace ids — `AUTH_RATE_LIMITER` `1001`
  (limit 10/60s), `GAME_RATE_LIMITER` `1002` (30/60s), `ME_RATE_LIMITER`
  `1003` (10/60s), `ADMIN_RATE_LIMITER` `1004` (20/60s),
  `LEADERBOARD_RATE_LIMITER` `1005` (100/60s). These are real production
  namespace ids, NOT placeholders (S1k/S1k-C/S1k-D in the contradictions log).
  Older Phase-6 documentation saying there are only four namespaces or that
  the ids are placeholders is STALE.

### C. Production deployment — DONE (green)

**[operator receipt]**
- The controlled GitHub Actions **Deploy (production)** workflow was
  successfully run; CI/CD was green and the production deployment succeeded.
- One transient Cloudflare API failure occurred during an EARLIER deployment
  attempt: `GET /accounts/***/workers/scripts/leaderboard-wordle/secrets` →
  `503 Service Unavailable` ("upstream connect error or disconnect/reset
  before headers"), at the pre-deploy `wrangler secret list` gate BEFORE
  `wrangler deploy`. The deployment was subsequently rerun successfully.
  **Do NOT treat the old failed run as the current deployment state — the
  later successful deployment is the current production state.**
- Deployed Worker/version id: not recorded in repository documentation —
  obtain from `wrangler deployments list` when a receipt needs it (never
  invent one).

### D. Production smoke / origin verification — DONE

**[operator receipt]**
- Production root `curl -sI https://leaderboard-wordle.leaderboardwordle.workers.dev/`
  → HTTP 200 with the expected security headers, including
  `strict-transport-security`, `content-security-policy`,
  `x-content-type-options: nosniff`, `x-frame-options: DENY`,
  `referrer-policy`.
- Production API `curl -i …/api/game/current` → `HTTP 401` with the expected
  NG21 envelope
  `{"error":{"code":"UNAUTHORIZED","message":"Authentication required","requestId":"…"}}`.
- The deployment smoke test initially INCORRECTLY treated the expected 401 as
  a failure; fixed in commit `5111e82`
  (`fix(deploy): smoke test must accept the expected 401 on /api/game/current`)
  [repo-verified], after which the deployment workflow passed.

### E. Production Google OAuth — DONE

**[operator receipt]**
- Production Google OAuth initially failed with `redirect_uri_mismatch`; the
  actual redirect URI was
  `https://leaderboard-wordle.leaderboardwordle.workers.dev/api/auth/callback/google`.
- The operator added the correct production origin/redirect URI to the Google
  OAuth client; Google OAuth then proceeded successfully. (No repository
  change — operator-side configuration.)

### F. Better Auth / Neon request-lifecycle fix — DONE (code, already in repo)

**[repo-verified]** commits `286a828` + `a45971f`.
- Production OAuth hit a Better Auth internal error caused by cross-request
  Neon I/O reuse: `Failed to parse state` / `Cannot perform I/O on behalf of
  a different request`.
- The repository implementation was fixed to use request-scoped DB lifecycle
  handling (`src/server/db/memo.ts` — AsyncLocalStorage `withDbScope`;
  request-scoped on workerd, warm memo on Node/Bun) and `src/hooks.server.ts`
  wraps requests with `withDbScope`.
- **Do not change this code.**

### G. Production secure Better Auth cookie fix — DONE (code, already in repo)

**[repo-verified]** commit `e0c2fba`.
- After the DB request-lifecycle fix, authentication appeared to bounce back
  to sign-in. Inspection showed production Better Auth uses the
  `__Secure-better-auth.session_token` cookie name, and the application had
  hardcoded the non-secure cookie name in two auth paths.
- Fixed (`fix(auth): detect __Secure- session cookie on both fast paths`): the
  shared predicate now recognizes both secure and non-secure session cookie
  forms.
- After the fix [operator receipt]: login works, signup works, sign-in
  redirects succeed, and the production session persists.

### H. Admin verification — DONE

**[operator receipt]**
- The configured production admin value is
  `tee.johnlor@gmail.com,leaderboardwordle@gmail.com` (comma-separated
  allowlist — D-ADMINSEP; email addresses, not secrets).
- The operator successfully tested BOTH configured admin accounts: both
  display the Admin tab in production. This fulfills the real-world admin
  promotion verification for both configured addresses. (OAuth credentials
  and session information are not documented.)

### I. Sign-out verification — DONE

**[operator receipt]**
- Production sign-out was tested manually and works: the live tail contained
  `POST /api/auth/sign-out - Ok` and the subsequent unauthenticated navigation
  worked.
- **production sign-out = VERIFIED.**

### J. Production gameplay — DONE

**[operator receipt]**
- The production Worker was exercised manually after the date rollover.
  Successful production requests included `/api/game/current`,
  `/api/game/start`, `/api/game/:gameId/guess`,
  `/api/leaderboard/today`, `/api/leaderboard/yesterday`,
  `/api/leaderboard/week`, `/api/leaderboard/month`, `/api/me`,
  `/api/me/profile`.
- Games were started and completed successfully; guess-timing diagnostics
  were observed (live-tail server timing values such as
  `duration_ms=48/359/389/347/468`). **These are diagnostic observations only
  and are NOT the seven-day performance baseline.**

### K. Production Web Analytics (J-A1) — DONE, VERIFIED

**[operator receipt + repo-verified]**
- Cloudflare Web Analytics was manually configured for
  `leaderboard-wordle.leaderboardwordle.workers.dev`. Cloudflare initially
  reported the hostname was not attached as a Cloudflare-managed website and
  therefore required manual JS snippet installation.
- The Cloudflare-provided Web Analytics snippet/token was integrated into
  `src/lib/app/cloudflare-analytics.svelte` (commit `5c2dbaa`) and rendered
  from the root layout. The token is intentionally client-visible (browser
  beacon) — do not treat it like a server secret.
- CSP was updated to allow `https://static.cloudflareinsights.com`
  (script-src) and `https://cloudflareinsights.com` (connect-src) in
  `src/server/middleware/csp.ts` [repo-verified].
- Verification in Brave: initially `net::ERR_BLOCKED_BY_CLIENT` (Brave Shields
  blocked the beacon); with Shields disabled for this site only,
  `beacon.min.js` loaded successfully and Cloudflare Web Analytics began
  receiving data; the Cloudflare dashboard subsequently showed `1 visit`.
- **Web Analytics integration = VERIFIED.** Do NOT treat this as the
  seven-day baseline.

### L. J-A2 game telemetry — instrumentation LIVE, observed

**[operator receipt + repo-verified]**
- The production live tail showed successful `POST /api/telemetry` requests
  after gameplay — the client game-timing beacon is visibly active in
  production.
- The J-A2 implementation already exists in the repo and writes game timing to
  the `LATENCY` Analytics Engine binding while filtering for
  `cf-ipcountry = PH`.
- **Do NOT claim that the seven-day PH P50/P75/P95 baseline is complete yet**
  (§6.5).

### M. Cron status — IMPORTANT NUANCE (not yet definitive)

**[operator receipt]**
- The cron is configured `0 16 * * *` and the first midnight production
  rollover was observed (with `npx wrangler tail leaderboard-wordle` running).
  The tail connection briefly disconnected before midnight
  (`Tail connection lost. Reconnecting`) and successfully reconnected
  (`Reconnected to leaderboard.`), but the live tail did NOT capture a
  `[settlement] run complete` message — **there is no definitive log-level
  proof that the scheduled invocation itself was captured**.
- After midnight the application functioned: game start, guesses, game
  completion all worked; today's puzzle existed and was usable. The production
  database then showed recent puzzle state `2026-09-11 SCHEDULED`,
  `2026-09-10 SCHEDULED`, `2026-09-09 ACTIVE`.
- **Why this is NOT definitive proof of the first cron run:**
  1. There was no prior puzzle for 2026-09-08 (production began without an
     initial puzzle configured), so there was nothing on 2026-09-08 to
     finalize — a normal "yesterday = FINALIZED" record should NOT be expected
     from the first production cron run.
  2. The live tail disconnected before midnight.
  3. The application has a designed lazy-activation path in `startGame()`
     that can change today's `SCHEDULED` puzzle to `ACTIVE` — so
     `2026-09-09 = ACTIVE` does NOT by itself prove the cron performed the
     activation.
- The repository cron code is correct and remains unchanged:
  `src/server/puzzle/scheduled-entry.ts` calls `runSettlement()` and logs
  `[settlement] run complete` on success / `[settlement] run failed` on
  failure, rethrowing failures so a real cron failure surfaces to Cloudflare;
  the settlement implementation performs `finalizeExpired` → `activateToday` →
  structured report and is designed to be retry-safe/idempotent.
- For the next rollover there WILL be a real `ACTIVE` puzzle to finalize, so
  the next midnight is the cleaner production cron proof (§6.2).

### N. Verified vs not-yet-proven (summary table)

| Area | Status |
|---|---|
| Deployed Worker + smoke (`/` 200, `/api/game/current` 401 envelope, nosniff) | ✅ VERIFIED |
| Neon production migrate + seed (2,315) | ✅ VERIFIED |
| Google OAuth sign-in / session persistence | ✅ VERIFIED |
| Both admin accounts promoted (Admin tab) | ✅ VERIFIED |
| Sign-out | ✅ VERIFIED |
| Security headers (HTTPS/HSTS/CSP/nosniff/XFO/Referrer-Policy) | ✅ OBSERVED (final one-command receipt still to record — §6.4) |
| Web Analytics integration (J-A1) | ✅ VERIFIED (`1 visit` = data collection works, not a baseline) |
| J-A2 telemetry instrumentation | ✅ OBSERVED in live tail (not a baseline) |
| Explicit CSRF negative (cross-origin mutation → 403) | ⏳ PENDING OPERATOR VERIFICATION (§6.1) |
| Definitive cron execution | ⏳ PENDING — next scheduled rollover (§6.2) |
| Cron idempotency | ⏳ PENDING (§6.3) |
| ≥ 7-day PH latency baseline (J-A1 + J-A2) | ⏳ PENDING — time-gated (§6.5) |

### O. Post-implementation commit trail (`4217134..HEAD`) — all 10 commits documented

Every commit after the Phase-6 implementation commit `4217134`
(`feat(phase6): deployment implementation…`) is recorded in the repository
documentation. Decision-log records live in
`docs/contradictions-and-gaps.md` (Phase-6 production reconciliation section +
S1k/S1k-C/S1k-D); §7 subsection pointers below. Verified against `git log` /
`git show` in the 2026-09-11 commit-trail audit:

| Commit | Subject | Where documented |
|---|---|---|
| `8df0f74` | configure rate limit namespaces | contradictions S1k-D + P6-PROD-9; runbook §1 step 5; handoff §7.B |
| `5111e82` | smoke test must accept the expected 401 | contradictions P6-PROD-3; handoff §7.D |
| `f744db8` | drop tagline copy from the auth page | contradictions P6-PROD-13 (added by the commit-trail audit) |
| `286a828` | scope Neon client per request | contradictions P6-PROD-5; handoff §7.F |
| `a45971f` | warm Neon memo on Node/Bun | contradictions P6-PROD-5; handoff §7.F |
| `e0c2fba` | detect `__Secure-` session cookie | contradictions P6-PROD-6; handoff §7.G |
| `5c2dbaa` | Web Analytics beacon (J-A1) | contradictions P6-PROD-7; runbook §1 step 11; handoff §7.K |
| `3fb6235` | rate-limit leaderboard reads, harden deploy gate | contradictions S1k/S1k-C + P6-PROD-12 (hash citation added by the audit); runbook gates paragraph |
| `d94628e` | drop artificial 1001–1005 placeholder policy | contradictions S1k-D + P6-PROD-9; handoff §7.B |
| `5258fc1` | v35 UI fixes (leaderboard tab scrollbar, desktop header wrap, admin hero) | contradictions P6-PROD-14 (added by the commit-trail audit) — last commit on `main` at reconciliation |

**Deployed-version caveat:** the exact commits contained in the deployed
production version are NOT recorded in repository documentation — the deploy
workflow's Gate 2 guarantees the deployed SHA had a green `ci.yml` run and the
operator confirmed the deployment green, but the deployed version id/SHA must
be obtained from `wrangler deployments list` when a receipt needs it (never
invented). If the operator records it, append it here.

*Handoff written by the Phase-6 implementation pass at repository HEAD
`780ae15` + implemented changes; **reconciled 2026-09-11** with the operator's
production receipts (§7) and the post-implementation commit-trail audit (§7.O);
the implementation-prompt sibling docs were updated only where this pass added
new facts (contradictions log).*