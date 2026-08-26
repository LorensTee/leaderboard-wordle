# Task: Create the Phase-1 implementation handoff/state file

> ⚠️ **HISTORICAL.** Phase-0 → Phase-1 prompt. Phase 1 is complete
> (`2fc1be1`, 2026-08-25). For current state read the repository +
> `docs/phase-2-implementation-handoff.md`.

Phase 0 is now complete and verified. Before ending this chat, create a comprehensive handoff file for the NEXT AI coding chat that will implement Phase 1.

The repository is:

https://github.com/LorensTee/leaderboard-wordle

The existing authoritative Phase-1 implementation prompt is:

`docs/phase-1-handoff-prompt.md`

Do NOT rewrite or replace that prompt.

Instead, create a NEW Markdown file:

`../phase-1-implementation-handoff.md`

This file is a **state-transfer document**, not another architecture specification.

Its purpose is to let a completely fresh AI coding session understand exactly what the previous Phase-0 session actually did, what the repository currently contains, what was verified, and what the Phase-1 agent must know before changing anything.

## Critical rule

Do not invent information.

Everything in the handoff must be based on:

- the actual current repository at HEAD
- the final Phase-0 implementation
- actual verification results
- current Architecture-v3
- current `../contradictions-and-gaps.md`
- current `docs/phase-1-handoff-prompt.md`
- actual package versions from `../../bun.lock`

If something was not verified, explicitly say it was not verified.

Do not present historical assumptions as current facts.

---

# Required contents

## 1. Current repository identity

Record:

- repository
- current branch
- current HEAD commit SHA
- date/time of handoff
- current Phase status

State clearly:

> Phase 0 is complete. Phase 1 is the next implementation phase.

---

## 2. Phase-0 completion summary

Summarize what Phase 0 actually implemented.

Include:

- SvelteKit
- Bun
- Cloudflare adapter
- Wrangler
- Hono
- Hono bridge
- Hono middleware stack
- Better Auth
- Google OAuth
- SvelteKit session hooks
- Hono auth helper
- Drizzle
- Neon
- database schema
- migrations
- transaction semantics
- CI
- tests
- word-list pipeline
- answer secrecy
- security fixes
- lint
- schema-generation parity

Do not merely copy the architecture.

Describe the actual current implementation.

---

## 3. Actual Phase-0 files that matter to Phase 1

Create an important-files table.

For each file/path give:

- path
- responsibility
- why Phase 1 developers must know about it
- whether Phase 1 should modify it, extend it, or leave it alone

At minimum include:

`../../src/server/routes.ts`

`../../src/server/middleware/auth.ts`

`../../src/server/middleware/csrf.ts`

`../../src/server/lib/errors.ts`

`../../src/server/auth/auth.ts`

`../../src/hooks.server.ts`

`src/routes/api/[...path]/+server.ts`

`../../src/server/db/schema.ts`

`../../src/server/db/client.ts`

`../../src/server/db/auth-schema.generated.ts`

`../../src/server/db/migrations`

`../../tests/integration`

`../../tests/unit`

`../../.github/workflows/ci.yml`

`../../scripts/build-word-list.ts`

`../../scripts/verify-bundle-secrecy.ts`

and the relevant shared frontend directories.

---

## 4. Authentication handoff

Document the exact current authentication architecture.

Explain:

- Better Auth owns identity/session
- Google OIDC
- SvelteKit hooks use session resolution for page behavior
- Hono independently resolves sessions
- `../../src/server/middleware/auth.ts`
- `authContext`
- `requireAuth`
- `c.get('auth')`
- protected namespaces
- `/api/auth/*` exception
- how Phase 1 game routes must use this boundary
- what MUST NOT be done

Explicitly state:

> Phase 1 must not create a second session/authentication mechanism.

---

## 5. Database handoff

Document the exact current schema relevant to Phase 1:

- `user`
- `daily_puzzles`
- `games`
- `guesses`
- `answer_dictionary`

For each table explain the fields Phase 1 will use.

Record all important constraints:

- `UNIQUE(user_id, puzzle_id)`
- `UNIQUE(game_id, guess_number)`
- puzzle date uniqueness
- answer uniqueness
- status enums
- relevant indexes
- FKs

Explain which constraints are application invariants and which are DB-enforced.

Do not invent columns that do not exist.

---

## 6. Transaction/concurrency handoff

This is extremely important.

Document the exact established transaction semantics:

- puzzle-first locking
- game lock ordering
- `SELECT ... FOR UPDATE`
- `transaction_timestamp()`
- expiry eligibility
- lazy activation
- NG9 lock order A
- NG9 lock order B
- M3

Explain what the Phase-1 services must preserve.

Explicitly warn:

> Do not replace the tested transaction contract with a simpler implementation.

---

## 7. Phase-0 tests that Phase 1 must preserve

List the current unit/integration/E2E tests.

State their current counts as verified at the final Phase-0 closeout.

Explain which existing integration tests must be **re-pointed from raw SQL to real Phase-1 services**.

Specifically cover:

- midnight lock-order test
- lazy activation test
- database constraint test
- token-column regression test
- Hono auth tests

---

## 8. Package/dependency handoff

Record the actual versions from the current `../../bun.lock` for packages that Phase 1 will use.

Do not guess versions.

Especially record:

- Svelte
- SvelteKit
- Vite
- TypeScript
- Hono
- Better Auth
- Drizzle ORM
- Neon serverless package
- Zod
- TanStack Svelte Query
- TanStack Svelte Form if installed
- Lucide Svelte
- Sonner
- Anime.js
- Tailwind
- shadcn-svelte

Distinguish:

- already installed
- installed but not yet used
- needs to be added in Phase 1

Do not instruct the new AI to upgrade packages unless the architecture requires it.

---

## 9. Environment handoff

Document:

- `../../.env`
- `.dev.vars`
- Wrangler/platformProxy behavior
- `NODE_ENV` auth behavior
- XDG_CONFIG_HOME workaround
- DATABASE_URL expectations
- non-production DB expectations

Never record actual credential values.

State clearly:

> Never print or commit environment secrets.

---

## 10. Word-list and answer secrecy handoff

Explain:

- public valid-guesses artifact
- canonical source
- build script
- private answer pool
- bundle secrecy check
- what Phase 1 may access
- what the browser must NEVER receive

Explicitly explain that the Phase-1 game client may know the public valid-guess list but must never receive the answer.

---

## 11. Architecture boundaries

Explain exactly:

- what belongs in `../../src/server`
- what belongs in `../../src/lib`
- what belongs in SvelteKit routes
- what `src/routes/api/[...path]/+server.ts` must NOT contain
- what `../../src/server/routes.ts` owns
- where game logic should go
- where puzzle lifecycle logic should go
- how RPC typing should work

---

## 12. Decisions already made

Extract all Phase-0 decisions that Phase 1 must NOT reopen unless a genuine contradiction appears.

Examples:

- Better Auth ownership
- Hono auth helper
- Neon WebSocket transaction path
- puzzle-first locking
- Manila timezone
- `transaction_timestamp()`
- CSRF fail-closed behavior
- token-column decision
- pinned Better Auth CLI
- mandatory integration CI gate
- word-list duplicate handling

For each decision briefly explain WHY it was chosen when the repository documents that reason.

---

## 13. Known limitations / intentional deferrals

List things that are intentionally deferred to later phases.

For example:

- real production valid-guess data/provenance if still deferred
- onboarding
- profile
- leaderboard
- settlement
- admin tools
- CSP
- later security hardening

Do not call intentional deferrals bugs.

---

## 14. Phase-1 starting state

Give the new AI a practical starting checklist.

It should include:

1. read `../../Architecture-v3.md`
2. read `../contradictions-and-gaps.md`
3. read `phase-1-handoff-prompt.md`
4. read this handoff
5. inspect current Git status
6. verify current HEAD
7. run the Phase-0 sanity checks
8. only then begin Phase 1

Do not tell the new AI to assume historical test counts.

---

## 15. Phase-1 risks / watch-outs

Create a section listing mistakes a new coding agent is most likely to make.

Include at least:

- accidentally trusting SvelteKit locals for API authorization
- exposing the answer through API responses
- importing server runtime code into client code
- breaking puzzle-first lock ordering
- using `clock_timestamp()` instead of `transaction_timestamp()`
- accepting client timing
- implementing naive duplicate-letter evaluation
- allowing a seventh guess
- forgetting concurrent start idempotency
- allowing completed games to mutate
- weakening CSRF
- adding React dependencies
- changing the Neon driver
- creating an alternate API composition point
- silently skipping integration tests
- regenerating Better Auth schema with an unpinned CLI
- changing architecture without recording a decision

---

## 16. Final verification status

Record the actual results of the final Phase-0 verification.

For each:

- command
- result
- date
- any caveat

Include:

- lint
- check
- unit
- integration
- build
- types:check
- auth:check
- verify:bundle
- e2e
- drizzle schema generation
- Wrangler dry-run

Also state whether the current GitHub Actions status for HEAD was directly verified or whether only the recorded local/fresh-runner verification was available.

Be precise.

---

## 17. Handoff invariants

End the document with a compact list titled:

`## Invariants the Phase-1 agent must preserve`

This should be a concise checklist covering the most important architectural/security/database rules.

---

# File quality requirements

Make the document:

- Markdown
- well structured
- easy for another AI to consume
- factual rather than narrative
- detailed enough to prevent rediscovery
- concise enough to avoid duplicating Architecture-v3

Do NOT copy the entire Architecture-v3 into the handoff.

The handoff should describe **current implementation state and practical context**, while `../../Architecture-v3.md` remains authoritative for the architecture.

After creating the file:

1. read it back
2. verify it is accurate against the current repository
3. fix any stale claims
4. commit it to `main`

Use a commit message such as:

`docs(phase1): add implementation handoff`

Do not make unrelated code changes.

At the end of your response, report:

- exact file created
- commit SHA
- what it contains
- the final Phase-0 verification status
- whether the repository is ready for a fresh Phase-1 chat
