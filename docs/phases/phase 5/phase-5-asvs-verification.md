# Phase 5 — ASVS Verification Record

> Project-specific ASVS matrix (plan §I) completed with **post-implementation
> states** (2026-09-02). Evidence is file:line on the final Phase-5 tree
> (commits `35a0e02` → `27c2188`; handoff HEAD recorded in
> `phase-5-implementation-handoff-final.md`). Legend: ✅ verified PASS ·
> ⚠️ PARTIAL · ❌ FAIL (fixed by Phase 5) · ➖ NOT APPLICABLE · ⏳ evidence
> finalized at S7 (slice not yet landed at S4-writing time).
>
> Rows that were ❓/❌ at planning time are resolved below with the exact
> Phase-5 artifact. Sign-off: Phase-5 implementation pass, 2026-09-02.

| Area | Requirement | State | Evidence (final) | Phase 5 action / verification |
|---|---|---|---|---|
| V1 architecture | Trust boundaries explicit; browser untrusted | ✅ | plan §D.3; API authz independent of `event.locals` (`src/server/middleware/auth.ts`, `src/hooks.server.ts:11`) | consistency check |
| V1 | No security-relevant logic in client | ✅ | server-authoritative game/profile/admin (Phase-1–4) | e2e bypass + cross-user isolation specs (`tests/e2e/security.spec.ts` API bypass / isolation tests) |
| V2 auth | Google OIDC, email verification, per-provider gate | ✅ | `src/server/auth/auth.ts:42-96` | existing e2e |
| V2 | Secret material not hardcoded for production | ✅ | `auth.ts:32-41` (production default, dev escape only in development/test, missing secret in production → hard throw) | existing unit `auth.test.ts` |
| V3 session | Session cookie flags (HttpOnly/SameSite/Secure) | ✅ | **Pinned (S3a)**: unit `tests/unit/security-cookie.test.ts` — name constant + signature scheme cross-checked against `@better-auth/utils/hmac` + attribute contract (`better-auth 1.7.1 dist/cookies/index.mjs:27-42`: `httpOnly:true`, `sameSite:'lax'`, `path:'/'`, secure https-only); browser-level HttpOnly enforcement `tests/e2e/security.spec.ts` (document.cookie excludes the token) | new unit + e2e pins |
| V3 | Logout invalidates session | ✅ | e2e `security.spec.ts` "sign-out invalidates protected access" + UI scenario 12 | S3 |
| V3 | Session revocation/`cookieCache` semantics assessed | ✅ | Decision record in `docs/contradictions-and-gaps.md` (D9/F7): opt-in, NOT adopted; default-off verified `better-auth/dist/cookies/index.mjs:77` | S0 record |
| V4 access control | API authz independent of page guards | ✅ | `middleware/auth.ts` + `guards.ts` + hooks (session locals only) | existing + security.spec |
| V4 | Admin role enforced (API 403 + page redirect) | ✅ | `requireAdmin` (`middleware/auth.ts`), `requireAdmin` page guard (`guards.ts`); e2e security.spec non-admin test + admin E-A1 | S3 reference + probe |
| V4 | Ownership (user A ≠ user B) | ✅ | e2e security.spec "cross-user isolation": guess on foreign game → 403 `FORBIDDEN`, profile isolation, identity separation | S3 |
| V5 validation | Zod strict bodies; unknown fields rejected | ✅ | S0 audit: `.strict()` on every mutation body (`admin/handlers.ts:54-77`, `game/handlers.ts:18`, `profile/handlers.ts:21`) — recorded in contradictions log | S0 note |
| V5 | Server-authoritative timestamps/scores | ✅ | NG21/domain; client timing fields rejected (contradictions log Phase-1 record) | existing e2e |
| V5 | Payload cap 64 KB | ✅ | `src/server/routes.ts:82-96` (bodyLimit → 413 pre-validation) + e2e security.spec oversized probe | existing + S3 |
| V5 | Malformed JSON → sanitized 400 envelope | ✅ | `src/server/lib/errors.ts:104-112` (raw HTTPException(400) → BAD_REQUEST); e2e security.spec malformed-body probe (verified: raw parser text never leaks) | existing + S3 |
| V5 encoding | No `{@html}`/raw-HTML sinks | ✅ | S0 grep across `src/`: **zero** `{@html}` and zero `innerHTML` (recorded in contradictions log) | S0 grep |
| V7 errors | Envelope + no internal leakage | ✅ | `errors.ts` (NG21); security.spec recovery asserts envelope shape | existing |
| V7 logging | requestId correlation; bodies only ≥500 | ✅ | `request-id.ts:5-13`; `errors.ts:116` (log-only trace ≥500) | existing |
| V8 data protection | Answer pool never bundled; admin-only exposure | ✅ | `verify:bundle` + admin-secrecy pins + role gate (E-A1); no pool word in client | existing pins |
| V8 | RLS on answer tables | ➖ (recorded) | **Decision record** (contradictions log D2/F6): NOT implemented — zero-migration invariant; compensating controls verified (server-only access path, bundle scan, role gate, gitignored pool); schema change requires a new product+operator decision | S0 record |
| V9 comms | TLS at platform; HSTS | ✅ | HSTS on API over https (`security-headers.ts` hstsOnHttps) + **pages** (`hooks.server.ts:49`, same https gate); curl probe at 4173 shows nosniff/XFO/Referrer on pages; HSTS unit-tested via fake https (`page-headers.test.ts`) | S0 + S2 |
| V10 | Business-logic abuse: rapid requests | ✅ | **Rate limiting (S1)**: `[[ratelimits]]` bindings per class (`wrangler.toml`), `middleware/rate-limit.ts` (pass-through when binding absent, 429 `RATE_LIMITED` envelope + Retry-After + x-ratelimit-\*), mounts per §D.1 (`routes.ts:120-157`), unit pins  | S1 |
| V13 API | CSRF on all unsafe cookie mutations | ✅ | `middleware/csrf.ts:9-30` (unchanged, fail-closed) + **GET-immutability pin** (`tests/unit/security-baseline.test.ts`: no GET/HEAD on pure-mutation paths; live probes never 2xx; Better Auth sign-out POST-only, GET/HEAD → 404) | S0 |
| V13 | Rate limiting for API | ✅ | See V10 row (S1 unit + pass-through e2e smoke verifying local dev unaffected) | S1 |
| V13 | HTTP method handling (405s/404s) | ✅ | Route-inventory + method probes (`security-baseline.test.ts`): mutation paths GET/HEAD → 404/401/403 envelope, never a mutation; `/api/auth/sign-out` GET/HEAD → 404 | S0 |
| V14 config | Header baseline | ✅ | Shared contract constants `security-headers.ts:15-21`; pages `hooks.server.ts:43-51`; API `securityHeadersMiddleware`; curl probes (page + 401 API envelope carry nosniff/XFO/Referrer; HSTS https-gated) — contradictions log S0 rows | S0 |
| V14 | CSP | ✅ | Shared builder `middleware/csp.ts` (pre-paint hash pinned `:12`); Kit hash mode (`vite.config.ts`); API `security-headers.ts` CSP middleware (`routes.ts:120`); hash pin unit `tests/unit/csp.test.ts`; e2e console-clean + theme on six routes light+dark + exact API equality `tests/e2e/csp.spec.ts`; G10/G11 curl probes in S2 commit | S2 |
| V14 | Dependency scanning | ✅ | **S6**: `.github/dependabot.yml` (npm — bun.lock covered + github-actions; weekly; dev-grouped; limit 5) + CI audit step `bun audit --audit-level=high` (green on the final tree: "No vulnerabilities found… 2 below --audit-level=high"), documented `--ignore` allowlist; Actions SHA-pinned; `permissions: contents: read` | S6 (commit d6eaf4d) |
| V14 | Dynamic scanning | ✅ | **S5**: local baseline run executed (ZAP 2.17.0, spider 54 URLs, passive only) → 0 High; triage committed in `docs/phases/phase 5/zap-baseline-triage.md` (Medium ACAO rejected as miniflare emulation artifact — zero ACAO in the deployed `_worker.js`; Low nosniff on assets mitigated via root `_headers`; Informational rejected). Harness: `scripts/zap/zap-baseline.sh` + `scripts/zap/README.md` | S5 (this commit) |
| V10/V13 | No unsafe GET mutations (incl. Better Auth) | ✅ | `tests/unit/security-baseline.test.ts` route inventory + probes; Better Auth 1.7.1 registers sign-out `method:'POST'` (verified `dist/api/routes/sign-out.mjs`) | S0 |

## Sign-off

- Date: 2026-09-02
- Executed by: Phase-5 implementation pass (this repository session)
- Basis: final Phase-5 tree at commits `35a0e02` (S0) → `e849a28` (S2) →
  `27c2188` (S3); rows ⏳ completed by S5/S6 and re-verified at S7.
- Re-verification note: V14 dependency/dynamic rows get their final evidence
  in `phase-5-implementation-handoff-final.md` §M receipts (G13/G14).