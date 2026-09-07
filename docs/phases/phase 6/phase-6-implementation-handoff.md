# Phase 6 — Implementation Handoff (Deployment)

Written by the Phase-6 implementation pass from the repository at `main` @
**`780ae15`** (+ this pass's uncommitted changes), per
`docs/phases/phase 6/phase-6-implementation-prompt.md` and the authoritative
plan `docs/phases/phase 6/phase-6-plan.md`.

> **Status: repository-side implementation COMPLETE and locally verified;
> production provisioning NOT yet performed** (plan §B readiness:
> "Production-provisioning readiness: ⏳ NOT REACHED"). Everything that
> requires external operator infrastructure is listed in §6 with exact
> procedures (also in `phase-6-runbook.md`). Nothing was deployed, no secret
> was provisioned, no namespace id was invented, no production database was
> touched.

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

## 3. A-goal status

| Goal | Status | Evidence |
|---|---|---|
| 1. Deployed | ⏳ **operator-owned** | repo-side gates green locally; live Worker requires §6 steps (bootstrap + secrets + deploy.yml). |
| 2. Migrated + Seeded | ⏳ **operator-owned** | existing `0000_init` applied to the NEW empty Neon SG DB + seed 2,315 — runbook §1 steps 2–4; receipts to be recorded here once run. |
| 3. Verified (origin/CSRF/OIDC) | ⏳ **operator-owned (code ready)** | allowlist code + unit tests done; real Google round-trip + both-admin promotion happen post-deploy (D-ORIGIN). |
| 4. Measured | ⏳ **operator-owned (instrumentation DONE)** | J-A2 beacon implemented + tested (PH filter, strict schema, no words); ≥7-day baseline starts after deploy (Web Analytics J-A1 operator-enable). |
| 5. Cron verified | ⏳ **operator-owned** | schedule unchanged `0 16 * * *`; patched-worker assertion green; first production run + "Run now" idempotency per runbook §7. |

---

## 4. N-gate status

N1 (CI green on HEAD) — pending push/CI. N2, N3, N4, N12 (server-side), N13,
N14-approach — **green locally** (§2). N5 — pending operator namespace IDs
(placeholder gate is the enforcement). N6 — pending Worker-secret bootstrap
(pre-deploy gate in deploy.yml). N7 — pending Neon SG migrate+seed. N8 — pending
deploy smoke via `PRODUCTION_URL`. N9 — pending real Google OIDC round-trip.
N10 — pending first cron run + re-invocation. N11 — pending ≥7-day PH baseline.

---

## 5. Decisions recorded (see `docs/contradictions-and-gaps.md`)

D-ADMINSEP = **comma**; CI-15 production assessment (server may commit after
client abort; retries non-idempotent ≤1 extra attempt; 15 s stays; duplicate-
word guard deferred D-GUARD); J-A2 contract (endpoint/shape/PH filter/me class/
202/504-synthetic); `[secrets] required` adopted (worker-configuration.d.ts
regenerated); deploy.yml facts. Deferred (unchanged): D-ORIGIN, D-AUTODEPLOY,
D-ALERT, D-TARGET, D-LIMITS, D-JA2KEEP, visual review (not a Phase-6 gate).

---

## 6. What remains operator-owned (to complete Phase 6)

1. Set GitHub secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit +
   Workers Assets: Edit; account read) + `CLOUDFLARE_ACCOUNT_ID`, variable
   `PRODUCTION_URL = https://<origin>` (D-ORIGIN decided → Google OAuth
   authorized origin + redirect `https://<origin>/api/auth/callback/google`).
2. Create the Neon **Singapore** DB; migrate (`DATABASE_URL=<prod>
   bun ./scripts/ci-migrate.ts`), probe (`bun ./scripts/ci-db-probe.ts`),
   seed (`bun run seed:answers` → `answer_dictionary` count = **2,315**).
3. Create the four rate-limit namespaces (AUTH 10 / GAME 30 / ME 10 / ADMIN
   20, `simple`, period 60) and substitute the real `namespace_id`s into
   `wrangler.toml` + record them here.
4. First-ever Worker bootstrap per plan §I.3 (`wrangler versions upload` /
   dashboard WITHOUT public routing; six secrets via `wrangler versions
   secret put` or dashboard — never gate-bypassing `wrangler secret put` as
   the bootstrap; alternative `wrangler deploy --secrets-file`).
5. Create the Analytics Engine `latency` dataset; enable Web Analytics (J-A1).
6. Deploy via the deploy workflow (`ref: main` — Gate 2 requires a green
   `ci.yml` push run on the exact deployed SHA), then run the §3 browser
   smoke (Google sign-in, gameplay, leaderboard, admin, headers, CSP
   console-clean), the cron verification, and record the ≥7-day PH baseline.
7. Append the obtained receipts to this handoff (migration/seed report + count,
   namespace ids [non-secret], deploy version id, cron receipt, baseline
   P50/P75/P95 + dates, `wrangler secret list` names).

*Handoff written by the Phase-6 implementation pass at repository HEAD
`780ae15` + implemented changes; the implementation-prompt sibling docs were
updated only where this pass added new facts (contradictions log).*