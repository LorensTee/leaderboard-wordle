# Phase 6 — Planning-State Handoff

> **HISTORICAL (2026-09-11).** This handoff describes the state at planning time
> (`main @ 294ff0b`). Production has since been provisioned and deployed — read
> `phase-6-implementation-handoff.md` §7 ("Current production operator state —
> September 2026") for the current baseline before acting on any "not yet
> provisioned" statement below. Do not re-perform completed operator work.

A fresh implementation chat can continue **without this conversation's history**.
Everything needed to implement Phase 6 (Deployment) is in this file and its links.
This is a **planning-state** handoff: it records verified facts, decisions, and
unresolved items so the implementation agent never has to guess. It is **not** the
implementation handoff (that is written by the implementation pass at the end of
Phase 6).

Authoritative plan: `docs/phases/phase 6/phase-6-plan.md` (slices, contracts, gates).
Executable prompt: `docs/phases/phase 6/phase-6-implementation-prompt.md`.

**Revision (after gpt-luna v29 review):** the plan now uses a **separate `deploy.yml`**
(workflow_dispatch + green-CI gate) instead of an in-workflow deploy job; the deploy
workflow uses only **GitHub deployment credentials** and verifies Worker secrets **by
name** (`wrangler secret list`); **production DB migration** is an explicit slice (5);
the **game-API timing beacon (J-A2) is mandatory** Phase-6 verification infrastructure;
the deploy smoke uses a **`PRODUCTION_URL`** variable (no `<origin>` in CI); rate-limit
creation and cron re-invocation have concrete operator steps. `ci.yml` stays byte-identical.

**Revision 2 (after gpt-luna v30 review):** three `deploy.yml` tightening fixes — the
green-CI gate is anchored to the **actual checked-out SHA** (`DEPLOY_SHA = git rev-parse
HEAD`) with the `ref` input hard-enforced to `main` (checked-out SHA = CI-tested SHA =
deployed SHA); the **Worker-secret existence check moved PRE-deploy** (post-deploy repeat =
receipt); the namespace preflight is **placeholder grep + `wrangler deploy --dry-run`**.

**Revision 3 (after gpt-luna v31 review):** the **first-ever Worker bootstrap** is now
prescribed in plan §I.3: create the initial Worker record without a public deployment and
set the six secrets via the **non-deploying/versioned mechanism** (`wrangler versions
secret put`) or the dashboard bootstrap — ordinary `wrangler secret put` is explicitly
excluded from the bootstrap path (it can create+deploy a version immediately under
versioned deployments, bypassing the `deploy.yml` gate). The green-CI gate now queries the
Actions API by **exact `head_sha`** (no 10-run page limit).

**Revision 4 (after gpt-luna v32 review):** plan §I.3 now names the non-deploying version
workflow explicitly (**`wrangler versions upload`**) and documents
`wrangler deploy --secrets-file <path>` as the single-step first-deploy alternative. The
optional **`[secrets] required`** config property is documented in plan F.1 as
defense-in-depth — **supported by the installed wrangler 4.125.0 (verified locally)**,
enforced at `wrangler deploy`/`wrangler versions upload`, warning-only in the preview
path; if adopted it requires regenerating + committing `worker-configuration.d.ts`;
`deploy.yml` Gate 5 remains the explicit pre-deploy gate.

**Revision 5 (after gpt-luna v33 review):** the deploy workflow's green-CI query uses the
**workflow-specific endpoint** (`gh api .../actions/workflows/ci.yml/runs?head_sha=...`)
instead of the repository-wide `actions/runs` endpoint, so only a successful `ci.yml` run
can satisfy the gate. Exact-SHA logic unchanged.

---

## 1. Exact repository identity

| Item | Value |
|---|---|
| Branch | `main` |
| **HEAD** | **`294ff0b`** — `diag(game): start/end markers in the guess handler (CI-15)` |
| Original planning-prompt anchor | `f031dc4` |
| Commits after the anchor (verified, exhaustive to HEAD) | `812b0a8` (avatar selected-badge clip fix) · `fab307c` (CI-14: Manila-Monday I8 guard) · `fcab2cf` (CI-13: Playwright failure-artifact upload) · `1d1de4a` (CI-15: bounded guess requests) · `294ff0b` (CI-15: request diagnostics) |
| Working tree | Only pre-existing noise: `.idea/material_theme_project_new.xml`, the planning prompt file, and an untracked `game-flow-authenticated-ga-5f333--rendered-NO-position-block-app/` (Playwright failure artifacts — scratch, not repo content). Do not commit these. |
| Planning-only constraint | No deploy, no secret/binding provisioning, no namespace creation, no migration/seeding, no source/CI/`wrangler.toml` modification was performed by the planning pass. |

## 2. Dependency summary (what Phase-6 builds on)

- **Phases 0–5 + pre-Phase-6 are COMPLETE** and committed on `main`.
- **Deployment surface already built (audit only, do NOT redo):** `wrangler.toml`
  (name `leaderboard-wordle`, `main`, compat `2026-08-23`, `nodejs_compat`, `ASSETS`
  binding, cron `0 16 * * *`, four `[[ratelimits]]`); root `_headers` (nosniff on
  `/_app/*`; verified correct location for adapter-cloudflare v7); build-time cron
  patch (`scripts/patch-worker-scheduled.ts` + `vite.config.ts` hook + CI patched-worker
  assertion); `verify:bundle` secrecy gate; fail-closed secret policy
  (`NON_PRODUCTION_ENVS` + `DEV_SECRET` — a production Worker can never select the dev
  secret); Better Auth Google OIDC + `trustedOrigins`; host-relative CSRF (NG4);
  rate-limit middleware (4 classes, pass-through when binding absent); settlement cron
  (`scheduled` export, `runSettlement`, rethrow-on-failure); **the migration toolchain**
  (`scripts/ci-migrate.ts` programmatic migrator; exactly one migration `0000_init.sql`).
- **CI-7…CI-15 architecture is the current baseline** (do not regress): ephemeral-postgres
  integration (CI-7), advisory-lock DB mutex (CI-2), push-gating (CI-3), mandatory e2e
  secret gate (CI-9), `.dev.vars` materialization (CI-10), E7 hardening (CI-11),
  CI-13 artifact upload with **job-level** `actions: write`, CI-14 Manila-Monday I8
  guard, CI-15 guess timeout/recovery + diagnostics.
- **Pre-Phase-6 open items carried into Phase-6:** migrate + seed the production DB;
  deployment `ADMIN_EMAIL` for both addresses (see §4 gap); avatar picker/combobox visual
  review still outstanding (NOT a Phase-6 gate — do not claim it, do not reopen it).

## 3. Deployment-readiness baseline (current)

**Classify every finding (from `phase-6-plan.md` §B):**

- **[verified current state]** — the deployment config surface above, `_headers`
  pipeline, build/cron patch, verify:bundle, secret policy, CSRF host-relativity, the
  migration toolchain, seed contract, cron behavior, CI-13/14/15 current behavior.
- **[planned/missing]** — production origin/domain + `account_id`/vars absent; **no
  `deploy` script; no deploy workflow; no `workflow_dispatch` on `ci.yml`**; no
  production DB migrated/seeded; no latency instrument.
- **[operator-provisioned]** — the four rate-limit `namespace_id`s (placeholders
  `00000000-…` — **must never be invented**), the six Worker runtime secrets, the Neon
  Singapore database (migrated + seeded — Slice 5), Google OAuth redirect registration,
  GitHub `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`PRODUCTION_URL`, optional
  Analytics Engine dataset.
- **[unresolved]** — production origin choice (D-ORIGIN; decoupled from CI smoke via
  `PRODUCTION_URL`), latency target (D-TARGET), alerting channel (D-ALERT), auto-deploy
  (D-AUTODEPLOY), duplicate-guess idempotency guard (D-GUARD), `ADMIN_EMAIL` separator
  (D-ADMINSEP), J-A2 keep-after-baseline (D-JA2KEEP).

**Highest-risk gaps:** (1) placeholder rate-limit namespaces; (2) `ADMIN_EMAIL`
single-address match vs the two required admins (see §4); (3) production origin unset;
(4) CI-15 `[game-guess]` diagnostics log the raw guess word (answer leak in prod);
(5) no deploy workflow and no production DB migration/seed step; (6) no latency
baseline/evidence gate.

## 4. Critical gap discovered by planning (do NOT lose this)

**`ADMIN_EMAIL` supports exactly ONE address in the current code.**
`src/server/middleware/auth.ts` `applyAdminBootstrap` promotes when
`userEmail === configured.toLowerCase()` — an exact single-string match. The product
lock requires BOTH `tee.johnlor@gmail.com` and `leaderboardwordle@gmail.com`, and the
pre-Phase-6 handoff's "existing promotion semantics; no code change" is **wrong for two
admins**. Phase-6 includes an explicit deployment remediation (plan Slice 3): parse
`ADMIN_EMAIL` as a `,`/`;`-separated allowlist, promote when any trimmed+lowercased
entry matches, never demote; pin with unit tests. Separator choice = D-ADMINSEP.

## 5. Implementation slices (from `phase-6-plan.md` §E — 10 slices)

1. **Deployment configuration & secret/binding plan** — substitute real rate-limit
   `namespace_id`s (operator provides; exact steps plan §I.1), document
   `CLOUDFLARE_ACCOUNT_ID`/`account_id`, six Worker secrets (**first bootstrap per plan
   §I.3 — `wrangler versions secret put`/dashboard, not gate-bypassing `wrangler secret
   put`**), three GitHub credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `PRODUCTION_URL`); `--dry-run` clean.
2. **CI-15 production-resilience + diagnostic redaction** — remove the guess word and
   `user.id` from `[game-guess]` markers (keep payload-free start/done or drop);
   15 s timeout stays; audit conclusion recorded (server may commit after client abort;
   retries not idempotent → ≤1 extra attempt; no code change beyond redaction).
3. **Origin/CSRF/OIDC + two-admin allowlist** — `BETTER_AUTH_URL = https://<origin>`,
   Google redirect URI, `trustedOrigins` unchanged, CSRF unchanged, `ADMIN_EMAIL`
   allowlist remediation in `applyAdminBootstrap`.
4. **CI deploy workflow (separate `deploy.yml`)** — `workflow_dispatch` with a `ref` input
   hard-enforced to `main`; the **exact checked-out SHA** (`git rev-parse HEAD`) must equal the
   dispatch-time main SHA and have a green `ci.yml` push run (via `gh api`, `actions: read`);
   build + patched-worker + `verify:bundle` + placeholder-namespace gate + credential gate +
   **PRE-deploy `wrangler secret list` name gate** + **`wrangler deploy --dry-run` binding
   validation** → `wrangler deploy` → post-deploy `wrangler secret list` receipt → smoke against
   `PRODUCTION_URL`. Min permissions (`contents: read`, `actions: read`; no write).
   **`ci.yml` is NOT modified.**
5. **Production Neon initialization: migrate existing schema + seed** — operator creates
   Neon SG DB; `DATABASE_URL=<prod> bun ./scripts/ci-migrate.ts` (applies the existing
   `0000_init` — **not** a new migration); verify via `scripts/ci-db-probe.ts` + schema
   query; then `bun run seed:answers` + `SELECT count(*) FROM answer_dictionary` = 2,315.
   Receipts recorded.
6. **Production deployment + smoke** — first deploy of current HEAD; operator-supervised
   browser smoke on `PRODUCTION_URL` (Google sign-in, gameplay, leaderboard, admin,
   headers, CSP console-clean).
7. **Settlement cron production verification** — first `0 16 * * *` run OK + deterministic
   re-invocation (plan §I.2).
8. **Real-user latency measurement + evidence gate** — Cloudflare Web Analytics (J-A1,
   operator, zero-code) **and** the mandatory game-API timing beacon (J-A2: Analytics
   Engine `latency` dataset + strict `POST /api/telemetry` + client timings, PH-filtered);
   ≥ 7-day baseline; optimization only on evidence.
9. **Rollback / incident-recovery runbook** — plan §L (`wrangler rollback`, detection,
   recovery).
10. **Final verification gate + receipts** — run plan §N on the deployed state; write the
    Phase-6 implementation handoff.

## 6. Bindings / secrets / namespaces contract (summary — full table in plan §F)

- **Worker secrets (never in GitHub; FIRST bootstrap per plan §I.3 — `wrangler versions
  secret put` or dashboard "Variables and Secrets", NOT ordinary `wrangler secret put`
  which can create+deploy a version and bypass the `deploy.yml` gate; subsequent changes
  via `wrangler secret put`):** `DATABASE_URL` (Neon
  **Singapore** WebSocket URL), `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL` (**both** addresses), `BETTER_AUTH_URL`
  (`https://<origin>`). All fail-closed if missing.
- **GitHub deployment credentials (deploy workflow only):** `CLOUDFLARE_API_TOKEN`
  (secret; Workers Scripts:Edit [+ Workers Assets:Edit as needed]), `CLOUDFLARE_ACCOUNT_ID`
  (secret), `PRODUCTION_URL` (variable, non-sensitive).
- Rate-limit namespaces (operator-created per plan §I.1; real IDs substituted into
  `wrangler.toml`): AUTH 10/60s, GAME 30/60s, ME 10/60s, ADMIN 20/60s, `simple` mode.
  **Never invent IDs.**
- `ASSETS` binding exists. Optional `[[analytics_engine_datasets]] latency` (J-A2).
- The deploy workflow verifies Worker secrets **by name** via `wrangler secret list`
  (post-deploy); secret **values** never enter GitHub.

## 7. Origin / CSRF / OIDC requirements (plan §G)

`BETTER_AUTH_URL = https://<origin>`; `trustedOrigins` unchanged (localhost only;
production covered by baseURL); Google OAuth authorized origin + redirect URI
`https://<origin>/api/auth/callback/google`; CSRF is host-relative and needs no config
(fail-closed; `ALLOWED_ORIGINS` must never be `*`); both admins promote (Slice 3).
The deploy smoke is decoupled from the origin decision via the `PRODUCTION_URL` variable.

## 8. Seeding and cron verification (plan §H, §I)

- **Migrate first** (Slice 5): `DATABASE_URL=<prod> bun ./scripts/ci-migrate.ts` (existing
  `0000_init`; zero NEW migrations) + probe + schema receipt. **Then seed**:
  `DATABASE_URL=<prod Neon SG> bun run seed:answers` (gitignored source; validates
  `answers ⊂ valid guesses`; idempotent `ON CONFLICT DO NOTHING`; report inserted/already
  present; exit 0/1/2). Post-seed `SELECT count(*) FROM answer_dictionary` = 2,315.
  **Never migrate/seed from CI** (private source never on a runner).
- Cron: `0 16 * * *` = Asia/Manila midnight (UTC+8). Verify first production run (OK in
  dashboard, `[settlement] run complete` log, DB single finalization). **Deterministic
  re-invocation**: dashboard Workers & Pages → worker → Settings → Triggers → Cron
  Triggers → "Run now" (confirm the exact label at provisioning time); re-invoke is safe
  (idempotent `runSettlement`). If "Run now" is unavailable, the first scheduled run is
  the production proof and idempotency is covered by the integration lock-order tests +
  a second consecutive run. Failed runs are marked FAILED (rethrow). Missing-today =
  structured `[settlement] missing puzzle` marker; lazy activation/finalization self-heal.

## 9. Latency measurement requirements (plan §J)

Real PH users, country-filtered (`cf-ipcountry = PH`): Cloudflare Web Analytics (page
Vitals) **and** the **mandatory** game-API timing beacon (timings only — never
words/secrets/user ids; Analytics Engine `latency` dataset). Baseline ≥ 7 days, P50/P75/P95
recorded. **Evidence gate:** optimization only on PH P95 above target (proposed page >
4 s / game-call > 3 s) or a sustained ≥30% regression over 3 days with a sample-size
floor. CI/runner→Neon RTT is diagnostic only, never the baseline.

## 10. CI deploy workflow requirements (plan §K)

Separate `.github/workflows/deploy.yml`: `workflow_dispatch` with a `ref` input
hard-enforced to `main`; **the exact checked-out SHA** must equal the dispatch-time main SHA
and have a green `ci.yml` push run queried by **exact `head_sha` on the workflow-specific
endpoint** (`gh api .../actions/workflows/ci.yml/runs`, `actions: read`); build +
patched-worker
assertion + `verify:bundle`; placeholder-namespace gate; GitHub credential gate
(`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`PRODUCTION_URL`); **PRE-deploy
`wrangler secret list` name gate**; **`wrangler deploy --dry-run` binding validation** →
`wrangler deploy` → post-deploy `wrangler secret list` receipt → smoke (`PRODUCTION_URL/`
200 + `/api/game/current` 401 envelope + nosniff). Minimum permissions (`contents: read`,
`actions: read`; no write scope). **`ci.yml` stays byte-identical** — CI-7…CI-15 preserved.
Manual fallback: `npx wrangler deploy` after the same local gates.

## 11. Rollback / recovery requirements (plan §L)

Detect via post-deploy smoke + 5xx/dashboard + `[settlement] run failed` + PH latency
regression + login failure. Recover via `wrangler rollback` (versioned deployments) to
the last known-good version, or revert-on-`main` + redeploy via the deploy workflow;
Worker secrets are environment-level (not per-version) — re-verify with `wrangler secret
list` after any rollback. DB/seed issues are not deploy-rollback problems (migration on an
empty DB + seeding are idempotent).

## 12. Explicit invariants to preserve (plan §P)

CI-13 permissions/upload · CI-14 Manila-Monday guard · CI-15 timeout/recovery (only the
log-marker redaction changes) · answer secrecy (no guess words/answers in logs/bundles;
pool never on a CI runner) · zero **new** migrations (applying `0000_init` to the prod DB
is required) · server-authoritative game behavior (NG9) · rate-limit/CSRF/CSP/NG21
behavior · product lock (thresholds 3/8, both admin addresses, datasets, provenance) ·
CI-7…CI-15 architecture (`ci.yml` byte-identical; deploy is a separate workflow) ·
`_headers`/asset security · FSD/bridge boundaries · no new runtime dependencies.

## 13. Next steps for the implementation chat

1. Read, in order: `docs/phases/phase 6/phase-6-implementation-prompt.md` →
   `phase-6-plan.md` → `Architecture-v3.md` §"Phase 6 — Deployment" + §"Answer pool
   deployment" → `docs/contradictions-and-gaps.md` (CI-1…CI-15, S1a/S1b) →
   `docs/phases/pre phase 6/handoff.md` + `pre-phase-6-production-data-lock.md` →
   the files listed in the implementation prompt.
2. Execute slices 1–10 per the plan; **never invent** rate-limit `namespace_id`s,
   Worker secret values, or the production origin.
3. Coordinate the operator-provisioned prerequisites (namespaces, six Worker secrets,
   Neon SG migrate + seed, Google OAuth, Cloudflare token/account, `PRODUCTION_URL`) —
   they are one-time external steps, not CI steps. Confirm the exact current Cloudflare
   endpoint/dashboard labels for rate-limit creation and the cron "Run now" trigger at
   provisioning time (plan §I; web verification was unavailable during planning).
4. Run the plan §N gates on the deployed state and write the Phase-6 implementation
   handoff with per-goal evidence.
5. Leave `ci.yml` byte-identical; the only new workflow file is `deploy.yml`.

*Planning-state handoff produced by the Phase-6 planning pass from the actual
repository at `main` @ `294ff0b`, revised after gpt-luna v29 review. Planning-only:
nothing was deployed, provisioned, migrated, seeded, or modified.*
