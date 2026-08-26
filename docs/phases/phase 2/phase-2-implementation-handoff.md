# Phase-2 Implementation Handoff — State Transfer Document

> ⚠️ **HISTORICAL DOCUMENT (pre-implementation baseline).** Written at
> Phase-2 planning time (2026-08-25). **Phase 2 is now IMPLEMENTED and
> VERIFIED** (HEAD `38c158a`, CI run #16 green). Statements in this file
> such as "Phase 2 implementation is next", "`src/server/profile/` is empty",
> "shadcn is NOT initialized", and "no profile/onboarding routes yet"
> describe the PLANNING-TIME repository and are no longer true. The
> authoritative current state is the repository itself plus
> `docs/phases/phase 2/phase-2-implementation-handoff-final.md`.

> State-transfer document for the Phase-2 implementation chat. This describes
> the ACTUAL repository state after Phase-2 planning (2026-08-25) and the
> decisions the implementation must follow. The repository itself outranks
> this document: verify everything before coding.

## 1. Current repository identity

| Item | Value |
|---|---|
| Repository | `https://github.com/LorensTee/leaderboard-wordle` |
| Branch | `main` |
| HEAD (at planning) | `2fc1be1` (`fix(ui): ignore stale sign-in settlements (security-review LOW)`) |
| Phase status | **Phase 1 complete. Phase 2 planning complete (this document + `docs/phase-2-plan.md`). Phase 2 implementation is next.** |
| Working tree | Clean except: user's `` reorganization (in progress), `../../../.idea` IDE file |

Note: the user has reorganized prompts into `` (uncommitted moves:
`phase 1/phase-1-handoff-prompt.md` → `phase 1/phase-1-handoff-prompt.md`, plus
this planning prompt and phase-0 prompts). Keep those moves; new Phase-2
prompt artifacts also belong under ``-consistent paths — the
plan says `docs/phase-2-plan.md`, `phase-2-implementation-handoff.md`,
`docs/phase-2-handoff-prompt.md` (existing convention per the planning prompt;
reconcile with the user's reorganization when committing).

## 2. Phase-1 closure assessment

### Closed

- Full authenticated Wordle vertical slice: start/resume/guess/finalize
  services, Hono endpoints, typed RPC client, board/keyboard/timer/hint UI,
  NG9/M3 concurrency contracts, answer secrecy.
- Post-Phase-1 fixes all verified:
  - `$lib` alias in vitest config (CI-only unit failure) — `01dac72`
  - NG9 lock-order determinism via `waitForLockWaiters` (no sleeps) — `4c981b5`
  - Google OAuth false-error toast fixed (`signInOutcome` keys off the
    response `error` field; verified against better-auth 1.7.1
    `redirectPlugin`/`sign-in/social` sources) — `9fe3df2`
  - sign-in hardening: sanitized generic error message, 8s failsafe,
    stale-settlement protection (attempt counter) — `b49f883`, `2fc1be1`
  - WCAG AA contrast pass on tiles/keys/banner/microcopy — `a640506`
  - regression tests: `../../../tests/unit/sign-in.test.ts` (4), UI audit harness
    (removed after use; screenshots kept in gitignored `../../../.cache/ui-shots`)
- Verified at `2fc1be1`: unit **75** (12 files), integration **24** (4 files),
  E2E **3** (2 files), `check` 0/0, `lint` clean, `build` OK, `verify:bundle`
  0 private words/59 files, `auth:check` OK, `types:check` OK (clean clone).

### Remaining external verification (not blockers)

- Live Google OAuth consent round-trip (manual; fixture covers everything else).
- Push + a fully green GitHub Actions run for the newest commits.

### Intentionally deferred (Phase 3/4/5)

- Leaderboard/history/statistics/settlement cron (Phase 3)
- Admin puzzle scheduling UI (Phase 4)
- CSP / rate limiting / ASVS/ZAP hardening (Phase 5)
- Deployment (Phase 6)
- Real valid-guess dictionary import (NG16, pre-launch)

### Stale documentation (fixed at planning)

- `phase 1/phase-1-implementation-handoff.md` and
  `phase 1/phase-1-handoff-prompt.md` are now **marked historical** at
  the top (Phase 1 complete; do not treat as current state).

## 3. Exact repository state (verified)

### Dependencies (bun.lock — actual)

`@hono/zod-validator 0.9.0`, `@lucide/svelte ^1.34.0`,
`@neondatabase/serverless ^1.1.0`, `@tailwindcss/vite ^4.3.3`,
`@tanstack/svelte-query ^6.1.42`, `animejs ^4.5.0`, `better-auth ^1.7.1`,
`drizzle-orm ^0.45.2`, `drizzle-zod ^0.8.3`, `hono ^4.13.3`,
`svelte-sonner ^1.2.1`, `tailwindcss ^4.3.3`, `zod ^4.4.3`; dev:
`auth 1.7.1` (pinned), `shadcn-svelte ^1.5.0` (NOT initialized), `wrangler
4.125.0`, `vitest 4.1.11`, `@playwright/test ^1.62.1`, etc.
`@tanstack/svelte-form` NOT yet installed (Phase 2 adds it).

### Source tree (Phase-2-relevant)

- `../../../src/server/routes.ts` — single Hono composition point (chained; AppType
  schema must stay chained — do not break RPC typing).
- `../../../src/server/middleware/auth.ts` — `authContext`/`requireAuth` (+ Phase-2
  admin-bootstrap step goes HERE).
- `../../../src/server/middleware/csrf.ts`, `request-id.ts`, `security-headers.ts`,
  `src/server/lib/{errors,origin}.ts` — NG21 envelope; `ERROR_CODES` extended
  only by adding codes.
- `src/server/game/*`, `src/server/puzzle/*`, `src/server/db/*` — Phase-1
  domain; do not modify casually.
- `../../../src/server/profile` — **empty** (Phase-2 home for profile service +
  display-name module).
- `src/lib/app/{auth-client,query-client}.ts`, `src/lib/shared/api/{client,game}.ts`
  (hc RPC), `src/lib/shared/lib/{format-duration,wordle-ux}.ts`,
  `src/lib/shared/ui/{board,keyboard,tile,timer,header}.svelte` (all custom).
- `../../../src/lib/shared/config` — **empty** (Phase-2: avatar-emojis generated twin,
  banned-words.json).
- `../../../src/server/data` — `valid-guesses.source.txt` + `valid-guesses.generated.ts`
  (word-list pipeline; avatar list follows the same pattern).
- Routes: `+layout.server.ts` (locals.user), `+layout.svelte` (shell),
  `+page.svelte` (landing/auth), `play/+page.server.ts` (auth gate) +
  `play/+page.svelte` (game). No `profile/`, `leaderboard/`, `admin/`, or
  `onboarding/` routes yet.

### Auth boundary (unchanged invariants)

- Better Auth owns identity/sessions. Hono `authContext` resolves the session
  independently (cookie fast-path). `requireAuth` guards `/api/game/*`,
  `/api/me/*`, `/api/admin/*` (registered in Phase 0 — `/api/me/*` and
  `/api/admin/*` protection already in place).
- Page guards use SvelteKit `locals` (Phase-2 adds onboarding checks).
- CSRF fail-closed for unsafe methods; `/api/auth/*` exempt.

### DB schema state

No Phase-2 migration needed. Existing user columns: `name`, `email`,
`emailVerified`, `image`, `avatarEmoji` (default `'🙂'`), `role` (default
`'player'`), `display_name_normalized` (nullable UNIQUE),
`onboarding_completed_at` (nullable). All in `auth-schema.generated.ts`
(generated — never hand-edit) + `migrations/0000_init.sql`.

### API architecture

Hono RPC (`hc<AppType>` from `../../../src/lib/shared/api/client.ts`); responses
inferred from server types; `unwrapOk`-style error mapping via
`apiErrorFromResponse`. New `/api/me/*` handlers registered ONLY in
`routes.ts` (or a chainable register function — see Phase-1 pattern
`registerGameRoutes`).

### UI architecture

Tailwind v4 (CSS-first, `../../../src/app.css`), custom components, `data-theme` NOT
yet used (dark via `prefers-color-scheme` media blocks — Phase-2 changes this
to a `data-theme`-driven `@custom-variant dark`). No theme toggle yet.

### Visual QA workflow

Phase 2 implementation must use the installed `make-ui-not-ai` skill from
`https://github.com/nanfei892/ship-it-skills/tree/master/make-ui-not-ai`
for visual direction, representative-slice checkpoints, screenshot-based
critique, and final visual verification.

The skill is subordinate to the repository, architecture, product
specification, decision log, Phase-2 plan, and security invariants.

Required checkpoints:
- **A — shell + onboarding:** desktop/mobile + light/dark where applicable;
- **B — profile + theme:** desktop/mobile + light/dark;
- **C — final regression:** onboarding, profile, shell, placeholders, and
  `/play` regression at desktop/mobile + light/dark where applicable.

Temporary screenshots live under `../../../.cache/ui-shots` and must not be committed.

A screenshot only counts as visual verification when it was actually opened
and inspected. Functional verification and visual verification must be
reported separately. Do not claim visual polish from automated tests,
accessibility scans, DOM measurements, or screenshot capture alone.

Do NOT use the skill to justify redesigning Phase-1 gameplay or inventing
features. Preserve the project's existing stack, behavior, architecture,
and conventions unless a documented Phase-2 decision requires a change.


### TanStack Query

`QueryClient` in `../../../src/lib/app/query-client.ts` (staleTime 30s, no window
focus refetch, retry 1); `['game','current']` query + start/guess mutations
with `setQueryData`; no optimistic mutations (deliberate — server
authoritative). Phase 2 adds `['me']` + profile mutation.

### shadcn-svelte

Installed (`^1.5.0`) but **NOT initialized**: no `../../../components.json`, no
shadcn components anywhere. Phase 2 must initialize the CLI (interactive
preset — plan a non-interactive fallback) and use it for Input/Button/Badge/
Dropdown where genuinely useful; the board/keyboard/tiles stay custom.

## 4. Phase-2 decisions (authoritative — see `phase-2-plan.md` §5 for details)

1. Onboarding gating: ANY authenticated user with incomplete onboarding is
   redirected to `/onboarding` from EVERY application route (`/play`,
   `/profile`, `/leaderboard`, `/admin`; SSR guards; `/onboarding` is the only
   reachable surface while incomplete); `/admin` additionally role-guards
   after onboarding; atomic single-request completion (PATCH requires both
   fields while incomplete); existing accounts onboard once on next login
   (no migration).
2. Display name: charset `[a-z0-9 _-]` (case-insensitive), 2–15 canonical
   chars; `canonicalizeDisplayName` ≠ `moderationKeyForDisplayName`;
   banned substring on the aggressive key → generic `NAME_MODERATED`;
   reserved set `['admin','wordle','leaderboard','moderator','system']` →
   same 409 `NAME_TAKEN` as duplicates; no change cooldown.
3. Moderation baseline: curated list authored in
   `../../../src/lib/shared/config/banned-words.json` with provenance fields.
4. Avatar: canonical `../../../src/server/data/avatar-emojis.ts` → generated client
   artifact + parity test + `avatar-list` script; server allow-list
   validation; required in onboarding; a11y labels; 48px+ targets.
5. Theme: binary light/dark, `localStorage['theme']`, system default,
   pre-paint inline script in `app.html`, `data-theme` attribute,
   `@custom-variant dark` in app.css.
6. Shell: Play | Leaderboard | Profile (+ Admin for admins) tabs, active
   state, placeholders for Leaderboard/Admin with real route guards; hidden
   tabs for not-onboarded users; logout in header + profile.
7. Admin bootstrap: promote-only step in Hono `authContext` keyed on
   `ADMIN_EMAIL` binding; never demotes; no-admin recovery is manual.
8. TanStack: `['me']` query + profile mutation (cache-update, no optimistic);
   theme/form input stay local; TanStack Form for the profile/onboarding form.
9. shadcn: initialize CLI; use for form/shell components only.
10. Dependencies: add `@tanstack/svelte-form`; record shadcn CLI deps.

## 5. Phase-2 invariants (must never be weakened)

- Better Auth remains the only identity/session system; Hono authenticates
  independently; never trust `event.locals` for API authorization.
- Answer secrecy unchanged: `verify:bundle` stays green; no server runtime
  imports in the client bundle (type-only only); today's answer never in
  client payloads.
- `../../../src/server/routes.ts` stays the only composition point; the bridge stays
  thin; `../../../src/server` never imports SvelteKit `RequestEvent` and **does not
  import FSD `../../../src/lib`** (display-name twin with parity test — or record a
  documented deviation).
- **`user.name` + `display_name_normalized` are application-owned after
  onboarding**: only `PATCH /api/me/profile` writes them; Google re-auth /
  session resolution never overwrites them (authContext's only user write is
  the admin role promotion). Regression-tested.
- CSRF stays fail-closed; `/api/auth/*` exemptions unchanged.
- Game services/lock order/expiry contract untouched.
- No schema changes; `auth-schema.generated.ts` never hand-edited;
  `auth:check` parity stays green.
- New error codes only via `ERROR_CODES` (NG21 envelope).
- Client-supplied timing/score/state fields never accepted.
- Every Phase-2 decision recorded in `../../contradictions-and-gaps.md`.

## 6. Phase-2 API contract (summary — full detail in plan §9)

- `GET /api/me` → `{ user: { id, name, avatarEmoji, role, onboardingCompleted } }`
- `PATCH /api/me/profile` (strict Zod: `displayName?`, `avatarEmoji?`; ≥1;
  both required while incomplete) → 200 same user shape; errors:
  `INVALID_NAME` 400, `NAME_MODERATED` 400, `NAME_TAKEN` 409,
  `INVALID_AVATAR` 400, `INCOMPLETE_ONBOARDING` 400, `BAD_REQUEST` 400 (strict).
- Ownership implicit (authenticated user); CSRF/requireAuth already active.

## 7. Files that must not be modified casually

- `../../../src/server/db/auth-schema.generated.ts`, `../../../src/server/db/schema.ts`
- `../../../src/server/routes.ts` (only additive, chained registration)
- `../../../src/server/middleware/auth.ts` (only the documented bootstrap seam)
- `src/routes/api/[...path]/+server.ts`, `../../../src/hooks.server.ts` (auth boundary)
- `src/server/game/*`, `src/server/puzzle/*`, `../../../scripts/verify-bundle-secrecy.ts`,
  `../../../scripts/check-auth-schema.ts`
- `../../../.env`/`.dev.vars` (never commit/print).

## 8. Testing contract (plan §12)

Unit 75 existing + new display-name/avatar/theme/profile suites (display-name
parity TABLE-DRIVEN across charset/whitespace/canonicalization/moderation-
key/reserved; moderation in BOTH directions incl. benign false-positive set);
integration 24 existing + me/profile/onboarding/bootstrap cases on live Neon
plus the Google re-auth name-preservation regression; E2E 3 existing
(fixtures gain an `onboarded` option) + 14 Phase-2 scenarios. Deterministic
auth fixtures only; no live Google OAuth in CI.

## 9. Visual QA contract

Phase 2 is UI-heavy and the implementation chat must use multimodal visual inspection at three checkpoints:

- **A — shell + onboarding:** light/dark at ~1440x900 and ~390x844.
- **B — profile + theme:** light/dark at ~1440x900 and ~390x844.
- **C — final regression:** `/onboarding`, `/profile`, authenticated shell, and `/play` in light/dark at ~1440x900 and ~390x844.

At each checkpoint the agent should run the application, capture screenshots, inspect the rendered UI, fix issues, and re-run relevant automated checks. Temporary screenshots belong in a gitignored location such as `../../../.cache/ui-shots`. Visual validation is required for Phase-2 completion; it does not replace automated tests.

## 10. Known risks

- shadcn CLI interactivity; theme variant switch scope (verify all `dark:`
  surfaces); FSD-vs-shared-module duplication; admin promotion page-level lag;
  fixture accounts must be onboarded for Phase-1 gameplay specs; user's
  uncommitted `` reorganization (reconcile on commit).

## 11. Verification commands (implementation phase)

```sh
bun install --frozen-lockfile
bun run lint
bun run check
bun run test:unit
bun run build
bun run types:check          # MUST be run in the hermetic condition: fresh clone WITHOUT .env/.dev.vars (CI state). A FAILURE in that condition is a blocker — do not dismiss a local failure as "expected" without reproducing the clean-checkout condition and recording its result.
bun run verify:bundle
bun run auth:check
bun run word-list
bun run avatar-list          # NEW Phase-2 script
bun run test:integration     # needs non-prod DATABASE_URL
bun run test:e2e             # needs DATABASE_URL + BETTER_AUTH_SECRET + ALLOW_DB_WIPE for gameplay specs
wrangler deploy --dry-run
```