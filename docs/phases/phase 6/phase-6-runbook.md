# Phase 6 — Deployment Runbook (rollback / incident recovery + operator procedures)

Authoritative plan: `docs/phases/phase 6/phase-6-plan.md` (§I operator steps, §L
rollback/recovery, §J latency gate). This runbook is the operator-facing
procedures document. Current repo state: **not yet deployed** — production
provisioning is operator-owned (plan §B read: **Production-provisioning
readiness: NOT REACHED**).

---

## 1. Pre-deploy operator checklist (one-time, in order)

| # | Step | Procedure | Receipt |
|---|---|---|---|
| 1 | **Neon Singapore database** | Create the Neon project in **Singapore**; obtain the WebSocket/pooled `DATABASE_URL`. **Never** point this at the non-production Neon. | — |
| 2 | **Migrate (existing schema — zero NEW migrations)** | `DATABASE_URL=<prod Neon SG url> bun ./scripts/ci-migrate.ts` → "migrations applied successfully" | migration receipt |
| 3 | **Verify migration** | `DATABASE_URL=<prod> bun ./scripts/ci-db-probe.ts` (redacted connect facts + `SELECT 1`); schema query: `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` and presence of `answer_dictionary` / `daily_puzzles` / `user` + the `drizzle.__drizzle_migrations` row for `0000_init` | probe + schema receipt |
| 4 | **Seed (private pool, operator-only — NEVER on a CI runner)** | `DATABASE_URL=<prod Neon SG url> bun run seed:answers` (requires the gitignored `scripts/seed/answer-pool.source.txt` locally; validates `answers ⊂ valid guesses`; idempotent `ON CONFLICT DO NOTHING`) then `SELECT count(*) FROM answer_dictionary` → **2,315** | seed report + count |
| 5 | **Four rate-limit namespaces** (plan §I.1) | Dashboard **Workers & Pages → Rate limiting** or the account API `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/rate_limits` with `{ "name": "<CLASS>", "description": "...", "period": 60, "limit": <n> }` — AUTH 10, GAME 30, ME 10, ADMIN 20, all `simple` mode. Record each `result.id` → substitute into `wrangler.toml` replacing the `00000000-…` placeholders (never invent IDs; placeholders must never ship) | four `namespace_id`s in `wrangler.toml` + handoff |
| 6 | **First-ever Worker bootstrap** (plan §I.3 — **no gate bypass**) | Create/upload the initial Worker version **without a public deployment** (`wrangler versions upload` or dashboard "Create Worker"; no workers.dev route, no custom domain, no route rules). Then set the six secrets via **`wrangler versions secret put <name>`** or the dashboard "Variables and Secrets" — **NOT ordinary `wrangler secret put`** (it can create+deploy a version and bypass the deploy.yml gate). Alternative single-step: `wrangler deploy --secrets-file <path>` (file gitignored, used once). Verify: `wrangler secret list` shows the six names. | `wrangler secret list` output (names) |
| 7 | **Six Worker secrets** (values never in GitHub) | `DATABASE_URL` (Neon SG WebSocket), `BETTER_AUTH_SECRET` (≥32 random bytes, e.g. `openssl rand -hex 32`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL` = **`tee.johnlor@gmail.com,leaderboardwordle@gmail.com`** (comma separator — D-ADMINSEP), `BETTER_AUTH_URL` = `https://<origin>` (no trailing slash; D-ORIGIN) | `wrangler secret list` (names) |
| 8 | **Google OAuth** | OAuth client: authorized JS origin `https://<production-origin>`; redirect URI `https://<production-origin>/api/auth/callback/google`; same id/secret → the two Worker secrets | dashboard state |
| 9 | **GitHub deployment credentials** | Secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit [+ Workers Assets: Edit as needed] + account read), `CLOUDFLARE_ACCOUNT_ID`; variable: `PRODUCTION_URL` = `https://<origin>` | GitHub settings state |
| 10 | **Analytics Engine dataset (J-A2)** | Create the `latency` dataset (dashboard/Analytics Engine API) — bound in `wrangler.toml` as `LATENCY` | dataset id in handoff |
| 11 | **Web Analytics (J-A1)** | Enable Cloudflare Web Analytics on the production origin (zero code); PH filtering via `cf-ipcountry = PH` | analytics presence |

Gates before ANY deploy: `bunx wrangler deploy --dry-run` lists all four
rate-limit bindings + `ASSETS` + `LATENCY`; `bun run types:check`; the
deploy.yml placeholder gate.

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

---

## 7. Cron verification (plan §I.2)

1. Dashboard/`wrangler tail`: `0 16 * * *` (Asia/Manila midnight = `16:00 UTC`)
   invocation **OK**, not FAILED.
2. Log: `[settlement] run complete { finalized, forfeitedCount,
   completedCount, activatedToday, alreadyActive, missingToday }`.
3. DB: yesterday FINALIZED exactly once; today ACTIVE; no spurious
   `[settlement] missing puzzle` marker.
4. **Deterministic idempotency re-invocation**: dashboard **Workers & Pages →
   leaderboard-wordle → Settings → Triggers → Cron Triggers → "Run now"** for
   the `0 16 * * *` trigger (confirm the exact label at provisioning time) →
   no duplicate finalization, consistent `activatedToday`/`alreadyActive`.
   If "Run now" is unavailable: the first scheduled run is the production
   proof; idempotency is covered by the integration lock-order tests + a
   second consecutive run with no drift.
5. Missed/failed run detection: `[settlement] missing puzzle for date=…`
   marker, dashboard FAILED status, and the lazy startGame/activation paths
   self-heal (the cron is a reconciliation job). Real alerting = D-ALERT
   (deferred, not Phase-6).

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