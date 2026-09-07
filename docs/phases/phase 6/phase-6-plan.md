# Phase 6 — Deployment Implementation Plan

> **Planning-only document.** Nothing in this file has been executed: no deploy,
> no secret/binding provisioning, no rate-limit namespace creation, no database
> migration/seeding, no source/CI/`wrangler.toml` change. The separate implementation
> pass executes the slices below. Every "current" claim was verified against the
> repository at **`main` @ `294ff0b`** (HEAD).
>
> **Revision note (2026-09, after gpt-luna v29 review):** this revision resolves the
> review's four critical and three major findings: (1) the deploy path is now a
> **separate `deploy.yml`** (workflow_dispatch + green-CI gate) instead of an
> in-workflow job that `workflow_dispatch` could never satisfy; (2) the deploy
> workflow uses only **GitHub-side deployment credentials** (`CLOUDFLARE_API_TOKEN`,
> `CLOUDFLARE_ACCOUNT_ID`, `PRODUCTION_URL`) and verifies Worker runtime secrets by
> **name via `wrangler secret list`**, never by injecting their contents into GitHub;
> (3) **production DB migration of the existing schema** is now an explicit slice
> (Slice 5) before seeding; (4) the **game-API timing beacon (J-A2) is mandatory**
> Phase-6 verification infrastructure (an explicitly-scoped third code addition), so
> the latency goal, Slice 8, and the implementation prompt agree; (5) the deploy smoke
> uses a `PRODUCTION_URL` variable (no `<origin>` placeholder in CI); (6) rate-limit
> namespace creation and cron re-invocation have concrete operator steps.
>
> **Revision note 2 (2026-09, after gpt-luna v30 review):** three tightening fixes to
> `deploy.yml` (K.2): (1) the green-CI gate is anchored to the **actual checked-out
> SHA** (`DEPLOY_SHA = git rev-parse HEAD`), the `ref` input is hard-enforced to `main`,
> and `DEPLOY_SHA` must equal the dispatch-time main SHA — so **checked-out SHA =
> CI-tested SHA = deployed SHA**; (2) the **Worker-secret existence check moved
> PRE-deploy** (a real gate), with a post-deploy repeat kept as a receipt; (3) the
> namespace preflight is **placeholder grep + `wrangler deploy --dry-run`** so the
> actual rate-limit/ASSETS bindings resolve before any deploy.
>
> **Revision note 3 (2026-09, after gpt-luna v31 review):** (1) **first-bootstrap path
> fixed** — new §I.3 prescribes creating the initial Worker record **without a public
> deployment** and setting the six secrets via the **non-deploying/versioned mechanism
> (`wrangler versions secret put`)** or the documented dashboard bootstrap, because
> ordinary `wrangler secret put` can create+deploy a Worker version immediately under
> versioned deployments (per current Cloudflare docs — confirm at provisioning time)
> and would bypass the `deploy.yml` gate; (2) the green-CI gate now queries the Actions
> API by **exact `head_sha`** instead of paging the last 10 successful runs (a valid but
> older SHA can no longer be rejected by newer green runs).
>
> **Revision note 4 (2026-09, after gpt-luna v32 review):** §I.3 now names the
> non-deploying version workflow explicitly (**`wrangler versions upload`**) instead of a
> vague "wrangler upload", and documents `wrangler deploy --secrets-file <path>` as the
> single-step first-deploy alternative. The optional **`[secrets] required`** Wrangler
> config property (F.1) is documented as defense-in-depth — **verified locally that the
> installed wrangler 4.125.0 supports it** (config → `secrets.required`, enforced at
> `wrangler deploy`/`wrangler versions upload`, warning-only in the local preview path),
> with the side-effects an implementer must check (regenerated
> `worker-configuration.d.ts` via `wrangler types`; `deploy.yml` Gate 5 stays the
> explicit pre-deploy gate regardless).
>
> **Revision note 5 (2026-09, after gpt-luna v33 review):** Gate 2's green-CI query now
> uses the **workflow-specific endpoint** (`actions/workflows/ci.yml/runs?head_sha=…`)
> instead of the repository-wide `actions/runs` endpoint — so ONLY a successful `ci.yml`
> run (not a run of any other workflow) can satisfy the gate, matching the documented
> promise "that exact SHA has a successful `ci.yml` push run". Exact-SHA logic unchanged.
>
> Source-of-truth hierarchy: current repository state > `Architecture-v3.md` §"Phase 6
> — Deployment" / §"Answer pool deployment" > `Specifications-v1.md` >
> `docs/contradictions-and-gaps.md` (CI-1…CI-15, S1a/S1b, Phase-0–5 + C6 records) >
> Phase 0–5 + pre-Phase-6 handoffs > this prompt.

---

## A. Phase goal

"Phase 6 complete" means **each** of the following is true, with the listed evidence
(nothing is complete on a green CI alone — CI green on an older commit does not
establish current-HEAD readiness):

| Goal | "Done" means | Evidence required |
|---|---|---|
| **1. Deployed** | A production Worker named `leaderboard-wordle` (Workers Static Assets + `scheduled`) is live on the production origin and answers HTTPS traffic. | `wrangler deployments list`/dashboard shows the deployed version ID; a fresh-HEAD production build passed `verify:bundle` and the patched-worker assertion; `PRODUCTION_URL` returns 200 for `/` and 401 `UNAUTHORIZED` envelope for `GET /api/game/current` (NG21). |
| **2. Migrated + Seeded** | The production Neon (Singapore) database has the **existing** schema applied (zero NEW migrations) and the 2,315-word private answer pool present with `answers ⊂ valid guesses` re-validated at seed time. | Migration receipt: `DATABASE_URL=<prod> bun ./scripts/ci-migrate.ts` → "migrations applied successfully"; `scripts/ci-db-probe.ts` connect OK; migrations table has the `0000_init` row and app tables exist. Seed receipt: `bun run seed:answers` report (inserted / already present) + `SELECT count(*) FROM answer_dictionary` = 2,315; no pool word in any public artifact/bundle/log (verify:bundle + e2e 401/403 gates stay green). |
| **3. Verified** | Production origin/CSRF/OIDC works: Google sign-in, sign-out, admin promotion for **both** admin addresses, CSRF same-origin checks, CSP/security headers, HSTS and Secure cookies over HTTPS. | A real Google OIDC round-trip from the production origin; both admin emails promoted; `curl -sI` over https shows the header contract incl. HSTS; browser session cookie is `HttpOnly`+`Secure`. |
| **4. Measured** | A real-user latency baseline from the Philippines exists (page Vitals **and** game-API request timing) and is evidence-gated: no optimization may happen without a demonstrated regression/excess against that baseline. | Cloudflare Web Analytics (PH country page-load Vitals) + the game-API timing beacon (J-A2, mandatory) baselines (P50/P75/P95) recorded over ≥ 7 production days; the optimization gate (J) is documented and unfired (or fired with evidence). |
| **5. Cron verified** | The `0 16 * * *` (Asia/Manila midnight) settlement cron ran successfully in production at least once, idempotently. | First production run observed in dashboard (invocation OK, not FAILED) + `[settlement] run complete` structured log with the expected report; a manual re-invocation (dashboard "Run now", I) produced no duplicate finalization (idempotency proof). |

**NOT part of "done"**: performance optimization (only when J's evidence gate fires),
new features, schema changes, threshold/dataset/admin-list changes, visual-review
sign-off (a pre-Phase-6 open item that is NOT a Phase-6 gate — see B/C).

---

## B. Current deployment posture

Repository identity (verified at planning time):

- Branch `main`; **HEAD `294ff0b`** — `diag(game): start/end markers in the guess handler (CI-15)`.
- Commits after the original planning-prompt anchor `f031dc4` (verified, exhaustive to HEAD):
  `812b0a8` (avatar selected-badge clipping fix) · `fab307c` (CI-14: Manila-Monday I8 guard) ·
  `fcab2cf` (CI-13: Playwright failure-artifact upload + job-level `actions: write`) ·
  `1d1de4a` (CI-15: bounded guess requests) · `294ff0b` (CI-15: request start/end diagnostics).
- Working tree: only pre-existing noise — `.idea/material_theme_project_new.xml`, the
  planning prompt file itself, and an untracked `game-flow-authenticated-ga-5f333--rendered-NO-position-block-app/`
  (Playwright failure artifacts; scratch, not part of the repo).

### Classification key
Each finding below is marked **[verified current state]** (read from the repo),
**[planned/missing]** (the plan must add it), **[operator-provisioned]** (external
one-time infrastructure/config the operator creates; planning must never invent
credentials/IDs), or **[unresolved]** (a decision the plan must surface, never silently resolve).

### B.1 Deployment configuration surface

| Item | State | Notes |
|---|---|---|
| `wrangler.toml` name/main/compat | **[verified current state]** | `leaderboard-wordle`, `main = ".svelte-kit/cloudflare/_worker.js"`, `compatibility_date = "2026-08-23"`, `compatibility_flags = ["nodejs_compat"]` (Better Auth AsyncLocalStorage). |
| `[assets] ASSETS` | **[verified current state]** | `binding = "ASSETS"`, `directory = ".svelte-kit/cloudflare"` (Workers Static Assets). |
| Cron trigger | **[verified current state]** | `[triggers] crons = ["0 16 * * *"]` — NG1: Cloudflare cron is UTC-only; Asia/Manila (UTC+8, no DST) midnight = `16:00 UTC`. |
| Four `[[ratelimits]]` | **[verified + operator-provisioned]** | `AUTH_RATE_LIMITER` 10/60s · `GAME_RATE_LIMITER` 30/60s · `ME_RATE_LIMITER` 10/60s · `ADMIN_RATE_LIMITER` 20/60s, `simple` mode (wrangler 4.125 only supports `simple`, period 10\|60 — S1a/S1b). **All four `namespace_id = "00000000-…"` are placeholders — the ONLY missing config piece here; the real IDs are OPERATOR-PROVISIONED (I gives exact steps) and must never be invented.** |
| `account_id` / `[vars]` / routes / workers.dev | **[planned/missing + operator-provisioned]** | Absent today. No account id (supply `CLOUDFLARE_ACCOUNT_ID` at deploy or add it), no vars (all six runtime values go to `wrangler secret put`), no routes/custom domain → production host is the account's `leaderboard-wordle.<subdomain>.workers.dev` **unless the operator adds a custom domain** (explicit operator decision, D-ORIGIN; the CI smoke URL comes from `PRODUCTION_URL`, not from config — G/K). |
| `_headers` (repo root) | **[verified current state]** | `/_app/* → X-Content-Type-Options: nosniff`. Verified the root file is the correct location: adapter-cloudflare v7 (`node_modules/@sveltejs/adapter-cloudflare/index.js:136-142`) copies root `_headers` into `${dest}/_headers` and merges its generated immutable-asset rules (Phase-5 S5c; the earlier doc wording "`static/_headers`" is loose — the implemented root file is authoritative). Platform-served assets (nosniff) complement the app-emitted contract. |
| Build pipeline | **[verified current state]** | `vite build` → `@sveltejs/adapter-cloudflare` → `patchWorkerOnBuild` (`vite.config.ts`) runs `scripts/patch-worker-scheduled.ts`: esbuild-bundles `src/server/puzzle/scheduled-entry.ts` → `.svelte-kit/cloudflare/_settlement.js`, appends `import { scheduled } …; export { scheduled }` to `_worker.js` (idempotent; defers during the client phase; CI asserts `grep -q "export { scheduled }"`). The production artifact therefore **does** carry `scheduled`. |
| `verify:bundle` | **[verified current state]** | `scripts/verify-bundle-secrecy.ts`: scans build output for answer-pool words **not** in the public valid-guess list (public-list members are documented by-design — Phase-4 deviation). Maps directly onto the production build as the secrecy gate. |
| `package.json` scripts | **[verified current state]** | **No `deploy` script.** Has `build`, `preview`, `types`, `types:check`, `verify:bundle`, `seed:answers`, `db:migrate`, `test:*`. Phase-6 adds the deploy path via `deploy.yml` (K) and documents a manual `npx wrangler deploy` fallback. |
| CI workflows | **[verified current state]** | `.github/workflows/ci.yml` — 4 jobs, **no deploy job, no `workflow_dispatch`** (details B.5). Phase-6 adds a **separate** `.github/workflows/deploy.yml` (K) and leaves `ci.yml` **byte-identical** (preserving CI-7…CI-15). |

### B.2 Secrets and configuration

| Secret/binding | State | Fail-closed behavior if missing |
|---|---|---|
| `DATABASE_URL` (Neon **Singapore** WebSocket URL) — **Worker secret** | **[operator-provisioned]** | `getDb`/`createAuth` throw: `getDb` → AppError 500 `DATABASE_URL is not configured`; Better Auth cannot start. App fails closed on first request. |
| `BETTER_AUTH_SECRET` — **Worker secret** | **[operator-provisioned]** | `createAuth` throws `BETTER_AUTH_SECRET is required` unless `NODE_ENV ∈ {development, test}` (Workers never set `NODE_ENV` → the dev fallback `DEV_SECRET` can never be selected in production — policy is runtime-conditional, not fold-dependent; unit-tested). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — **Worker secrets** | **[operator-provisioned]** | Empty values reach better-auth → Google sign-in fails/errors; app continues for anonymous pages (fail-closed for the auth feature, verified: better-auth with empty creds does not silently accept). |
| `ADMIN_EMAIL` — **Worker secret/var** | **[operator-provisioned + UNRESOLVED gap]** | **Gap (verified):** `src/server/middleware/auth.ts` `applyAdminBootstrap` promotes when `userEmail === configured.toLowerCase()` — an **exact single-string match**. The product lock requires **both** `tee.johnlor@gmail.com` and `leaderboardwordle@gmail.com`. The pre-Phase-6 handoff's claim "existing promotion semantics; no code change" is **wrong for two admins**. Phase-6 remediation (explicit, in-scope, E.3): support a separated allowlist (`,` or `;`) in `applyAdminBootstrap`, with promotion comparison per-list-entry. Without this, only ONE admin can ever be promoted. Missing/empty → **no admin is ever promoted** (NG18: no-admin = manual DB/operator bootstrap). |
| `BETTER_AUTH_URL` — **Worker var** | **[operator-provisioned]** | `baseURL = env.BETTER_AUTH_URL ?? 'http://localhost:5173'`. In production it MUST be the production `https://<origin>` or Google OIDC callbacks + sign-in redirects break and better-auth's origin check misbehaves. |
| `trustedOrigins` | **[verified current state]** | `['http://localhost:5173','http://127.0.0.1:4173']` only. Production is covered by `BETTER_AUTH_URL`'s own origin (better-auth origin check = baseURL origin ∪ trustedOrigins); the localhost entries are harmless in production (attacker origins can never equal them). **No production code change needed.** |
| Dev-secret fallback policy | **[verified current state]** | `NON_PRODUCTION_ENVS = {development, test}` gate (BETTER_AUTH_SECRET policy above). A production Worker can never select the dev secret. |
| `.dev.vars` / `.env` / seed source gitignored | **[verified current state]** | `.gitignore`: `.env`, `.env.*` (except `.env.example`/`.env.test`), `.dev.vars`, `scripts/seed/*.txt`, `.cache`, `test-results`, `playwright-report`, `coverage`. No secret can leak into the bundle from committed files; verify:bundle + admin-secrecy pins cover bundle content. |
| Production origin (domain) | **[operator-provisioned + UNRESOLVED]** | workers.dev subdomain vs custom domain — operator decision (D-ORIGIN); drives `BETTER_AUTH_URL`, Google OAuth authorized origins/redirect URI, HSTS preload (Phase-5 D6). **The CI smoke URL comes from the `PRODUCTION_URL` GitHub variable (K), so CI never embeds an unresolved placeholder.** |
| GitHub deployment credentials | **[planned/missing + operator-provisioned]** | `CLOUDFLARE_API_TOKEN` (secret), `CLOUDFLARE_ACCOUNT_ID` (secret), `PRODUCTION_URL` (variable, non-sensitive). Used only by the deploy workflow (K). These are the ONLY GitHub-side credentials; the six Worker runtime values never enter GitHub. |

### B.3 Database / seeding

- Driver (verified): `src/server/db/client.ts` — `Pool` from `@neondatabase/serverless` (WebSocket, interactive transactions / `SELECT … FOR UPDATE`) + `drizzle-orm/neon-serverless`. Do **not** substitute the HTTP-only `neon-http` path.
- Neon **Singapore** region is the production target; the existing non-production Neon is a different database and must never be the production `DATABASE_URL`.
- Migration (verified): the migration set is exactly `src/server/db/migrations/0000_init.sql` (the only migration). CI applies it programmatically via `scripts/ci-migrate.ts` (`DATABASE_URL`-driven, `drizzle-orm/node-postgres/migrator`); local alternative `bun run db:migrate` (drizzle-kit). **Applying this existing migration to the empty production DB is a required Phase-6 step (E.5) and does NOT violate the zero-migration invariant** (no NEW migration is authored).
- Seed contract (verified, `scripts/seed/README.md` + `import-answer-pool.ts`): `bun run seed:answers` requires the gitignored `scripts/seed/answer-pool.source.txt`; validates lowercase 5-letter words, no duplicates, **`answers ⊂ VALID_GUESS_SET` at seed time** (NG13); idempotent `ON CONFLICT DO NOTHING`; batches of 500; exit codes 0 = imported / 1 = source invalid or import failed / 2 = missing `DATABASE_URL`. Source provenance pinned (2,315 words @ `deedy/wordle-solver` commit `924deba…`, SHA-256 `ecc026…01f0`).
- **Zero-migration invariant** (Phase-3 D1): Phase-6 authors **no** new migration; CI's `Schema purity` gate enforces it.

### B.4 Production verification requirements

- Settlement cron: see I. Rethrows after structured logging → failed runs are marked FAILED in the dashboard (audit-resolved deviation).
- Latency: see J. Explicitly: GitHub Actions/CI-runner → Neon observations are **diagnostic evidence only**, never the Philippines-user baseline (cross-region runner RTT is not the product path).
- Rollback: see L.
- CI-15 production-resilience: see E.2 + O.
- **Temporary diagnostics (verified):** `src/server/game/handlers.ts:93-99` logs `console.error('[game-guess] start|done … word=${word} …')`. The `word` is the **player's guess** — for any solved day this equals the day's **answer**, and logging it (via `console.error`, which lands in Cloudflare logs) exposes today's/future answer material to anyone with log access; `user.id` is also PII. **Decision: this is an explicit Phase-6 deployment remediation (E.2) — the word must be removed/redacted before production.** No other server log carries answer material (settlement/admin markers log counts/dates only — verified).

### B.5 CI workflow (as built)

`.github/workflows/ci.yml` — verified actual state, four jobs, no deploy job:

1. **unit-and-build** (PR + push): install → `bun audit --audit-level=high` → lint → word-list + diff → avatar-list + diff → `auth:check` → `check` → unit → build → **schema purity** (`git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations`) → **patched-worker assertion** (`grep -q "export { scheduled }"`) → `types:check` → `verify:bundle`.
2. **integration** (push-only, `if: github.event_name == 'push'`): ephemeral `postgres:16-alpine` service container, `LOCAL_PG=1` node-postgres harness seam, `scripts/ci-db-probe.ts` → `scripts/ci-migrate.ts` → `test:integration`. No secrets; never skips (CI-7).
3. **e2e** (push-only, shared non-production Neon): mandatory secret gate (CI-9), `.dev.vars` materialization (CI-10), `ALLOW_DB_WIPE=true`, Playwright `app` project, advisory-lock mutex (CI-2), **job-level `permissions: { contents: read; actions: write }`** (CI-13 — `actions/upload-artifact` needs `actions: write`; re-declared `contents: read` because job-level permissions replace workflow defaults), uploads `test-results/` **only on failure**.
4. **smoke** (needs unit-and-build only; DB-free project).

Workflow-level `permissions: contents: read` (S6c). No `workflow_dispatch`. **Phase-6 does NOT modify this file** — deployment lives in a separate `deploy.yml` (K).

### B.6 Highest-risk deployment gaps (pre-audit summary)

1. **Four placeholder rate-limit `namespace_id`s** — a deploy with the placeholders either fails or (worse) wires a wrong/shared namespace; must be operator-created and substituted first (E.1/I, M).
2. **`ADMIN_EMAIL` single-address match vs two required admins** (B.2) — the pre-Phase-6 handoff mis-stated this; remediation is a small code change (E.3).
3. **Production origin unset** — `BETTER_AUTH_URL`/Google OAuth/`trustedOrigins` semantics all hang on D-ORIGIN (E.3, G). The CI smoke is decoupled via `PRODUCTION_URL` (K) so it does not block on D-ORIGIN.
4. **CI-15 guess-word diagnostics** would leak today's/future answers into production logs (E.2, M).
5. **No deploy workflow and no production DB migration/seed step** — the entire production path is currently manual/absent (E.4/E.5/K).
6. **Latency baseline does not exist** — without J's methodology there is no evidence gate and the architecture's "optimize only with evidence" cannot be honored (E.8/J).

---

## C. Scope

### In scope (each justified by repo/architecture evidence)

1. **Cloudflare Workers + Neon Singapore production deployment** (Architecture §"Phase 6 — Deployment"): the deploy path, production artifact, versioned deployment, smoke.
2. **Production secrets/vars/bindings provisioning plan** — the six Worker runtime values (`DATABASE_URL` [Neon SG], `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL` [both addresses — see E.3], `BETTER_AUTH_URL`), the GitHub deployment credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PRODUCTION_URL`), and the **exact operator steps to create the four rate-limit namespaces and record real `namespace_id`s** (never invented — I).
3. **Production Neon initialization**: apply the **existing** migration to the empty production DB, then **seed** the answer pool and re-verify `answers ⊂ valid guesses` (E.5, H).
4. **Production origin/CSRF/OIDC configuration** — `BETTER_AUTH_URL`, `trustedOrigins` assessment, Google OAuth authorized origin + redirect URI (G).
5. **Settlement cron production verification plan** (I).
6. **Real-user latency measurement methodology from the Philippines + evidence-driven optimization gate** (J) — includes the mandatory game-API timing beacon (J-A2).
7. **CI deploy workflow** in a new `deploy.yml`, preserving CI-7…CI-15 byte-identical (K).
8. **Rollback / incident-recovery runbook** (L).
9. **The two explicit deployment remediations** the plan identifies as required for a safe production run:
   - CI-15 guess-word diagnostics redaction (E.2) — mandated by the prompt ("temporary CI-15 guess-word diagnostics are explicitly resolved before production").
   - `ADMIN_EMAIL` two-admin allowlist (E.3) — required by the product lock; the current code cannot express it.
   Plus **one explicitly-scoped verification addition**: the J-A2 game-API timing beacon (E.8/J), which is verification infrastructure (timings only), not a product feature.

### Out of scope (explicitly NOT Phase 6)

- New product features (e.g., notification/email alerting, admin settlement tooling, shadcn surface expansion — C6-11 post-deployment candidates).
- **New** schema changes / migrations (zero-migration invariant; applying the existing migration to a new DB is in scope, not a new migration).
- Changing product thresholds (weekly 3 / monthly 8), admin emails (the two are fixed), or datasets (12,972 / 2,315 / 3,944).
- Loosening any security/secrecy gate (verify:bundle, admin-secrecy pins, subset pin, e2e 401/403, CSP).
- Speculative performance optimization without a measured baseline (J gate).
- Modifying the CI architecture already established in CI-7…CI-15 (deploy is a separate workflow; `ci.yml` untouched).
- **Visual-review sign-off of pre-Phase-6 UI** — that is a pre-Phase-6 open item (`pre-phase-6-visual-review-handoff.md`; pixel-level inspection still outstanding, `.cache/ui-shots/prephase6/`); Phase-6 must not claim it and must not reopen it.
- Anything belonging to Phase 7 or later (see O).

---

## D. Target deployment architecture

### D.1 Final topology

```text
Philippines users (browser)
        │  HTTPS
        ▼
Cloudflare edge (Workers Static Assets — ASSETS binding, _headers, CSP/headers
app-emitted, pre-paint theme script hash-allowed)   [CF-Connecting-IP for rate limits]
        │
        ▼
Worker "leaderboard-wordle" (nodejs_compat)
   fetch  ← SvelteKit pages + Hono /api/* (bridge src/routes/api/[...path]/+server.ts)
   scheduled ← 0 16 * * * (Asia/Manila midnight) → runSettlement (patched export)
        │
        ├─ Neon (Singapore) DATABASE_URL — @neondatabase/serverless WebSocket Pool
        │     answer_dictionary (seeded, private) · daily_puzzles · games · user …
        ├─ Workers Rate Limiting — AUTH/GAME/ME/ADMIN namespaces (operator-created)
        └─ Analytics Engine dataset `latency` (J-A2 game-API timing beacon, optional-disable)
```

### D.2 Request flow (gameplay, the path CI-15 targets)

`POST /api/game/:gameId/guess` → CSRF (host-relative origin check, `/api/auth/*` excluded) →
`authContext` → `requireAuth` → `GAME_RATE_LIMITER` (keyed `user_id`) → zValidator strict →
handler (with the CI-15 start/done markers **redacted per E.2**) → `submitGuess`
(puzzle-row lock, `transaction_timestamp()` eligibility, terminal transitions) → Neon.

### D.3 Bindings summary (final production set)

- **Worker secrets** (via `wrangler secret put`, all fail-closed, never in GitHub):
  `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `ADMIN_EMAIL` (both addresses), `BETTER_AUTH_URL`.
- Rate-limit bindings (from `wrangler.toml`, real IDs substituted): `AUTH_RATE_LIMITER`,
  `GAME_RATE_LIMITER`, `ME_RATE_LIMITER`, `ADMIN_RATE_LIMITER`.
- Assets binding (config): `ASSETS`.
- Optional verification binding (J-A2): `[[analytics_engine_datasets]] latency`
  (operator-created dataset).
- **GitHub-side only** (deploy workflow): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
  (secrets), `PRODUCTION_URL` (variable).

### D.4 Cron + CSP behind the platform

- `scheduled` export is appended post-build (verified pipeline); the production artifact carries it.
- CSP: the pre-paint theme script (`src/app.html`) is allowed by its pinned `sha256-PBIDO3zx1…` (`src/server/middleware/csp.ts` + unit hash pin); Kit hash-mode augments `script-src`; `style-src` tightened (S2c). Behind the platform these headers are app-emitted (Hono + hooks), so nothing platform-specific changes; the `_headers` file only adds nosniff on `/_app/*`. No CSP change is required for deploy.

---

## E. Implementation slices

Order by dependency. Each slice is independently verifiable; do not merge slices.

### Slice 1 — Deployment configuration & secret/binding plan (incl. rate-limit namespace provisioning)

- **Objective**: make the production config complete and fail-closed, and produce the operator provisioning checklist (no credentials invented).
- **Files/config affected**: `wrangler.toml` (substitute four real `namespace_id`s; add `account_id` or document `CLOUDFLARE_ACCOUNT_ID`; **no `[vars]`** — the six runtime values stay as Worker secrets); `.github/workflows/deploy.yml` gates reference the GitHub credentials (E.4); handoff operator checklist (I).
- **Current behavior**: placeholders `00000000-…`; no account id; no vars.
- **Desired behavior**: real namespace IDs in `wrangler.toml`; documented operator steps; `wrangler deploy --dry-run` lists all four rate-limit bindings + ASSETS.
- **Worker/Cloudflare changes**: none (config only).
- **Neon/database changes**: none (this slice is Cloudflare-side provisioning).
- **Secrets/CI changes**: operator provisions the six Worker values per the bootstrap procedure (**§I.3 — versioned/non-deploying mechanism on the first setup**, not a gate-bypassing `wrangler secret put`); operator sets GitHub `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PRODUCTION_URL`; the deploy workflow's gates (Slice 4/§K.2) verify GitHub credentials + **pre-deploy** `wrangler secret list` names.
- **Tests/verification**: `bunx wrangler deploy --dry-run` (bindings listed, no placeholder); `bun run types:check`; `wrangler secret list` (names only).
- **Acceptance criteria**: all four `namespace_id`s real and recorded in the handoff; six Worker secrets set; three GitHub credentials set; `--dry-run` clean; no placeholder remains in `wrangler.toml` on `main`.
- **Risk/rollback**: config-only, no runtime risk; a wrong namespace id = wrong rate-limit class (limits are abuse-protection only, not accounting — S1c/S1d note); reverting = restore the previous `wrangler.toml`.

### Slice 2 — CI-15 production-resilience assessment + diagnostic redaction (deployment remediation)

- **Objective**: resolve the temporary `[game-guess]` diagnostics before production and lock the CI-15 timeout/recovery as production-appropriate (or explicitly defer any behavior change with an evidence rule).
- **Files/config affected**: `src/server/game/handlers.ts` (redact the markers); `tests/e2e/game-flow.spec.ts` + any unit test asserting marker shape (update, not weaken); `docs/contradictions-and-gaps.md` (record CI-15 production decision).
- **Current behavior**: `console.error('[game-guess] start user=… game=… word=…')` and `…done … word=… guess=… status=…` — logs the raw guess word (for a solved day, the answer) and `user.id` into worker logs; the client bounds each guess request at `GUESS_REQUEST_TIMEOUT_MS = 15_000` (`src/lib/shared/api/game.ts`), aborting on timeout and surfacing `ApiError REQUEST_TIMEOUT` so the keyboard re-enables.
- **Desired behavior**: **no guess word (and no `user.id`) in any production log.** The marker either becomes a payload-free `[game-guess] done game=<id> status=<s> duration_ms=<n> requestId=<r>` or is removed after E7 confidence. The 15 s timeout stays; the server keeps running the transaction to completion independently of the client socket (this is expected and acceptable — see CI-15 audit below).
- **CI-15 production audit (recorded conclusion)**:
  - *Can a timed-out request still commit server-side?* **Yes.** The abort only closes the client socket; the Worker may continue (or be cancelled at the next I/O point). Either way a server commit after client timeout is possible.
  - *How do retries interact with locking/idempotency?* `submitGuess` has **no duplicate-word guard**; each accepted submission increments `guessNumber`. A timeout-retry for a guess that *already committed but non-terminal* inserts a second row with the same word (consumes an extra attempt, ≤1 lost attempt per rare timeout). If the committed guess *terminalized* (solved), the retry is rejected (game no longer ACTIVE) and the client must reload to show the terminal state. Impact: low, bounded by the 30/min game rate limit, and still server-authoritative (no cross-user integrity impact, NG9 lock/liveness untouched).
  - *Is 15 s appropriate for production?* **Yes.** Bounded UX; real-Neon CI observations showed multi-second round trips; 15 s > observed P99 and < the 30 s Hono timeout. Change only with evidence (J baseline + a measured timeout/retry rate).
  - *What evidence is needed before changing this behavior?* A production baseline of guess-request duration + timeout frequency (from the redacted logs/telemetry, J), and a recorded decision on whether to add a **server-side consecutive-duplicate-word guard** (deferred — see O; it alters game semantics and is a product decision).
- **Tests/verification**: `grep -rn "word=" src/ | grep game-guess` → none; unit + e2e suites green (the redaction must not change the guess wire behavior); a targeted check that no `[game-guess]` line contains a 5-letter lowercase token.
- **Acceptance criteria**: no guess word/user id in the marker; CI green; decision recorded in the contradictions log.
- **Risk/rollback**: trivial code change; rollback = revert the handler edit.

### Slice 3 — Production origin/CSRF/OIDC + two-admin allowlist (deployment remediations)

- **Objective**: make Google OIDC, CSRF, and both-admin promotion work on the production origin; keep all origin checks fail-closed.
- **Files/config affected**: `src/server/middleware/auth.ts` (**two-admin allowlist** in `applyAdminBootstrap` — parse `ADMIN_EMAIL` as a `,`/`;`-separated list, compare trimmed+lowercased per entry, promote when any entry matches, never demote; unit tests for 1-entry, 2-entry, mixed-case, empty); `src/server/auth/auth.ts` (assess — likely **no change**: `trustedOrigins` stays, production covered by `BETTER_AUTH_URL`); no CSRF code change (host-relative `isSameOriginRequest` works for any production host — verified `src/server/lib/origin.ts`; `ALLOWED_ORIGINS` env must never contain `*`, filtered at runtime). Operator: set `BETTER_AUTH_URL` to `https://<origin>` (from the D-ORIGIN decision), register Google OAuth redirect URI `https://<origin>/api/auth/callback/google` + authorized origins, set the six Worker secrets (E.1).
- **Current behavior**: single-email `ADMIN_EMAIL` match (gap, B.2); `trustedOrigins` = localhost only; `BETTER_AUTH_URL` defaults to `http://localhost:5173`.
- **Desired behavior**: both admins promote on first request after sign-in; production origin resolves Google callbacks; CSRF rejects cross-site JSON mutations with 403 (same-origin control proves the positive case).
- **Worker/Cloudflare changes**: none beyond E.1 secrets.
- **Neon/database changes**: none (promotion is a `UPDATE … SET role='admin'` with the `WHERE role <> 'admin'` no-op — NG18; never demotes).
- **Secrets/CI changes**: `ADMIN_EMAIL` = `tee.johnlor@gmail.com,leaderboardwordle@gmail.com` (or `;`-separated — implementation must pick ONE separator and document it; the unit tests pin the choice).
- **Tests/verification**: unit tests for the allowlist parser (single/two/mixed-case/whitespace/empty/`*`); e2e admin 401/403 stays green; a real Google round-trip on the production origin promotes **both** addresses (documented evidence).
- **Acceptance criteria**: both admin emails promote; Google sign-in/out works on `https://<origin>`; CSRF positive+negative pins green; no `trustedOrigins`/CSRF weakening.
- **Risk/rollback**: small, tested code change; rollback = revert `auth.ts`.

### Slice 4 — CI deploy workflow (separate `deploy.yml`, controlled, min-permission)

- **Objective**: a deterministic, controlled deploy path that only ships `main` that has a green CI run, without touching `ci.yml` (CI-7…CI-15 byte-identical).
- **Files/config affected**: **new** `.github/workflows/deploy.yml`; `.github/dependabot.yml` (no change — dependabot `github-actions` keeps any new SHA-pinned action fresh); **`ci.yml` is NOT modified** (see K for the design decision that resolves the v29 `workflow_dispatch` contradiction).
- **Current behavior**: no deploy path; `ci.yml` has no `workflow_dispatch` and its integration/e2e jobs are push-gated, so an in-workflow manually-triggered deploy could never satisfy `needs` (this is why deploy is a separate workflow).
- **Desired behavior** (full spec in K):
  - `deploy.yml` triggered by **`workflow_dispatch`** with a `ref` input that is **hard-enforced to `main`** (Gate 1).
  - Gate: **the exact checked-out SHA** (resolved via `git rev-parse HEAD` after checkout) must equal the dispatch-time main SHA **and** have a **successful `ci.yml` push run** (Gate 2, via `gh api` with `actions: read`) — invariant: checked-out SHA = CI-tested SHA = deployed SHA.
  - Steps: checkout `main` → install → build → patched-worker assertion → `verify:bundle` → **placeholder namespace gate (Gate 3)** → credential gate (Gate 4) → **PRE-DEPLOY `wrangler secret list` name gate (Gate 5)** → **`wrangler deploy --dry-run` binding validation (Gate 6)** → `wrangler deploy` → post-deploy **`wrangler secret list` receipt** → **smoke against `PRODUCTION_URL`** (page 200 + `/api/game/current` 401 envelope + header contract).
  - Permissions: `contents: read`, `actions: read` (CI-status check), **no write scope**.
- **Tests/verification**: YAML review (no actionlint installed — manual review); a dry local run of the gates (placeholder + credential checks); `ci.yml` diff = empty.
- **Acceptance criteria**: a manual dispatch deploys only on green-main with the **exact checked-out SHA = CI-tested SHA = deployed SHA**; it fails loudly on a non-main ref, placeholder namespace, missing credentials, missing Worker secrets (pre-deploy), dry-run binding failure, or non-green CI; a green deploy produces a live version (smoke passes); `ci.yml` is byte-identical.
- **Risk/rollback**: additive (new file); worst case a deploy failure leaves the previous version live (L).

### Slice 5 — Production Neon initialization: migrate existing schema + seed answers

- **Objective**: bring the empty production Neon (Singapore) database to the current schema (**applying the existing migration — not a new one**) and seed the private answer pool, with receipts.
- **Files/config affected**: none in the repo (operator runs against the production `DATABASE_URL`); receipts recorded in the handoff. Optionally a `docs/phases/phase 6/production-db-receipts.md` scratch receipt doc (no secrets).
- **Current behavior**: no production database exists/configured; the migration set is exactly `src/server/db/migrations/0000_init.sql`.
- **Desired behavior**:
  1. Operator creates the Neon **Singapore** project + database; obtains the WebSocket/pooled `DATABASE_URL` and sets it as the `DATABASE_URL` Worker secret (E.1) — the value never enters the repo or GitHub.
  2. **Migrate**: `DATABASE_URL=<prod> bun ./scripts/ci-migrate.ts` (programmatic migrator, proven in CI; local alternative `bun run db:migrate`). This applies the **existing** `0000_init` — no new migration authored (zero-migration invariant preserved).
  3. **Verify migration**: `DATABASE_URL=<prod> bun ./scripts/ci-db-probe.ts` (redacted connect facts + `SELECT 1`) and a schema query — `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` and the presence of `answer_dictionary`, `daily_puzzles`, `user` (or the migration row in `drizzle.__drizzle_migrations`); record a receipt.
  4. **Seed**: `DATABASE_URL=<prod> bun run seed:answers` (H contract — validates `answers ⊂ valid guesses`, idempotent) then `SELECT count(*) FROM answer_dictionary` = 2,315; record the report.
- **Worker/Cloudflare changes**: none.
- **Neon/database changes**: this slice **is** the database change — schema applied + data seeded.
- **Secrets/CI changes**: none (operator-only; seeding never runs on a runner — H).
- **Tests/verification**: the migration receipt (step 3) + seed report + count; the subset invariant is re-validated by the seed tool itself.
- **Acceptance criteria**: production DB at `0000_init` schema; `answer_dictionary` = 2,315; receipts recorded; zero new migrations authored.
- **Risk/rollback**: migration is applied once to an empty DB (idempotent migrator re-run is safe); seeding is idempotent (`ON CONFLICT DO NOTHING`); rollback = point the Worker at a different DB or re-provision (no data to destroy before users arrive).

### Slice 6 — Production deployment + smoke of the deployed URL

- **Objective**: first production deploy of current HEAD, verified end-to-end.
- **Files/config affected**: none (deployment via Slice 4/§K or the documented manual `npx wrangler deploy`); `.env`/`.dev.vars`-style local secret files untouched.
- **Current behavior**: no production deployment exists.
- **Desired behavior**: a live Worker serving pages + API from the production origin; version recorded.
- **Worker/Cloudflare changes**: deploy; enable workers.dev subdomain (or custom domain) — operator (D-ORIGIN); the smoke URL is `PRODUCTION_URL`.
- **Neon/database changes**: production DB must be **migrated + seeded** first (E.5).
- **Secrets/CI changes**: E.1 Worker secrets + GitHub credentials in place; deploy path green.
- **Tests/verification**: post-deploy smoke (K) + `wrangler secret list` assertion; real-browser e2e smoke against `PRODUCTION_URL` (Google sign-in, start game, guess, leaderboard, admin) — operator-supervised; header probe (nosniff/XFO/Referrer/HSTS-over-https/Secure-cookie prefixes — Phase-5 op step 3); CSP console-clean in a real browser on the prod URL.
- **Acceptance criteria**: every A-goal "Deployed" + "Verified" evidence item exists.
- **Risk/rollback**: L.

### Slice 7 — Settlement cron production verification

- **Objective**: prove the first production cron run happened, idempotently, at the correct UTC instant.
- **Files/config affected**: none (verification only).
- **Current behavior**: cron configured (`0 16 * * *`); `scheduled` export patched; `runSettlement` idempotent (SKIP LOCKED + finalize-before-activate, NG9 lock orders) and rethrows so failures show as FAILED in the dashboard.
- **Desired behavior**: verified first run at `16:00 UTC` (Asia/Manila midnight) with the expected reconciliation outcome.
- **Worker/Cloudflare changes**: none (observe via dashboard + `wrangler tail`).
- **Neon/database changes**: verify no double finalization after a manual re-trigger (I gives the deterministic re-invocation procedure).
- **Secrets/CI changes**: none.
- **Tests/verification**: dashboard invocation log (OK, not FAILED) for the expected cron time; `[settlement] run complete` structured log with `finalized`/`activatedToday`/`missingToday` counts; DB query confirming today's puzzle ACTIVE and yesterday FINALIZED exactly once; the missing-today marker absent (or present + alerted) per the missing-puzzle invariant.
- **Acceptance criteria**: first production run verified; idempotency proven (re-invoke → no duplicate finalization); detection path for a missed run documented (I).
- **Risk/rollback**: none (read-only verification; settlement self-heals via lazy activation/finalization).

### Slice 8 — Real-user latency measurement from the Philippines + evidence gate

- **Objective**: a concrete, evidence-based PH baseline for **both** page load and the game-API path; no optimization without it (Architecture guiding principle 15 / §1187).
- **Files/config affected**: two mandatory instruments:
  - **J-A1 — Cloudflare Web Analytics** (operator-enable; zero code): per-country real-user page Vitals, PH filter (`cf-ipcountry = PH`).
  - **J-A2 — game-API timing beacon (MANDATORY Phase-6 verification infrastructure)**: add `[[analytics_engine_datasets]] latency` to `wrangler.toml` (operator creates the dataset), a minimal `POST /api/telemetry` endpoint (registered in `routes.ts`; rate-limited to the `me` class; strict-schema, timings only — **never words/secrets/user ids**), client timing capture for `GET /api/game/current` + `POST /api/game/:gameId/guess` (TanStack Query timing), posted via `navigator.sendBeacon`, filtered to `cf-ipcountry = 'PH'` server-side. This is the **explicitly-scoped third code addition** in Phase 6 (C).
- **Current behavior**: no RUM, no timing telemetry, no baseline.
- **Desired behavior**: PH page-load + game-API P50/P75/P95 baselines over ≥ 7 production days; the gate (J) governs any optimization.
- **Worker/Cloudflare changes**: J-A2 adds a binding + endpoint (verification infrastructure, not a product feature); the endpoint can be disabled after the baseline is collected without product impact.
- **Neon/database changes**: none (Analytics Engine is outside the Postgres schema → zero-migration preserved).
- **Secrets/CI changes**: none.
- **Tests/verification**: unit/e2e for the telemetry endpoint contract (401 without auth; strict payload schema rejects non-timing fields and any string body; no guess words); a dashboard query proves PH timings flow.
- **Acceptance criteria**: baseline recorded and stored; the gate document (J) is explicit; optimization only on evidence.
- **Risk/rollback**: J-A2 is additive and can be disabled (remove the binding + endpoint or gate behind a flag) without product impact.

### Slice 9 — Rollback / incident-recovery runbook

- **Objective**: document detection + recovery (L). Files: `docs/phases/phase 6/phase-6-runbook.md`. No code change.

### Slice 10 — Final verification gate + receipts

- **Objective**: run N's full gate set on the deployed production state and write the Phase-6 implementation handoff (all A-goals evidenced). Files: `docs/phases/phase 6/phase-6-implementation-handoff.md` (new, written by the implementation pass).

---

## F. Secrets & bindings contract

### F.1 Worker runtime secrets/vars (Cloudflare, never GitHub)

| Name | Kind | Source (injection) | Operator-provisioned? | Missing → | Provision steps |
|---|---|---|---|---|---|
| `DATABASE_URL` | secret | `wrangler secret put` | **yes** | fail-closed 500 / auth cannot start | Create Neon **Singapore** project + database; use the **WebSocket/pooled** connection string; `wrangler secret put DATABASE_URL` |
| `BETTER_AUTH_SECRET` | secret | `wrangler secret put` | **yes** | `createAuth` throws (no dev-secret fallback in prod) | Generate ≥ 32 random bytes (e.g. `openssl rand -hex 32`); `wrangler secret put` |
| `GOOGLE_CLIENT_ID` | secret | `wrangler secret put` | **yes** | Google sign-in fails | From the Google Cloud OAuth client; register redirect URI + origins (G) |
| `GOOGLE_CLIENT_SECRET` | secret | `wrangler secret put` | **yes** | Google sign-in fails | As above |
| `ADMIN_EMAIL` | var (non-secret config) | `wrangler secret put` (keeps it out of the repo; a `[vars]` alternative is acceptable **only** if it contains no secret and the repo owner accepts the committed value — **not recommended**) | **yes** | no admin ever promotes (NG18 manual recovery) | **`tee.johnlor@gmail.com,leaderboardwordle@gmail.com`** (separator per E.3) |
| `BETTER_AUTH_URL` | var | `wrangler secret put` | **yes** | OIDC redirects break; baseURL falls back to `localhost:5173` | `https://<origin>` (D-ORIGIN) |
| `AUTH_RATE_LIMITER` | binding (rate-limit) | `wrangler.toml` `[[ratelimits]]` | **namespace_id: yes** | binding absent → limiter pass-through (abuse protection off — M) | I: create 4 simple rate-limit namespaces (period 60; limits 10/30/10/20 per class) and **record the real `namespace_id`s**; substitute in `wrangler.toml` |
| `GAME_RATE_LIMITER` | binding | `wrangler.toml` | **namespace_id: yes** | as above | as above |
| `ME_RATE_LIMITER` | binding | `wrangler.toml` | **namespace_id: yes** | as above | as above |
| `ADMIN_RATE_LIMITER` | binding | `wrangler.toml` | **namespace_id: yes** | as above | as above |
| `ASSETS` | binding (static assets) | `wrangler.toml` `[assets]` | no | build/deploy fails | none (config exists) |
| `latency` Analytics Engine dataset (J-A2) | binding | `wrangler.toml` `[[analytics_engine_datasets]]` | **yes** (dataset creation) | endpoint logs error / telemetry off | Create dataset in dashboard; add binding |

**First-bootstrap ordering (v31 fix; detail in §I.3):** the six Worker secrets are set
per the bootstrap procedure — on the FIRST setup use the **non-deploying/versioned
mechanism (`wrangler versions secret put`)** or the documented dashboard "Variables and
Secrets" bootstrap, because ordinary `wrangler secret put` can create+deploy a Worker
version immediately under versioned deployments (per current Cloudflare docs — confirm at
provisioning time), which would bypass the `deploy.yml` gate. The `wrangler secret put`
shorthand in the table applies to an **already-deployed** Worker (subsequent changes).

**Optional defense-in-depth — `[secrets] required` (v32; NOT a blocker):** the 2026
Wrangler config property is **supported by the installed wrangler 4.125.0** (verified
locally in `node_modules/wrangler/wrangler-dist/cli.js`: config → `secrets.required`,
enforced by `wrangler deploy`/`wrangler versions upload` — it fails with a clear message
when required names are missing, including the `--secrets-file` alternative for a first
deploy — and **warning-only** in the local preview/`.dev.vars` load path, so the CI e2e
preview with only `DATABASE_URL` + `BETTER_AUTH_SECRET` in `.dev.vars` is not broken).
If the implementer adopts it (only if it fits the repo's wrangler conventions):

```toml
[secrets]
required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "ADMIN_EMAIL", "BETTER_AUTH_URL"]
```

then the committed `worker-configuration.d.ts` must be regenerated (`bun run types:check`
compares it byte-for-byte; the six names will appear as `Secret` bindings — `wrangler
types` emits `secrets.required` as typed bindings, verified in dist) and committed with
the change. `deploy.yml` Gate 5 (`wrangler secret list` pre-deploy) **stays the explicit
gate regardless** — `[secrets] required` is complementary, not a replacement.

### F.2 GitHub-side deployment credentials (deploy workflow only)

| Name | Kind | Where | Operator-provisioned? | Missing → | Provision steps |
|---|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | GitHub Actions secret | **yes** | deploy job fails loudly (K gate) | API token scoped to **Workers Scripts: Edit** (+ **Workers Assets: Edit** if the platform requires it for static-asset upload) + account read |
| `CLOUDFLARE_ACCOUNT_ID` | secret | GitHub Actions secret | **yes** | deploy job fails loudly | Account id from the dashboard |
| `PRODUCTION_URL` | variable (non-sensitive) | GitHub Actions variable | **yes** | deploy smoke fails loudly | `https://<origin>` once D-ORIGIN is decided |

> **Why the split (v29 fix):** the six Worker runtime values live in Cloudflare and are
> never copied into GitHub Actions. The deploy workflow only needs the Cloudflare API
> credentials to deploy and the `PRODUCTION_URL` to smoke-test; it verifies Worker
> secrets **by name** with `wrangler secret list` (post-deploy), never by content.

**Never invented here**: rate-limit `namespace_id`s, Cloudflare account/token values,
production secret values, the production origin domain, Google OAuth credentials. All are
operator-provisioned.

---

## G. Origin & auth contract

- **`BETTER_AUTH_URL`** must be exactly `https://<production-origin>` (no trailing slash). Better Auth builds Google OAuth callbacks and sign-in redirects from `baseURL`; the origin check on state-changing `/api/auth/*` requests compares the request `Origin` against the `baseURL` origin ∪ `trustedOrigins` — so setting `BETTER_AUTH_URL` to the production origin makes production requests same-origin automatically. `trustedOrigins` keeps only the two local hosts; **no production entry is needed and none should be added** (adding the prod origin there would be redundant; adding anything else would be a CSRF-weakening change — forbidden).
- **Google OAuth (operator, external)**: create/use the OAuth client; authorized JavaScript origins = `https://<production-origin>`; authorized redirect URI = `https://<production-origin>/api/auth/callback/google`. The same client id/secret go into the two Worker secrets (F.1).
- **CSRF** (`src/server/lib/origin.ts`, NG4): custom middleware rejects unsafe JSON mutations whose `Origin` ≠ the request's own origin (host-relative, so it needs **no** configuration per origin) unless `Sec-Fetch-Site: same-origin`; headerless requests rejected (fail-closed); `/api/auth/*` excluded (better-auth owns its CSRF there); `ALLOWED_ORIGINS` env exists but `*` is filtered at runtime (never `*`). **Security rationale stays fail-closed**: nothing about Phase-6 loosens these checks; the two-admin change (E.3) only widens the *promotion allowlist*, never the origin trust.
- **Admin bootstrap (NG18)**: promotion keys on the **verified email** (`requireEmailVerification: true` for Google) + `ADMIN_EMAIL` allowlist (E.3); never demotes; a misconfigured/empty `ADMIN_EMAIL` → no admin → **manual operator/SQL bootstrap** (documented, not app-fixable).

---

## H. Seeding contract

- **When**: once per target DB, after the production DB is **migrated** (E.5) and **before** any deploy that schedules real answers (handoff op item 1). The production seed runs against the **production** Neon SG `DATABASE_URL` only; the non-production DBs stay separate.
- **How**: operator command `DATABASE_URL=<prod Neon SG url> bun run seed:answers` (gitignored source `scripts/seed/answer-pool.source.txt` must be present locally).
- **Validates**: every line a lowercase 5-letter word; no duplicates; **every answer ∈ server valid-guess set** (`answers ⊂ valid guesses`, NG13) — a violation aborts with exit 1 and writes nothing.
- **Idempotency**: `ON CONFLICT DO NOTHING` on `answer_dictionary.word`; re-running reports `inserted / already present`; never duplicates.
- **Report/exit codes**: 0 imported (report printed), 1 source missing/invalid/import failed, 2 `DATABASE_URL` missing.
- **Secrecy constraints**: the pool source is **gitignored, never committed, never bundled, never on a CI runner**; `verify:bundle` + admin-secrecy pins + e2e 401/403 stay green after seeding; the pool must **never** appear in logs (settlement/admin markers log counts/dates only — verified).
- **Post-seed verification**: `SELECT count(*) FROM answer_dictionary` = 2,315 (or the seed report's "already present"), plus a sample spot-check of the subset invariant; record the report in the handoff.

---

## I. Cron verification contract + operator provisioning steps

### I.1 Rate-limit namespace creation (exact operator steps)

1. **Choose the mechanism** (dashboard or API — pick one; both create a **Workers Rate Limiting** namespace with a `simple` limit and `period`).
   - **API** (preferred for reproducibility — confirm the exact current endpoint at provisioning time; the shape below matches the documented Workers Rate Limiting API): `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/rate_limits` with a JSON body per class, e.g. `{ "name": "GAME_RATE_LIMITER", "description": "Phase-5 S1 game class", "period": 60, "limit": 30 }`. The response `result.id` **is** the `namespace_id` to record. List: `GET …/rate_limits`. (Verify against current Cloudflare docs before provisioning; the operator performs this step — it is external, not CI.)
   - **Dashboard**: Cloudflare dashboard → **Workers & Pages → leaderboard-wordle → Settings → (Rate limiting / "Bindings")** or the account-level **Rate limiting** section → create a rate limit with `period = 60` and the class limit; copy the returned `namespace_id`. (Confirm the current dashboard label at provisioning time.)
2. **Four namespaces, one per class** (S1b — `simple` mode applies ONE limit per key, so per-class limits need per-class namespaces): AUTH 10/min, GAME 30/min, ME 10/min, ADMIN 20/min, all `period = 60`.
3. **Record** the four real IDs into `wrangler.toml` (replace the `00000000-…` placeholders) and into the handoff (never commit the placeholders).
4. **Validate**: `bunx wrangler deploy --dry-run` lists all four rate-limit bindings + `ASSETS`; `bun run types:check`; the deploy workflow's placeholder gate (K) confirms none remain.
   - Note: a single shared namespace is possible **only** if a uniform limit is acceptable (S1b) — not recommended.

### I.2 Settlement cron

- **Schedule**: `[triggers] crons = ["0 16 * * *"]` — UTC-only Cloudflare cron; Asia/Manila (UTC+8, no DST) midnight = `16:00 UTC` (NG1). The DB evaluates the boundary as `expires_at <= now()` (`expires_at` = `(puzzle_date + 1) AT TIME ZONE 'Asia/Manila'`, NG1/NG15/expiresAtExpr-corrected).
- **Export**: the build-time patch (`scripts/patch-worker-scheduled.ts` → `_settlement.js` + `export { scheduled }`) is verified in CI (`grep -q "export { scheduled }"`); the production artifact carries it.
- **Behavior**: `runSettlement` = finalize expired → activate today; idempotent (SKIP LOCKED, finalize-before-activate, each independently retryable — N3/D10); rethrows after structured logging so a failed invocation is marked **FAILED** in the dashboard (audit-resolved).
- **First production run verification**:
  1. Dashboard/`wrangler tail`: invocation at `16:00 UTC` with status OK.
  2. Log: `[settlement] run complete { finalized, forfeitedCount, completedCount, activatedToday, alreadyActive, missingToday }`.
  3. DB: yesterday FINALIZED exactly once; today ACTIVE; no spurious `[settlement] missing puzzle` marker.
- **Manual re-invocation (deterministic idempotency test)**: in the Cloudflare dashboard, **Workers & Pages → leaderboard-wordle → Settings → Triggers → Cron Triggers**, use the **"Run now"** action for the `0 16 * * *` trigger — this posts a ScheduledEvent to the `scheduled` handler (confirm the exact label at provisioning time; this is the documented manual-trigger path). Re-invoking is **safe by construction**: cron deliveries are at-most-once and `runSettlement` is retry-safe (SKIP LOCKED + idempotent finalize/activate + lazy self-healing), so the re-invocation must produce no duplicate finalization and consistent `activatedToday`/`alreadyActive` counts. If the dashboard "Run now" is unavailable in your account, the **first scheduled invocation at `16:00 UTC` is the required production proof** and idempotency is instead demonstrated by the existing integration lock-order tests (`tests/integration/midnight-lock-order.test.ts`) + a second consecutive scheduled run observing no drift.
- **Missed/failed run detection**: the `[settlement] missing puzzle for date=…` marker (missing-today invariant, fail-closed `PUZZLE_UNAVAILABLE`); the dashboard FAILED status; and the **lazy paths** (startGame lazy activation, lazy finalization) self-heal a missed run — the cron is a reconciliation job (N16). Real alerting/notification remains a deferred Phase-6+ decision (D-ALERT, O).

### I.3 First-ever Worker bootstrap (no gate bypass)

The production Worker does **not** exist yet (no production deploy has ever run), so the
first bootstrap must not rely on ordinary `wrangler secret put`: under Cloudflare
versioned deployments, `wrangler secret put` on a Worker can create a new version and
**deploy it immediately** (per current Cloudflare docs — confirm the exact behavior at
provisioning time). That would deploy an empty/placeholder Worker version **outside** the
controlled `deploy.yml` gate. The bootstrap below keeps `deploy.yml` as the first
controlled production deployment:

1. **Database first (Slice 5)**: create the Neon SG project/database, apply the existing
   migration (`scripts/ci-migrate.ts`), seed — none of this touches the Worker, so
   nothing is deployed.
2. **Create/upload the initial Worker version without a public deployment**: use the
   documented non-deploying version workflow (**`wrangler versions upload`**) or the
   Cloudflare dashboard (Workers & Pages → Create Worker), ensuring **no production
   traffic is routed to it** — no workers.dev route enabled, no custom domain, no route
   rules. (Confirm the exact dashboard/CLI flow at provisioning time.) The record/version
   exists so secret/version commands have a target.
3. **Set the six Worker secrets via the non-deploying/versioned mechanism**:
   `wrangler versions secret put <name>` — creates/updates a version WITHOUT deploying
   (per current Cloudflare docs, and corroborated by the installed wrangler 4.125.0's own
   error strings; confirm the exact command at provisioning time) — or the documented
   dashboard "Variables and Secrets" bootstrap. **Do NOT use ordinary `wrangler secret
   put` for this first setup** (it may auto-deploy a version). Alternative single-step
   path (documented by wrangler): `wrangler deploy --secrets-file <path>` supplies the
   secrets at first deploy via a local file (`SECRET_NAME=value` lines or JSON) —
   acceptable only as an operator preference, with the file gitignored and used once.
4. **Verify by name**: `wrangler secret list` shows the six names — this is exactly what
   `deploy.yml` Gate 5 checks pre-deploy.
5. **Gated first deployment**: run the controlled `deploy.yml` (pre-deploy gates, then
   `wrangler deploy`), which produces the first PUBLIC production version; enabling
   workers.dev/custom-domain routing is part of D-ORIGIN and happens at/after this step.

If the operator deliberately accepts an early placeholder deploy instead, record it as a
recorded deviation; the default is the gate-preserving path above.

---

## J. Latency measurement & optimization gate

- **What is measured** (explicitly, both mandatory):
  - *Page load*: real PH-user Web Vitals (LCP/INP/CLS/TTFB) via **Cloudflare Web Analytics**, country-filtered `cf-ipcountry = PH` (J-A1; operator-enable, zero code).
  - *Gameplay path*: client-observed duration of `GET /api/game/current` and `POST /api/game/:gameId/guess` (the CI-15 path) via the **J-A2 timing beacon** (timings only — never words/secrets/user ids), stored in the Analytics Engine `latency` dataset, filtered to `cf-ipcountry = PH`.
  - Optional diagnostic (not a baseline): server-side `[game-guess] done duration_ms` (redacted per E.2) and Neon query timings — **diagnostic evidence only**; CI/runner → Neon RTT is explicitly NOT the Philippines-user baseline.
- **Why J-A2 is mandatory (v29 fix)**: the architecture requires measuring **real user** latency from the Philippines, and the game-API path is the product's core latency surface (and the CI-15 concern). Client-observed game-API timing is only obtainable from client instrumentation (there is no zero-code platform source for it), so the beacon is Phase-6 verification infrastructure, explicitly scoped (C), and can be disabled after the baseline is collected.
- **Where sampled from**: the browser of real PH users (geo-filtered); sample at least the PH country segment; report P50/P75/P95 and sample size per day.
- **Baseline**: ≥ 7 consecutive production days after deploy; the baseline values + date range are recorded in the handoff (they become the gate's reference).
- **The evidence gate (no optimization without it)**: an optimization may be started **only** when one of:
  - PH P95 (page-load or game-call) exceeds a documented target (proposed: page-load P95 > 4 s or game-call P95 > 3 s — product-tunable, D-TARGET), **or**
  - a sustained regression (≥ 30% above the recorded baseline for 3 consecutive days) is demonstrated on the same metrics.
  - A single slow sample, a local/CI measurement, or a synthetic probe **never** triggers optimization.
- **What a regression looks like**: sustained PH P95 above the baseline by the rule above, with the sample-size floor met (e.g., ≥ 50 PH samples/day); the handoff records the exact trigger used.
- **Explicit architecture rule**: Phase-6 itself performs **no** optimization unless the gate fires; if it does, the optimization is a new, separately-scoped decision (likely Phase-7), not an ad-hoc change mid-deploy.

---

## K. CI deploy workflow (full spec — separate `deploy.yml`)

### K.1 Design decision (resolves the v29 `workflow_dispatch` contradiction)

The earlier draft proposed adding `workflow_dispatch` **to `ci.yml`** plus an in-workflow
deploy job gated `if: github.event_name == 'push'` with `needs: [unit-and-build,
integration, e2e, smoke]`. That is contradictory: on `workflow_dispatch`, `integration`
and `e2e` do not run (they are push-gated), so `needs` can never be satisfied and the
deploy job's own `if` is false. **Resolved**: deployment is a **separate workflow
(`deploy.yml`)**, manually dispatched, that consumes an **already-successful `ci.yml`
run for the exact SHA being deployed** (verified via the GitHub API). `ci.yml` stays
**byte-identical** — CI-7…CI-15 fully preserved. This is the review's Option C, made
deterministic.

### K.2 `deploy.yml` spec

```yaml
name: Deploy (production)
on:
  workflow_dispatch:
    inputs:
      ref:
        description: 'git ref to deploy (must be main)'
        required: false
        default: 'main'
permissions:
  contents: read
  actions: read        # needed to query ci.yml run status via the API (read-only)
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ inputs.ref || 'main' }}
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
        with:
          bun-version: latest
      # GATE 1 — only main is deployable. The `ref` input is future-proofing only;
      # anything other than main aborts before anything is built or deployed.
      - name: Gate — ref input must be main
        run: |
          if [ "${{ inputs.ref }}" != "main" ]; then
            echo "::error::deploy.yml only deploys main (inputs.ref=${{ inputs.ref }})"
            exit 1
          fi
      # GATE 2 — the EXACT checked-out commit is the commit with a green ci.yml run.
      # Resolve the actual checked-out SHA (not $GITHUB_SHA, whose meaning differs on
      # workflow_dispatch) and require: checked-out SHA == dispatch-time main SHA AND
      # that exact SHA has a successful push-triggered ci.yml run. If main advanced
      # between dispatch and checkout, DEPLOY_SHA != GITHUB_SHA and the CI query has
      # no green run for DEPLOY_SHA yet → fail and ask for a re-dispatch. Invariant:
      # checked-out SHA = CI-tested SHA = deployed SHA. The query uses the
      # workflow-SPECIFIC endpoint (actions/workflows/ci.yml/runs) with exact head_sha
      # (no per_page truncation — an older but valid SHA is never rejected because newer
      # green runs exist), so ONLY a successful ci.yml run can satisfy the gate — not a
      # run of any other workflow. `gh` is preinstalled on ubuntu-latest; GH_TOKEN
      # scoped to actions: read.
      - name: Gate — green CI run exists for the exact checked-out SHA
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          DEPLOY_SHA="$(git rev-parse HEAD)"
          echo "Deploying SHA: $DEPLOY_SHA"
          if [ "$DEPLOY_SHA" != "$GITHUB_SHA" ]; then
            echo "::error::checked-out SHA ($DEPLOY_SHA) differs from the dispatch-time main SHA ($GITHUB_SHA) — main advanced between dispatch and checkout; re-dispatch"
            exit 1
          fi
          COUNT=$(gh api "repos/${{ github.repository }}/actions/workflows/ci.yml/runs?head_sha=$DEPLOY_SHA&branch=main&event=push&status=success&per_page=1" --jq '.total_count')
          if [ "${COUNT:-0}" -lt 1 ]; then
            echo "::error::no successful ci.yml run found for exact SHA $DEPLOY_SHA on main — wait for CI or re-run it"
            exit 1
          fi
      - name: Install
        run: bun install --frozen-lockfile
      - name: Production build (Cloudflare Workers)
        run: bun run build
      - name: Patched-worker assertion (cron `scheduled` export present)
        run: grep -q "export { scheduled }" .svelte-kit/cloudflare/_worker.js
      - name: Answer-pool secrecy proof
        run: bun run verify:bundle
      # GATE 3 — no placeholder rate-limit namespace ids ship to production.
      - name: Gate — rate-limit namespace placeholders absent
        run: |
          if grep -q '00000000-' wrangler.toml; then
            echo "::error::rate-limit namespace_id placeholders still in wrangler.toml — provision namespaces first (plan I.1)"
            exit 1
          fi
      # GATE 4 — the GitHub deployment credentials exist.
      - name: Gate — Cloudflare deployment credentials present
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          PRODUCTION_URL: ${{ vars.PRODUCTION_URL }}
        run: |
          if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
            echo "::error::CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets are required"
            exit 1
          fi
          if [ -z "$PRODUCTION_URL" ]; then
            echo "::error::PRODUCTION_URL variable is required (set to https://<origin> once the origin decision is made)"
            exit 1
          fi
      # GATE 5 — PRE-DEPLOY Worker runtime secrets present by NAME (values never in GitHub).
      # Runs BEFORE deploy so a missing BETTER_AUTH_SECRET / DATABASE_URL / … blocks the
      # deploy instead of shipping a broken version and failing after the fact. On the
      # first-ever bootstrap, provision the six secrets per plan §I.3 (versioned/
      # non-deploying mechanism or dashboard bootstrap — NOT ordinary `wrangler secret
      # put`, which can create+deploy a version and bypass this gate).
      - name: Pre-deploy gate — Worker runtime secrets present (names only)
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          LIST=$(npx wrangler secret list) || { echo "::error::wrangler secret list failed — the six Worker secrets must exist before deploy; on the FIRST-ever bootstrap follow plan §I.3 (wrangler versions secret put or the dashboard bootstrap — ordinary \`wrangler secret put\` may create+deploy a version and bypass the deploy gate)"; exit 1; }
          for s in DATABASE_URL BETTER_AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ADMIN_EMAIL BETTER_AUTH_URL; do
            echo "$LIST" | grep -q "$s" || { echo "::error::Worker secret $s missing — set it via \`wrangler secret put $s\` (plan F.1)"; exit 1; }
          done
      # GATE 6 — namespace/binding validation: placeholder grep + wrangler dry-run so the
      # actual rate-limit and ASSETS bindings resolve before any deploy (a typo'd or
      # non-UUID namespace_id is caught here, not at deploy time).
      - name: Pre-deploy gate — wrangler dry-run (bindings resolve)
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: npx wrangler deploy --dry-run
      - name: Deploy (versioned deployment)
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: npx wrangler deploy
      # RECEIPT — post-deploy Worker-secret confirmation (Gate 5 pre-deploy is the actual
      # gate; this confirms the deployed environment still carries the secrets).
      - name: Post-deploy confirmation — Worker runtime secrets present (names only)
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          LIST=$(npx wrangler secret list)
          for s in DATABASE_URL BETTER_AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ADMIN_EMAIL BETTER_AUTH_URL; do
            echo "$LIST" | grep -q "$s" || { echo "::error::Worker secret $s missing after deploy — environment drift"; exit 1; }
          done
      # SMOKE — post-deploy smoke against the production URL.
      - name: Post-deploy smoke
        env:
          PRODUCTION_URL: ${{ vars.PRODUCTION_URL }}
        run: |
          code=$(curl -fsS -o /dev/null -w '%{http_code}' "$PRODUCTION_URL/" ) || exit 1
          [ "$code" = "200" ] || { echo "::error::$PRODUCTION_URL/ returned $code"; exit 1; }
          body=$(curl -fsS "$PRODUCTION_URL/api/game/current") || exit 1
          echo "$body" | grep -q '"UNAUTHORIZED"' || { echo "::error::/api/game/current did not return the NG21 401 UNAUTHORIZED envelope"; exit 1; }
          curl -fsSI "$PRODUCTION_URL/" | grep -qi 'x-content-type-options: nosniff' || exit 1
```

### K.3 Rules

- **Trigger**: `workflow_dispatch` (manual, controlled). Automatic deploy-on-push can be
  added later as a product/ops decision (D-AUTODEPLOY, O) — not Phase-6.
- **Gating**: only `main` (Gate 1), and only the **exact checked-out SHA** that equals the
  dispatch-time main SHA and has a green `ci.yml` push run (Gate 2 — invariant:
  checked-out SHA = CI-tested SHA = deployed SHA), plus the local build/secrecy/placeholder
  gates (Gate 3), credential gate (Gate 4), **PRE-DEPLOY Worker-secret name gate (Gate 5)**,
  **`wrangler deploy --dry-run` binding validation (Gate 6)**, and only then deploy →
  post-deploy secret receipt + smoke. A broken/degraded deploy never ships unverified code.
- **Permissions (minimum)**: `contents: read` + `actions: read` (read-only, for the CI-status
  check). **No write scope; no `actions: write`** (no artifact upload here). `ci.yml` unchanged.
- **What CI must NOT do**: seed the production DB (private source never on a runner — H),
  invent namespace ids, mutate Google OAuth, or change product config. One-time operator
  provisioning (F, G, I) is outside CI.
- **Manual fallback**: the documented operator path `npx wrangler deploy` after the same
  local gates (build, patched-worker assertion, `verify:bundle`, placeholder check) — for
  out-of-band deploys when GitHub Actions is unavailable; recorded in the runbook (L).

---

## L. Rollback / recovery

- **Detection of a broken deploy**: the post-deploy smoke (K.2 Gate 6) is the fast gate (page 200 + API 401 envelope + headers); operator/real-user signals: increased 5xx in dashboard, `[settlement] run failed` FAILED invocations, PH latency regression (J), failed OIDC/CSRF (login broken), admin cannot promote (E.3 bug). `ci.yml` + Gate 2 catch regressions pre-deploy; the smoke catches the deploy itself.
- **Recovery**:
  1. **`wrangler rollback`** (Workers versioned deployments — each deploy is a version; rollback restores the previous version; verify with `wrangler deployments list`). Dashboard "Rollback to previous deployment" is equivalent.
  2. If the previous version is itself bad (multi-deploy cascade): roll back to the last known-good version id from `wrangler deployments list`; treat the DB as the safe boundary (settlement is idempotent; a wrong code version cannot corrupt data because NG9 lock/liveness + constraints are unchanged).
  3. **Redeploy the known-good git commit** through the deploy workflow (K) after reverting the offending change on `main`.
- **What "deploy failed" looks like**: `wrangler deploy` non-zero (config/binding/secrets/namespace errors — usually caught by the gates), a failed post-deploy smoke, or a deployed-but-broken version (5xx, login failure). Each has a recovery: fix config → redeploy; rollback → fix → redeploy; DB/seed issues are **not** deploy-rollback problems (migration is idempotent on an empty DB, seeding is idempotent — re-run or fix source).
- **Secrets/rollback note**: Worker secrets are environment-level (not per-version); rolling back code does not roll back secrets — verify the environment still has the correct secret set after any rollback (F.1 list + `wrangler secret list`).

---

## M. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Missing/placeholder rate-limit `namespace_id`s | High | E.1 + I.1 exact steps + the deploy placeholder gate (K.2 Gate 3) + **`wrangler deploy --dry-run` binding validation (K.2 Gate 6)**; never invent IDs. Missing binding = limiter pass-through → abuse protection off (S1d note: limits are abuse protection, not accounting). |
| Missing/misconfigured Worker secrets (fail-closed) | High | F.1 + K.2 **PRE-deploy Gate 5** (`wrangler secret list` names, before deploy) + Gate 4 credential gate + post-deploy smoke; `BETTER_AUTH_SECRET`/`DATABASE_URL` fail closed by design (B.2); real Google round-trip. |
| First-bootstrap bypasses the deploy gate (ordinary `wrangler secret put` can create+deploy a version) | Medium | I.3: create the initial Worker record without a public deployment; set the six secrets via `wrangler versions secret put` or the dashboard bootstrap; no route/workers.dev until the gated `deploy.yml` deploy (recorded deviation if the operator accepts an early placeholder deploy). |
| Production origin/CSRF/OIDC misconfiguration | High | G: `BETTER_AUTH_URL = https://<origin>`; Google redirect URI; CSRF host-relative (no config) + fail-closed; e2e login/sign-out on the prod URL. |
| Answer-pool or secret leakage into bundles/logs | High | verify:bundle (public-list-aware) + admin-secrecy pins + subset pin; **E.2 redacts guess words from logs**; seed source gitignored and never on a runner; settlement/admin logs verified word-free. |
| Cron scheduling/UTC mistake | Medium | NG1 verified `0 16 * * *` + DB boundary; I.2 verification (first-run + idempotency + FAILED surfacing); self-healing lazy paths. |
| Latency measurement that cannot prove the PH baseline | Medium | J: real PH-user Web Analytics (country-filtered) + mandatory game-API beacon (J-A2); CI/runner RTT explicitly excluded; sample-size floor; evidence gate. |
| Deploy CI regressing CI-7…CI-15 | Medium | K: separate `deploy.yml`; `ci.yml` byte-identical (diff-gated); min permissions (`actions: read` only, no write). |
| Zero-migration invariant broken | High | No new Phase-6 migration (only applying the existing `0000_init`, E.5); CI schema-purity gate stays; J-A2 uses Analytics Engine (outside Postgres schema). |
| Accidental product-threshold/dataset/admin changes | High | C out-of-scope list; the only admin-related change is the **allowlist mechanism** for the two already-fixed addresses (E.3) — addresses themselves unchanged. |
| CI-15 retry double-count (timeout-retry burns an attempt) | Low | Documented (E.2); bounded by 30/min limit; no cross-user integrity impact; server-authoritative; server-side duplicate-word guard deferred as a product decision (O). |
| Two-admin promotion broken by single-string match | High | E.3 allowlist remediation + unit tests + real round-trip for both addresses. |
| Deploy smoke blocked by unresolved origin | Medium | K: smoke uses the `PRODUCTION_URL` GitHub variable (operator-set once D-ORIGIN is decided); CI never embeds `<origin>`. |
| Worker secret values leaking into GitHub Actions | High | F.2/K: the deploy workflow never receives Worker secret contents; it only lists names post-deploy (Gate 5). |

---

## N. Verification gates (final)

Run on the **deployed production state** (current HEAD), not an older commit:

| # | Gate | Expected evidence |
|---|---|---|
| N1 | Four CI jobs green on `main` @ HEAD | unit-and-build, integration, e2e, smoke all ✅ on the deployed HEAD |
| N2 | `bun run build` + patched-worker assertion | `grep -q "export { scheduled }" .svelte-kit/cloudflare/_worker.js` = 1 |
| N3 | `bun run verify:bundle` | "bundle secrecy OK"; 0 non-public pool words |
| N4 | Schema purity | `git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` empty (no NEW migration) |
| N5 | Placeholder gate | `grep '00000000-' wrangler.toml` → empty (real namespace IDs committed) |
| N6 | Worker secrets present (names) | **PRE-deploy** `wrangler secret list` gate (K.2 Gate 5) green + post-deploy receipt; the six names listed |
| N7 | Production DB migrated + seeded | `scripts/ci-migrate.ts` receipt; `scripts/ci-db-probe.ts` OK; `SELECT count(*) FROM answer_dictionary` = 2,315 |
| N8 | Deployed smoke | `PRODUCTION_URL/` 200; `/api/game/current` 401 `UNAUTHORIZED`; headers (nosniff/XFO/Referrer/HSTS-over-https) |
| N9 | OIDC round-trip | Real Google sign-in/out on `https://<origin>`; **both** admin emails promoted |
| N10 | Cron receipt | First production `0 16 * * *` run OK; `[settlement] run complete`; idempotency re-invoke clean (I.2) |
| N11 | Latency baseline | ≥ 7 days PH Web Analytics + game-API beacon baselines recorded (P50/P75/P95) |
| N12 | Diagnostics resolved | No `[game-guess]` line contains a guess word or `user.id`; decision recorded in the contradictions log |
| N13 | `ci.yml` untouched | `git diff --exit-code -- .github/workflows/ci.yml` empty (only `deploy.yml` added) |
| N14 | Review | `tool:review`/manual review of the Phase-6 diff (only the planned files changed) |

---

## O. Deferred decisions (never silently resolved)

- **D-ORIGIN** — production host: `leaderboard-wordle.<subdomain>.workers.dev` vs a custom domain. Operator/product decision; drives `BETTER_AUTH_URL` + Google OAuth. Default until decided: workers.dev subdomain. **`PRODUCTION_URL` (K) decouples the deploy smoke from this decision.**
- **D-AUTODEPLOY** — whether to add automatic deploy-on-green-main-push later (Phase-6 uses manual `workflow_dispatch` only).
- **D-ALERT** — notification/alert channel for cron/missing-puzzle/429 monitoring (Phase-5 D10 + Architecture's deferred alerting). Out of Phase-6 scope; structured log markers remain the detection mechanism.
- **D-TARGET** — the PH latency targets (J gate; proposed page P95 > 4 s / game-call P95 > 3 s). Product-tunable; the baseline, not a target, is the Phase-6 deliverable.
- **D-GUARD** — server-side consecutive-duplicate-word guard for guess idempotency (E.2). Product decision (alters game semantics); deferred.
- **D-LIMITS** — exact rate-limit thresholds stay PROPOSED/product-tunable (Phase-5 D1); operator sets the namespace values.
- **C6-11** — shadcn-svelte surface expansion: post-deployment candidate, NOT Phase-6.
- **Visual review** — pre-Phase-6 pixel-level UI review still outstanding; NOT a Phase-6 gate (it must not block deploy and must not be claimed).
- **ADMIN_EMAIL separator** — `,` vs `;` for the two-admin allowlist (E.3) is chosen at implementation and pinned by tests (one decision, not product-critical).
- **J-A2 disable-after-baseline** — the game-API beacon is mandatory for the Phase-6 baseline; whether to keep it permanently is a post-baseline decision (D-JA2KEEP).

---

## P. Explicit invariants (Phase 0–5 + pre-Phase-6 + CI-7…CI-15 MUST NOT be broken)

1. **CI-13 failure-artifact upload + its narrowly scoped permissions** — e2e job in `ci.yml` keeps `permissions: { contents: read; actions: write }`; the deploy workflow adds no write scope.
2. **CI-14 Manila-Monday-safe integration behavior** — `tests/integration` I8 guard (`fab307c`) untouched.
3. **CI-15 guess-request timeout/recovery** — the 15 s client abort + re-enable stays, **unless** the Phase-6 plan's recorded assessment (E.2) justifies a deployment remediation; the only CI-15 change is the log-marker redaction (a remediation, explicitly identified here).
4. **Answer secrecy** — no permanent production logs containing guess words or private answer material (E.2); the pool never in any bundle/public artifact (verify:bundle + pins) and never on a CI runner; admin answer search stays behind `requireAuth + requireAdmin + ADMIN_RATE_LIMITER`; e2e 401/403 stays green.
5. **Zero migration** — no **new** Phase-6 schema/migration (applying the existing `0000_init` to the empty production DB is required, not a new migration); CI schema-purity gate green.
6. **Server-authoritative game behavior** — NG9 lock/liveness + `transaction_timestamp()` eligibility, terminal-state transitions, one-guess-in-flight UI contract unchanged.
7. **Rate-limit/security behavior** — the four-class limiter keying/429 envelope/pass-through, CSRF fail-closed (NG4), CSP/header contract, NG21 envelope, Better Auth secret policy all unchanged (config additions only).
8. **Product lock** — thresholds 3/8, the two admin addresses (mechanism may change, values never), datasets 12,972/2,315/3,944, provenance, seed subset invariant.
9. **CI architecture (CI-7…CI-15)** — `ci.yml` byte-identical; deploy is a separate workflow; mandatory gates, mutex, `.dev.vars` materialization, parity assertions unchanged.
10. **`_headers`/asset security** — the root `_headers` nosniff rule + app-emitted header contract stay; no header weakening.
11. **FSD/architecture boundaries** — bridge-only env translation; Hono registration only in `routes.ts`; no new product endpoints except the explicitly-scoped telemetry endpoint (J-A2).
12. **No new runtime dependencies** — the Phase-6 diff adds none (telemetry uses existing fetch/sendBeacon + the platform Analytics Engine binding, not a package).

---

## Readiness classification (three states)

- **Planning readiness**: ✅ **REACHED** — this file + the planning-state handoff + the implementation prompt contain verified, implementation-grade detail; no inventing required (external operator facts in I are marked for confirmation at provisioning time).
- **Implementation readiness**: ✅ **REACHED (conditional)** — a fresh implementation agent can execute the slices without guessing, provided the operator prerequisites (below) are met; every placeholder/unresolved item is explicitly marked (never silently resolved).
- **Production-provisioning readiness**: ⏳ **NOT REACHED** — external prerequisites still missing and operator-owned: the four rate-limit namespace IDs, the six Worker secrets, the production origin decision + Google OAuth redirect registration, the Neon Singapore database (**to be migrated + seeded — Slice 5**), the Cloudflare deploy token/account, `PRODUCTION_URL`, and the Analytics Engine dataset. The repository is **planning/implementation-ready, not yet production-ready**.

*Generated by the Phase-6 planning pass from the actual repository at `main` @ `294ff0b`, revised after gpt-luna v29 review. Planning-only: no deploy, no secret/binding provisioning, no namespace creation, no migration/seeding, no source/CI/`wrangler.toml` modification was performed.*
