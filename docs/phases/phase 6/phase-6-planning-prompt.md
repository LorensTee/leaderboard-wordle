# Phase 6 Planning Prompt — Deployment

We are now starting **Phase 6** of this repository:

https://github.com/LorensTee/leaderboard-wordle

You are working in the repository itself.

**Do NOT implement Phase 6 yet.**

Your job in this chat is to perform a deep deployment-focused repository review and produce the complete **Phase 6 planning package** that a separate implementation pass can execute safely.

Phase 6 is the project's **production deployment phase** (Architecture-v3 §"Phase 6 — Deployment"): deploy to **Cloudflare Workers + Neon Singapore**, measure **real latency from Philippines users**, optimize **only when evidence supports it**, and verify the **settlement cron in production**.

The purpose of this planning pass is not merely to list deploy steps. You must determine the repository's actual current deployment-readiness posture, compare it against the architecture/specification and every established invariant, identify concrete gaps (secrets, bindings, origins, seeding, cron, CI deploy workflow, latency measurement), and produce implementation-grade Markdown documents for a later implementation pass.

---

## 1. Source-of-truth hierarchy

Treat the **current repository state as the ultimate source of truth**.

Start by identifying the exact current:

- branch (`main`)
- HEAD commit
- working-tree state
- pre-Phase-6 final implementation state (all slices S1–S6 done and committed)

The authoritative starting points are:

- `docs/phases/pre phase 6/handoff.md` — the pre-Phase-6 → Phase-6 handoff (finalized product values + open items)
- `docs/phases/pre phase 6/pre-phase-6-implementation-handoff.md` — S1–S6 receipts
- `docs/phases/pre phase 6/pre-phase-6-production-data-lock.md` — the product lock
- `Architecture-v3.md` — especially §"Phase 6 — Deployment" and §"Answer pool deployment"
- `Specifications-v1.md`
- `docs/contradictions-and-gaps.md` — **read the CI-1 … CI-11 records fully** (CI-7 … CI-11 changed the CI architecture this phase must not regress)
- `docs/phases/phase 5/phase-5-implementation-handoff-final.md`
- all earlier Phase 0–5 planning/implementation/handoff documents as needed
- current source code, `wrangler.toml`, `_headers`, `package.json`, `.github/workflows/ci.yml`, migrations, seed tooling, and the current CI gate receipts

Important rules:

- Phases 0–5 and pre-Phase-6 are COMPLETE (including the post-CI-7/8/10/11 rework, CI fully green and meaningful on `main`).
- Do not reimplement or redesign any prior phase.
- The current repository state wins over stale planning documents.
- Do not silently change product decisions already made (admin emails, 3/8 thresholds, datasets, answer-pool secrecy).
- Do not invent requirements unsupported by the architecture, specification, or the deployment surface.
- Do not assume a deployment capability exists merely because the architecture mentions it — verify every item against actual config/code/CI.

---

## 2. First task: determine exactly what Phase 6 is

Do not assume Phase 6 means "run wrangler deploy and be done."

Trace the intended Phase 6 scope through:

- Architecture-v3 §"Phase 6 — Deployment" and §"Answer pool deployment"
- the pre-Phase-6 handoff open items
- `wrangler.toml` (name, `main`, `compatibility_date`, `compatibility_flags`, ASSETS binding, cron trigger, the four `[[ratelimits]]` entries)
- `_headers`
- `scripts/seed/` + `scripts/seed/README.md` (answer-pool provenance and seed contract)
- `scripts/patch-worker-scheduled.ts` (the build-time cron export patch)
- `src/server/auth/auth.ts` (BETTER_AUTH_URL, trustedOrigins, Google OIDC bindings, secret policy)
- `src/server/middleware/security-headers.ts` and the CSP pre-paint theme script
- `package.json` scripts (is there a `deploy` script? a `preview`/`types`?) and `wrangler.toml`
- the current CI workflow (unit-and-build / integration / smoke / e2e) — note there is **no deploy job yet**
- Neon (Singapore) `DATABASE_URL` usage through the neon-serverless WebSocket driver (`src/server/db/client.ts`)

Explicitly answer:

1. What is Phase 6 intended to accomplish?
2. Which deployment targets and bindings are explicitly in scope (Cloudflare Workers, Neon Singapore, rate-limit namespaces, secrets, vars)?
3. Which production-verification activities are explicitly in scope (latency from the Philippines, settlement cron, rollback)?
4. Which deployment work is already done and must only be audited (the CI pipeline, the build-time cron patch, the secrecy gates) rather than duplicated?
5. What is explicitly OUT of scope (new features, schema changes, threshold changes, unrelated performance work)?
6. What belongs to Phase 7 or later (if anything)?
7. Which invariants must remain untouched (answer-pool secrecy, zero migration, server-authoritative game behavior, rate-limit/security behavior)?

At minimum investigate the Phase-6 areas referenced by the architecture and the handoff:

- Cloudflare Workers deployment (wrangler, versioned deployments, rollback, asset binding)
- Neon Singapore connection + production `DATABASE_URL` secrets (WebSocket driver path)
- production secrets and vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL` (both `tee.johnlor@gmail.com` and `leaderboardwordle@gmail.com`), `BETTER_AUTH_URL`
- the four rate-limit `[[ratelimits]]` namespace placeholders (`00000000-…` = OPERATOR-PROVISIONED; see contradictions log S1a/S1b — these MUST be created in the dashboard/API before deploy; the planning agent must not invent credentials)
- answer-pool seeding into each target DB (`bun run seed:answers`; idempotent; re-validates `answers ⊂ valid guesses`; the source file `scripts/seed/answer-pool.source.txt` is gitignored/never committed)
- settlement cron production verification (UTC `0 16 * * *` = Asia/Manila midnight; `scheduled` export appended by the build patch; `runSettlement` behavior)
- production origin/CSRF: `BETTER_AUTH_URL` and `trustedOrigins` (currently `localhost:5173` / `127.0.0.1:4173` only) — determine exactly what production requires so Google OIDC and the CSRF origin checks keep working
- real-user latency measurement from the Philippines: define a concrete, evidence-based methodology (what is measured, where it is sampled from, what the "optimize only with evidence" gate is, and what a regression would look like)
- a CI **deploy** job (currently absent) that keeps the existing CI-7 … CI-11 architecture intact and only deploys from `main` on a controlled trigger

Do not broaden the phase into unrelated product work.

---

## 3. Perform a deep deployment-readiness audit BEFORE designing the plan

Before writing any proposed implementation steps, audit the current state as if you were about to ship to real users from the Philippines.

Audit at minimum:

### Deployment configuration surface

- `wrangler.toml`: name/main/compat, `nodejs_compat` (Better Auth AsyncLocalStorage), ASSETS binding, cron schedule and its UTC→Asia/Manila mapping, and the four `[[ratelimits]]` namespaces (are the placeholder `namespace_id` values the ONLY missing piece? what are the exact operator steps to provision them? are the limits correct or product-tunable?)
- `_headers` vs the app-level security headers contract (which headers are platform-served vs app-emitted)
- build pipeline: `vite build` → adapter-cloudflare → `patch-worker-scheduled` appends the cron export — verify the production artifact really carries `scheduled`
- the `verify:bundle` secrecy gate and how it maps to a production build

### Secrets and configuration

- which secrets must exist in production (`DATABASE_URL` [Neon SG], `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), how they are injected (wrangler secret vs env), and what happens if they are missing (the app must fail closed)
- `ADMIN_EMAIL` — a deployment binding (not code); confirm BOTH admin addresses are covered by the promotion semantics
- `BETTER_AUTH_URL` and `trustedOrigins` — what the production base URL and origin trust must be so Google OIDC callbacks and CSRF/Origin checks pass in production (trace auth.ts + the CSRF middleware)
- the dev-secret fallback policy (`NON_PRODUCTION_ENVS` + `DEV_SECRET`) — confirm a production Worker can never select the dev secret
- `.dev.vars` / `.env` are gitignored — confirm no secret can leak into the worker bundle or repo

### Database / seeding

- Neon Singapore connectivity through the app's real driver (`@neondatabase/serverless` WebSocket + `drizzle-orm/neon-serverless`)
- the answer-pool seed contract (`scripts/seed/README.md`, `bun run seed:answers`): when it runs per target DB, what it validates, idempotency, and that the private source file is never committed
- zero-migration invariant (Phase 3 D1): no schema/migration changes in Phase 6

### Production verification requirements

- settlement cron: how to verify the first production run (wrangler deployments/logs, manual trigger, the `runSettlement` behavior, expected idempotent outcome)
- latency measurement from the Philippines: define concrete methodology and acceptance evidence (what tooling/probes/RUM, what the baseline is, the evidence gate before any optimization)
- rollback path: versioned deployments / `wrangler rollback`; what "deploy failed" looks like and how to recover

### CI deploy workflow

- the existing four-job CI (unit-and-build, integration on ephemeral postgres, smoke, e2e on shared Neon with the CI-9/CI-10 gates) — Phase 6 must preserve it
- what a deploy job must do: gate on the four jobs, build the production artifact, run `verify:bundle`, provision/validate secrets + rate-limit namespaces, seed the answer pool, deploy, and smoke the deployed URL
- where credentials for deployment live (GitHub secrets / OIDC) and what the minimum permissions are (the current `permissions` block is `contents: read` only — deployment will need more; specify exactly what)

---

## 4. Define the exact Phase 6 scope

Produce a definitive boundary.

### In scope

Likely areas include:

- Cloudflare Workers + Neon Singapore production deployment
- production secrets/vars/bindings provisioning plan (incl. the four rate-limit namespace IDs and the exact operator steps)
- answer-pool seeding into the production DB
- production origin/CSRF/OIDC configuration (`BETTER_AUTH_URL`, `trustedOrigins`)
- settlement cron production verification plan
- real-user latency measurement methodology from the Philippines (evidence gate before optimization)
- CI deploy workflow (without regressing CI-7 … CI-11)
- rollback and incident-recovery steps

But do not mark anything in scope just because it sounds deploy-related. Every item must be justified by repository evidence.

### Out of scope

Explicitly identify things such as:

- new product features
- schema changes / migrations
- changing product thresholds (3/8), admin emails, or datasets
- loosening any security/secrecy gate
- speculative performance optimization without a measured baseline
- redesigning the CI architecture already established in CI-7 … CI-11
- anything that belongs to a later phase

---

## 5. Produce the Phase 6 implementation plan

Create:

`docs/phases/phase 6/phase-6-plan.md`

This must be implementation-grade. It should include:

## A. Phase goal

Precise definition of what "Phase 6 complete" means (deployed, seeded, verified, measured — each with evidence).

## B. Current deployment posture

Summarize:

- what is already deploy-ready
- what is verified
- what is partial (e.g. rate-limit namespace placeholders)
- what is missing (deploy workflow, secrets provisioning, production origin config, latency measurement)
- the highest-risk deployment gaps

## C. Scope

Definitive in-scope/out-of-scope list.

## D. Target deployment architecture

Describe the final intended production topology and request flow:

- Cloudflare Workers (worker + static assets) → Neon Singapore via the WebSocket driver
- bindings: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL`, `BETTER_AUTH_URL`, the four rate-limit namespaces
- cron trigger `0 16 * * *` (Asia/Manila midnight) with the patched `scheduled` export
- how the CSP pre-paint theme script stays intact behind the platform

## E. Implementation slices

Break the work into small, independently verifiable slices (order by dependency):

1. deployment configuration & secret/binding plan (incl. rate-limit namespace provisioning steps)
2. answer-pool seeding into the production DB (and verifying the subset invariant)
3. production origin/CSRF/OIDC configuration
4. CI deploy workflow (gated, min-permission)
5. production deployment + smoke of the deployed URL
6. settlement cron production verification
7. real-user latency measurement methodology from the Philippines + the evidence-driven optimization gate
8. rollback / incident-recovery runbook
9. final verification gate + receipts

For every slice specify:

- objective
- exact files/config likely affected
- current behavior
- desired behavior
- Worker/Cloudflare changes
- Neon/database changes
- secrets/CI changes
- tests/verification
- acceptance criteria
- risk/rollback

## F. Secrets & bindings contract

Document every production secret/var/binding: name, source (wrangler secret / env / `[vars]`), whether it must be operator-provisioned, what happens if missing, and the exact provisioning steps (including creating the four rate-limit namespaces and recording the real `namespace_id`s — never invent values).

## G. Origin & auth contract

Document `BETTER_AUTH_URL`, `trustedOrigins`, and the Google OIDC callbacks exactly as production requires, with the security rationale (CSRF/Origin checks stay fail-closed).

## H. Seeding contract

Document exactly when/how `bun run seed:answers` runs against the production DB, what it validates (`answers ⊂ valid guesses`), idempotency, and the secrecy constraints (private source never committed or bundled).

## I. Cron verification contract

Document the settlement cron: schedule mapping (UTC → Asia/Manila), the patched `scheduled` export, how the first production run is verified, expected idempotent outcomes, and how a missed/failed run is detected.

## J. Latency measurement & optimization gate

Document a concrete methodology for measuring real latency from Philippines users, the baseline, and the rule that **no optimization happens without evidence** (and no optimization in Phase 6 unless a real regression is demonstrated — the architecture says "optimize only when evidence supports it").

## K. CI deploy workflow

Document the deploy job: trigger, dependency on the four green jobs, build + `verify:bundle`, secret/binding validation, seeding, deploy, and post-deploy smoke — with the minimum required GitHub permissions and how it preserves CI-7 … CI-11.

## L. Rollback / recovery

Document `wrangler rollback`/versioned deployments, how a broken deploy is detected, and the recovery steps.

## M. Risks and mitigations

Pay particular attention to:

- missing/placeholder rate-limit namespaces
- missing or misconfigured production secrets (fail-closed behavior)
- production origin/CSRF/OIDC misconfiguration
- answer-pool or secret leakage into bundles/logs
- cron scheduling/UTC mistakes
- latency measurement that cannot prove the Philippines baseline
- deploy CI regressing the established CI architecture
- zero-migration invariant
- accidental product-threshold changes

## N. Verification gates

Define exact commands, tests, and required evidence (CI green, `verify:bundle`, seed verification, deployed smoke, cron receipt, latency baseline).

## O. Deferred decisions

Record anything that should remain product-tunable or be deferred (e.g. exact rate-limit thresholds, optimization targets).

## P. Explicit invariants

List the Phase 0–5 + pre-Phase-6 + CI-7…CI-11 behavior that Phase 6 MUST NOT break.

A Phase 6 plan is NOT complete until another agent can implement it without guessing what "deployed" means.

---

## 6. Produce a planning-state handoff

Create:

`docs/phases/phase 6/phase-6-planning-state-handoff.md`

This must allow a fresh implementation chat to continue without access to the reasoning history. Include:

- exact repository HEAD/branch
- pre-Phase-6 and CI-7 … CI-11 dependency summary
- deployment-readiness baseline
- every unresolved decision (never silently resolved)
- the implementation slices
- bindings/secrets/namespaces contract
- origin/CSRF/OIDC requirements
- seeding and cron verification requirements
- latency measurement requirements
- CI deploy workflow requirements
- rollback/recovery requirements
- exact next-step instructions

---

## 7. Produce the Phase 6 implementation prompt

Create:

`docs/phases/phase 6/phase-6-implementation-prompt.md`

This must be the executable prompt for a separate implementation chat. It must tell the implementation agent:

- what to read first
- what Phase 6 means
- the exact scope
- current deployment posture
- exact slices to implement
- binding decisions
- unresolved decisions that MUST NOT be invented (especially the rate-limit `namespace_id`s)
- files/components/config likely to change
- Cloudflare + Neon constraints
- secrets/CI requirements
- verification gates
- documentation/receipt requirements
- how to produce the final implementation handoff

The implementation prompt must explicitly state:

**Do not modify Phase 0–5 / pre-Phase-6 behavior, the zero-migration invariant, answer-pool secrecy, or the CI-7 … CI-11 architecture unless the Phase 6 plan explicitly identifies it as a deployment remediation.**

---

## 8. Do NOT implement Phase 6 yet

This is a **PLANNING-ONLY** task.

You may:

- inspect the repository
- inspect source/config/CI
- create the Phase 6 Markdown planning files
- update planning documentation if needed

You must NOT:

- deploy anything
- create or edit secrets/bindings
- provision rate-limit namespaces
- seed any database
- modify application code
- change CI implementation
- change `wrangler.toml`
- modify dependencies

Those belong to the later Phase 6 implementation pass.

---

## 9. Final consistency review

Before finishing, perform a final cross-check. Verify:

- the Phase 6 plan matches the current repository and deployment surface
- the Phase 6 plan matches Architecture-v3 and Specifications-v1
- Phase 0–5 / pre-Phase-6 invariants are preserved (zero migration, answer secrecy, thresholds, admin emails)
- CI-7 … CI-11 architecture is preserved
- every secret/binding/namespace is fully specified (placeholders flagged, not invented)
- production origin/CSRF/OIDC is fully specified
- seeding and cron verification are fully specified
- latency measurement from the Philippines is concrete and evidence-gated
- the deploy CI workflow is realistic and min-permission
- unresolved product/operator decisions remain explicitly unresolved
- another implementation agent could implement Phase 6 without guessing

Finally, give me:

1. a concise Phase 6 readiness assessment
2. the highest-risk deployment gaps discovered
3. any genuine blockers to implementation
4. the exact files created
5. confirmation that NO deployment or source-code implementation was performed
