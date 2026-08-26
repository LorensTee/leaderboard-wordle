# Task: Fully Finish Phase 0 of Leaderboard Wordle

You are working on the GitHub repository:

`https://github.com/LorensTee/leaderboard-wordle`

I have uploaded the authoritative **Architecture-v3** document for this project. Treat the repository's current `../../../Architecture-v3.md` and especially `../../contradictions-and-gaps.md` as the implementation authority. Do not replace architectural decisions with your own preferences unless you discover a genuine contradiction, security flaw, or impossibility. When there is a conflict, investigate it and preserve the latest documented decision.

## Objective

Fully finish **Phase 0 — Foundation**.

Do not start implementing Phase 1 gameplay features.

The goal is to leave the repository in a state where Phase 0 can honestly be declared **100% complete, reproducible, verified, and ready for Phase 1**.

Phase 0 is defined as:

- SvelteKit + Bun + Cloudflare adapter
- Hono bridge at `src/routes/api/[...path]/+server.ts`
- Drizzle ORM + Neon using the WebSocket-capable driver
- `wrangler.toml` with `nodejs_compat`
- TypeScript configuration
- `../../../src/app.d.ts` with `App.Locals`
- Basic dev/build pipeline
- CI pipeline including lint/check/unit/integration tests against a non-production DB
- Environment/config management
- Better Auth core with Google OIDC, session cookie, and user table
- `hooks.server.ts` with Better Auth session resolution
- A Hono-side authentication helper that independently establishes API authentication/authorization rather than trusting SvelteKit hooks

The existing repository has already completed most of this work. **Do not rebuild working components unnecessarily. Audit first, then make only the changes needed to close the remaining gaps.**

---

# Important repository context

The current repository already contains:

- SvelteKit + Bun + Cloudflare Workers
- Hono bridge
- Hono middleware stack
- Better Auth
- Drizzle + Neon
- database schema and migration
- live Neon transaction tests
- `SELECT ... FOR UPDATE` tests
- midnight concurrency tests
- lazy activation test
- word-list generation
- answer-pool bundle secrecy verification
- GitHub Actions
- Playwright E2E smoke testing
- live Google OAuth verification
- security review fixes

The latest Phase-0 verification is recorded in `../../../Architecture-v3.md`, including B1–B7.

Do **not** assume that the Architecture's recorded PASS statuses automatically mean the current repository is still correct. Verify the actual current `HEAD`.

The current HEAD at the time of this audit was:

`7f13ddd2a3ddd337f39a544948941911ded86e81`

The repository is public, so do not ever add private answer-pool contents, credentials, secrets, or local environment files.

---

# Primary issues identified during the final Phase-0 audit

You must investigate and resolve all of these rather than merely documenting them.

## 1. Missing Hono-side authentication helper

This is the most important remaining Phase-0 gap.

Architecture-v3 explicitly requires:

> Hono authentication helper (independent from SvelteKit hooks)

The current repository has:

- `../../../src/server/auth/auth.ts`
- `../../../src/server/auth/auth.generate.ts`

and `hooks.server.ts` resolves Better Auth sessions for SvelteKit.

However, that is not the same as having an explicit Hono/API authentication helper or middleware that independently establishes the authenticated user for application API routes.

### Required work

Design and implement the smallest architecture-consistent Hono authentication helper needed for Phase 0.

Requirements:

- It must resolve the Better Auth session from the request's cookies/headers.
- It must not rely on `event.locals` from SvelteKit.
- It must be usable by future Hono application routes such as `/api/game/*`, `/api/me/*`, and `/api/admin/*`.
- It must establish authenticated user identity independently inside Hono.
- It must not create a second authentication/session system.
- Better Auth remains the identity/session owner.
- Application authorization remains application-owned.
- Do not scatter email comparisons throughout future routes.
- The helper should expose a clean typed context value for the authenticated user/session, or a clean equivalent that fits the existing Hono architecture.
- Unauthenticated requests should receive the project's standard error envelope/status behavior.
- Do not accidentally make `/api/auth/*` use this middleware in a way that breaks OAuth callbacks.
- Preserve the existing Better Auth mounting behavior.
- Keep the bridge file platform-only.

Before implementing it, inspect the current Hono and Better Auth integration and determine the cleanest current-version pattern.

Add unit tests covering at minimum:

1. authenticated session resolves correctly
2. missing/invalid session is rejected
3. Hono does not trust SvelteKit `locals`
4. auth middleware does not break `/api/auth/*`

Do not implement Phase 1 game routes merely to prove the helper works. A focused middleware-level test is sufficient.

---

# 2. CI currently does not satisfy the stated lint requirement

The Phase 0 definition explicitly includes a CI pipeline with lint/check/unit/integration testing.

Inspect the current repository:

- `../../../package.json`
- `../../../.github/workflows/ci.yml`

Determine whether a real linting solution is already intended by the project's dependency/architecture documents.

If linting is required by the authoritative Phase-0 definition, add a proper lint setup rather than inventing a random style system.

Requirements:

- Add the appropriate lint dependency/configuration if necessary.
- Add a `lint` script.
- Run lint in CI.
- Keep it compatible with the current SvelteKit/Svelte/TypeScript/Bun stack.
- Avoid introducing unnecessary tooling.
- Do not replace `svelte-check`.
- CI should fail on genuine lint violations.
- Run lint locally before considering the task complete.

If the architecture documents have an explicit reason to omit a lint tool, investigate and document that decision instead of blindly adding one.

---

# 3. Resolve the Better Auth Google-token storage contradiction

This needs an explicit technical investigation.

Architecture-v3 states that the application should not store Google access/refresh tokens.

The current generated Better Auth `account` schema contains columns such as:

- `access_token`
- `refresh_token`
- `id_token`

Do not assume that merely having nullable columns means tokens are actually being stored, but also do not ignore the contradiction.

Investigate the exact behavior of the currently pinned Better Auth version and its Drizzle adapter.

Determine:

- whether Google access/refresh tokens are actually persisted by the current configuration
- under what circumstances they are persisted
- whether the application can configure Better Auth so these tokens are not persisted because the application does not need Google API access
- whether removing/omitting these columns is supported and safe
- whether they are Better Auth-managed required schema fields
- whether changing this would make future Better Auth schema regeneration incompatible
- whether the architecture should instead explicitly document that the columns exist but the application deliberately never requests/stores usable provider tokens

### Important

Do not make a speculative schema change.

Pick the safest architecture-consistent solution based on the actual Better Auth version in the repository.

If the fields must remain because they are part of Better Auth's generated account schema, document the precise reason and prove that the current application does not persist/use Google access/refresh tokens unnecessarily.

If they can safely be removed/configured away, implement that change and regenerate/migrate correctly.

Add a regression test or another deterministic verification where practical.

---

# 4. Make Better Auth schema generation reproducible

The repository currently has:

```text
bunx auth@latest generate
```

and the architecture's own post-Phase-0 recheck identified that `auth@latest` can produce fingerprint-only differences between fetches.

The current documents already identify the action:

> pin `auth@1.7.1` on a networked machine

Do this properly.

Requirements:

- Do not use an unpinned `auth@latest` generator.
- Pin the Better Auth CLI version used to generate the schema.
- Ensure the pinned CLI version is represented reproducibly in `../../../bun.lock`.
- Preserve the application's Better Auth dependency version alignment.
- Run the schema generation.
- Run `bun run auth:check`.
- Ensure genuine regeneration is deterministic.
- Do not weaken the parity checker just to make it pass.
- Do not accept real schema drift as a "fingerprint-only" difference.
- Preserve the canonical generated schema if the files are semantically identical.
- Make sure future developers/agents can reproduce the same schema without relying on a mutable `latest` package.

Inspect the existing:

- `../../../scripts/check-auth-schema.ts`
- `../../../src/server/auth/auth.generate.ts`
- `../../../package.json`
- `../../../bun.lock`

and improve them rather than creating a parallel generator mechanism.

---

# 5. Verify the word-list situation without accidentally expanding Phase 0

The repository currently contains:

```text
src/server/data/valid-guesses.source.txt
src/lib/shared/data/valid-guesses.json
scripts/build-word-list.ts
```

The current source is intentionally a small sample.

The architecture says the eventual canonical valid-guess dictionary needs provenance/version discipline, while the actual production dictionary/content belongs to later implementation work.

Do not turn this into a Phase 1/Phase 3 data-import project.

Instead:

- verify the current Phase-0 pipeline is structurally correct
- verify source → generated artifact consistency
- verify invalid entries fail
- verify duplicates fail
- verify output is deterministic
- verify the public word list is never confused with the private answer pool
- verify `verify:bundle` still works
- ensure documentation clearly identifies that the current 20-word list is a Phase-0 fixture/sample unless the authoritative docs explicitly require a production dictionary now
- ensure the private answer pool remains gitignored and out of the public repo

Do not add actual future puzzle answers to the repository.

---

# 6. Re-audit the entire Phase-0 implementation

Do not limit the work to the four issues above.

Use Architecture-v3 as a checklist and audit the actual repository.

At minimum, inspect:

## Infrastructure

- `../../../package.json`
- `../../../bun.lock`
- `../../../vite.config.ts`
- `../../../tsconfig.json`
- `wrangler.toml`
- `../../../worker-configuration.d.ts`
- `../../../.env.example`
- `../../../.gitignore`

## SvelteKit

- `../../../src/app.d.ts`
- `../../../src/hooks.server.ts`
- SvelteKit configuration
- Cloudflare adapter configuration
- alias configuration

## Hono

- `src/routes/api/[...path]/+server.ts`
- `../../../src/server/routes.ts`
- middleware ordering
- error handling
- request IDs
- body limit
- timeout
- secure headers
- HSTS
- CSRF
- auth boundary

## Authentication

- `../../../src/server/auth/auth.ts`
- `../../../src/server/auth/auth.generate.ts`
- generated auth schema
- Better Auth migration
- hooks integration
- Hono API auth helper
- Google OAuth
- session cookie behavior
- secret handling
- production fallback behavior

## Database

- `../../../src/server/db/schema.ts`
- `../../../src/server/db/auth-schema.generated.ts`
- `../../../src/server/db/client.ts`
- migration SQL
- migration journal/snapshot
- Drizzle configuration
- Neon driver
- WebSocket transaction semantics

## Word-data secrecy

- valid guess source
- generated public artifact
- private answer-pool path
- `../../../.gitignore`
- bundle-secrecy script
- unit tests
- repository contents

## Tests

- unit tests
- integration tests
- E2E smoke tests
- security tests
- schema parity check
- bundle secrecy
- CI behavior

---

# 7. Verify the documented Phase-0 exit criteria against reality

Use the B7 exit criteria from Architecture-v3.

Do not simply copy the existing PASS table.

Re-run or independently verify every applicable gate.

These include:

1. package installation / `../../../bun.lock`
2. TypeScript check
3. Cloudflare production build
4. Wrangler configuration validation
5. Neon connection
6. migration application
7. transaction + `SELECT ... FOR UPDATE` proof
8. Hono bridge
9. Better Auth configuration/session resolution
10. CSRF/error/timeout/body-limit/secure headers
11. word-list generation
12. answer-pool secrecy/build inspection
13. lazy activation
14. midnight concurrency
15. CI
16. live Google OAuth

For each gate:

- verify it
- record the actual command/test
- record the result
- identify anything that cannot be verified in the current environment
- do not claim PASS without evidence

---

# 8. Pay special attention to the Neon integration tests

The architecture requires the actual production database path to be validated for transaction behavior.

The relevant invariant is:

- Neon
- `@neondatabase/serverless`
- Drizzle Neon driver
- WebSocket transport
- interactive transactions
- `SELECT ... FOR UPDATE`

Verify that the integration suite is still using the real Neon path when `DATABASE_URL` is provided.

Do not accidentally change the default test path to local `pg`.

The existing local-PostgreSQL seam is useful, but it must not replace the Neon proof.

The important concurrency tests include:

### Lock-order A

Guess obtains puzzle lock first.

Expected:

- guess remains valid
- guess completes/commits
- finalization waits
- finalization then sees the updated state

### Lock-order B

Finalization obtains puzzle lock first.

Expected:

- finalization commits `FINALIZED`
- guess later acquires the puzzle lock
- guess re-reads current state
- guess is rejected
- no late mutation occurs

Also verify the lazy-activation test.

---

# 9. Verify security fixes were not regressed

The repository previously had security-review findings.

Re-audit the final code for at least:

### Auth secret

Production must never silently use the development fallback secret.

The current architecture intentionally treats production as the default because Cloudflare Workers may not provide `NODE_ENV`.

Verify the current runtime behavior rather than assuming bundler constant folding.

### CSRF

Verify:

- cross-site unsafe request rejected
- missing Origin/Sec-Fetch-Site rejected according to the finalized policy
- `Sec-Fetch-Site: none` is not accidentally accepted
- same-origin request works
- allowed explicit origin works where intended
- `/api/auth/*` remains compatible with OAuth
- no state-changing operation becomes GET-accessible

### Error handling

Verify:

- standard error envelope
- request ID
- internal error sanitization
- 408 remains 408
- 413 remains 413
- no accidental leakage

### Session resolution

Verify:

- SvelteKit hook is not the authorization source for Hono
- Hono independently authenticates application API requests
- unauthenticated API requests are rejected

---

# 10. Check for accidental Phase-1 implementation

Phase 0 is the foundation.

Do not start implementing:

- Wordle board
- keyboard
- gameplay APIs
- guess submission service
- leaderboard
- profile UI
- onboarding UI
- admin UI
- puzzle scheduling UI
- settlement service

unless a tiny focused test fixture is absolutely necessary to verify a Phase-0 boundary.

The goal is to finish Phase 0, not blur the phase boundaries.

---

# 11. Keep the architecture clean

Preserve these rules:

### SvelteKit

Owns:

- routing
- page/layout composition
- hooks
- SSR/page loading
- frontend application shell

### Hono

Owns:

- API boundary
- authentication/authorization enforcement
- domain/application backend
- validation
- API response contracts
- middleware

### SvelteKit Hono bridge

Must remain a thin adapter.

Do not place:

- database queries
- game logic
- authorization logic
- business rules

inside:

`src/routes/api/[...path]/+server.ts`

### Better Auth

Owns:

- identity
- Google OIDC
- sessions
- cookies
- login/logout/session lifecycle

### Application

Owns:

- role authorization
- display-name rules
- avatar rules
- game ownership
- game rules
- admin authorization

### Database

Owns:

- constraints
- uniqueness
- referential integrity
- transaction serialization

---

# 12. Verify repository hygiene

Before declaring Phase 0 complete:

- no `../../../.env`
- no `.dev.vars`
- no credentials
- no Google secrets
- no DATABASE_URL
- no private answer-pool seed
- no generated local cache
- no `.svelte-kit`
- no `.cache`
- no test artifacts
- no accidental local PostgreSQL binaries
- no node_modules
- no debug page
- no temporary OAuth page
- no temporary scripts that are not documented

Check Git status and the tracked file tree.

---

# 13. Improve documentation only where it reflects reality

Update documentation after implementation, not before.

At minimum, make sure:

- Architecture-v3's Phase-0 status is accurate
- `../../contradictions-and-gaps.md` no longer claims a resolved item is still unresolved if you actually closed it
- remaining open items are clearly distinguished from Phase-0 blockers
- the Better Auth CLI reproducibility situation is accurately documented
- the Hono authentication helper is documented
- CI commands match reality
- README commands actually work
- Phase-1 handoff documentation accurately describes the finished foundation

Do not rewrite the architecture just to make the repository appear complete.

---

# 14. Final verification commands

Run all appropriate checks.

At minimum, determine whether the following should pass in the current repository and run them:

```bash
bun install --frozen-lockfile

bun run check
bun run lint
bun run test:unit
bun run word-list

bun run build
bun run types:check
bun run verify:bundle
bun run auth:check

bun run db:generate
```

For DB-dependent verification, use the dedicated non-production Neon database:

```bash
bun run db:migrate
bun run test:integration
```

Run the E2E suite:

```bash
bun run test:e2e
```

Also validate Wrangler:

```bash
wrangler deploy --dry-run
```

Use the repository's existing environment/config conventions. Never print or expose secrets in logs.

If `db:generate` reports no schema changes, record that as confirmation rather than modifying the migration unnecessarily.

---

# 15. Verify CI from a clean checkout

This is important.

Some previous CI problems were caused by generated files or `.svelte-kit` state affecting Wrangler type generation.

Therefore verify the workflow in a clean environment.

The CI order must remain logically correct.

In particular, if `wrangler types --check` depends on the Cloudflare build output being present, make sure the workflow order reflects that fact.

Also verify the migration journal/snapshot are actually committed.

Make sure the integration job cannot silently claim success merely because `DATABASE_URL` is missing unless that behavior is explicitly intended by the project's final CI policy.

If the repository's final Phase-0 policy requires the integration job to be mandatory, make it fail when the required non-production secret is missing rather than silently skipping the entire DB verification.

Use the safest interpretation consistent with the architecture and existing CI decisions.

---

# 16. Do a final contradiction audit

After making the changes, compare:

- `../../../Architecture-v3.md`
- `../../contradictions-and-gaps.md`
- `../../proposed-repo-tree.md`
- `../../proposed-dependencies.md`
- current implementation

Look specifically for:

- requirements that are documented but not implemented
- implemented behavior that contradicts the architecture
- stale "TODO" statements that are actually finished
- claims of PASS that are no longer true
- references to old package versions
- old auth endpoint names
- old SvelteKit configuration assumptions
- old Neon HTTP-driver assumptions
- old CSRF behavior
- old security behavior

Do not silently resolve contradictions by choosing whichever document is easier.

---

# Definition of Done

You may declare Phase 0 complete only when all of these are true:

## Architecture

- [ ] Every Phase-0 requirement in Architecture-v3 is either implemented and verified or explicitly justified as intentionally deferred to a later phase.
- [ ] No unresolved Phase-0 blocker remains in `../../contradictions-and-gaps.md`.
- [ ] Architecture and implementation agree.

## Infrastructure

- [ ] Bun install is reproducible.
- [ ] SvelteKit builds correctly.
- [ ] Cloudflare adapter builds correctly.
- [ ] Wrangler configuration validates.
- [ ] Worker types are reproducible.
- [ ] `App.Locals` is correctly typed.

## Hono

- [ ] Hono bridge is thin.
- [ ] Middleware ordering is correct.
- [ ] Request IDs work.
- [ ] Error envelopes work.
- [ ] Timeout works.
- [ ] Body limits work.
- [ ] Secure headers work.
- [ ] CSRF works.
- [ ] Hono-side authentication helper exists and is tested.

## Authentication

- [ ] Better Auth is the sole identity/session system.
- [ ] Google OAuth works.
- [ ] Session creation works.
- [ ] Session lookup works.
- [ ] Logout works.
- [ ] SvelteKit hooks resolve sessions.
- [ ] Hono independently authenticates API requests.
- [ ] Production cannot use the dev fallback secret.
- [ ] Auth schema generation is reproducible.
- [ ] Better Auth token-storage behavior matches the architecture and is explicitly verified.

## Database

- [ ] Migration applies successfully.
- [ ] Migration metadata is committed.
- [ ] Schema matches the architecture.
- [ ] Neon WebSocket driver is used for transactional behavior.
- [ ] `FOR UPDATE` proof passes against Neon.
- [ ] NG9 lock order A passes.
- [ ] NG9 lock order B passes.
- [ ] Lazy activation passes.

## Security

- [ ] CSRF tests pass.
- [ ] Auth-secret regression test passes.
- [ ] Error-handling regression tests pass.
- [ ] No credentials are committed.
- [ ] No future answer pool is public.
- [ ] Bundle-secrecy verification passes.

## Testing

- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] E2E smoke test passes.
- [ ] Schema parity test passes.
- [ ] Word-list generation passes.
- [ ] Bundle verification passes.
- [ ] CI is valid.
- [ ] CI actually executes the intended gates.

## Repository hygiene

- [ ] No temporary/debug code remains.
- [ ] No stale Phase-0 claims remain.
- [ ] Documentation accurately reflects the final implementation.
- [ ] Git status is clean except for intentional commits.
- [ ] No Phase-1 implementation was unnecessarily introduced.

---

# Required final response

Do not simply say "done."

Give me a structured final report with:

## 1. Phase-0 verdict

Choose exactly one:

- `PHASE 0 COMPLETE`
- `PHASE 0 COMPLETE WITH DOCUMENTED NON-BLOCKING FOLLOW-UPS`
- `PHASE 0 NOT COMPLETE`

## 2. Changes made

List every actual code/config/documentation change.

## 3. Verification

For every important command/test, give:

- command
- result
- important evidence

Do not invent results.

## 4. Remaining issues

If anything remains, distinguish:

- blocking
- non-blocking
- intentionally deferred to later phases

## 5. Architecture contradictions

Explicitly state whether any implementation-vs-architecture contradictions remain.

## 6. Phase-1 readiness

Only answer that Phase 1 is ready if Phase 0 genuinely satisfies the architecture and all mandatory gates.

---

# Critical working rules

1. **Audit before editing.**
2. **Do not rebuild working Phase-0 components.**
3. **Do not implement Phase 1.**
4. **Do not weaken tests to make them pass.**
5. **Do not weaken security requirements.**
6. **Do not hide failures behind skipped tests unless that behavior is explicitly intended.**
7. **Do not expose secrets.**
8. **Do not add future puzzle answers to the public repository.**
9. **Do not use `auth@latest`.**
10. **Do not invent undocumented architecture merely because it seems cleaner.**
11. **Prefer the smallest change that closes the actual gap.**
12. **When uncertain about an existing library behavior, inspect the installed/pinned version and verify it empirically.**
13. **Use the actual current repository state as the source of truth for implementation, while using Architecture-v3 and `../../contradictions-and-gaps.md` as the specification.**
14. **Do not declare completion unless the evidence supports it.**

The intended result is not merely "tests pass." The intended result is:

> **A clean, reproducible, security-conscious Phase-0 foundation whose implementation, tests, CI, database behavior, authentication boundaries, and architecture documentation all agree, with no remaining Phase-0 blocker before Phase 1 begins.**