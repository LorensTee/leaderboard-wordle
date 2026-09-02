# Phase 5 — Planning-State Handoff

> **Status: PLANNING COMPLETE.** This document lets a fresh implementation chat
> continue **without access to the planning reasoning history**.
> Executable prompt: `docs/phases/phase 5/phase-5-implementation-prompt.md`.
> Authoritative plan: `docs/phases/phase 5/phase-5-plan.md`.
>
> Evidence notation: **[V]** = verified by the planning pass (file:line);
> **[D]** = documented in Phase 0–4 records; **[NV]** = must be verified by the
> implementation pass (exact step given).

## 1. Exact repository identity

| Item | Value |
|---|---|
| Branch | `main` (tracks `origin/main`) |
| **HEAD (planning time)** | `40210c3` — `docs(phase3+4): final visual review receipt + handoff synchronization` |
| Phase-4 implementation commit | `3d2251910eebd770f3951cc5dc92198b55124548` — `feat(phase4): admin puzzle scheduling & management` |
| Post-implementation UI review | `1de4c02` (`fix(ui): phase 3+4 visual review fixes`) + `4a06987` (`docs(phase3+4): multimodal visual review prompt`) |
| Working tree | `.idea/material_theme_project_new.xml` modified (user-owned IDE file, never committed); `docs/phases/phase 5/` untracked (this planning package) |
| Phase-4 dependency | `docs/phases/phase 4/phase-4-implementation-handoff-final.md` — mandatory pre-read (see §9) |

## 2. Phase-4 final state (verified receipts [D])

- Unit **206 passed** / 89 skipped (DB-gated) · Integration **89/89** (live non-production Neon, incl. I-A1…I-A10 lock-order races) · E2E **30/30** (6 specs) · `bun run build` + patched worker (single `export { scheduled }`) · `verify:bundle` OK · `types:check` hermetic OK · `auth:check` OK · schema/migrations diff EMPTY · `wrangler deploy --dry-run` OK · CI run #26 green (all three jobs: unit-and-build, integration, e2e).
- Phase-4 handoff §10 lists the invariants Phase 5 must keep (mirrored in plan §O).

## 3. Security baseline (verified this pass)

### 3.1 Solid — audit/extend only, never re-implement

- **Middleware composition** (`src/server/routes.ts:65-116` [V]): requestId → timeout(30s→408) → bodyLimit(64KB→413) → securityHeaders → hstsOnHttps → csrfProtection → authContext → requireAuth (`/api/game/*`, `/api/me/*`, `/api/admin/*`, `/api/leaderboard/*`) → requireAdmin (`/api/admin/*`) → Better Auth `/api/auth/*`.
- **CSRF** (`src/server/middleware/csrf.ts` + `src/server/lib/origin.ts`): fail-closed same-origin verification for POST/PUT/PATCH/DELETE on all paths except `/api/auth/*`; `Sec-Fetch-Site` ∈ {same-origin} only; `Origin` must equal own origin or `ALLOWED_ORIGINS` (never `'*'`); no header → reject.
- **Error envelope** (`src/server/lib/errors.ts`): `{error:{code,message,requestId,issues?}}`; centralized onError/notFound; sanitized 500s; 408 preserved verbatim; 400 mapped to sanitized `BAD_REQUEST`; **`RATE_LIMITED` code already defined, currently unused**.
- **Auth** (`src/server/middleware/auth.ts`, `src/server/auth/auth.ts`): cookie fast-path (DB-free), requireAuth 401, requireAdmin 403, bootstrap promote-only/idempotent, secret policy (production default), `trustedOrigins` = the two local hosts only, Google OIDC + email verification, memo keyed on `DATABASE_URL`+`BETTER_AUTH_SECRET`.
- **Page guards** (`src/lib/app/guards.ts` + `src/hooks.server.ts`): independent from API authz; redirects 307.
- **Answer secrecy** [D]: gitignored pool source, `verify:bundle` scans, admin-secrecy unit pins, settlement chunk answer-free (U5), admin role gate on answers.
- **Pre-paint theme script**: single inline script in `src/app.html:11-26` — NG17 hashable.

### 3.2 Gaps found (the Phase-5 work)

| # | Finding | Evidence |
|---|---|---|
| F1 | **Rate limiting entirely absent** — no binding (`wrangler.toml`), no middleware (`routes.ts`), `RATE_LIMITED` unused, no tests. Arch §Rate limiting contradicts Arch §Phase 5 + Phase-4 handoff; code wins → Phase 5 implements. | [V] |
| F2 | **Page responses carry no security headers** — NG22 baseline is Hono-only (`routes.ts:97-98`); `hooks.server.ts` sets only session locals; no Kit `csp` config in `vite.config.ts`. | [V] |
| F3 | **No CSP** (reserved for Phase 5 by NG17/NG22 — intended). | [V] |
| F4 | **No Dependabot / dependency audit.** `.github/` contains only `workflows/ci.yml`. | [V] |
| F5 | **`tests/security/` empty; no ZAP/adversarial harness anywhere.** | [V] |
| F6 | **No RLS** on answer tables — documented deferral to Phase 5 (decision record required, NO schema change without a new decision). | [D] |
| F7 | `cookieCache` assessment outstanding (contradictions log:137). | [D] |
| F8 | GET-reachability of state changes (incl. Better Auth sign-out) not pinned by a test. | [V]/[D] |
| F9 | No Playwright security regression spec beyond per-feature guards. | [D] |
| F10 | Actions unpinned to SHAs; no supply-chain automation. | [D] |

## 4. Current request flow (normative for Phase 5)

```text
HTTP → SvelteKit hooks (session locals only, no headers today)
     → /api/[...path] bridge → Hono: requestId → timeout → bodyLimit →
       securityHeaders → hstsOnHttps → csrf → authContext → guards →
       route handler → DB → envelope/response
Pages: hooks → SSR page (currently header-less apart from SvelteKit defaults)
```

**Phase-5 target flow** (plan §D.1): rate-limit classes mounted CSRF-after, guards-before (auth class at `/api/auth/*` pre-handler); page responses get the header baseline via `hooks.server.ts`; both surfaces carry one CSP contract.

## 5. Relevant files (inventory)

- Middleware: `src/server/middleware/{request-id,csrf,security-headers,auth}.ts` · `src/server/lib/{errors,origin}.ts`
- Composition/bridge: `src/server/routes.ts` · `src/routes/api/[...path]/+server.ts`
- Auth: `src/server/auth/auth.ts`, `auth.generate.ts` · `src/hooks.server.ts` · `src/lib/app/guards.ts`, `theme.ts`, `auth-client.ts`
- Domain: `src/server/{admin,game,leaderboard,profile,puzzle}/*` (handlers = strict zod + UUID short-circuit per Phase-4 record [D], re-verify S0)
- Platform: `wrangler.toml` (no rate-limit binding today [V]) · `vite.config.ts` (Kit options here, no `csp` [V]) · `worker-configuration.d.ts` · `scripts/patch-worker-scheduled.ts`
- DB: `src/server/db/{client,schema}.ts` · `src/server/db/migrations/0000_init.sql`
- Secrecy: `scripts/verify-bundle-secrecy.ts` · `scripts/seed/` (gitignored source) · `tests/unit/admin-secrecy.test.ts`
- Tests: `tests/unit/` (206) · `tests/integration/` (89; serialized, `ALLOW_DB_WIPE=1`) · `tests/e2e/` (30; `helpers/auth-fixture.ts`) · `tests/security/` (empty)
- CI: `.github/workflows/ci.yml` · `scripts/ci-{db-probe,migrate}.ts`
- Docs: `Architecture-v3.md` (§Phase 5, §Rate limiting, §Security verification) · `Specifications-v1.md` (§21) · `docs/contradictions-and-gaps.md` (NG4/NG17/NG19–NG23, Phase-4 decisions D1–D10 + deviations) · Phase-4 handoff/plan/prompt/planning-state docs

## 6. Implementation slices (plan §E — do not reorder without recording why)

- **S0** baseline audit corrections: page-header baseline fix (F2); GET-immutability pin (F8); verification tasks (raw-SQL grep, handler zod/UUID audit, `RATE_LIMITED` consumer check); RLS (F6) + `cookieCache` (F7) decision records; `{@html}`/`innerHTML` grep with result recorded.
- **S1** rate limiting (F1): `[[rate.limit]]` binding + middleware + 429 `RATE_LIMITED` envelope + headers + pass-through + unit tests (§F).
- **S2** CSP + header hardening (F2/F3): shared directive builder; Kit `csp` hash mode; pre-paint sha256 pin; report-only(dev)→enforced(preview/prod); e2e console-clean + theme assertions (§G/H).
- **S3** security regression tests: one `tests/e2e/security.spec.ts` reusing the auth fixture (cross-user isolation, API bypass, CSRF cross-site, page redirects, malformed bodies, sign-out invalidation, CSP-consistency); unit pins.
- **S4** ASVS verification record `docs/phases/phase 5/phase-5-asvs-verification.md` (matrix = plan §I).
- **S5** ZAP/adversarial: `scripts/zap/` (run script + README) + `docs/phases/phase 5/adversarial-checklist.md` + triaged findings record (report artifacts gitignored).
- **S6** dependency automation (F4/F10): `.github/dependabot.yml` + audit step + Actions SHA pinning (§K).
- **S7** final security gate + `docs/phases/phase 5/phase-5-implementation-handoff-final.md`.

## 7. Binding decisions (made by this plan — do not re-litigate)

1. CSP mechanism = **hash for the pre-paint script** (pinned sha256; no nonces; Kit `csp` mode `hash` for SvelteKit's own inline scripts).
2. Rate limiting = **Cloudflare Workers Rate Limiting API binding**; classes/keying/order per plan §F (arch-suggested limits remain PROPOSED, not decided).
3. CSRF-before-rate-limit ordering (contract §D.1) — cross-site floods stay canonical 403; limiter protects the legit path.
4. Session-keyed limiters mounted **after** `requireAuth`/`requireAdmin`; auth class per-IP before the Better Auth handler.
5. Missing binding ⇒ **pass-through** (never fail-closed locally); unit-tested branch.
6. Page + API share ONE header/CSP contract; single directive/header constant source under `src/server/middleware/`.
7. Security regression tests live in existing suites (`tests/e2e/security.spec.ts`, owning unit suites) — no parallel infrastructure; `tests/security/` = ZAP artifacts home.
8. ZAP = local/preview only, baseline/passive; triage committed, reports gitignored; NOT default CI.

## 8. Unresolved decisions (implementation MUST NOT invent — plan §N)

- D1 rate-limit thresholds (PROPOSED 10/30/10/20/min from Architecture; product-tunable)
- D2 RLS implementation (decision record only in S0 — schema change NOT authorized by this plan)
- D3 `Permissions-Policy`/`COOP` adoption (deferred)
- D4 ZAP CI cadence (default local-only)
- D5 audit tool/policy (`bun audit` vs `npm audit`; HIGH+ fail — choose and record; bounded, one scanner)
- D6 HSTS preload (Phase 6), D7 CSP report-only duration (E2E-green gate), D8 dependabot schedule/grouping (weekly dev-group proposed), D9 `cookieCache` (default not adopted), D10 alert channel (Phase 6)

## 9. Exact next-step instructions

1. Read, in order: `docs/phases/phase 5/phase-5-implementation-prompt.md` → `docs/phases/phase 5/phase-5-plan.md` → `docs/phases/phase 4/phase-4-implementation-handoff-final.md` → `docs/contradictions-and-gaps.md` → §4 inventory files as needed.
2. Confirm HEAD == `40210c3` (or record the new HEAD in the handoff).
3. Execute S0 → S7 in order; record every decision/deviations in `docs/contradictions-and-gaps.md` BEFORE their code (Phase-4 discipline).
4. Verify every `[NV]` item explicitly (each has a concrete step in plan §E/S0).
5. Run all §M gates on the final tree and capture receipts in the handoff.
6. Run `tool:review` + `tool:security-review` on the final diff; check against plan §O invariants.
7. Do not implement Phase 6 work or any plan-§N unresolved decision.

## 10. Cloudflare constraints (planning-time facts)

- Workers target with `nodejs_compat` (Better Auth AsyncLocalStorage) — no Node-only APIs for new middleware (`cloudflare:rate-limit` module is platform-provided).
- `wrangler.toml` today: `ASSETS` binding, cron `0 16 * * *` (UTC = Manila midnight), no rate-limit binding.
- Rate-limit namespace provisioning may need dashboard/operator work — record steps, don't invent credentials.
- Cron `scheduled` export is patched post-build (`scripts/patch-worker-scheduled.ts`) — do not disturb (CI asserts single export).
- `types:check` is build-state-dependent → must run post-build, hermetic (`.env`/`.dev.vars` absent) — unchanged.
- CSP headers are Worker-emitted (no platform caching concerns for test assertions).

## 11. CI constraints (planning-time facts)

- 3 jobs: unit-and-build (lint, check, unit, build, post-build types:check, verify:bundle, auth:check, parity diff gates), integration (non-prod Neon, fails when `DATABASE_URL` secret missing), e2e (Playwright; `vite preview`).
- New Phase-5 tests flow through existing jobs; CI structural changes are limited to: (S6) audit step + dependabot + action pinning; optional manual ZAP workflow (default NO).
- All assertions stay; nothing may weaken the mandatory secret gate.

## 12. Pre-flight checklist for the implementation chat

- [ ] `bun install --frozen-lockfile` clean
- [ ] `bun run lint` + `bun run check` clean before S0
- [ ] baseline `bun run test:unit` / `test:integration` / `test:e2e` receipts captured (206/89/30)
- [ ] `git status` shows only the user-owned IDE file + `docs/phases/phase 5/` untracked
- [ ] no `.env`/`.dev.vars` committed (they are gitignored; `types:check` hermetic rule)