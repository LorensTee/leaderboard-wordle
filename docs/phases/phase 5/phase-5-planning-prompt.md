# Phase 5 Planning Prompt — Security Verification & Hardening

We are now starting **Phase 5** of this repository:

https://github.com/LorensTee/leaderboard-wordle

You are working in the repository itself.

**Do NOT implement Phase 5 yet.**

Your job in this chat is to perform a deep security-focused repository review and produce the complete **Phase 5 planning package** that a separate implementation pass can execute safely.

Phase 5 is the project's **security verification and hardening gate**.

The purpose of this planning pass is not merely to list security improvements. You must determine the repository's actual current security posture, compare it against the architecture/specification and established invariants, identify concrete gaps, and produce implementation-grade Markdown documents for a later implementation pass.

---

## 1. Source-of-truth hierarchy

Treat the **current repository state as the ultimate source of truth**.

Start by identifying the exact current:

- branch
- HEAD commit
- working-tree assumptions if observable
- Phase 4 final implementation state

The current Phase 4 final handoff is:

`docs/phases/phase 4/phase-4-implementation-handoff-final.md`

Also inspect and cross-reference:

- `Architecture-v3.md`
- `Specifications-v1.md`
- `docs/contradictions-and-gaps.md`
- `docs/phases/phase 4/phase-4-plan.md`
- `docs/phases/phase 4/phase-4-planning-state-handoff.md`
- `docs/phases/phase 4/phase-4-implementation-prompt.md`
- `docs/phases/phase 3/phase-3-final-state-handoff.md`
- `docs/phases/phase 3 + 4 vision/phase-3-and-4-visual-review-final.md`
- relevant Phase 0/1/2 planning, implementation, and handoff documents
- current source code
- database/schema/migrations
- tests and fixtures
- CI workflows
- `package.json`
- `wrangler.toml`
- Worker/SvelteKit adapter integration
- current security-related configuration and middleware

Important rules:

- Phase 3 is COMPLETE.
- Phase 4 is COMPLETE.
- Do not reimplement or redesign Phase 3 or Phase 4.
- The current repository state wins over stale planning documents.
- Do not silently change product decisions already made.
- Do not invent requirements unsupported by the architecture, specification, current product direction, or security evidence.
- Do not assume that a security requirement is already implemented merely because the architecture document says it exists.
- Verify every security control against actual code/config/tests.

---

# 2. First task: determine exactly what Phase 5 is

Do not assume Phase 5 means "add some security headers."

Trace the intended Phase 5 scope through:

- Architecture-v3
- Specifications-v1
- contradictions/gaps
- Phase 3/4 handoffs
- existing security middleware
- CI
- current endpoints
- authentication/authorization
- Cloudflare Worker configuration
- current test suite
- known deferred work

Explicitly answer:

1. What is Phase 5 intended to accomplish?
2. Which security controls are explicitly in scope?
3. Which security verification activities are explicitly in scope?
4. Which hardening work is already implemented and must only be audited/extended rather than duplicated?
5. What is explicitly OUT of scope?
6. What belongs to Phase 6 instead?
7. Which Phase 3/4 invariants must remain untouched?
8. Are there architecture/specification contradictions affecting Phase 5?
9. Are there security controls described in the architecture that are missing, partial, or implemented differently in the current code?

At minimum investigate the Phase 5 areas referenced by the architecture:

- rate limiting
- security headers
- Content-Security-Policy
- OWASP ASVS review
- Playwright security regression testing
- adversarial/security testing
- dependency security / Dependabot
- CSRF boundary correctness
- authentication/authorization boundaries
- request validation and error behavior
- payload/body limits
- request timeouts
- origin/security metadata checks
- secret and answer-pool secrecy
- deployment/configuration security where relevant

Do not broaden the phase into unrelated product work.

---

# 3. Perform a deep security audit BEFORE designing the plan

Before writing any proposed implementation steps, audit the current implementation as if you were trying to break it.

Do not merely inspect files containing the word "security."

Trace the actual request flow:

HTTP request
→ SvelteKit/Cloudflare bridge
→ Hono app
→ middleware ordering
→ auth/session resolution
→ authorization
→ validation
→ domain service
→ database
→ response

Determine exactly what protections apply to each category of endpoint.

Audit at minimum:

## Authentication and authorization

Inspect:

- Better Auth configuration
- session handling
- cookie configuration
- auth middleware
- `requireAuth`
- `requireAdmin`
- page guards
- API authorization
- admin endpoints
- logout/sign-out behavior
- cross-origin behavior
- role handling
- admin bootstrap
- unauthorized and forbidden response envelopes

Verify that page protection and API protection are not being incorrectly treated as equivalent.

---

## CSRF and cross-site request protection

Inspect:

- `src/server/middleware/csrf.ts`
- middleware composition/order
- all unsafe application mutations
- `/api/game/*`
- `/api/me/*`
- `/api/admin/*`
- Better Auth `/api/auth/*`

Verify the actual implementation against NG4 and the current architecture.

Pay particular attention to:

- JSON requests
- `Origin`
- `Sec-Fetch-Site`
- SameSite cookie behavior
- unsafe GETs
- Better Auth exceptions
- whether a state-changing operation is reachable through GET
- whether middleware is actually mounted globally where intended

Do not replace working protection without evidence.

---

## Rate limiting

Determine:

- whether a Cloudflare Rate Limiting binding exists
- whether Wrangler configuration already defines one
- whether application code consumes it
- which endpoints should be rate-limited
- whether limits are defined by architecture/spec or remain product-tunable
- what identity/key should be used
- how authenticated and unauthenticated traffic differ
- whether login/auth endpoints require a different treatment
- how admin endpoints differ from player endpoints
- how rate-limit failures should be represented
- how this should behave in local development and tests
- how this should behave in Cloudflare Workers specifically

Do not invent arbitrary thresholds without clearly marking them as proposed/product-tunable.

Separate **binding/mechanism decisions** from **threshold/product decisions**.

---

## CSP and security headers

Inspect:

- existing `security-headers` middleware
- current headers
- inline scripts
- SvelteKit-generated scripts
- Vite assets
- worker/static asset behavior
- the pre-paint theme script
- nonce/hash opportunities
- any third-party resources
- Google OAuth-related resources if applicable

The architecture explicitly requires CSP to remain compatible with the **pre-paint theme script**.

Determine:

- what CSP can safely be enforced
- whether a nonce, hash, or another mechanism is needed
- whether development and production require different treatment
- whether CSP should be Report-Only first or enforced directly
- whether any existing UI behavior would break
- whether headers currently duplicate or conflict

Do not blindly copy a generic CSP template.

---

## Request and application-layer hardening

Audit existing:

- request ID
- timeout
- body/payload limits
- Zod validation
- strict unknown-field rejection
- UUID short-circuiting
- error-envelope behavior
- logging
- error leakage
- exception handling
- route exposure
- HTTP method handling
- caching behavior
- sensitive response data
- answer secrecy

Determine which protections are already sufficient and which require changes.

---

## Database/security boundary

Audit:

- authorization before privileged queries
- transaction boundaries
- locking rules
- SQL construction
- parameterization
- raw SQL usage
- uniqueness/race protections
- admin operations
- exposure of answer data
- accidental client-bundle inclusion
- migrations and seed tooling
- database credentials
- environment-variable usage

The Phase 5 plan MUST preserve:

- answer-pool secrecy
- existing transaction/locking invariants
- zero unintended schema changes
- server-authoritative game behavior

---

## Client-side security surface

Inspect:

- Svelte rendering behavior
- use of `{@html}`
- URL construction
- query-string handling
- localStorage usage
- theme initialization
- redirects
- error rendering
- toast rendering
- user-controlled display names
- user-controlled data appearing in leaderboard/admin pages

Look for XSS/open-redirect/data-exposure risks.

Do not assume framework defaults make every sink safe; verify the actual code.

---

## Dependency and supply-chain security

Inspect:

- `package.json`
- `bun.lock`
- existing GitHub configuration
- Dependabot presence/absence
- lockfile discipline
- dependency update strategy
- scripts/hooks that run third-party code
- CI permissions
- GitHub Actions configuration

Determine exactly what Phase 5 should implement versus what should be documented as operational/product policy.

Do not invent an elaborate supply-chain program unless the repository requires it.

---

# 4. Perform an OWASP ASVS-style review

Perform a bounded, repository-specific security review informed by OWASP ASVS.

Do NOT merely paste ASVS categories.

Map relevant requirements to this actual application.

At minimum cover:

- V1 architecture / trust boundaries
- V2 authentication
- V3 session management
- V4 access control
- V5 validation / encoding
- V7 error handling / logging
- V8 data protection
- V9 communications
- V10 malicious code / business logic abuse where applicable
- V13 API and web-service security
- V14 configuration

For every relevant area classify the current state as:

- PASS
- PARTIAL
- FAIL
- NOT APPLICABLE
- NEEDS VERIFICATION

For every PARTIAL or FAIL item, identify:

- exact evidence
- affected file/path
- security consequence
- recommended remediation
- required test
- whether remediation belongs in Phase 5 or a later phase

Keep this bounded to the real application.

---

# 5. Audit the existing tests before designing new ones

Inspect:

- unit tests
- integration tests
- E2E tests
- existing security tests
- test fixtures
- CI workflow

Determine which security guarantees are already pinned.

Do not create parallel testing infrastructure when the existing system can be extended.

Identify missing tests for:

- CSRF
- unauthorized access
- forbidden admin access
- rate-limit behavior
- security headers
- CSP
- redirect safety
- XSS-sensitive rendering paths
- payload limits
- malformed requests
- sensitive-data leakage
- auth/session edge cases
- method restrictions
- answer secrecy
- security regressions in existing routes

For each proposed test, state whether it belongs in:

- unit
- integration
- E2E
- security-specific test suite
- CI/static verification

---

# 6. Audit CI/CD and Cloudflare-specific constraints

Inspect the actual GitHub Actions workflow and deployment configuration.

Determine how Phase 5 can safely validate:

- lint
- type checking
- unit tests
- integration tests
- E2E
- build
- worker bundle
- security-header behavior
- CSP behavior
- rate limiting
- dependency checks
- ZAP

Pay special attention to the fact that this application targets **Cloudflare Workers**.

Do not design a security mechanism that depends on Node-only APIs or server behavior unavailable in Workers.

Where a security test cannot be realistically executed in local CI, document:

- why
- what can be tested locally
- what requires a deployed environment
- what acceptance evidence is required

---

# 7. Define the exact Phase 5 scope

Produce a definitive boundary.

At minimum, distinguish:

### In scope

Likely areas to investigate include:

- security verification
- rate limiting
- CSP
- remaining security headers hardening
- security regression tests
- OWASP ASVS review
- ZAP/adversarial testing
- dependency/security automation
- security-focused CI verification

But do not mark anything in scope just because it sounds security-related. Every item must be justified by repository evidence.

### Out of scope

Explicitly identify things such as:

- Phase 6 deployment/operations work unless security verification specifically requires it
- new product features
- leaderboard/game/admin redesign
- database redesign unrelated to a demonstrated security issue
- speculative security infrastructure
- unrelated performance optimization

---

# 8. Produce the Phase 5 implementation plan

Create:

`docs/phases/phase 5/phase-5-plan.md`

This must be implementation-grade.

It should include:

## A. Phase goal

Precise definition of what "Phase 5 complete" means.

## B. Current security posture

Summarize:

- existing controls
- verified controls
- partial controls
- missing controls
- high-risk findings
- medium/low findings

## C. Scope

Definitive in-scope/out-of-scope list.

## D. Security architecture

Describe the final intended security request flow and control boundaries.

Include middleware ordering and explain why the order is correct.

## E. Implementation slices

Break the work into small, independently verifiable slices.

For every slice specify:

- objective
- exact files likely affected
- current behavior
- desired behavior
- backend changes
- frontend changes
- Worker/Cloudflare changes
- configuration changes
- tests
- CI changes
- dependencies
- acceptance criteria
- security rationale

Prefer slices such as:

1. security baseline audit corrections
2. rate-limiting mechanism
3. CSP/security-header hardening
4. security regression tests
5. ASVS verification
6. ZAP/adversarial verification
7. dependency/security automation
8. final security gate

But reorganize them when the actual repository evidence suggests a better order.

## F. Rate-limiting contract

Document:

- binding/configuration
- endpoint classes
- keying strategy
- failure behavior
- local/test behavior
- production constraints
- threshold decisions
- which values are binding vs product-tunable

## G. CSP contract

Document:

- directives
- nonce/hash strategy
- theme-script compatibility
- asset/script/style requirements
- production/dev considerations
- expected headers
- testing method

Do not leave the implementation agent to guess.

## H. Security-header contract

Document:

- each required header
- exact intended value
- HTTPS-only behavior where appropriate
- exclusions
- compatibility concerns

## I. ASVS matrix

Include a concise project-specific table:

| Area | Requirement | Current state | Evidence | Phase 5 action | Verification |

Do not turn it into a generic ASVS dump.

## J. Testing strategy

Separate:

- unit
- integration
- E2E
- security regression
- static checks
- ZAP/adversarial testing
- CI verification
- production/deployed verification

## K. CI/dependency strategy

Document:

- Dependabot
- lockfile expectations
- GitHub Actions security considerations
- permissions
- security scans
- failure policy

## L. Risks and mitigations

Pay particular attention to:

- CSP breaking SvelteKit
- CSP breaking the pre-paint theme script
- Cloudflare Worker limitations
- rate-limit configuration mistakes
- auth regressions
- CSRF regressions
- false-positive security tests
- test environment differences
- production-only security behavior
- accidental secret/answer exposure
- dependency automation noise

## M. Verification gates

Define exact commands, tests, and required evidence.

A Phase 5 plan is NOT complete until another agent can implement it without guessing what "secure enough" means.

## N. Deferred decisions

Record anything that should remain product-tunable or be deferred.

Never silently choose a threshold or policy merely to make the plan convenient.

## O. Explicit invariants

List the Phase 0–4 behavior that Phase 5 MUST NOT break.

---

# 9. Produce a planning-state handoff

Create:

`docs/phases/phase 5/phase-5-planning-state-handoff.md`

This must allow a fresh implementation chat to continue without access to the reasoning history.

Include:

- exact repository HEAD
- branch
- Phase 4 final-state dependency
- security baseline
- current middleware/request flow
- security findings
- relevant files
- existing test coverage
- implementation slices
- binding decisions
- unresolved decisions
- Cloudflare constraints
- CI constraints
- ASVS findings
- ZAP/adversarial testing requirements
- dependency-security requirements
- exact next-step instructions

---

# 10. Produce the Phase 5 implementation prompt

Create:

`docs/phases/phase 5/phase-5-implementation-prompt.md`

This must be the executable prompt for a separate implementation chat.

It must tell the implementation agent:

- what to read first
- what Phase 5 means
- the exact scope
- current security posture
- exact slices to implement
- binding decisions
- unresolved decisions that MUST NOT be invented
- files/components/configuration likely to change
- Cloudflare constraints
- middleware ordering requirements
- tests required
- ZAP/adversarial verification requirements
- dependency/security automation requirements
- final verification gates
- documentation/receipt requirements
- how to produce the final implementation handoff

The implementation prompt must explicitly state:

**Do not modify Phase 3/4 behavior unless the Phase 5 plan explicitly identifies it as a security remediation.**

---

# 11. Do NOT implement Phase 5 yet

This is a **PLANNING-ONLY** task.

You may:

- inspect the repository
- inspect source/config/tests
- create the Phase 5 Markdown planning files
- update planning documentation if needed

You must NOT:

- add rate limiting
- add CSP
- change headers
- modify application code for remediation
- change CI implementation
- add Dependabot
- add security tests
- modify dependencies

Those belong to the later Phase 5 implementation pass.

---

# 12. Final consistency review

Before finishing, perform a final cross-check.

Verify:

- the Phase 5 plan matches the current repository
- the Phase 5 plan matches Architecture-v3 and Specifications-v1
- Phase 3/4 invariants are preserved
- security claims are backed by actual code/config evidence
- no missing security control is hidden by architecture documentation
- rate-limiting behavior is fully specified
- CSP behavior is fully specified
- CSP remains compatible with the pre-paint theme script
- middleware ordering is explicit
- ASVS findings are actionable
- ZAP/adversarial testing is actionable
- security tests use the existing test architecture
- CI requirements are realistic for Cloudflare Workers
- dependency automation is clearly bounded
- unresolved product decisions remain explicitly unresolved
- another implementation agent could implement Phase 5 without guessing

Finally, give me:

1. a concise Phase 5 readiness assessment
2. the highest-risk security findings discovered
3. any genuine blockers to implementation
4. the exact files created
5. confirmation that NO source-code implementation was performed