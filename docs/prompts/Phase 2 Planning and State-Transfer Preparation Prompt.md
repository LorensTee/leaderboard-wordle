You are preparing **Phase 2 planning** for Leaderboard Wordle.

Repository:
https://github.com/LorensTee/leaderboard-wordle

Branch:
`main`

Do NOT begin Phase-2 implementation yet.

Your task in this chat is to perform a thorough **Phase-2 planning, repository-state audit, and handoff preparation** so that a separate implementation chat can execute Phase 2 without relying on stale context or making architectural assumptions.

## 0. Highest-priority rule: inspect the actual repository

Do not trust historical handoff documents, commit messages, or old Phase-1 prompts as authoritative statements about the current state.

Inspect the actual current `main` branch first.

Determine:

- current HEAD
- current working-tree-relevant repository state
- actual dependency versions from `../../bun.lock`
- actual source tree
- actual Phase-1 implementation
- actual tests
- actual CI configuration
- actual authentication implementation
- actual onboarding-related DB columns/state
- actual UI shell/navigation
- actual use of TanStack Query
- actual shadcn-svelte state
- actual theme implementation, if any
- actual profile-related code, if any

The authoritative hierarchy is:

1. actual repository code/state
2. `../contradictions-and-gaps.md`
3. `../../Architecture-v3.md`
4. `../../Specifications-v1.md`
5. `../proposed-repo-tree.md`
6. `../proposed-dependencies.md`
7. historical handoff documents / commit messages

When documents conflict with the current repository, document the discrepancy instead of silently guessing.

## 1. Verify Phase-1 closure before planning Phase 2

Review the final Phase-1 state, including the post-Phase-1 fixes.

In particular verify the recent Google OAuth fixes:

- false error toast on successful OAuth initiation
- genuine initiation failure handling
- sanitized user-facing auth errors
- OAuth loading failsafe
- stale async sign-in settlement protection
- related regression tests

Also review the recent UI/accessibility fixes.

Do not assume these are correct merely because commit messages say they are correct. Inspect the actual code and tests.

Run or inspect the relevant verification commands where practical.

Produce a concise Phase-1 closure assessment:

- closed
- remaining external verification
- intentionally deferred items
- stale documentation that must be corrected before Phase 2

## 2. Read all Phase-2 authoritative requirements

Read in full:

- `../../Architecture-v3.md`
- `../../Specifications-v1.md`
- `../contradictions-and-gaps.md`
- `../proposed-repo-tree.md`
- `../proposed-dependencies.md`

Extract ONLY the requirements relevant to Phase 2.

Phase 2 is expected to include the authenticated user/onboarding/profile/application-shell work described by the architecture and specification, including where applicable:

- new-user onboarding
- display name
- display-name normalization and moderation
- curated emoji avatar
- profile page
- theme switching and persistence
- main navigation/application shell
- onboarding completion state
- role-aware shell behavior where Phase 2 owns it
- admin bootstrap decision/work where explicitly assigned to Phase 2

Do not pull Phase-3 leaderboard/history/statistics work into Phase 2.
Do not pull Phase-4 admin puzzle scheduling UI into Phase 2 unless the authoritative documents explicitly assign a prerequisite to Phase 2.

## 3. Identify every Phase-2 decision that is still underspecified

Create a decision inventory.

At minimum investigate:

### Authentication/onboarding

- How a newly authenticated user is detected as incomplete.
- What route/page handles onboarding.
- What happens when an authenticated user attempts `/play` before onboarding.
- Whether onboarding must be completed before entering the normal application shell.
- Whether onboarding is atomic.
- What happens after partial completion and reload.
- What happens to existing Phase-1 test users/accounts.
- Whether callback/auth flow needs any changes.
- Whether onboarding can be bypassed by direct API access.
- Exact API authorization boundaries.

### Display name

Define:

- 2–15 character validation
- exact ASCII charset
- trimming
- whitespace normalization
- canonical uniqueness key
- case handling
- moderation normalization
- profanity detection behavior
- reserved-name handling, if required
- duplicate-name behavior
- error codes/messages
- change-name behavior

Preserve the distinction between:

`canonicalizeDisplayName()`

and

`moderationKeyForDisplayName()`

Do not merge these into a single normalization function.

### Profanity/moderation

Determine:

- baseline list source
- custom banned-word list format
- version/provenance recording
- moderation behavior
- whether false positives are surfaced generically
- whether the same moderation logic is used for onboarding and later profile changes

Do not pretend a profanity list alone solves semantic moderation.

### Avatar

Define:

- exact curated avatar data location
- initial set
- ordering
- server-side allow-list validation
- client/server sharing strategy
- accessibility labels
- keyboard navigation
- mobile behavior
- whether selecting an avatar is mandatory

Use application data, not a new database table.

### Theme

Respect the existing architecture:

- `localStorage`
- `theme` key
- pre-first-paint application
- system preference default
- no DB dependency

Determine the exact integration point in the current SvelteKit shell.

### Application shell/navigation

Determine:

- navigation structure
- Play / Leaderboard / Profile visibility
- admin visibility behavior if applicable
- mobile navigation behavior
- signed-in vs onboarding-incomplete shell
- logout behavior
- active route state
- accessibility expectations

Do not implement Phase-3 leaderboard functionality merely because the navigation item exists.

## 4. Inspect the current UI architecture before proposing changes

Determine exactly which Phase-1 UI components are currently custom and which shadcn-svelte components actually exist.

Do not assume that installing `shadcn-svelte` means it is initialized.

Report:

- whether shadcn-svelte is initialized
- whether `components.json` exists
- which shadcn components are actually present
- which current UI components are custom
- which Phase-2 components genuinely benefit from shadcn-svelte
- which components should remain custom

Do NOT force shadcn-svelte into the Wordle board/keyboard merely for library compliance.

Likewise, do not introduce a large FSD refactor unless Phase 2 genuinely requires it.

## 5. Inspect the existing TanStack Query architecture

Document how the current application uses TanStack Query:

- QueryClient configuration
- query keys
- current game query
- mutations
- cache updates
- refetch/invalidation behavior
- optimistic updates, if any

Explicitly distinguish:

- server-state caching
- local Svelte UI state
- optimistic mutation behavior

Do not claim optimistic UI merely because TanStack Query is installed.

For Phase 2, decide which new server state belongs in TanStack Query and which state should remain local Svelte state.

## 6. Review current database state

Inspect the actual current schema and migrations.

Determine:

- which onboarding/profile columns already exist
- which are Better Auth managed
- which are app-controlled
- whether a migration is actually needed for Phase 2
- whether `onboarding_completed_at` already exists
- whether `display_name_normalized` already exists
- whether avatar storage already exists
- whether role already exists
- whether any schema change would require Better Auth schema regeneration/parity checks

Do not invent columns that already exist.
Do not hand-edit generated Better Auth schema.

## 7. Define the Phase-2 API contract before implementation

Create a proposed API contract for every Phase-2 mutation/read that is actually needed.

For each endpoint specify:

- method
- path
- authentication requirement
- authorization requirement
- request body
- strict validation rules
- success response
- error envelope/code
- ownership rule
- CSRF behavior
- whether it changes durable state
- whether it should use TanStack Query on the client

Prefer the existing Hono composition pattern and existing error envelope.

Do not create a parallel API typing system.

## 8. Define the Phase-2 UI state machine

For the onboarding/profile experience explicitly define states such as:

- unauthenticated
- authenticated + onboarding incomplete
- authenticated + onboarding complete
- loading
- validation error
- server error
- successful mutation
- retry

Define navigation behavior for every state.

Do not rely on "it should probably redirect."

## 9. Define the test plan BEFORE implementation

Create a Phase-2 test matrix covering:

### Unit

- display-name validation
- canonicalization
- moderation key generation
- profanity detection
- avatar allow-list validation
- any pure shell/theme helpers

### Integration

- authenticated onboarding access
- unauthorized onboarding/profile mutation
- display-name uniqueness
- moderation rejection
- avatar allow-list enforcement
- onboarding completion persistence
- role behavior where applicable

### E2E

At minimum:

1. unauthenticated user reaches Google sign-in
2. authenticated incomplete user is sent to onboarding
3. onboarding can complete successfully
4. invalid display name is rejected
5. banned name is rejected
6. duplicate name is rejected
7. avatar can be selected
8. refresh preserves completed onboarding
9. completed user reaches normal application shell
10. profile can update allowed fields
11. theme switching persists across reload
12. logout still works
13. existing Phase-1 gameplay remains reachable after onboarding
14. no Phase-1 gameplay regressions

Use deterministic authentication fixtures where practical. Do not introduce live Google OAuth as a required CI dependency unless the architecture explicitly calls for it.

## 10. Update the decision log

Any Phase-2 decision that changes or clarifies an existing architecture/specification rule must be recorded in:

`../contradictions-and-gaps.md`

Do not hide architectural decisions only in the new Phase-2 files.

Use the existing conventions in that document.

## 11. Create the Phase-2 planning artifacts

After the investigation, create/update the following markdown artifacts:

### A. `docs/phase-2-plan.md`

This is the authoritative Phase-2 implementation plan.

It must contain:

- purpose
- scope
- explicit non-goals
- current repository baseline
- authoritative requirements
- decisions made
- unresolved decisions
- architecture/data flow
- DB impact
- API contract
- UI/shell/onboarding flow
- validation/moderation strategy
- avatar strategy
- theme strategy
- TanStack Query strategy
- shadcn-svelte usage strategy
- test plan
- CI/verification plan
- migration plan
- rollback/risk notes
- definition of done

### B. `docs/phase-2-implementation-handoff.md`

This is a state-transfer document for the future implementation chat.

It must describe the ACTUAL repository state after planning is complete.

Include:

- current HEAD
- current phase
- Phase-1 closure state
- exact relevant files
- current auth boundary
- current DB/schema state
- current API architecture
- current UI architecture
- current TanStack Query setup
- actual shadcn state
- Phase-2 decisions
- Phase-2 invariants
- API contract
- testing contract
- deferred items
- known risks
- files that must not be modified casually
- exact commands for verification

Do not copy stale Phase-1 handoff prose wholesale.

### C. `docs/phase-2-handoff-prompt.md`

This is the prompt for a NEW implementation chat.

It must explicitly instruct the next agent to:

1. inspect the current repository first
2. read the authoritative docs
3. read the Phase-2 implementation handoff
4. verify the Phase-2 planning assumptions
5. run pre-implementation gates
6. fix documentation contradictions before coding if necessary
7. preserve Phase-1 invariants
8. implement only Phase 2
9. update the decision log for new decisions
10. add tests before declaring completion
11. run the full required verification
12. produce a final Phase-2 implementation handoff/update

The prompt must explicitly say that the repository state outranks historical handoff prose.

## 12. Stale-document audit

Before finishing this planning task, search for stale references such as:

- "Phase 1 is the next implementation phase"
- "No Phase-1 gameplay code exists"
- stale package versions
- stale test counts
- stale file lists
- stale claims about shadcn initialization
- stale claims about OAuth behavior

Identify each stale document and either:

- update it when it is intended to remain current, or
- clearly mark it as historical if it should remain unchanged.

Do NOT silently leave a misleading Phase-1 handoff document that a future agent could mistake for current state.

## 13. No implementation yet

Do not implement Phase 2 in this chat.

Do not add speculative packages.

Do not change the database schema.

Do not refactor Phase-1 gameplay.

Do not rewrite the architecture simply to make the plan look cleaner.

At the end, report:

1. Phase-1 closure status
2. current repository baseline
3. Phase-2 scope
4. decisions made
5. unresolved decisions
6. files created/updated
7. planned API surface
8. planned schema changes
9. planned UI changes
10. test matrix
11. risks
12. exact verification commands for the implementation phase

Stop after the planning artifacts are complete and internally consistent.