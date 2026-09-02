# Phase 5 — Implementation Plan: Security Verification & Hardening

> **Status: PLANNING COMPLETE — READY FOR IMPLEMENTATION.**
> Companion documents: `docs/phases/phase 5/phase-5-planning-state-handoff.md`
> (planning-time state, exact repository identity) and
> `docs/phases/phase 5/phase-5-implementation-prompt.md` (the executable prompt
> for the implementation chat). Source-of-truth precedence: the **current
> repository state** wins over every planning document; where this plan cites
> "documented" evidence it means the Phase 0–4 records listed in §B.
>
> **Evidence notation used throughout this document:**
> - **[V]** = directly verified by the planning pass against repository code/config (file:line).
> - **[D]** = stated in Phase 0–4 implementation records / handoffs / receipts (trusted, re-verifiable in one command).
> - **[NV]** = needs verification during implementation (exact verification step given).

---

## A. Phase goal

**"Phase 5 complete" is defined as:** the repository demonstrably closes the
security gaps recorded in §B, implements the rate-limiting, CSP/header,
security-test, ASVS, ZAP/adversarial, and dependency-automation contracts in
§E–§L, passes every gate in §M, and produces the final implementation handoff —
**without changing any Phase 0–4 behavior that this plan does not explicitly
identify as a security remediation** (§O).

Non-goal: Phase 5 is a **verification and hardening gate**, not a feature phase
and not a deployment phase (Phase 6 owns deployment/operations).

## B. Current security posture (evidence-backed baseline)

### B.1 Verified controls — do NOT re-implement, audit/extend only

| Control | State | Evidence |
|---|---|---|
| NG21 error envelope `{ error: { code, message, requestId, issues? } }`, centralized `onError`/`notFound`, sanitized 500s (log-only trace by requestId) | ✅ PASS [V] | `src/server/lib/errors.ts:16-127`; `RATE_LIMITED` code already defined at `errors.ts:25` (currently **unused** [V]) |
| NG19 timeout: 30 s → JSON 408 envelope (only verbatim `HTTPException` payload) | ✅ PASS [V] | `src/server/routes.ts:67-81`; 400 `HTTPException` (malformed JSON) mapped to sanitized `BAD_REQUEST` at `errors.ts:104-112` |
| NG20 body limit: 64 KB → JSON 413 (pre-validation) | ✅ PASS [V] | `src/server/routes.ts:82-96` |
| NG21 requestId: one per request, regex-validated inbound value, echoed in header + envelope | ✅ PASS [V] | `src/server/middleware/request-id.ts:5-13` |
| NG4 CSRF: custom Origin/Sec-Fetch-Site gate on every unsafe method for all paths except `/api/auth/*`; fail-closed (headerless, `Sec-Fetch-Site: none`, cross-origin → 403 `CSRF`); `ALLOWED_ORIGINS` env allowlist never `'*'` | ✅ PASS [V] | `src/server/middleware/csrf.ts:9-30`; `src/server/lib/origin.ts:15-47`; `ALLOWED_ORIGINS` filter at `origin.ts:15-18` |
| NG22 header baseline (API surface): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`; HSTS `max-age=31536000; includeSubDomains` over HTTPS only | ✅ PASS (API only) [V] | `src/server/middleware/security-headers.ts:8-31`; mounted `routes.ts:97-98`. **CSP explicitly reserved for Phase 5 — comment at `security-headers.ts:4-5`** |
| Auth: Better Auth session resolved independently in Hono (`authContext`), cookie fast-path DB-free; `requireAuth` 401 `UNAUTHORIZED`; `requireAdmin` 403 `FORBIDDEN`; admin bootstrap promote-only/idempotent/lowercased-email; page guards independent (`guards.ts` + `hooks.server.ts`) | ✅ PASS [V] | `src/server/middleware/auth.ts:55-191`; `src/hooks.server.ts:7-30`; `src/lib/app/guards.ts` |
| Better Auth secret policy: production is default; dev fallback only under `NODE_ENV ∈ {development,test}`; missing secret in production → hard throw; `getAuth` memo keyed on `DATABASE_URL`+`BETTER_AUTH_SECRET` | ✅ PASS [V] | `src/server/auth/auth.ts:32-120` |
| Better Auth config: Google OIDC, `requireEmailVerification` (global + per-provider), `trustedOrigins` limited to the two local hosts, additionalFields (role `input:false`) | ✅ PASS [V] | `src/server/auth/auth.ts:42-96` |
| Answer-pool secrecy: pool source gitignored; server-authoritative validation; admin role gate on answer exposure; `verify:bundle` post-build scan (hard-fails genuine private-word leaks; public guesses by design); settlement chunk answer-free (U5); `tests/unit/admin-secrecy.test.ts` conditional pins | ✅ PASS (no RLS — see F6) [D] | Phase-4 handoff §3/§6; `Architecture-v3.md:273` |
| NG9 invariants: puzzle-row-first `SELECT … FOR UPDATE`, `transaction_timestamp()` eligibility anchor, no `clock_timestamp()`, lock-order race tests | ✅ PASS [D] | Phase-4 handoff §10; integration I-A1…I-A10 |
| CI gates: unit-and-build (lint, check, unit, build, post-build `types:check`, `verify:bundle`, `auth:check`, word/avatar parity `git diff`), integration (non-prod Neon, mandatory secret gate), e2e (Playwright) | ✅ PASS [D] | `.github/workflows/ci.yml` [NV exact steps]; Phase-0 B7/B8 + Phase-4 §6 records |
| Pre-paint theme script: **single inline script** in `app.html` (localStorage `theme` → `data-theme`), kept hashable per NG17 | ✅ PASS [V] | `src/app.html:11-26`; `src/lib/app/theme.ts` |

### B.2 Partial / missing controls (Phase 5 work)

| # | Finding | Severity | Evidence | Phase 5 action |
|---|---|---|---|---|
| **F1** | **Rate limiting is entirely absent.** No `[[rate.limit]]` binding in `wrangler.toml` [V], no rate-limit middleware in `routes.ts` [V], `ERROR_CODES.RATE_LIMITED` unused [V], no rate-limit tests [D]. Architecture-v3 §Rate limiting states it is "implemented alongside each feature in its respective phase, not deferred to Phase 5" — **contradicted** by Architecture-v3 §Phase 5 ("rate limiting" listed as Phase 5 work, line 1398) and the Phase-4 handoff §10 ("Phase 5 starting point: … rate limiting …"). Spec §21 requires "rapid repeated requests are handled appropriately". **Current code wins: implement in Phase 5.** | HIGH (abuse/brute-force/DoS surface on auth + mutations) | `wrangler.toml:1-19` [V]; `routes.ts:65-116` [V]; `Architecture-v3.md:1107-1113` / `:1390-1400` [D]; Phase-4 handoff §10 [D] | Slice 1 |
| **F2** | **Page responses carry NO security headers.** The NG22 baseline is mounted only inside the Hono app (`routes.ts:97-98`), which serves only `/api/*` + `/api/auth/*`. SvelteKit page responses (`/`, `/play`, `/leaderboard`, `/profile`, `/onboarding`, `/admin`) get no nosniff/XFO/Referrer-Policy/HSTS from application code: `hooks.server.ts` sets only session locals [V], and no `csp` Kit option exists in `vite.config.ts` [V]. | HIGH (header contract applies to pages; CSP would be a no-op on pages without this) | `src/hooks.server.ts:7-30` [V]; `vite.config.ts:26-52` [V]; `src/server/routes.ts:97-98` [V] | Slice 0 (remediation) + Slice 2 |
| **F3** | **No Content-Security-Policy anywhere** (pages or API). Reserved for Phase 5 by NG17/NG22 — this is the *intended* Phase-5 delivery, not a defect. `X-Frame-Options: DENY` covers framing until `frame-ancestors` lands. | MEDIUM | `security-headers.ts:4-5` [V]; `Architecture-v3.md:1023-1024` [D] | Slice 2 |
| **F4** | **No dependency vulnerability automation.** No `.github/dependabot.yml` [V — `.github/` contains only `workflows/ci.yml`], no audit script in `package.json` [V], lockfile is `bun.lock` [V]. | MEDIUM (supply-chain) | `.github/` listing [V]; `package.json` scripts [V] | Slice 6 |
| **F5** | **`tests/security/` is empty** (only `.gitkeep`) and there is no ZAP/adversarial harness, script, or documented procedure anywhere in the repo. | MEDIUM | `tests/security/` listing [V]; `scripts/` listing [V] | Slices 3 + 5 |
| **F6** | **No RLS on `answer_dictionary`/`daily_puzzles`.** Explicitly deferred to "Phase 5 hardening" in the Phase-0 B7 record; compensating controls (server-only access path, bundle-secrecy gates, role gates) in place. | LOW–MEDIUM (defense-in-depth; DB access is operator-controlled) | `Architecture-v3.md:273` [D] | Slice 0 decision record (see §N) |
| **F7** | **Better Auth `cookieCache` assessment outstanding** (session staleness vs revocation semantics) — recorded as "assess against ASVS at Phase 0/5" in the contradictions log. | LOW/INFO | `docs/contradictions-and-gaps.md:137` [D] | Slice 0 (assess; likely documented "not adopted") |
| **F8** | **GET-reachability audit of state changes not pinned.** CSRF gate only guards unsafe methods [V]; Spec §21 + NG4 require verifying no state-changing endpoint (incl. Better Auth sign-out) is GET-reachable. Envelope + handler evidence suggests none, but no test pins it. | LOW | `csrf.ts:17` [V]; NG4 row, contradictions log [D] | Slice 0 test |
| **F9** | **No Playwright security regression spec** beyond per-feature guards (admin E-A1/E-A7, auth fixture). Spec §21's security regression list (cross-user isolation, fake score/time rejection, malformed/oversized inputs in browser) is only partially pinned. | MEDIUM | `tests/e2e/*.spec.ts` [D]; Spec §21 [D] | Slice 3 |
| **F10** | **Supply-chain hygiene gaps:** GitHub Actions used without SHA pinning (checkout bumped v4→v5 [D]); no dependabot; `auth/schema` generation pinned (`auth@1.7.1`) [D] — good precedent to extend. | LOW | Phase-0 B7 note [D]; `package.json` [V] | Slices 0 + 6 |

### B.3 High-risk summary

1. **F1 — unthrottled auth/game/admin endpoints** (highest-value attack surface per Architecture §Security verification: authorization + game integrity; a flood of `POST /api/auth/sign-in` or `POST /api/game/…` needs no authentication to consume DB/CPU).
2. **F2 — pages without the security-header baseline**, which would silently neutralize a page-only CSP if headers were (incorrectly) assumed covered.

### B.4 Medium/low (see table above): F3–F10. No blocking findings outside Phase-5 scope.

## C. Scope

### In scope (each justified by §B evidence)

1. **S0 — Security baseline audit + corrections**: verify handler-level validation claims (strict zod, UUID short-circuit, GET-reachability incl. `/api/auth/*`), fix the demonstrated F2 page-header gap, add the missing pins (F8), record the RLS decision (F6) and `cookieCache` assessment (F7), update the contradictions log.
2. **S1 — Rate limiting** (F1): Cloudflare Workers Rate Limiting binding + Hono middleware per §F, 429 `RATE_LIMITED` envelope, headers, pass-through in local/tests, unit tests.
3. **S2 — CSP + security-header hardening** (F2/F3): Kit `csp` config (hash mode) + Hono-side CSP for the API + pre-paint script hash pin; extend the header contract to page responses; report-only → enforce.
4. **S3 — Security regression tests** (F8/F9): extend the existing Playwright suite (one `tests/e2e/security.spec.ts`, reusing `auth-fixture.ts`) + unit/integration pins in existing suites; no new parallel test infrastructure.
5. **S4 — ASVS verification**: produce `docs/phases/phase 5/phase-5-asvs-verification.md` (matrix in §I, completed with post-implementation states).
6. **S5 — ZAP + adversarial verification**: local/preview ZAP baseline run harness (script + README), triaged findings record, friend adversarial checklist document (Spec §21 / Architecture §Security verification).
7. **S6 — Dependency/security automation** (F4/F10): Dependabot config, dependency audit step (mechanism chosen at implementation per §K), Actions SHA pinning.
8. **S7 — Final security gate**: full sweep (§M), docs, final handoff.

### Out of scope (explicit)

- **Phase 6 work**: deployment to Cloudflare/Neon, production latency measurement, production verification of the settlement cron, alert-channel infrastructure (P3).
- New product features; leaderboard/game/admin redesign; UI changes beyond security-required header/CSP adjustments.
- Database redesign unrelated to a demonstrated issue (RLS is a *decision record* in S0 — implementation requires a separate decision per §N; a schema change is NOT authorized by this plan).
- Speculative security infrastructure (WAF rules, DDoS protection, custom domains, secrets manager, SIEM, email verification flows).
- Unrelated performance optimization.
- HSTS preload submission, Permissions-Policy/COOP adoption (see §N — deferred).

## D. Security architecture (final intended request flow)

### D.1 Final middleware order (Hono, `src/server/routes.ts`)

```text
requestIdMiddleware            (*)        — 1st: every envelope/header references it (unchanged)
timeout(30s → 408)             (*)        — unchanged
bodyLimit(64KB → 413)          (*)        — unchanged
securityHeadersMiddleware      (*)        — CHANGED: adds CSP (API surface); baseline stays
hstsOnHttps                    (*)        — unchanged
csrfProtection                 (*)        — unchanged (after rate-limit placement decision, see D.2)
authContext                    (*)        — unchanged (DB-free fast-path)
 requireAuth                   /api/game/* /api/me/* /api/admin/* /api/leaderboard/*  — unchanged
 requireAdmin                  /api/admin/*  — unchanged
 rateLimitMiddleware (NEW)     /api/auth/*        per-IP class        — BEFORE the Better Auth handler
 rateLimitMiddleware (NEW)     /api/game/*        per-session class   — AFTER requireAuth (identity known)
 rateLimitMiddleware (NEW)     /api/me/*          per-session class   — AFTER requireAuth
 rateLimitMiddleware (NEW)     /api/admin/*       per-session+role    — AFTER requireAdmin
Better Auth handler            /api/auth/*        — unchanged
```

**Why this order is correct:**

1. **requestId first** — NG21: every envelope (408/413/429/403/401/500) and header carries the id; reordering would regress the B7 fix.
2. **timeout/bodyLimit before validation** — NG19/NG20: reject oversized/slow requests before any parsing or DB work.
3. **Headers set early** — response decoration must not depend on route outcome (error responses also get headers).
4. **CSRF before rate limiting** — cross-site floods get the cheap, canonical 403 `CSRF` (origin semantics are intent-establishing); the rate limiter then protects the same-origin/legit path that reaches validation/DB. Rationale recorded; the alternative (limit-first) is equivalent in cost but makes 403-vs-429 attribution noisier.
5. **authContext before guards and before post-guard rate limiting** — keying on `user_id` requires the resolved identity; for `/api/auth/*` the class is per-IP (no session exists pre-auth; matches Architecture §Rate limiting table).
6. **Guards before session-keyed rate limiting** — unauthenticated floods of `/api/game/*` still get the cheap 401 fast-path (DB-free); only authenticated traffic consumes limiter quota per session. Unauthenticated floods of protected paths are additionally bounded at the edge (operational, §F.7).

### D.2 Page request flow (SvelteKit)

```text
request → hooks.server.ts handle ── (NEW) wrap resolve(): apply CSP (from Kit csp config,
         which SvelteKit injects into page responses) + page header baseline
         (nosniff / X-Frame-Options / Referrer-Policy / HSTS-on-https) → SSR page
```

- Pages get CSP via Kit `csp` options in `vite.config.ts` (`sveltekit({ csp: … })` — Kit options live in the Vite config in this repo, kit ≥2.62 [V `vite.config.ts:41-44`]).
- The page header baseline is applied in `hooks.server.ts` (wrap `resolve(event)` and set headers on `event.response`), sharing directive/header constants with the Hono middleware (single source in `src/server/middleware/`).
- Hono `/api/*` and SvelteKit pages remain **separate header surfaces by design**; both must carry the same contract (§H). The bridge (`src/routes/api/[...path]/+server.ts`) is conceptually a page-path in SvelteKit but produces Hono responses — it does not need the hooks-level headers twice; verify no duplication/conflict at implementation (S0).

### D.3 Trust boundaries (unchanged)

- Browser is untrusted; server authoritative. Better Auth owns identity/session; Hono owns API auth/authz; SvelteKit owns page guards (`guards.ts`); page and API authorization are independent by design (never share `event.locals` as an API auth source).
- `answer_dictionary`/answers are server + admin-role-only; client never receives the pool.

## E. Implementation slices

> Each slice is independently verifiable; slices 0→2 are the critical path (S2 depends on S0's page-header fix for meaningful verification).

### S0 — Security baseline audit corrections

- **Objective**: verify every documented claim the plan relies on; fix demonstrated defects only; produce decision records.
- **Files**: `src/hooks.server.ts`, `src/server/routes.ts`, `src/server/middleware/security-headers.ts`, `src/server/lib/errors.ts` (only if a defect is demonstrated), `src/server/admin/handlers.ts`, `src/server/game/handlers.ts`, `src/server/profile/handlers.ts`, `src/server/leaderboard/handlers.ts`, `src/server/auth/auth.ts`, `docs/contradictions-and-gaps.md`, `.github/workflows/ci.yml` (read-only), `vite.config.ts` (read-only).
- **Current**: page responses lack the header baseline [V F2]; GET-reachability unpinned [V F8]; RLS/cookieCache decisions open [D].
- **Desired**: pages carry the baseline (see §H); unit test pins that no state change is GET-reachable (enumerate all registered routes incl. `/api/auth/*` — Better Auth sign-out is POST; assert via a route-inventory unit test over `app.routes` and a `HEAD`/`GET` probe of registered mutation paths → 404/405, never a mutation); RLS + cookieCache decision records appended to `docs/contradictions-and-gaps.md`.
- **Verification tasks during implementation (exact)**:
  1. `grep -rn "sql\`" src/server` — confirm all queries parameterized (Drizzle; no string interpolation of user input); report any raw SQL.
  2. Read every `src/server/*/handlers.ts` — confirm strict zod bodies (`strict()` or unknown-stripping policy — record which), `UUID_RE` short-circuit, and that no `.get()` handler mutates.
  3. Confirm `ERROR_CODES.RATE_LIMITED` has no consumer yet (pre-S1).
  4. Confirm `tests/security/` stays as the ZAP/adversarial artifact home (S5).
- **Backend changes**: page-header baseline in `hooks.server.ts` (shared constants from `src/server/middleware/security-headers.ts` or a new `src/server/middleware/page-headers.ts`).
- **Frontend changes**: none.
- **Worker/Cloudflare changes**: none.
- **Configuration changes**: none.
- **Tests**: `tests/unit/middleware.test.ts` or a new `tests/unit/security-baseline.test.ts` — (a) page-header application via a hooks unit test (invoke `handle` with a fake `resolve`), (b) route-inventory GET-immutability pin.
- **CI**: none new (added tests run in the existing unit job).
- **Dependencies**: none.
- **Acceptance criteria**: `bun run test:unit` green incl. new tests; manual `curl -sI http://127.0.0.1:4173/` shows nosniff/XFO/Referrer/HSTS on a page response; decision records appended; no Phase 3/4 behavior changed otherwise.
- **Security rationale**: closes F2/F8; the GET-immutability pin makes the CSRF contract (unsafe-method gate) airtight and satisfies NG4's audit clause.

### S1 — Rate-limiting mechanism

- **Objective**: implement F1 per the §F contract end-to-end (binding, middleware, envelope, headers, pass-through, tests).
- **Files**: `wrangler.toml` (add `[[rate.limit]]` binding), `worker-configuration.d.ts` (regenerated via `bun run types`), `src/server/middleware/rate-limit.ts` (new), `src/server/routes.ts` (mount), `src/server/lib/errors.ts` (only if a code needs adding — `RATE_LIMITED` exists), `tests/unit/rate-limit.test.ts` (new), `docs/contradictions-and-gaps.md` (record mechanism + thresholds as PROPOSED), possibly `scripts/` (no).
- **Current**: no binding, no middleware, no tests [V F1].
- **Desired**: exactly §F.1–§F.7.
- **Backend changes**: the middleware factory + mounts (§D.1).
- **Frontend changes**: none (client sees 429 envelopes; TanStack Query surfaces the error; verify existing error handling renders the envelope's message — no change expected; mark [NV] at implementation).
- **Worker/Cloudflare changes**: binding + namespace in `wrangler.toml`; `bun run types` regenerates the typed binding; deployment note: a free/paid rate-limit namespace may require dashboard provisioning — record exact steps in the handoff (operator task, do not invent credentials).
- **Configuration changes**: `wrangler.toml` binding config only.
- **Tests**: unit — injectable limiter seam (content-based, mirroring the `SessionResolver`/`fetchImpl` precedent): pass-through when binding absent, 429 envelope shape + `Retry-After`, keying (session vs IP), `OPTIONS` skip, per-class config applied to the right namespace path. Integration — none new required (no DB behavior). E2E — rapid-request smoke only in pass-through mode (real limiter is unavailable locally; assert requests still succeed → pass-through verified in a browser context).
- **CI changes**: none structurally; new unit tests run in the existing unit job.
- **Dependencies**: none new (`cloudflare:rate-limit` module is platform-provided; verify exact import + types against the installed `wrangler`/`@cloudflare/workers-types` — [NV]).
- **Acceptance criteria**: unit tests green; `bun run types:check` green with the new binding; `bunx wrangler deploy --dry-run` OK; E2E suite green (pass-through); local dev unaffected.
- **Security rationale**: abuse/brute-force protection per Architecture §Rate limiting + Spec §21 ("rapid repeated requests"); 429 must use the NG21 envelope so clients/logs stay uniform.

### S2 — CSP + security-header hardening

- **Objective**: F2's page-surface headers + F3's CSP per §G and §H; report-only → enforce.
- **Files**: `vite.config.ts` (Kit `csp` options), `src/server/middleware/security-headers.ts` (add CSP emission for API responses from the shared directive builder), `src/server/middleware/csp.ts` (new — single directive source), `src/hooks.server.ts` (page baseline from S0 + verify Kit CSP application), `src/server/middleware/page-headers.ts` (new if S0 shaped it that way), `tests/unit/csp.test.ts` (new: pre-paint hash pin + directive shape), `tests/e2e/security.spec.ts` (add CSP assertions), `docs/contradictions-and-gaps.md`.
- **Current**: no CSP [V F3]; API-only headers [V F2].
- **Desired**:
  - Production: strict CSP enforced on pages (Kit `csp` hash mode) AND API (`securityHeadersMiddleware` emits the same directives). Pre-paint script allowed by its exact `sha256-…` hash.
  - Dev/preview: CSP in **report-only** mode via a documented env toggle (e.g. `CSP_REPORT_ONLY=1` in `.dev.vars` for `vite dev`; E2E runs against the production build → enforced, which is the intent).
  - The hash pin test fails loudly if `src/app.html`'s inline script changes without updating the hash (NG17).
- **Backend changes**: CSP builder + emission; hooks page baseline.
- **Frontend changes**: none (CSP must not require component changes; if report-only shows legit violations, triage per §L — style-src 'unsafe-inline' is the expected acceptable exemption).
- **Worker/Cloudflare changes**: none (headers are Worker-emitted).
- **Configuration changes**: `vite.config.ts` Kit `csp`; optional env toggle.
- **Tests**: unit — hash pin (read `app.html`, extract the script, compare sha256 to the constant); e2e — `page.on('console')` filters for CSP violation messages on `/`, `/play`, `/leaderboard`, `/profile`, `/onboarding`, `/admin` + assert `data-theme` still applies (theme regression) + header assertions on page and API responses + a `frame-ancestors`/XFO behavior check via `page.setContent` (or a request assertion).
- **CI changes**: none structurally.
- **Dependencies**: none.
- **Acceptance criteria**: E2E green with enforced CSP with **zero CSP violation console messages** on the six routes in light+dark; theme works (pre-paint); unit hash pin green; report-only mode documented and tested in dev.
- **Security rationale**: CSP is the primary XSS mitigation; NG17 mandates pre-paint compatibility; the header contract must be uniform (§H).

### S3 — Security regression tests (Playwright + pins)

- **Objective**: F8/F9 — pin the Spec §21 security regression list using the existing test architecture.
- **Files**: `tests/e2e/security.spec.ts` (new), `tests/e2e/helpers/auth-fixture.ts` (extend only if needed), `tests/unit/` (individual pins in the owning suites — no new suites unless the existing suite structure genuinely lacks a home).
- **Current**: scattered coverage [D]; no dedicated security spec [V F5-related].
- **Desired** (browser-level, reusing the auth fixture):
  1. unauthenticated access to `/api/game/*`, `/api/me/*`, `/api/admin/*` → 401 envelope (API bypass rejection);
  2. user A cannot read/modify user B's game/profile (fixture supplies two identities — check fixture capabilities [NV], extend minimally);
  3. cross-site POST from a foreign origin (`page.route` or a second context served from an attacker origin) → 403 `CSRF`;
  4. protected pages redirect unauthenticated users (`/admin`, `/play`, `/profile`, `/leaderboard`);
  5. non-admin → 403 on `/api/admin/*` + page redirect (already E-A1 — do not duplicate; reference instead);
  6. malformed/oversized bodies → 400/413 envelopes (unit-level already exists [D]; add a browser-level oversized POST probe if cheap);
  7. sign-out invalidates protected access (session cookie cleared → 401; reference existing scenario 12);
  8. CSP console-clean on all six routes (S2 assertion; kept here or in S2's spec — keep in ONE place, decide in S2).
- **Backend/Frontend changes**: test-only.
- **Tests**: the above; every assertion reuses existing helpers.
- **CI**: new spec runs in the existing e2e job.
- **Acceptance criteria**: `bun run test:e2e` green (30 existing + new); no existing assertion weakened.
- **Security rationale**: Spec §21 list → machine-pinned regression net; existing infra (auth fixture, playwright.config) is reused — no parallel harness.

### S4 — ASVS verification record

- **Objective**: complete the §I matrix with post-implementation states as `docs/phases/phase 5/phase-5-asvs-verification.md` (verified statuses, evidence file:line, date, sign-off).
- **Files**: the new doc only (plus handoff).
- **Acceptance criteria**: every row has a concrete evidence line; NEEDS VERIFICATION rows are resolved or explicitly re-scoped; no generic ASVS dump (project-specific rows only).

### S5 — ZAP + adversarial verification

- **Objective**: F5 — a reproducible local ZAP baseline run + triage record + friend adversarial checklist.
- **Files**: `scripts/zap/zap-baseline.sh` (new; dockerized ZAP against `vite preview`, `--tls` off, JSON report to `scripts/zap/reports/` — gitignored), `scripts/zap/README.md` (exact commands, prerequisites: non-production `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ALLOW_DB_WIPE=1`, seed data), `docs/phases/phase 5/adversarial-checklist.md` (new — the Spec §21 friend-test list, one checkbox per attack with "expected behavior" column), `tests/security/` (report/home dir, `.gitkeep` stays).
- **Current**: nothing [V F5].
- **Desired**: one documented baseline run against preview; findings triaged (each: confirm/reject, exploitability, status); the checklist is a two-hour manual session protocol.
- **Cloudflare constraint**: ZAP runs against the local preview (Workers emulation), NOT production; active scanning of production is explicitly out of scope (Architecture §OWASP ZAP).
- **CI**: optional manual workflow only — documented, not enabled by default (§K).
- **Acceptance criteria**: README's command is copy-paste runnable; `reports/latest.json` + triage table committed to the handoff (report artifacts gitignored, triage is committed).
- **Security rationale**: dynamic verification the unit/e2e layers cannot provide (header/CSP interaction, scanner-visible leakage).

### S6 — Dependency/security automation

- **Objective**: F4/F10 — Dependabot + audit + Actions hardening.
- **Files**: `.github/dependabot.yml` (new), `.github/workflows/ci.yml` (add a dependency audit step — mechanism per §K), `.github/workflows/pin-actions` (edit), `docs/contradictions-and-gaps.md`.
- **Current**: no dependabot [V]; no audit [V]; unpinned Actions [D].
- **Desired**: weekly dependabot PRs (npm ecosystem; bun.lock support — verify §K; group devDependencies; limit 5 open), security updates enabled (auto-merge off); CI audit step fails on HIGH+ (or is advisory — decision per §K); Actions pinned to full-length SHAs with a comment, dependabot `github-actions` ecosystem enabled.
- **Tests/CI**: audit step in the unit-and-build job; `verify:bundle` + parity gates untouched.
- **Acceptance criteria**: dependabot config valid (GitHub validates on push); audit step green on current tree; no lockfile changes in this slice.
- **Security rationale**: supply-chain risk is a standing requirement (Spec §21 / Architecture §Dependency/supply-chain security: exactly ONE scanner, no overlap).

### S7 — Final security gate + handoff

- **Objective**: §M full sweep, updated ASVS record, `docs/contradictions-and-gaps.md` entries (decisions recorded FIRST, mirrors Phase-4 discipline), final handoff `docs/phases/phase 5/phase-5-implementation-handoff-final.md`.
- **Acceptance criteria**: every §M gate green; the handoff captures receipts + remaining deferred decisions; a final `tool:security-review` on the diff returns no blocking findings.

## F. Rate-limiting contract

### F.1 Mechanism (binding decision)

- **Binding**: Cloudflare Workers Rate Limiting API via a `[[rate.limit]]` binding in `wrangler.toml` (namespace + `simple_limit` or `complex_limit` per Cloudflare's schema at implementation — verify exact syntax against the installed wrangler; `bun run types` will emit the typed binding).
- **Zero-config local behavior**: when the binding is absent from the environment (local dev, `app.request()` tests, preview without binding), the middleware **passes through** (never fails closed on a missing binding — matches Architecture §Rate limiting implementation notes). The pass-through branch is unit-tested.
- **NOT an accounting mechanism**: Cloudflare's API is eventually consistent and locality-based — abuse protection only (Architecture note). No product logic may depend on exact counts.

### F.2 Endpoint classes (mechanism binding; thresholds = PROPOSED, product-tunable §N)

| Class | Paths | Identity key | PROPOSED limit (arch-suggested) | Enforcement point |
|---|---|---|---|---|
| Auth | `POST /api/auth/*` (sign-in, callback, sign-out, etc.) | per-IP (`CF-Connecting-IP`; dev fallback `requestId`-scoped no-op pass-through) | 10 req/min | App middleware (binding), mounted before the Better Auth handler |
| Game mutations | `POST/PATCH/DELETE /api/game/*` | session `user_id` when authenticated, else per-IP | 30 req/min | App middleware after `requireAuth` |
| Profile changes | `POST/PATCH/DELETE /api/me/*` | session `user_id`, else per-IP | 10 req/min | App middleware after `requireAuth` |
| Admin | `/api/admin/*` | session `user_id` (role gate already applied) | 20 req/min | App middleware after `requireAdmin` |
| Read endpoints | `GET /api/*` | — (not app-limited) | 100 req/min per-IP | **Cloudflare edge rules = operational**, NOT code; document in handoff; no app middleware |

### F.3 Keying rules

- Authenticated → `user_id` (from `c.get('auth')`); unauthenticated → `CF-Connecting-IP` header when present, else a per-request pass-through decision must NOT be made — instead key on the emulated/local IP or skip only in binding-absent mode (implementer's choice, but the branch must be explicit + unit-tested; never silently key everyone on one value).
- `OPTIONS` (and any method outside the class's unsafe set) is skipped.

### F.4 Failure behavior

- 429 with the NG21 envelope: `{ error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', requestId } }` (code exists at `errors.ts:25`).
- Headers: `Retry-After` (seconds) + `x-ratelimit-limit` / `x-ratelimit-remaining` / `x-ratelimit-reset` where the Cloudflare API exposes them (mirror what the binding returns; document exact names at implementation).
- The client (TanStack Query) treats 429 like any envelope error → toast/error state; verify no retry-loop behavior in `query-client.ts` [NV S1].

### F.5 Ordering

Per §D.1: CSRF → authContext → guards → class limiter (post-identity). `/api/auth/*` limiter runs before the Better Auth handler (IP-keyed, no identity needed).

### F.6 Local/test behavior

- Binding absent → pass-through (tested); unit tests use an injectable fake limiter (content seam, same pattern as `SessionResolver`).
- E2E: rapid-request smoke runs in pass-through mode and asserts success (documents that E2E cannot exercise the real limiter).

### F.7 Production constraints

- Namespace provisioning may require Cloudflare dashboard/API work (operator task — record exact steps + the `namespace_id` in the handoff; do not invent credentials).
- Edge-level IP limiting for reads is a Cloudflare dashboard rule; supply the documented values (§F.2) as an operator checklist item, NOT code.

### F.8 Threshold status

The numbers above are **PROPOSED defaults copied from Architecture-v3 §Rate limiting** ("Suggested limit" column). They are product-tunable; the plan does not resolve them (see §N).

## G. CSP contract

### G.1 Strategy (binding decision)

- **Hash-based for the pre-paint script**, nonce-free: the theme script is static, single, and known at build time [V `app.html:11-26`] → a pinned `sha256-…` in `script-src` is the lowest-complexity correct mechanism (no per-request nonce plumbing into `app.html`, which SvelteKit does not transform).
- **Kit `csp` mode: `hash`** for SvelteKit's own emitted inline scripts (`vite.config.ts` Kit options — verify the exact option shape for kit 2.63 at implementation [NV]; `mode: 'hash'` hashes SvelteKit's inline bootstrap; directives below are additive).
- **API responses**: the Hono `securityHeadersMiddleware` emits the same `Content-Security-Policy` from the shared builder (`src/server/middleware/csp.ts`) so page and API contracts cannot drift.
- **Enforcement ladder**: dev = report-only (env toggle) → preview/E2E + production = enforced. E2E's console-violation assertions are the gate before production enforcement.

### G.2 Directives (production, enforced)

```text
default-src 'self';
script-src 'self' 'sha256-<PREPAINT_HASH>';
style-src 'self' 'unsafe-inline';            # expected acceptable exemption — §L
img-src 'self' data:;
font-src 'self';
connect-src 'self';                          # + ws://localhost:* ws://127.0.0.1:* in dev only
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
frame-src 'none';
upgrade-insecure-requests                    # production only (harmless on Workers HTTPS)
```

- `<PREPAINT_HASH>` = `sha256-` + base64(SHA-256 of the EXACT bytes of the script in `app.html:11-26`) — including indentation and line breaks. Adding or reformatting a single character breaks the hash → the pin test (S2) must fail loudly with the recomputed value in the message. An environmental process `new Function`/`eval` audit is not needed (none used).
- Dev additions: `connect-src` gains the Vite HMR websocket origins; `script-src` may need nothing extra (SvelteKit dev loads external modules) — verify in dev with report-only console watching [NV].
- `style-src 'unsafe-inline'`: keep ONLY if tightening (removing it) produces legitimate violations from Svelte/Tailwind runtime-injected styles; record the triage in the contradictions log. If no violations occur when removed — remove it (prefer strict).
- No third-party resources exist (Inter font is self-bundled `@fontsource-variable/inter` [D]; Google OAuth is a top-level OIDC redirect, not a subresource → not CSP-affected; verify no GSI script is loaded by `auth-client.ts` [NV]).

### G.3 Expected headers

- Pages: `Content-Security-Policy: <directives>` (Kit-injected).
- API: same value via Hono middleware.
- Report-only variant (dev): `Content-Security-Policy-Report-Only` with the same directives; no `report-uri` endpoint exists in V1 (documented decision — reports are read from devtools/e2e console).

### G.4 Testing method

- Unit: hash pin; directive builder unit test (shape, production vs dev delta).
- E2E: console event filter (`page.on('console')` matching `Content Security Policy`) on the six routes × light/dark; assert `data-theme` set + theme persistence (regression vs Phase-2 scenario 11); header presence/equality on page + API responses.

### G.5 Compatibility risks (pre-painted)

- Pre-paint script blocked → theme flash/FOUC + broken dark mode: prevented by the hash (tested).
- SvelteKit hydration script blocked → blank page: prevented by Kit `hash` mode + E2E smoke (existing `smoke.spec.ts` stays green with CSP enforced).
- Inline `style=` attributes blocked (if any exist — [NV] component scan) → `style-src 'unsafe-inline'` covers; triage as above.

## H. Security-header contract (final, both surfaces)

| Header | Value | Where (final state) | Notes |
|---|---|---|---|
| `X-Content-Type-Options` | `nosniff` | API [exists] + pages [NEW S0] | |
| `X-Frame-Options` | `DENY` | API [exists] + pages [NEW S0] | kept alongside `frame-ancestors 'none'` for pre-CSP clients |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | API [exists] + pages [NEW S0] | |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | API over HTTPS [exists] + pages over HTTPS [NEW S0] | https-only; pages gate same as `hstsOnHttps` |
| `Content-Security-Policy` | §G.2 | pages [NEW S2, Kit] + API [NEW S2, Hono] | |
| `X-Request-Id` | per-request id | API [exists] | pages: NOT added (documented decision — correlation via access logs; avoid duplicate header semantics) |

- Explicitly NOT added: `X-XSS-Protection` (obsolete), `Expect-CT` (obsolete).
- PROPOSED but deferred (§N): `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`.
- Duplication rule: SvelteKit pages must never also be wrapped by Hono middleware (they aren't — the bridge is the only Hono entry [V `routes.ts` composition]); the API must not receive hooks-level headers twice (the `[...path]` route is served through hooks too — S0 must verify the hooks wrapper skips or does not conflict with `/api/*`; expected resolution: hooks applies the page set for non-API responses, API keeps the Hono set — implementer verifies the actual response path and records it).

## I. ASVS matrix (project-specific)

Legend: ✅ = verified PASS, ⚠️ = PARTIAL, ❌ = FAIL, ➖ = NOT APPLICABLE, ❓ = NEEDS VERIFICATION.

| Area | Requirement | State | Evidence | Phase 5 action | Verification |
|---|---|---|---|---|---|
| V1 architecture | Trust boundaries explicit; browser untrusted | ✅ | §D.3 [V] | none (record) | consistency check |
| V1 | No security-relevant logic in client | ✅ | server-authoritative game/profile/admin [D] | none | e2e bypass specs (S3) |
| V2 auth | Google OIDC, email verification, per-provider gate | ✅ | `auth.ts:58-67` [V] | none | existing e2e |
| V2 | Secret material not hardcoded for production | ✅ | `auth.ts:32-41` [V] | none | existing unit `auth.test.ts` |
| V3 session | Session cookie flags (HttpOnly/SameSite/Secure) | ❓ | Better Auth defaults, not asserted | **pin**: e2e/unit assert `set-cookie` on sign-in (S0/S3) | new unit test |
| V3 | Logout invalidates session | ✅ | e2e scenario 12 [D] | reference in security spec | S3 |
| V3 | Session revocation/`cookieCache` semantics assessed | ⚠️ | contradictions log:137 [D] | F7 decision record (S0) | record |
| V4 access control | API authz independent of page guards | ✅ | `middleware/auth.ts` + `guards.ts` [V] | none | existing |
| V4 | Admin role enforced (API 403 + page redirect) | ✅ | `requireAdmin` [V]; E-A1 [D] | none | S3 reference |
| V4 | Ownership (user A ≠ user B) | ✅ | guards [D] + e2e [D] | extend e2e (S3) | S3 |
| V5 validation | Zod strict bodies; unknown fields rejected | ❓ | documented [D Phase-4 §3], not re-verified | S0 verification task 2 | unit (existing) + S0 note |
| V5 | Server-authoritative timestamps/scores | ✅ | NG21/domain [D] | none | existing e2e |
| V5 | Payload cap 64 KB | ✅ | `routes.ts:82-96` [V] | none | existing unit |
| V5 | Malformed JSON → sanitized 400 envelope | ✅ | `errors.ts:104-112` [V] | none | existing |
| V5 encoding | No `{@html}`/raw-HTML sinks | ❓ | not scanned this pass | **S0**: grep `{@html` + `innerHTML` across `src`; Svelte auto-escaping is default | grep + e2e name-render test |
| V7 errors | Envelope + no internal leakage | ✅ | `errors.ts` [V] | none | existing |
| V7 logging | requestId correlation; bodies only ≥500 | ✅ | arch + implementation [D] | none | existing |
| V8 data protection | Answer pool never bundled; admin-only exposure | ✅ | [D] + `verify:bundle` | RLS decision record (S0) | existing pins |
| V8 | RLS on answer tables | ❌ | `Architecture-v3.md:273` [D] | decision record (§N), no schema change without decision | record |
| V9 comms | TLS at platform; HSTS | ⚠️ | HSTS API-only today [V F2] | S0 page surface | curl probe |
| V10 | Business-logic abuse: rapid requests | ❌ | F1 [V] | S1 | unit + smoke |
| V13 API | CSRF on all unsafe cookie mutations | ✅ | `csrf.ts` + `origin.ts` [V] | GET-immutability pin (S0) | new unit |
| V13 | Rate limiting for API | ❌ | F1 [V] | S1 | unit |
| V13 | HTTP method handling (405s/404s) | ❓ | not probed | S0 probe (wrong-method requests → no mutation, envelope) | new unit |
| V14 config | Header baseline | ⚠️ | API-only [V F2] | S0/S2 | curl probe |
| V14 | CSP | ❌ | F3 [V] | S2 | e2e console-clean |
| V14 | Dependency scanning | ❌ | F4 [V] | S6 | dependabot + audit |
| V14 | Dynamic scanning | ❌ | F5 [V] | S5 | ZAP run + triage |
| V10/V13 | No unsafe GET mutations (incl. Better Auth) | ❓ | `csrf.ts:17` [V]; not pinned | S0 route-inventory test | new unit |

## J. Testing strategy

| Layer | Existing (keep) | New (Phase 5) |
|---|---|---|
| Unit (`tests/unit`) | 206 tests incl. middleware/CSRF/413/408/envelope/headers/auth-secret/answer-secrecy [D] | rate-limit seam tests; CSP hash pin; page-header hooks test; GET-immutability route-inventory pin; session-cookie flag pin |
| Integration (`tests/integration`) | 89/89 on non-prod Neon [D] | none required (no new DB behavior); re-run as regression |
| E2E (`tests/e2e`) | 30/30 incl. auth-fixture flows, admin E-A1…E-A7 [D] | `security.spec.ts` (S3) + CSP console/theme assertions (S2; housed in ONE place) |
| Security suite (`tests/security/`) | empty [V] | home for ZAP reports dir + `.gitkeep`; stays non-executed by vitest (config check [NV]) |
| Static | lint, svelte-check, `verify:bundle`, word/avatar parity, `auth:check`, `types:check` [D] | dep-audit step (S6); `{@html}` grep in S0 (documented procedure, optional script) |
| ZAP/adversarial | — | `scripts/zap/` + `adversarial-checklist.md` (S5) |
| CI | 3 jobs, mandatory integration secret gate [D] | new tests flow through existing jobs; optional manual ZAP workflow (S5, §K) |
| Deployed/production | — | manual header probe + rate-limit smoke after deploy (Phase 6 owner; Phase 5 documents the script) |

## K. CI/dependency strategy

- **Dependabot** (S6): `.github/dependabot.yml` — `npm` ecosystem (covers `bun.lock` — **verify** support against the installed Dependabot docs at implementation; if unsupported, fallback: documented monthly `bun update --latest` PR discipline + the CI audit step, recorded in the contradictions log). Weekly schedule; group devDependencies (`group: development-dependencies`); `open-pull-requests-limit: 5`; `security-updates` enabled (GitHub default) with automatic merge **off**; `github-actions` ecosystem for pin updates.
- **Audit step** (S6): one scanner only (Architecture requirement). Mechanism chosen at implementation: `bun audit` if available for the installed bun, else `npm audit --package-lock-only` (does not touch bun.lock) — decision recorded in the contradictions log; failure policy: fail on HIGH/CRITICAL, allowlist documented advisories with a rationale list in the workflow file (no silent skips).
- **Actions security**: pin every `uses:` to a full-length commit SHA (+ comment); enable Dependabot `github-actions`; workflow `permissions: contents: read` minimum; keep the mandatory integration `DATABASE_URL` gate (never weaken).
- **Failure policy**: security gates fail CI loudly; the integration secret-missing gate and `auth:check` parity stay mandatory (Phase-0 B8).
- **ZAP in CI**: NOT in default CI (needs a live preview + DB + ~minutes; documented). Optional manual workflow dispatch allowed if the implementer demonstrates it is hermetic; otherwise local-only (acceptance = §M run evidence).
- **Lockfile discipline**: `bun install --frozen-lockfile` in CI [D] — unchanged; dependency PRs must include lockfile changes in the same PR (dependabot handles).

## L. Risks and mitigations

| Risk | Mitigation |
|---|---|
| CSP breaks SvelteKit hydration/blank pages | Kit `hash` mode + E2E smoke on enforced CSP before production; report-only ladder (§G.1) |
| CSP breaks the pre-paint theme script | Exact-hash pin test (S2); e2e theme assertion; hash-change failure message includes recomputed hash |
| CSP breaks Tailwind/Svelte runtime styles | `style-src 'unsafe-inline'` accepted exemption with triage record; attempt removal first (§G.2) |
| Rate-limit config mistakes (wrong binding name, namespace mismatch, no pass-through) | `bun run types` + `types:check` after adding the binding; unit-tested pass-through; deployment dry-run |
| Rate limiting silently keying all users on one key | explicit keying branch + unit tests (authenticated vs IP); code review of the key resolver |
| Auth regression (401/403/session) | guards + ordering unchanged; full existing suite re-run; security spec re-pinned |
| CSRF regression | middleware untouched; GET-immutability pin added; existing CSRF unit tests re-run |
| False-positive security tests (console/violation noise) | e2e violation filter scoped to CSP messages on the six routes; triage whitelist with comments in the spec |
| Test environment differences (binding absent, DB) | pass-through + injectable seams; integration unchanged (Neon, serialized); hermetic `types:check` note respected |
| Production-only behavior (HSTS-on-https, upgrade-insecure-requests) | probe script documented for Phase 6; code paths unit-tested via fake https scheme |
| Accidental answer/secret exposure | `verify:bundle` + admin-secrecy pins re-run; grep for `answer-pool.source` in build output; RLS decision only, no schema change without decision |
| Dependency automation noise | grouped weekly PRs, limit 5, single scanner |
| ZAP findings overwhelm | triage table with confirm/reject/status per finding; baseline (= scans are a starting point, not a verdict) per Architecture |
| middleware ordering accidentally changed during S1/S2 | §D.1 is normative; review gate (`tool:review`) checks diff against it |

## M. Verification gates (exact commands + evidence)

| # | Gate | Command / evidence | Owner slice |
|---|---|---|---|
| G1 | Lint | `bun run lint` — 0 errors | all |
| G2 | Type check | `bun run check` — 0 errors; `bun run types:check` (post-build, hermetic: `.env`/`.dev.vars` stashed) | all |
| G3 | Unit | `bun run test:unit` — 206 existing + new, 0 failures | all |
| G4 | Integration | `bun run test:integration` — 89 + any new, 0 failures (non-prod Neon; `ALLOW_DB_WIPE=1`) | regression |
| G5 | E2E | `bun run test:e2e` — 30 + new, incl. CSP console-clean + theme + header assertions | S2/S3 |
| G6 | Build | `bun run build` + patched-worker assertion (`grep -c "export { scheduled }" .svelte-kit/cloudflare/_worker.js` = 1) | all |
| G7 | Bundle secrecy | `bun run verify:bundle` | all |
| G8 | Auth schema parity | `bun run auth:check` | all |
| G9 | Wrangler | `bunx wrangler deploy --dry-run` | S1 |
| G10 | Page headers | `curl -sI http://127.0.0.1:4173/` (after `bun run build && bun run preview`) — nosniff/XFO/Referrer/HSTS present | S0 |
| G11 | API headers + CSP equality | curl probe on `/api/game/…` response + page response — same CSP value | S2 |
| G12 | Hash pin | `bun run test:unit csp` — pre-paint hash matches `app.html` | S2 |
| G13 | ZAP | documented run per `scripts/zap/README.md`; triage table committed | S5 |
| G14 | Dependabot/audit | dependabot config pushed (GitHub validates); audit step green | S6 |
| G15 | Reviews | `tool:review` + `tool:security-review` on the final diff: no blocking findings; diff checked against §O invariants | S7 |
| G16 | Schema purity | `git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations` → EMPTY | all |

Evidence rule: a gate is "passed" only when the command actually ran on the final tree and the output is captured in the final handoff (Phase-4 precedent).

## N. Deferred decisions (do NOT silently resolve)

| # | Decision | Current state | Who resolves |
|---|---|---|---|
| D1 | Rate-limit thresholds (§F.2 numbers) | PROPOSED (arch "Suggested limit") | Product/operator before or during deployment |
| D2 | RLS on `answer_dictionary`/`daily_puzzles` | Deferred (F6); S0 writes a decision record; implementation requires an explicit schema-change decision (violates the zero-migration invariant otherwise) | Product + operator |
| D3 | `Permissions-Policy` / `Cross-Origin-Opener-Policy` | PROPOSED-optional; not adopted by default | Product |
| D4 | ZAP cadence (local-only vs optional CI) | Local-only by default; optional manual workflow allowed if hermetic | Product |
| D5 | Dependency audit failure policy + tool (`bun audit` vs `npm audit`) | Mechanism + policy decided at implementation and recorded (bounded: one scanner; no silent skips) | Implementer + recorded |
| D6 | HSTS preload submission | Out of scope (ownership/ops) | Phase 6 |
| D7 | CSP report-only duration before enforcement | E2E-green is the gate; no calendar commitment | Implementer |
| D8 | Dependabot schedule/grouping (weekly, dev-group) | PROPOSED defaults | Product (non-blocking) |
| D9 | `cookieCache` adoption | Assess in S0; default NOT adopted unless revocation semantics demand it | Implementer + record |
| D10 | Alert channel for rate-limit/429 monitoring | Out of scope (P3, Phase 6) | Phase 6 |

## O. Explicit invariants (Phase 0–4 behavior Phase 5 MUST NOT break)

1. **NG9**: puzzle-row-first `SELECT … FOR UPDATE`; `transaction_timestamp()` eligibility anchor; no `clock_timestamp()`; lock-order race tests stay green.
2. **Admin lifecycle**: admin code never changes puzzle lifecycle status (SCHEDULED→ACTIVE only via `activateToday`/`startGame`; ACTIVE→FINALIZED only via `finalizePuzzle`).
3. **Zero schema change**: no migrations, no new tables/columns/indexes. (RLS would require one — explicitly NOT authorized; D2.)
4. **Answer secrecy**: pool gitignored; server-authoritative validation; answers admin-role-only; client never receives the pool; `verify:bundle` semantics unchanged (non-public words hard-fail; public-list words by-design).
5. **NG21 envelopes**: every API error keeps the envelope (incl. the new 429 `RATE_LIMITED`); only 408 is a preserved verbatim `HTTPException`.
6. **Middleware order**: `requestId` FIRST; timeout/bodyLimit before validation; CSRF semantics unchanged (fail-closed, `/api/auth/*` excluded, `ALLOWED_ORIGINS` never `'*'`).
7. **Auth**: Better Auth owns identity; Hono authz independent of `event.locals`; secret policy (production default, dev escape hatch only in `development`/`test`); admin bootstrap promote-only/idempotent.
8. **Composition rule**: route registration only in `src/server/routes.ts`, chained for AppType; no new endpoints beyond the Phase-1–4 contracts (Phase 5 adds middleware, not routes).
9. **CI assertions**: parity gates (word/avatar diff, `auth:check`, patched-worker single export), integration mandatory secret gate, hermetic `types:check` post-build — all stay.
10. **Error/session behavior**: page guards, redirect semantics (`307`), and the cookie fast-path stay byte-for-byte behaviorally identical unless a Phase 5 remediation explicitly says otherwise.
11. **Product decisions**: P1–P6 (§Phase-4 handoff §8) untouched; D4 calendar defaults untouched.
12. **No new dependencies at runtime**; dev-only additions require a recorded rationale (S6's audit tool is the only likely addition).