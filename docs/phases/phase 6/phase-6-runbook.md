# Phase 6 — Deployment Runbook (rollback / incident recovery + operator procedures)

Authoritative plan: `docs/phases/phase 6/phase-6-plan.md` (§I operator steps, §L
rollback/recovery, §J latency gate). This runbook is the operator-facing
procedures document.

> **Status — RECONCILED 2026-09-11: production IS deployed and working.** The
> Neon `production` branch (Singapore) is migrated + seeded (2,315); the Worker
> `leaderboard-wordle` is live at
> `https://leaderboard-wordle.leaderboardwordle.workers.dev`; Google OAuth
> sign-in/out, BOTH admins, gameplay, security headers, Web Analytics (J-A1),
> and J-A2 telemetry are verified. Full receipts:
> `phase-6-implementation-handoff.md` §7 ("Current production operator state —
> September 2026"). §1 below is retained as the COMPLETED provisioning record
> (updated to the as-built five-namespace state). The REMAINING Phase-6 work is
> handoff §6: the CSRF negative probe, definitive cron evidence + idempotency
> (§7 below), and the ≥ 7-day PH latency baseline.

---

## 1. Pre-deploy operator checklist — ✅ COMPLETED 2026-09-11 (as-built record)

| # | Step | As-built outcome / receipt |
|---|---|---|
| 1 | **Neon Singapore database** | ✅ Project `leaderboardwordle` (id `tiny-haze-64643097`); **`production`** branch, **Singapore**, created from `non-production (CI)` as **Branch schema only**; intentionally wiped before the first migration. The local `.env` was NOT repointed — the production `DATABASE_URL` was only ever a one-off env override; the temporary `.env.production` used for the bootstrap is gitignored/untracked and must remain outside the repository. |
| 2 | **Migrate (existing schema — zero NEW migrations)** | ✅ `DATABASE_URL="<prod>" bun ./scripts/ci-migrate.ts` → `migrations applied successfully (programmatic)` |
| 3 | **Verify migration** | ✅ 8 public tables (`account`, `answer_dictionary`, `daily_puzzles`, `games`, `guesses`, `session`, `user`, `verification`) + `drizzle.__drizzle_migrations` row `id=1`, `hash=344afde9e4c8d7e2bc29d21bd38813e8ef7d539ca64a04e92b039b1ee9c6e94a`, `created_at=1787492127258` (matches the repo's `src/server/db/migrations/meta/_journal.json` `when` timestamp exactly) |
| 4 | **Seed (private pool, operator-only — never on a CI runner)** | ✅ answer pool loaded (validates `answers ⊂ valid guesses`, idempotent); `SELECT count(*) FROM answer_dictionary` → **2,315** |
| 5 | **Rate-limit namespaces (FIVE — plan §I.1 + S1k/S1k-D)** | ✅ Five real namespace ids committed in `wrangler.toml` (commit `8df0f74`; placeholder policy dropped `d94628e`): AUTH `1001` 10/60s · GAME `1002` 30/60s · ME `1003` 10/60s · ADMIN `1004` 20/60s · LEADERBOARD `1005` 100/60s (`simple`, period 60). Real production ids — NO placeholder policy (S1k-D). Older "four namespaces / `00000000-…` placeholders" wording is stale. |
| 6 | **First-ever Worker bootstrap** (plan §I.3 — no gate bypass) | ✅ Done manually (the Worker record did not exist — the first normal version-upload path failed for that reason). The bootstrap was initially blocked because **Cloudflare Analytics Engine was not enabled**; the operator enabled Analytics Engine, then the bootstrap deployment succeeded. A temporary gitignored `.env.production` carried the production-only values for the bootstrap. |
| 7 | **Six Worker secrets** (values never in GitHub) | ✅ Present — names verified: `ADMIN_EMAIL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Values are never documented. |
| 8 | **Google OAuth** | ✅ Initially `redirect_uri_mismatch`; the operator added the production origin + redirect URI `https://leaderboard-wordle.leaderboardwordle.workers.dev/api/auth/callback/google` → sign-in works |
| 9 | **GitHub deployment credentials** | ✅ Secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (token named `leaderboard-wordle-github-deploy`, account-scoped, Workers Scripts edit, no IP restriction — value never documented); variable `PRODUCTION_URL=https://leaderboard-wordle.leaderboardwordle.workers.dev` |
| 10 | **Analytics Engine dataset (J-A2)** | ✅ Account Analytics Engine enabled during the bootstrap; `LATENCY` → `latency` binding active in the deployed Worker |
| 11 | **Web Analytics (J-A1)** | ✅ Configured for the production origin. **Deviation from the plan's "zero code" wording:** Cloudflare reported the workers.dev hostname is not attached as a Cloudflare-managed website, so the provided JS snippet was integrated manually (`src/lib/app/cloudflare-analytics.svelte` rendered from the root layout, commit `5c2dbaa`) with the CSP additions in `src/server/middleware/csp.ts`. Verified end-to-end (dashboard received data — see handoff §7.K). |

Gates before ANY deploy: `bunx wrangler deploy --dry-run` lists all five
rate-limit bindings + `ASSETS` + `LATENCY`; `bun run types:check`; the
deploy.yml rate-limit-namespace gate (`scripts/check-rate-limit-config.ts`).

---

## 2. Deployment (controlled path)

**Preferred**: GitHub **Actions → Deploy (production) → Run workflow** (`ref: main`).
The workflow enforces: ref = `main`; checked-out SHA = dispatch-time main SHA =
a green `ci.yml` push run (exact `head_sha`, workflow-specific endpoint);
build + patched-worker assertion + `verify:bundle`; placeholder-namespace gate;
credential gate; **pre-deploy** `wrangler secret list` name gate;
`wrangler deploy --dry-run` binding validation; `wrangler deploy`; post-deploy
secret-name receipt; smoke (`PRODUCTION_URL/` 200 + `/api/game/current` 401
`UNAUTHORIZED` envelope + `x-content-type-options: nosniff`).

**Manual fallback** (GitHub Actions unavailable — out-of-band): run the same
local gates, then `npx wrangler deploy` with `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID` exported; record the version id. **First-ever bootstrap
must still follow §1 step 6** — the manual fallback is for an already-bootstrapped
Worker.

**Status (2026-09-11): DONE.** The preferred path ran green and that successful
deployment is the current production state. One EARLIER attempt failed
transiently at the pre-deploy `wrangler secret list` gate (`GET
/accounts/***/workers/scripts/leaderboard-wordle/secrets` → `503 Service
Unavailable`, "upstream connect error or disconnect/reset before headers")
BEFORE `wrangler deploy` ran; the rerun succeeded. Do not treat the failed run
as current (handoff §7.C).

---

## 3. Detection of a broken deploy

| Signal | Where | Meaning |
|---|---|---|
| deploy.yml smoke failure | workflow step | page 200 / API 401 envelope / header contract violated |
| 5xx spike | Cloudflare dashboard (analytics / Workers logs) | broken version serving errors |
| `[settlement] run failed` / FAILED cron | dashboard Cron Triggers status | settlement cron broken on the new version |
| login broken (OIDC/CSRF) | browser smoke; Google sign-in | `BETTER_AUTH_URL`/origin misconfig or auth regression |
| admin cannot promote | admin sign-in | `ADMIN_EMAIL` allowlist regression (E.3) |
| PH latency regression | J-A2 beacon + Web Analytics (≥30% above baseline for 3 days) | performance degradation (J gate) |
| 401 on `/api/game/current` missing | post-deploy smoke | auth middleware regression |

---

## 4. Recovery / rollback

1. **Fastest safe step**: `wrangler rollback` (versioned deployments — each
   deploy is a version; restores the previous version). Dashboard "Rollback to
   previous deployment" is equivalent. Verify: `wrangler deployments list`
   shows the restored version id; re-run the §3 smoke signals manually.
2. **Multi-deploy cascade**: roll back to the last **known-good** version id
   from `wrangler deployments list`. The DB is the safe boundary: settlement is
   idempotent and NG9 lock/liveness + constraints are unchanged — a wrong code
   version cannot corrupt data.
3. **Redeploy the fixed commit**: revert/fix on `main` (CI runs), then deploy
   that exact SHA via the deploy workflow (§2). `wrangler rollback` is the
   fast path while the fix is in review.
4. **Secrets are environment-level (not per-version)**: rolling back code does
   NOT roll back secrets — after any rollback, re-verify the six names with
   `wrangler secret list` (drift = re-set per plan §F.1).
5. **DB/seed issues are NOT deploy-rollback problems**: migration on an empty
   DB + seeding are idempotent — re-run `ci-migrate.ts` / `seed:answers`
   (exit codes 0/1/2 per plan §H) or fix the seed source; they are independent
   of the Worker version.
6. **What "deploy failed" looks like**: `wrangler deploy` non-zero (usually
   caught by the gates: config/binding/namespace/secret errors), failed
   post-deploy smoke, or a deployed-but-broken version. Recovery: fix config →
   redeploy; rollback → fix → redeploy.

---

## 5. Post-deploy verification (A-goals; plan §A + §N)

- **Deployed**: `wrangler deployments list` + smoke (§2) + `PRODUCTION_URL/` 200.
- **Migrated + seeded**: §1 steps 2–4 receipts (`answer_dictionary` = 2,315).
- **Verified (origin/CSRF/OIDC)**: real Google sign-in/out on the production
  origin; **both** admin emails promoted (row `role='admin'`);
  `curl -sI https://<origin>/` shows the header contract incl. HSTS over HTTPS;
  browser session cookie `HttpOnly` + `Secure` over HTTPS.
- **Measured**: Web Analytics PH page Vitals + J-A2 beacon baseline (P50/P75/
  P95 + sample size/day) over **≥ 7 production days**; optimization only when
  the §6 gate fires.
- **Cron verified**: §7.

**Status (2026-09-11):** Deployed ✅, migrated + seeded ✅ (2,315), OIDC round-trip
✅ (both admin addresses verified — both show the Admin tab), sign-out ✅
(`POST /api/auth/sign-out - Ok` in the live tail), headers observed ✅ over
HTTPS. REMAINING: the explicit CSRF negative probe (cross-origin-style mutation
→ expected `HTTP 403` — do NOT modify the CSRF implementation to create the
test); one final clean header-contract receipt, e.g.
`curl -sI https://leaderboard-wordle.leaderboardwordle.workers.dev/ | grep -iE 'strict-transport-security|content-security-policy|x-content-type-options|x-frame-options|referrer-policy'`;
definitive cron + idempotency (§7); the ≥ 7-day PH baseline (§6). Full receipts:
handoff §7.

---

## 6. Latency evidence gate (plan §J)

- Baseline: ≥ 7 consecutive production days; PH-country-filtered page Vitals
  (J-A1) and game-API timing (J-A2 — `POST /api/telemetry` rows in the
  `latency` Analytics Engine dataset, `cf-ipcountry = PH` only).
- Optimization may start ONLY when: PH **P95 page-load > 4 s** or **P95
  game-call > 3 s** (D-TARGET, product-tunable), **or** a sustained ≥ 30%
  regression above baseline for 3 consecutive days with the sample-size floor
  (e.g. ≥ 50 PH samples/day) met. A single slow sample, a local/CI measurement,
  or a synthetic probe never triggers optimization.
- CI/runner → Neon RTT is **diagnostic only**, never the PH-user baseline.
- After the baseline: keep or disable the J-A2 beacon (D-JA2KEEP) — disabling
  = remove the `[[analytics_engine_datasets]]` block + `/api/telemetry`
  registration (additive; no product impact).
- **Current status (2026-09-11): instruments LIVE, baseline NOT started.** The
  Web Analytics dashboard showing `1 visit` and the observed successful
  `POST /api/telemetry` requests in the live tail prove the instruments work —
  they are NOT baseline data. For each production day record P50/P75/P95 +
  sample count from BOTH sources (handoff §6.5).

---

## 7. Cron verification (plan §I.2) — first run NOT definitive; next rollover is the proof

**First production rollover (observed 2026-09-11 — NOT definitive).** The cron
`0 16 * * *` passed the first midnight while `npx wrangler tail
leaderboard-wordle` was running, but the tail connection dropped and reconnected
around the boundary (`Tail connection lost. Reconnecting` → `Reconnected to
leaderboard.`) and a `[settlement] run complete` line was NOT captured — there
is no log-level proof the scheduled invocation itself was observed. Post-midnight
DB state: `2026-09-11 SCHEDULED`, `2026-09-10 SCHEDULED`, `2026-09-09 ACTIVE`.
This does NOT prove cron activation because (1) production began with no puzzle
configured for 2026-09-08, so the first run had nothing to finalize; (2) the
tail disconnect before midnight; and (3) `startGame()`'s designed
lazy-activation path can set today's puzzle ACTIVE independently of the cron.
The cron implementation is correct and UNCHANGED
(`src/server/puzzle/scheduled-entry.ts` → `runSettlement()`, logs
`[settlement] run complete` on success / `[settlement] run failed` on failure,
rethrowing failures so real cron failures surface to Cloudflare as FAILED;
settlement = finalize expired → activate today → structured report,
retry-safe/idempotent).

1. Dashboard/`wrangler tail`: `0 16 * * *` (Asia/Manila midnight = `16:00 UTC`)
   invocation **OK**, not FAILED.
2. Log: `[settlement] run complete { finalized, forfeitedCount,
   completedCount, activatedToday, alreadyActive, missingToday }`.
3. DB: yesterday FINALIZED exactly once; today ACTIVE; no spurious
   `[settlement] missing puzzle` marker.
4. **Idempotency**: a deterministic "Run now" re-invocation is the ideal proof,
   but the Cloudflare dashboard available to the operator does NOT expose a
   usable cron execution history / "Run now" control — do not keep directing
   the operator to a nonexistent dashboard feature. Fallback (per plan §I.2's
   own documented fallback): rely on the idempotent implementation (SKIP LOCKED
   + finalize-before-activate), the integration lock-order tests
   (`tests/integration/midnight-lock-order.test.ts`), and **consecutive
   scheduled runs** observed with no duplicate finalization and consistent
   `activatedToday`/`alreadyActive`. Do NOT invent an artificial cron endpoint
   and do NOT change the schedule for testing.
5. Missed/failed run detection: `[settlement] missing puzzle for date=…`
   marker, dashboard FAILED status, and the lazy startGame/activation paths
   self-heal (the cron is a reconciliation job). Real alerting = D-ALERT
   (deferred, not Phase-6).

**Next-rollover procedure (the clean production cron proof):**

1. Keep `npx wrangler tail leaderboard-wordle` running before midnight
   (Asia/Manila). Watch specifically for `[settlement] run complete`.
2. Record the report fields: `finalized`, `forfeitedCount`, `completedCount`,
   `activatedToday`, `alreadyActive`, `missingToday`.
3. Verify the DB state after rollover: yesterday FINALIZED exactly once; today
   ACTIVE.
4. Record the safest available idempotency evidence (consecutive runs with no
   duplicate finalization).
5. Append the receipt to the handoff (§6 of the handoff).

---

## 8. Incident log template

```text
Time (UTC):   detected / resolved
Signal:       which §3 row fired (or manual report)
Version id:   before / after (wrangler deployments list)
Rollback:     wrangler rollback | redeploy <sha>
Secrets:      wrangler secret list re-verified after rollback (six names)
DB state:     settlement/reconciliation unaffected (idempotent); counts
Follow-up:    fix commit on main → CI green → deploy workflow
```