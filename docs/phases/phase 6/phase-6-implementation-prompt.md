# Phase 6 — Implementation Prompt (Deployment)

You are starting a **fresh implementation chat** for **Phase 6 — Deployment** of
`https://github.com/LorensTee/leaderboard-wordle`. You work in the repository itself.

> **MANDATORY CONSTRAINT**
> **Do not modify Phase 0–5 / pre-Phase-6 behavior, the zero-migration invariant,
> answer-pool secrecy, or the CI-7 … CI-15 architecture unless the Phase 6 plan
> (`docs/phases/phase 6/phase-6-plan.md`) explicitly identifies it as a deployment
> remediation.** The plan identifies **exactly three allowed source/config changes**:
> (1) redacting the CI-15 `[game-guess]` guess-word/user-id log markers;
> (2) the `ADMIN_EMAIL` two-admin allowlist; and (3) the **J-A2 game-API latency timing
> beacon** (a strict `POST /api/telemetry` endpoint + Analytics Engine binding + client
> timings) — explicitly-scoped verification infrastructure, timings only, never words or
> secrets. Everything else is config/operator/CI-additive work, and **`.github/workflows/ci.yml`
> stays byte-identical** (deployment lives in a new `deploy.yml`).

## 1. What to read first (in order)

1. `docs/phases/phase 6/phase-6-plan.md` — the authoritative plan (slices, contracts A–P, gates).
2. `docs/phases/phase 6/phase-6-planning-state-handoff.md` — verified current state + unresolved decisions.
3. `Architecture-v3.md` §"Phase 6 — Deployment" (line ~1402) and §"Answer pool deployment" (~1505); §1187 latency; NG1.
4. `docs/contradictions-and-gaps.md` — read the CI-1…CI-15 records and S1a/S1b fully (CI-7…CI-15 are current baseline state, not noise).
5. `docs/phases/pre phase 6/handoff.md` and `pre-phase-6-production-data-lock.md` — finalized product values (12,972 / 2,315 private / 3,944 avatars; both admin emails; 3/8 thresholds).
6. `docs/phases/phase 5/phase-5-implementation-handoff-final.md` §4 (operator steps), `scripts/seed/README.md`, and these source files: `wrangler.toml`, `_headers`, `package.json`, `.github/workflows/ci.yml`, `src/server/auth/auth.ts`, `src/server/middleware/auth.ts`, `src/server/lib/origin.ts`, `src/server/db/client.ts`, `src/server/routes.ts`, `src/server/middleware/rate-limit.ts`, `src/server/game/handlers.ts`, `src/lib/shared/api/game.ts`, `src/server/puzzle/scheduled-entry.ts` + `settlement.ts`, `scripts/ci-migrate.ts`, `scripts/ci-db-probe.ts`, `scripts/patch-worker-scheduled.ts`, `vite.config.ts`, `src/app.html`, `src/server/middleware/csp.ts` + `security-headers.ts`.

## 2. What Phase 6 means

Deploy the current `main` HEAD to **Cloudflare Workers + Neon (Singapore)**, apply the
**existing** schema to the empty production DB and **seed** it, verify the **settlement
cron in production**, measure **real latency from Philippines users** (page Vitals AND
game-API timing), and **optimize only when evidence supports it**. It is NOT "run
`wrangler deploy` and be done": the plan's A-goals (Deployed / Migrated+Seeded /
Verified / Measured / Cron-verified) each require explicit evidence, and the N-gates
must be run on the **deployed** state.

## 3. Exact scope (from plan §C)

In scope: production deploy config + secret/binding plan; rate-limit namespace
provisioning steps; **production Neon migration of the existing schema + seeding**;
origin/CSRF/OIDC; settlement cron verification; PH latency methodology (incl. the
**mandatory J-A2 beacon**) + evidence gate; a **separate `deploy.yml`** workflow (CI-7…CI-15
preserved, `ci.yml` untouched); rollback runbook; and the **three allowed source/config
changes** (CI-15 log redaction; `ADMIN_EMAIL` two-admin allowlist; J-A2 telemetry beacon).

Out of scope (do NOT do): new product features; **new** schema/migrations (applying the
existing `0000_init` to a new DB is in scope); threshold/dataset/admin-address changes;
loosening security/secrecy gates; speculative optimization; modifying CI-7…CI-15; the
pre-Phase-6 visual review (outstanding but NOT a Phase-6 gate).

## 4. Current deployment posture (verified at plan time)

- **HEAD `294ff0b`** on `main`; worktree has only pre-existing noise (do not commit it).
- Deploy-ready already (audit only): `wrangler.toml` (name/compat/`nodejs_compat`/ASSETS/cron `0 16 * * *`/four `[[ratelimits]]`), root `_headers`, build-time cron patch + CI assertion, `verify:bundle`, fail-closed secret policy, Better Auth OIDC, host-relative CSRF, rate-limit middleware, settlement cron, **migration toolchain** (`scripts/ci-migrate.ts`; one migration `0000_init.sql`).
- Partial/missing: the four rate-limit `namespace_id`s are **placeholders** (operator-provisioned; plan §I.1); no `account_id`/`[vars]`/domain; **no deploy workflow**; no production DB migrated/seeded; no latency instrument; `ADMIN_EMAIL` supports only one address.

## 5. Slices to implement (from plan §E; order matters)

1. **Deployment config & secret/binding plan** — substitute real rate-limit `namespace_id`s (operator provides; **never invent**), document `CLOUDFLARE_ACCOUNT_ID`/`account_id`, the six Worker secrets (**first bootstrap per plan §I.3 — `wrangler versions secret put` or the dashboard bootstrap, NOT gate-bypassing `wrangler secret put`; single-step alternative `wrangler deploy --secrets-file`**), optionally adopt **`[secrets] required`** in `wrangler.toml` per plan F.1 (if adopted: regenerate + commit `worker-configuration.d.ts`; Gate 5 stays), the three GitHub credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PRODUCTION_URL`), `--dry-run` clean.
2. **CI-15 resilience + diagnostic redaction (remediation)** — remove the guess `word` and `user.id` from `[game-guess]` markers in `src/server/game/handlers.ts`; keep the 15 s timeout unchanged; record the audit conclusion (server may commit after client abort; retries non-idempotent, ≤1 extra attempt) in the contradictions log.
3. **Origin/CSRF/OIDC + two-admin allowlist (remediation)** — `BETTER_AUTH_URL`; Google OAuth redirect URI; `trustedOrigins`/CSRF unchanged; extend `applyAdminBootstrap` to a `,`/`;`-separated `ADMIN_EMAIL` allowlist (trimmed+lowercased per entry; never demote; unit-tested; choose and document the separator).
4. **CI deploy workflow (new `deploy.yml`)** — `workflow_dispatch` with a `ref` input hard-enforced to `main`; the **exact checked-out SHA** (`git rev-parse HEAD`) must equal the dispatch-time main SHA and have a green `ci.yml` push run queried by **exact `head_sha` on the workflow-specific endpoint** (`gh api .../actions/workflows/ci.yml/runs`, `actions: read`); build + patched-worker assertion + `verify:bundle` + placeholder-namespace gate + credential gate (`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`PRODUCTION_URL`) + **PRE-deploy `wrangler secret list` name gate** + **`wrangler deploy --dry-run` binding validation** → `wrangler deploy` → post-deploy `wrangler secret list` receipt → smoke (`PRODUCTION_URL/` 200 + `/api/game/current` 401 envelope + nosniff). Permissions: `contents: read`, `actions: read`, no write. **Do NOT modify `ci.yml`.**
5. **Production Neon initialization: migrate + seed** — operator creates Neon SG DB; `DATABASE_URL=<prod> bun ./scripts/ci-migrate.ts` (applies the existing `0000_init`; **no new migration**); verify via `scripts/ci-db-probe.ts` + schema query; then `bun run seed:answers` + `SELECT count(*) FROM answer_dictionary` = 2,315; record receipts.
6. **Production deployment + smoke** — deploy current HEAD (via `deploy.yml` or the documented manual `npx wrangler deploy`), operator-supervised browser smoke on `PRODUCTION_URL` (Google sign-in, gameplay, leaderboard, admin, headers, CSP console-clean).
7. **Settlement cron verification** — first `0 16 * * *` run OK + deterministic re-invocation (plan §I.2).
8. **PH latency measurement + evidence gate** — Cloudflare Web Analytics (J-A1, operator, zero-code) **and** the **mandatory J-A2 game-API timing beacon** (Analytics Engine `latency` dataset in `wrangler.toml`; strict `POST /api/telemetry` endpoint registered in `routes.ts`, rate-limited to the `me` class; client timings for `/api/game/current` + `/api/game/:gameId/guess` posted via `navigator.sendBeacon`; PH-filtered server-side). Timings only — never words/secrets/user ids. Record ≥ 7-day baseline; document the gate (plan §J).
9. **Rollback / incident-recovery runbook** — plan §L (`wrangler rollback`, detection, recovery).
10. **Final verification gate + receipts** — run plan §N on the deployed state; write the Phase-6 implementation handoff.

## 6. Binding decisions (do not reinvent)

- **Deploy trigger (v29/v30/v31-resolved):** deployment is a **separate `deploy.yml`** (manual `workflow_dispatch`), NOT an in-workflow job — because `ci.yml`'s integration/e2e jobs are push-gated, an in-workflow deploy could never be reached by `workflow_dispatch`. The `ref` input is **hard-enforced to `main`**; the **exact checked-out SHA** (`git rev-parse HEAD`) must equal the dispatch-time main SHA and have a green `ci.yml` push run (queried by **exact `head_sha` on the workflow-specific `actions/workflows/ci.yml/runs` endpoint** — only a `ci.yml` run can satisfy the gate; **checked-out SHA = CI-tested SHA = deployed SHA**); Worker secrets are verified **PRE-deploy** by name (`wrangler secret list`, values never in GitHub) and a **`wrangler deploy --dry-run`** validates the rate-limit/ASSETS bindings before deploy (post-deploy secret-list repeat is a receipt). `ci.yml` stays byte-identical. **First-ever Worker bootstrap follows plan §I.3**: create/upload the initial Worker version without a public deployment (`wrangler versions upload` or dashboard) and set the six secrets via `wrangler versions secret put` or the dashboard bootstrap — never ordinary `wrangler secret put` as the bootstrap (it can create+deploy a version and bypass the gate).
- Production origin: operator decision (D-ORIGIN; default workers.dev subdomain until decided). Drives `BETTER_AUTH_URL` + Google OAuth. The **deploy smoke uses the `PRODUCTION_URL` GitHub variable** (operator-set), never an embedded `<origin>`.
- `BETTER_AUTH_URL = https://<origin>`; `trustedOrigins` stays `['http://localhost:5173','http://127.0.0.1:4173']` (production covered by baseURL; do not add prod to trustedOrigins — redundant).
- **Worker secrets** (via `wrangler secret put`, never in GitHub): `DATABASE_URL` (Neon **Singapore**, WebSocket/pooled), `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL` (both addresses), `BETTER_AUTH_URL`. All fail-closed if missing.
- **GitHub deployment credentials only:** `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit [+ Workers Assets:Edit as required]) + `CLOUDFLARE_ACCOUNT_ID` (secrets) + `PRODUCTION_URL` (variable). The deploy workflow verifies Worker secrets **by name** via `wrangler secret list` — it never receives or checks their contents.
- Rate-limit namespaces: AUTH 10 / GAME 30 / ME 10 / ADMIN 20 req/min, `simple` mode, period 60 — operator-created (plan §I.1); substitute the real IDs. **The `00000000-…` placeholders must never ship.**

## 7. Unresolved decisions that MUST NOT be invented

- The four rate-limit `namespace_id`s (operator-provisioned; plan §I.1).
- The production origin/domain (D-ORIGIN) — `PRODUCTION_URL` (operator) feeds the smoke.
- All Worker secret values and Google OAuth credentials (operator-provisioned).
- The PH latency targets (D-TARGET) and alerting channel (D-ALERT) — defer, don't invent.
- Auto-deploy-on-push (D-AUTODEPLOY) — not Phase-6.
- The server-side duplicate-guess idempotency guard (D-GUARD) — a product decision, deferred.
- The `ADMIN_EMAIL` separator (`,` vs `;`) — pick one at implementation, pin with tests, record it (D-ADMINSEP).
- Whether to keep the J-A2 beacon permanently after the baseline (D-JA2KEEP) — a post-baseline decision.

## 8. Files / components likely to change (the only ones)

- `wrangler.toml` — real `namespace_id`s (+ optional `account_id`, + `[[analytics_engine_datasets]] latency` for J-A2, + **optional `[secrets] required` per plan F.1**).
- `src/server/middleware/auth.ts` — `ADMIN_EMAIL` allowlist (remediation).
- `src/server/game/handlers.ts` — CI-15 marker redaction (remediation).
- **New** `src/server/telemetry/…` + `src/routes`-adjacent registration (J-A2 beacon): strict `POST /api/telemetry` handler + schema + rate-limit class reuse (registered only in `routes.ts`), client timing capture in `src/lib/shared/api/game.ts` (no wire change to guesses) + `sendBeacon` posting.
- **New** `.github/workflows/deploy.yml` (plan §K.2).
- `docs/contradictions-and-gaps.md` — record the CI-15 production decision, the two-admin gap, the J-A2 addition, and any new decisions.
- Tests: unit tests for the admin allowlist; any test asserting the marker shape; telemetry contract tests (401, strict payload, no word fields).
- New docs: `docs/phases/phase 6/phase-6-runbook.md` (slice 9), `docs/phases/phase 6/phase-6-implementation-handoff.md` (slice 10).
- **`src/server/db/migrations/` — MUST NOT change** (no new migration; only apply `0000_init` to the prod DB). **`src/server/db/schema.ts` — MUST NOT change.** **`.github/workflows/ci.yml` — MUST NOT change.** **`package.json` — MUST NOT change** (no new runtime dependencies). CSP/headers, `vite.config.ts` (except the J-A2 binding), seed tooling logic, `.github/dependabot.yml` — unchanged.

## 9. Cloudflare + Neon constraints

- Cloudflare Cron is UTC-only: `0 16 * * *` = Asia/Manila midnight (no DST) — do not change.
- Use the existing `@neondatabase/serverless` WebSocket driver (`drizzle-orm/neon-serverless`) — do not swap to the HTTP path.
- Production `DATABASE_URL` must point at Neon **Singapore**, not the non-production DB.
- Migrate the production DB with the **existing** migration (`scripts/ci-migrate.ts`) before seeding; never author a new migration.
- Versioned deployments: each deploy is a version; rollback = `wrangler rollback`/dashboard. Worker secrets are environment-level (re-verify after rollback).
- Workers never set `NODE_ENV` → the dev-secret fallback is unreachable in production by design; never relax it.

## 10. Secrets / CI requirements

- The six Worker secrets + the three GitHub credentials must be set **before** the first deploy (operator); **Worker-secret bootstrap follows plan §I.3** (`wrangler versions secret put` or the dashboard "Variables and Secrets" on first setup — ordinary `wrangler secret put` is for an already-deployed Worker only); the deploy workflow's credential gate + pre-deploy `wrangler secret list` check fail loudly otherwise.
- Migration + seeding are **operator one-time steps, never CI** (the private pool source is gitignored and must not reach a runner).
- **`ci.yml` is not modified.** The deploy workflow is a new file with `contents: read` + `actions: read` only (no write scope); only the e2e job in `ci.yml` keeps `actions: write` (CI-13).

## 11. Verification gates (run on the deployed state)

Plan §N in full: four CI jobs green on HEAD; patched-worker assertion; `verify:bundle`;
schema purity (no NEW migration); placeholder gate empty; `wrangler secret list` shows the
six names; production DB migrated + seeded (probe + count = 2,315); deployed smoke (200 +
401 envelope + headers); real Google OIDC round-trip promoting **both** admins; cron
receipt + idempotency; ≥7-day PH baseline (page + game-API); no guess word/user id in
logs; **`git diff --exit-code -- .github/workflows/ci.yml` empty**; review of the final diff
(only the planned files changed).

## 12. Documentation / receipt requirements

- Record every decision/deviation in `docs/contradictions-and-gaps.md` FIRST (Phase-4 discipline), especially: the two-admin allowlist, the CI-15 log redaction + production assessment, the J-A2 telemetry addition, the chosen `ADMIN_EMAIL` separator, and any operator-provided receipts (never secrets themselves).
- Write `phase-6-runbook.md` (slice 9) and `phase-6-implementation-handoff.md` (slice 10) with per-A-goal evidence (migration receipt, seed report + count, deploy version, cron receipt, latency baseline).
- Update this prompt's sibling docs only if a factual claim is found wrong (never silently change product decisions).

## 13. How to finish

1. All slices 1–10 complete with their acceptance criteria met.
2. All N-gates green with evidence actually obtained (a command that did not run or a stale receipt does not count).
3. Working tree contains only the intended changes (no leftover scratch — remove any probe artifacts; do not commit the pre-existing noise).
4. A final `git diff` review: only the planned files changed; `ci.yml` byte-identical; zero new migrations; no new dependencies.
5. The implementation handoff explicitly lists what remains operator-owned (production-provisioning readiness) vs what is verified done.

*Written by the Phase-6 planning pass from the actual repository at `main` @ `294ff0b`, revised after gpt-luna v29 review.*
