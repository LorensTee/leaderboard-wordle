# Phase 5 — Implementation Prompt (executable)

You are starting **Phase 5: Security Verification & Hardening** of the
`leaderboard-wordle` repository. This is an **implementation pass** that
executes the already-completed Phase-5 plan.

**Read first, in this order:**

1. `docs/phases/phase 5/phase-5-plan.md` — the authoritative plan (contracts, slices, gates, invariants). Read it TWICE: once fully, once while implementing each slice.
2. `docs/phases/phase 5/phase-5-planning-state-handoff.md` — repository identity, baseline, binding decisions, unresolved decisions, pre-flight checklist.
3. `docs/phases/phase 4/phase-4-implementation-handoff-final.md` — the Phase-4 final state and its invariants.
4. `docs/contradictions-and-gaps.md` — the decisions/deviations log. **Record every Phase-5 decision and deviation THERE, BEFORE its code** (Phase-4 discipline).
5. `Architecture-v3.md` §Phase 5, §Rate limiting, §Security verification; `Specifications-v1.md` §21.

## What Phase 5 means

A **verification + hardening gate**, not a feature or deployment phase. The
repository already has working CSRF, error-envelope/requestId, timeout/body-
limit, auth/role enforcement, secret-missing-fails-hard, answer-secrecy gates,
and an API-only security-header baseline. Phase 5 closes the demonstrated gaps
(F1–F10 in plan §B), implements the rate-limiting, CSP/header,
security-testing, ASVS, ZAP/adversarial, and dependency-automation contracts,
and verifies everything with the plan's gates.

## Scope

- **In scope**: plan §C.1, exactly — slices S0–S7 (plan §E).
- **Out of scope**: plan §C.2 — Phase 6 deployment/operations, new product
  features, redesigns, speculative security infrastructure, HSTS preload,
  and every plan §N deferred decision (D1–D10) unless a decision is explicitly
  reached and recorded.

**Do not modify Phase 3/4 behavior unless the Phase 5 plan explicitly
identifies it as a security remediation.** The plan identifies exactly two
behavioral remediations: (S0) the page-header baseline gap (finding F2) and
(S1) rate limiting (finding F1). Everything else is additive (middleware,
headers, tests, config, docs). If you believe another Phase 3/4 behavior must
change, STOP and record it as a deviation with evidence — do not silently
change it.

## Current security posture (summary — details in plan §B)

- **Verified solid**: NG21 envelopes + centralized errors; NG19 timeout/NG20
  body limit; NG4 fail-closed CSRF (`/api/auth/*` excluded); NG21 requestId;
  auth (Better Auth, cookie fast-path, secret policy, admin bootstrap);
  `requireAuth`/`requireAdmin` + independent page guards; answer-pool secrecy
  gates (bundle scans, role gates, admin-only exposure).
- **Gaps to close**: F1 rate limiting absent · F2 page responses header-less ·
  F3 no CSP (intended Phase-5 delivery) · F4 no dependabot/audit · F5 empty
  `tests/security/`, no ZAP harness · F6 RLS decision record · F7 cookieCache
  assessment · F8 GET-immutability unpinned · F9 no Playwright security spec ·
  F10 unpinned Actions.

## Slices to implement (in order; do not reorder without recording why)

- **S0 — Baseline audit + corrections**: fix F2 (page header baseline in
  `src/hooks.server.ts`, shared constants from `src/server/middleware/`);
  add the GET-immutability route-inventory unit test (F8); run and RECORD the
  verification tasks (raw-SQL grep over `src/server`; read every handler —
  strict zod bodies, UUID_RE short-circuit, no GET mutations; confirm
  `ERROR_CODES.RATE_LIMITED` has no consumer pre-S1; grep `{@html`/`innerHTML`
  across `src` and record the result); append RLS (F6) and `cookieCache` (F7)
  decision records to `docs/contradictions-and-gaps.md`.
- **S1 — Rate limiting** (plan §F): `[[rate.limit]]` binding in
  `wrangler.toml` + `bun run types`; `src/server/middleware/rate-limit.ts`
  (injectable limiter seam, pass-through when binding absent, 429
  `RATE_LIMITED` envelope + `Retry-After` + `x-ratelimit-*`, OPTIONS skip,
  session-vs-IP keying); mount per plan §D.1; unit tests; English-only
  `RATE_LIMITED` message; verify `bun run types:check` + `wrangler deploy
  --dry-run`; verify the exact `cloudflare:rate-limit` import against the
  installed wrangler/workers-types and the exact `[[rate.limit]]` schema — if
  the installed toolchain differs from this plan's expectation, record the
  CORRECT shape in the contradictions log.
- **S2 — CSP + headers** (plan §G/H): `src/server/middleware/csp.ts` shared
  directive builder (production vs dev delta); Kit `csp` options in
  `vite.config.ts` (mode `hash`; verify the exact option shape for kit 2.63);
  Hono `securityHeadersMiddleware` emits the same CSP for `/api/*` responses;
  pre-paint script sha256 constant + pin test (reads `src/app.html`, includes
  the recomputed hash in the failure message); report-only in dev via a
  documented toggle, enforced in build/preview/prod; e2e CSP console-clean +
  `data-theme` assertions on all six routes (`/`, `/play`, `/leaderboard`,
  `/profile`, `/onboarding`, `/admin`) in light+dark; verify the hooks-level
  header wrapper does not duplicate/conflict with Hono headers for `/api/*`.
- **S3 — Security regression tests** (plan §J): one `tests/e2e/security.spec.ts`
  reusing `tests/e2e/helpers/auth-fixture.ts` (extend the fixture only if
  needed and record it): API bypass → 401, cross-user isolation, cross-site
  POST → 403 CSRF, protected-page redirects, non-admin → 403 + redirect
  (reference existing E-A1 rather than duplicating), malformed/oversized body
  probes, sign-out invalidates access; unit pins for session-cookie flags on
  sign-in (`set-cookie`); do not weaken any existing assertion.
- **S4 — ASVS verification**: complete `docs/phases/phase 5/
  phase-5-asvs-verification.md` from plan §I with post-implementation states,
  file:line evidence, date, sign-off. Resolve every ❓ row with evidence or an
  explicit re-scope.
- **S5 — ZAP + adversarial**: `scripts/zap/zap-baseline.sh` (dockerized ZAP
  baseline against `vite preview` with non-production env; JSON report to
  `scripts/zap/reports/`, gitignored) + `scripts/zap/README.md` (exact
  commands + prerequisites) + `docs/phases/phase 5/adversarial-checklist.md`
  (Spec §21 friend-attack checklist: expected behavior column per attack) +
  ONE documented baseline run with a committed triage table (confirm/reject/
  exploitability/status). Never scan production.
- **S6 — Dependency automation** (plan §K): `.github/dependabot.yml` (npm +
  github-actions ecosystems; weekly; dev-dependencies grouped; limit 5; verify
  bun.lock support — if Dependabot does not support it, record the fallback
  decision); CI audit step (one scanner — `bun audit` if available for the
  installed bun, else `npm audit --package-lock-only`; fail HIGH+ with a
  documented allowlist, no silent skips); pin every `uses:` to a full-length
  SHA with a comment; keep `permissions` minimal; never weaken the integration
  secret gate.
- **S7 — Final security gate**: run all §M gates; record decisions/deviations
  in `docs/contradictions-and-gaps.md`; write
  `docs/phases/phase 5/phase-5-implementation-handoff-final.md` (receipts for
  every gate that actually ran on the final tree — Phase-4 precedent); run
  `tool:review` and `tool:security-review` on the final diff; verify plan §O
  invariants one by one; confirm schema/migrations diff is EMPTY.

## Binding decisions (do not re-litigate)

Plan §7 of the planning-state handoff: hash-based CSP for the pre-paint
script; Workers Rate Limiting API binding; CSRF-before-rate-limit; session-
keyed limiters after guards, per-IP class before the Better Auth handler;
missing binding ⇒ pass-through (unit-tested); one shared header/CSP contract
for pages + API; existing test architecture only; ZAP local-only default.

## Unresolved decisions (MUST NOT be invented — plan §N)

D1 rate-limit thresholds (PROPOSED 10/30/10/20/min — implement the mechanism
with these defaults clearly marked `PROPOSED/product-tunable` as constants,
not gospel), D2 RLS (decision record only — no schema change), D3
Permissions-Policy/COOP (don't add), D4 ZAP CI (local only), D5 audit
tool/policy (choose + record), D6 HSTS preload (skip), D7 report-only
duration (enforce once E2E green), D8 dependabot schedule (weekly default),
D9 cookieCache (default not adopted), D10 alert channel (skip).

## Files likely to change (plan §E per slice)

`wrangler.toml`, `worker-configuration.d.ts` (generated), `vite.config.ts`,
`src/hooks.server.ts`, `src/server/routes.ts`,
`src/server/middleware/{security-headers,csp,rate-limit}.ts` (new),
`src/server/middleware/page-headers.ts` (new, if S0 shaped it so),
`src/server/lib/errors.ts` (only if a demonstrated defect), `.github/workflows/
ci.yml`, `.github/dependabot.yml` (new), `tests/unit/*` (new + existing),
`tests/e2e/security.spec.ts` (new), `scripts/zap/*` (new),
`docs/contradictions-and-gaps.md`, Phase-5 docs (new). No changes to:
`src/server/admin|game|profile|leaderboard|puzzle` business logic (unless a
demonstrated defect), `src/server/db/*`, migrations, `src/lib/app/*` (unless
the CSP/429 surfaces prove otherwise — record it).

## Cloudflare constraints

Workers + `nodejs_compat`; no Node-only APIs in new code. The `scheduled`
export stays patched exactly once (CI asserts). `types:check` is
build-state-dependent → run post-build with `.env`/`.dev.vars` absent.
Rate-limit namespace provisioning may require operator steps — document them;
never invent credentials. CSP is Worker-emitted (no platform caching caveats).

## Middleware ordering requirement (normative)

Plan §D.1 order is binding: requestId → timeout → bodyLimit → headers →
hsts → csrf → authContext → guards → per-class rate limiters → handlers;
`/api/auth/*` limiter before the Better Auth handler. Any deviation must be
recorded in the contradictions log with a working test demonstrating why.

## Tests required (plan §J)

Unit (rate-limiter seam incl. pass-through, CSP hash pin, page-header hooks
test, GET-immutability inventory, session-cookie flags), integration
(regression only — suite must stay green, 89/89 + any new), e2e (existing
30 + security.spec.ts + CSP/theme/header assertions), static (audit step),
ZAP (documented local run + triage). No parallel test infrastructure.

## ZAP/adversarial verification requirements

One baseline/passive run against local preview per `scripts/zap/README.md`;
committed triage table; `docs/phases/phase 5/adversarial-checklist.md`
delivered. Scanner output is NOT a verdict — findings are triaged against
real code paths.

## Dependency/security automation requirements

Dependabot config (both ecosystems) + one CI audit step + SHA-pinned actions;
decisions recorded; exactly one scanner; gates fail loudly; nothing weakens
existing mandatory gates.

## Final verification gates (plan §M — all must run on the FINAL tree)

`bun run lint` · `bun run check` · `bun run test:unit` (206 + new) ·
`bun run test:integration` (89 + new, non-prod Neon) · `bun run test:e2e`
(30 + new) · `bun run build` + patched-worker assertion · `bun run verify:
bundle` · `bun run types:check` (post-build, hermetic) · `bun run auth:check` ·
`bunx wrangler deploy --dry-run` · curl header probes (page + API; CSP
equality) · schema/migrations diff EMPTY · `tool:review` + `tool:security-
review` no blocking findings · ZAP run evidence · dependabot config accepted
by GitHub.

## Documentation/receipt requirements

- Decisions/deviation recorded in `docs/contradictions-and-gaps.md` FIRST.
- `docs/phases/phase 5/phase-5-asvs-verification.md` (S4).
- `docs/phases/phase 5/adversarial-checklist.md` (S5).
- Final handoff `docs/phases/phase 5/phase-5-implementation-handoff-final.md`
  with: exact final HEAD + branch; per-slice receipts; §M gate receipts
  (command + output); remaining deferred decisions (D1–D10); Cloudflare
  operator steps (rate-limit namespace, edge read-limit rule values);
  invariant checklist (plan §O); confirmation that NO Phase 3/4 behavior
  changed outside the plan's explicit remediations.

## Final status block (copy into the handoff)

```text
PHASE 5 STATUS: COMPLETE
Slices: S0–S7 (list per-slice outcome)
Verification: <every §M gate with real numbers>
Known open decisions: D1–D10 (state per item)
Phase 6 starting point: deployment/operations
Important invariants (verified): plan §O list
```