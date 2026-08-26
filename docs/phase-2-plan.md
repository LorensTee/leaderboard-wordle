# Phase 2 — Onboarding, Profile, Application Shell: Implementation Plan

> Authoritative planning artifact (2026-08-25). Repo state at planning time:
> `main` @ `2fc1be1`. The implementation chat must re-inspect the repository
> first — this plan describes decisions and contracts, not a frozen snapshot.

## 1. Purpose

Phase 2 converts the Phase-1 authenticated vertical slice into an
application with a real shell and a complete user identity flow:

- new-user onboarding (display name + curated emoji avatar)
- display-name validation, canonicalization, uniqueness, moderation
- profile page (edit display name / avatar / theme / log out)
- light/dark theme switching with pre-paint application and persistence
- main navigation shell (Play / Leaderboard / Profile / Admin-for-admins)
- onboarding completion state gating protected surfaces
- role provisioning + the NG18 admin bootstrap (promote-on-login)
- placeholders for Leaderboard (Phase 3) and Admin (Phase 4) surfaces

## 2. Scope

### In scope

- `/onboarding` flow and its state machine
- `GET /api/me` + `PATCH /api/me/profile` (Hono, NG21 envelope)
- display-name domain: `canonicalizeDisplayName`, `moderationKeyForDisplayName`,
  validation, reserved names, baseline+override banned list
- curated avatar allow-list (server + client artifacts, parity-tested)
- theme provider (localStorage `theme`, pre-paint inline script, no DB)
- app shell: header navigation with active state, role-aware Admin tab
- onboarding guard on EVERY application route (`/play`, `/profile`, `/leaderboard`, `/admin`); onboarding-complete redirect from `/onboarding`
- admin bootstrap (ADMIN_EMAIL promote-on-session, never demote)
- leaderboard/admin placeholder pages (no Phase-3/4 functionality)
- shadcn-svelte CLI initialization + a small set of real components
- TanStack Query `['me']` state + profile mutation; TanStack Form for the profile/onboarding form

### Non-goals (explicitly excluded)

- No leaderboard/history/statistics queries or pages (Phase 3)
- No admin puzzle scheduling/calendar (Phase 4)
- No social features, achievements, groups
- No rate limiting beyond baseline (Phase 5), no CSP (Phase 5)
- No schema changes (Phase-0 columns already exist — see §8)
- No changes to game services, routes composition, bridge, or answer secrecy
- No "system" theme option UI: binary light/dark toggle, system default

## 2A. Visual implementation and QA

Phase 2 UI implementation uses the installed `make-ui-not-ai` skill from
`https://github.com/nanfei892/ship-it-skills/tree/master/make-ui-not-ai`
as the visual-design and visual-verification workflow.

The skill is subordinate to the repository's architecture, product
specification, decision log, Phase-2 plan, security invariants, and
implementation handoff. It must not override product behavior or technical
architecture.

### Required visual workflow

1. **Establish product truth before styling**
   - inspect the existing landing/game UI, Phase-2 requirements, real content
     shape, responsive constraints, and existing design conventions;
   - distinguish verified repository evidence from assumptions.

2. **Choose a direction before completing the UI**
   - for substantial new UI, compare two compact visual directions internally;
   - choose one using product evidence, usability, implementation cost, and
     product specificity;
   - explicitly reject a generic AI-template direction when appropriate.

3. **Build a representative slice first**
   - prove the visual direction with a representative application-shell /
     onboarding slice before completing every Phase-2 surface;
   - include realistic content, navigation, primary actions, and enough
     responsive behavior to expose layout problems.

4. **Pass an early rendered checkpoint**
   - run the application;
   - render the representative slice;
   - inspect the actual screenshots, not just capture them;
   - inspect desktop and narrow/mobile viewports;
   - inspect light and dark mode where applicable;
   - critique hierarchy, composition, typography, color, density,
     product-specificity, responsiveness, accessibility, and operability;
   - fix the largest visual weaknesses and render again.

5. **Complete the real interface only after the representative direction is
   credible.**

6. **Run an independent final visual critique**
   - inspect final screenshots without first defending the implementation
     rationale;
   - identify generic/template-like choices, hierarchy problems, spacing
     issues, responsive failures, readability issues, accessibility issues,
     and product-specificity weaknesses;
   - fix material problems and render again.

### Visual checkpoints

The implementation MUST perform these checkpoints:

- **Checkpoint A — shell + onboarding:** desktop + narrow/mobile; light +
  dark; inspect header/navigation, first viewport, display-name form, avatar
  picker, primary action, focus/target sizing, and responsive composition.
- **Checkpoint B — profile + theme:** desktop + narrow/mobile; light + dark;
  inspect profile controls, avatar picker, theme toggle, feedback states,
  navigation, and persistence behavior.
- **Checkpoint C — final regression:** desktop + narrow/mobile; light + dark;
  inspect onboarding, profile, authenticated shell, placeholders, and the
  existing `/play` surface for unintended regressions.

Temporary screenshots belong in `.cache/ui-shots/` and must not be committed.

A screenshot counts as visual verification only when it was actually opened
and inspected. Capturing a screenshot without viewing it does NOT satisfy the
checkpoint.

Functional and visual verification must remain separate:

- **Functionally verified:** code, interactions, tests, and relevant runtime
  behavior were exercised.
- **Visually verified:** rendered screenshots were actually viewed and
  critiqued after the last meaningful UI change.
- **Not visually verified:** screenshots could not be viewed; report this
  plainly and do not claim visual polish.

### Constraints

- Do NOT let `make-ui-not-ai` override product requirements or architecture.
- Do NOT invent features merely to make the UI more visually interesting.
- Do NOT redesign the Phase-1 Wordle gameplay UI unless a Phase-2 change
  genuinely requires it.
- Reuse the existing Tailwind, Lucide, shadcn-svelte, Svelte, and animation
  conventions where they are sound.
- Do not introduce generic AI-dashboard/template patterns merely because they
  are convenient.
- Preserve accessibility, keyboard operation, visible focus, touch-target
  requirements, reduced-motion behavior, and the existing product contract.


## 3. Current repository baseline (verified at planning time)

| Item | State |
|---|---|
| HEAD | `2fc1be1` (working tree: only user's `docs/prompts/` reorganization + `.idea`) |
| Framework | SvelteKit 2.70.3 / Svelte 5.56.10 (runes) / Vite 8.2.2 / TS 6.0.3 |
| API | Hono 4.13.3 (single composition point `src/server/routes.ts`, chained schema, `hc<AppType>` RPC) |
| Auth | Better Auth 1.7.1 (Google OIDC; `/api/auth/*`); Hono `authContext`/`requireAuth` independent of SvelteKit locals |
| DB | Drizzle 0.45.2 + Neon WebSocket; 8 tables; migration `0000_init.sql` |
| UI | Tailwind v4 CSS-first; custom board/keyboard/tile/timer/header; svelte-sonner; @lucide/svelte; animejs |
| Server state | @tanstack/svelte-query 6.1.42 (`['game','current']` + start/guess mutations, `setQueryData`) |
| shadcn | `shadcn-svelte@1.5.0` installed as devDependency; **NOT initialized** (no `components.json`) |
| Theme | **None** — dark mode is pure `prefers-color-scheme` CSS media queries |
| Onboarding cols | `avatarEmoji` (text, default `'🙂'`), `role` (text, `'player'`), `display_name_normalized` (nullable UNIQUE), `onboarding_completed_at` (nullable) — all present in generated schema + migration |
| Admin bootstrap | **Not implemented** (`ADMIN_EMAIL` exists only as a binding type) |
| Tests | Unit 75 (12 files), integration 24 (4 files), E2E 3 (2 files) |
| CI | unit-and-build → integration (mandatory) → e2e (serially after integration) |

## 4. Authoritative requirements (sources)

1. Architecture-v3 §Phase 2, §Display-name rules, §Onboarding state, §Admin bootstrap,
   §Styling/UI (theme), §Auth ownership, §Core API shape (`GET /api/me`,
   `PATCH /api/me/profile`), §TanStack Form ("profile editing").
2. Specifications-v1 §1 (auth/onboarding), §2 (profile), §3 (nav), §15 (profile/avatar
   spec), §18 (component usage), §23 (open decisions).
3. contradictions-and-gaps NG5 (theme), NG6 (display-name normalization +
   moderation keys), NG9–NG25 (unchanged guards), NC3 (data provenance),
   NG18 (admin bootstrap), M1/M4 (config paths).
4. proposed-repo-tree: `src/lib/shared/config/` (avatar-emojis, banned-words),
   `src/lib/shared/lib/` (canonicalizeDisplayName, moderationKeyForDisplayName),
   `src/lib/app/theme`, `src/server/profile/` (Phase-2 home), `src/routes/play|profile|admin|leaderboard`.

## 5. Decisions made

Architecture decisions are also recorded in `docs/contradictions-and-gaps.md`
(§Phase-2 planning resolutions).

### D1 — Onboarding gating (user-facing)

- A user is **onboarded** when `onboarding_completed_at IS NOT NULL` (and the
  two required fields are set). Detection helper `isOnboarded(user)` server-side.
- **Rule (applies to EVERY authenticated application route):** any
  authenticated user whose onboarding is incomplete is redirected to
  `/onboarding` from `/play`, `/profile`, `/leaderboard`, and `/admin` (SSR
  page guards) — `/onboarding` is the only application surface reachable
  while incomplete. `/admin` additionally enforces the role guard once
  onboarding is complete. The `/onboarding` page redirects to `/play` when
  complete.
- Pre-existing Phase-1 accounts (friends) have no profile → they see onboarding
  once on next login (this supersedes Spec §1's "existing user → app" shortcut
  for accounts without profile fields; documented deviation, no data migration).
- Onboarding is **atomic via one request**: when `onboarding_completed_at IS
  NULL`, `PATCH /api/me/profile` requires BOTH `displayName` and `avatarEmoji`
  in the same request (else `INCOMPLETE_ONBOARDING` 400); nothing is persisted
  until the single successful submit. Post-onboarding edits accept either field.
- Nothing is ever persisted client-side; reload before submit = clean form.

### D2 — Display name rules

- Raw input → trim → collapse internal whitespace runs → validate charset
  `[a-z0-9 _-]` (case-insensitive) → canonical form length **2–15**.
- `canonicalizeDisplayName(s)` (in `src/lib/shared/lib/display-name.ts`):
  lowercase, trim, collapse spaces → uniqueness key stored in
  `display_name_normalized`. UNIQUE constraint is the final guard.
- `moderationKeyForDisplayName(s)` (same module, deliberately separate):
  lowercase → leet/confusable mapping (`4a@ → a`, `3 → e`, `1!i|l → i`,
  `0o → o`, `5$s → s`, `7t → t`, `8 → b`, `9q → q`, …) → strip separators
  `[-_. ]` and duplicates → aggressive detection key.
- Moderation: banned entry (normalized the same way) contained as a substring
  of the moderation key → rejected. Generic user-facing message only
  (`NAME_MODERATED`, "This name is not allowed") — never reveal which word.
  **False-positive guard:** substring matching is intentionally aggressive but
  must be validated against realistic benign names (a short banned term inside
  an ordinary word must NOT block the name) — the curated dataset + rule are
  tested in BOTH directions (evasion rejected, benign substring accepted);
  do not weaken detection to accommodate an edge case. **Dataset rule:** the
  curated banned-word dataset must avoid entries so short or ambiguous that
  literal substring matching systematically produces false positives — the
  benign-name tests are the acceptance gate for the selected dataset (both
  the algorithm and the dataset can fail the gate; fix either, never weaken
  the detector to pass it).
- Reserved names (app-level, `['admin','wordle','leaderboard','moderator','system']`
  canonical comparison) reject with the **same** `NAME_TAKEN` 409 as duplicates.
- Duplicate: pre-check + `UNIQUE(display_name_normalized)` catch (23505) →
  `NAME_TAKEN` 409.
- Error codes added to `ERROR_CODES`: `INVALID_NAME` (400), `NAME_MODERATED` (400),
  `NAME_TAKEN` (409), `INVALID_AVATAR` (400), `INCOMPLETE_ONBOARDING` (400).
- Change-name behavior: allowed at any time via profile PATCH; no cooldown in V1.
- **Name ownership (Google re-auth regression):** after onboarding,
  `user.name` + `display_name_normalized` are application-owned and written
  ONLY by `PATCH /api/me/profile`. A later Google sign-in / session
  resolution must never rewrite them (the better-auth config maps no provider
  profile into user fields; `authContext`'s only user write is the admin role
  promotion). Pinned by a regression test (simulate a later session
  resolution after onboarding → name unchanged).

### D3 — Moderation baseline (user decision)

- Baseline authored directly in `src/lib/shared/config/banned-words.json`:
  `{ "version": "1.0", "source": "curated baseline", "license": "project-owned",
  "importedAt": "2026-08-25", "words": [...] }` (~60–100 common profanities/slurs
  + common embedded evasion variants). Provenance fields live IN the JSON.
- Same list+logic used for onboarding and later profile changes (one code path).

### D4 — Avatar

- Canonical curated list in `src/server/data/avatar-emojis.ts`
  (`readonly { emoji: string; label: string }[]`, ~24 entries, stable order,
  a11y labels), mirrored to a **generated client artifact**
  `src/lib/shared/config/avatar-emojis.generated.ts` via a new
  `scripts/build-avatar-list.ts` + `bun run avatar-list` (mirrors the word-list
  pipeline; parity unit test; CI step `git diff --exit-code` after generation).
- Server allow-list validation `isValidAvatarEmoji()`; DB stores the emoji string
  only. Not a DB table (Spec §15).
- Selection is **required** in onboarding (grid of buttons with
  `aria-label="{label} avatar"`, 48px+ targets, keyboard-native, 6-col grid on
  mobile); profile page offers the same picker.
- **Reproducibility:** the implementation MUST commit and document the exact
  chosen set (emoji + label + ordering) in the artifact header/comment and the
  decision log — the set may be tuned, but never as an undocumented design
  choice.

### D5 — Theme

- Binary `light | dark`; stored as `localStorage['theme']`; default = system via
  `prefers-color-scheme`; explicit choice persists and wins.
- Pre-paint inline script in `src/app.html` `<head>` sets
  `document.documentElement.dataset.theme` before first paint (CSP-compatible
  single script; NG17 note for Phase 5).
- Tailwind v4 dark variant switched from media query to the data attribute via
  `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` in
  `src/app.css`; the existing `@media (prefers-color-scheme: dark)` blocks move
  to `[data-theme='dark']`-driven rules.
- `src/lib/app/theme.ts`: `applyTheme`, `initTheme`, `themeAtom`/store for the
  toggle. Toggle lives in header and/or profile (spec §2: profile switch).

### D6 — Shell/navigation (user decision)

- Tabs **Play | Leaderboard | Profile**, plus **Admin** for `role === 'admin'` —
  all rendered in Phase 2; Leaderboard and Admin are placeholder pages
  ("arrives in a later phase") with **real route guards** (admin page
  server-guarded by role; both require auth).
- Active route state via `aria-current` + underline. Mobile: tabs stay in the
  header (4 short labels fit 390px); no bottom nav in V1.
- Not-onboarded users see a header without tabs (name + avatar only).
- Logout remains in the header; Profile page also offers logout (spec §2).

### D7 — Admin bootstrap (NG18)

- Implemented in the Hono `authContext` middleware as an idempotent
  promote-only step: when `env.ADMIN_EMAIL` is set and the resolved user's
  `email === ADMIN_EMAIL` and `role !== 'admin'`, run
  `UPDATE "user" SET role = 'admin' WHERE id = $id AND role <> 'admin'` and
  refresh the context user. Never demotes; changing `ADMIN_EMAIL` demotes nobody.
- No-admin state → manual operator bootstrap (documented recovery; no in-app fix).
- Page-level lag note: SvelteKit `locals` resolve independently, so the Admin
  tab appears on the next page load after promotion (accepted; documented).

### D8 — TanStack usage boundaries

- New server state in TanStack Query: `['me']` query (`GET /api/me`) + profile
  mutation (`PATCH /api/me/profile`) updating the cache from the response.
- **Local state** (not TanStack): theme (localStorage), form input/validation
  reveal, picker selection, nav/dropdown open state.
- No optimistic mutation for profile saves (server-authoritative response
  updates the cache — same rationale as Phase 1 guesses).
- Play game state unchanged.

### D9 — shadcn-svelte

- Phase 2 initializes the CLI (interactive preset — the implementation chat
  must handle the non-interactive constraint; fallback: hand-rolled components
  with the documented deferral re-recorded). `components.json` + Tailwind v4
  shadcn tokens land in `src/app.css`.
- Real shadcn use: **Input, Button, Badge** (profile/onboarding form, shell),
  **Dropdown Menu** (header user menu if used), **Sheet** only if the 390px
  shell needs it (do not force). Board/keyboard/tiles stay custom (documented).

### D10 — Dependencies

- Add `@tanstack/svelte-form` (architecture intent: profile editing forms).
- shadcn CLI init will add its component deps (bits-ui etc.) — record exact
  resolved versions in the implementation commit.
- No other new runtime dependencies.

## 6. Unresolved decisions (open at planning time)

- Exact emoji set composition/size (Spec §23 open item; D4 proposes ~24 —
  implementation may tune the set, keeping labels + stable order).
- Whether profile editing needs a display-name change frequency guard later
  (deferred; V1 has none).
- Theme toggle placement detail (header vs profile only) — reversible.

## 7. Architecture / data flow

```text
Browser
  ├─ pre-paint theme script (app.html) → data-theme
  ├─ /onboarding | /profile | /play | /leaderboard | /admin (SSR guards)
  └─ hc<AppType> RPC → Hono (/api/me/*)
        ├─ authContext (session + NG18 promote step)
        ├─ requireAuth (already mounted on /api/me/* in Phase 0)
        └─ profile service (validation → user row UPDATE, tx where needed)
Drizzle/Neon: user (name, avatar_emoji, display_name_normalized, onboarding_completed_at, role)
```

## 8. Database impact

**No schema change and no migration.** All columns already exist (generated
schema + `0000_init.sql`): `avatar_emoji` (default `'🙂'`), `role`
(`'player'`), `display_name_normalized` (nullable UNIQUE), `onboarding_completed_at`
(nullable). Do NOT hand-edit `auth-schema.generated.ts`; `auth:check` parity
must stay green. No Better Auth schema regeneration needed.

## 9. API contract (Hono RPC = source of truth)

### GET /api/me — auth required (requireAuth; CSRF n/a for GET)

- Response 200: `{ user: { id, name, avatarEmoji, role, onboardingCompleted } }`
  (no email, no token, no internals). Never exposes `display_name_normalized`?
  — expose `displayNameNormalized` NOT needed; keep minimal.
- TanStack: `createQuery(['me'])`.

### PATCH /api/me/profile — auth required (requireAuth + CSRF apply)

- Body (strict Zod, ≥1 field): `{ displayName?: string; avatarEmoji?: string }`
- Rules (server-side, transaction where the two writes must be atomic):
  1. unknown fields → 400 (strict);
  2. onboarding incomplete → both fields required → else `INCOMPLETE_ONBOARDING` 400;
  3. `displayName`: trim/collapse → charset/length → `INVALID_NAME` 400;
     moderation → `NAME_MODERATED` 400 (generic message);
     reserved/duplicate → `NAME_TAKEN` 409 (UNIQUE catch included);
  4. `avatarEmoji`: curated allow-list → `INVALID_AVATAR` 400;
  5. write `name`, `avatar_emoji`, `display_name_normalized`; set
     `onboarding_completed_at = now()` (DB time) only when first completing;
  6. response 200: `{ user: { id, name, avatarEmoji, role, onboardingCompleted } }`.
- Ownership: implicit (row = authenticated user; no ids in the path).
- Client: mutation updates `['me']` cache.

### Errors

All NG21 envelope; new codes from D2. Internal/sanitized 500s unchanged.

## 10. UI / shell / onboarding flow + state machine

Shell states and behavior:

| State | Behavior |
|---|---|
| unauthenticated | Landing (`/`) with Continue with Google; all tabs hidden |
| authenticated, not onboarded | Header minimal (no tabs); every application route (`/play`, `/profile`, `/leaderboard`, `/admin`) → `/onboarding` |
| authenticated, onboarded | Full tabs; `/onboarding`→`/play` |
| loading (query `['me']` pending) | Shell renders header from SSR locals; profile panel shows skeleton/spinner |
| validation error | Inline field errors; server issues mirrored; safe retry |
| server error | Sonner toast + retry affordance; input preserved |
| successful mutation | Cache update; onboarding success → navigate to `/play` (toast "Welcome!") |
| retry | Buttons re-invoke query/mutation; never a hard redirect loop |

Onboarding page: display-name input (with live client charset/length count),
avatar grid, submit. All validation server-authoritative; client checks are UX
only (reuse `canonicalizeDisplayName`/charset helpers from shared lib).

## 11. Validation/moderation strategy (recap)

`src/lib/shared/lib/display-name.ts`: `validateDisplayName(input)` →
`{ ok: true, canonical, moderationKey } | { ok: false, code }` (pure, unit-tested).
Server service re-runs everything; shared pure functions imported by the server
via a server-side copy? **Boundary note:** `src/server` must not import FSD
`src/lib`. Resolution: the pure display-name module lives in
`src/server/profile/display-name.ts` (authoritative) and the client re-uses a
mirrored implementation in `src/lib/shared/lib/display-name.ts` with a parity
unit test (same pattern as `BOARD_ROWS` vs server constants) — OR the module is
duplicated deliberately with a parity test. Choose the parity-tested twin to
preserve both boundary rules; start server-authoritative.

(Simplification note for the implementer: if duplication is judged worse than
the boundary rule, record the deviation in contradictions-and-gaps and import
the shared module from the server — do NOT decide silently.)

## 12. Test plan (Phase 2)

### Unit (extend `tests/unit/`)

- display-name: charset/length/trim/collapse; canonicalization determinism;
  moderation key leet/confusable/separator cases; banned substring detection;
  reserved names; parity between server and client display-name modules
- **parity coverage is TABLE-DRIVEN and property-based across ALL five
  behaviors — charset, whitespace normalization, canonicalization, moderation
  transformation, reserved-name handling — not a handful of examples**
- moderation runs BOTH directions: obvious/leet/separator evasions rejected AND
  realistic benign names containing ordinary substrings accepted
- avatar: allow-list shape/uniqueness/parity (server artifact ↔ client artifact)
- theme helpers: storage round-trip, default resolution, applyTheme idempotence
- profile service validation branches (pure logic) with fake user input

### Integration (live Neon; extend `tests/integration/`)

- `GET /api/me` authenticated shape; 401 unauthenticated
- PATCH: complete onboarding (both fields) persists
  `display_name_normalized` + `onboarding_completed_at`
- atomicity: incomplete onboarding with one field → 400, nothing written
- uniqueness: second user takes a taken name → 409 (incl. reserved name)
- moderation rejection (banned substring through leet/separators)
- avatar allow-list enforcement (non-curated emoji → 400)
- partial edit post-onboarding (single field OK; completion timestamp unchanged)
- admin bootstrap: user with `ADMIN_EMAIL` match is promoted once; second
  resolution does not rewrite; non-matching email never promoted
- **Google re-auth name preservation:** after onboarding completes, a fresh
  session resolution (simulating a later Google sign-in) leaves
  `user.name`/`display_name_normalized` untouched — OAuth re-auth never
  overwrites the application-chosen name
- re-run NG9/M3/game suites untouched (regression)

### Visual QA checkpoints (multimodal implementation checkpoint)

These are implementation-time visual checkpoints, not replacements for the automated test suite.
Use the multimodal model's image input at each checkpoint when available. The implementation agent MUST run the app, capture screenshots, inspect the rendered result, and fix concrete visual issues before moving on. Do not claim a visual checkpoint passed without inspecting the rendered screenshots.

**Checkpoint A — shell + onboarding**
- Capture light and dark screenshots at approximately `1440x900` and `390x844` after the onboarding route and application shell exist.
- Inspect: overall hierarchy, header/nav fit, active-route state, onboarding spacing, display-name field, avatar grid, focus states, button sizes, overflow, and readability.

**Checkpoint B — profile + theme**
- Capture light and dark screenshots at approximately `1440x900` and `390x844` after profile editing and the theme switch are implemented.
- Inspect: theme consistency across existing Phase-1 surfaces, profile form layout, avatar picker, logout placement, dark/light contrast, and any flash of the wrong theme on reload.

**Checkpoint C — final Phase-2 regression pass**
- Capture final light and dark screenshots at approximately `1440x900` and `390x844` for `/onboarding`, `/profile`, and the normal authenticated shell (plus `/play` to verify Phase-1 UI was not visually regressed).
- Inspect: responsive behavior, horizontal overflow, navigation fit, typography, spacing, focus/hover/disabled states, avatar target size, and consistency between custom and shadcn-svelte components.
- Keep temporary screenshots in a gitignored location such as `.cache/ui-shots/`; do not commit screenshots unless the repository explicitly requires them.

The visual pass should complement, not replace, automated checks for accessibility, contrast, routing, and behavior. When a visual finding is discovered, fix the underlying implementation and re-run the relevant automated tests.

### E2E (deterministic fixture; extend `tests/e2e/`)

1. unauthenticated user reaches Google sign-in
2. authenticated incomplete user is sent to onboarding
3. onboarding completes successfully (name + avatar)
4. invalid display name rejected (client + server path)
5. banned name rejected generically
6. duplicate name rejected
7. avatar can be selected
8. refresh preserves completed onboarding (SSR guard passes)
9. completed user reaches the normal shell (tabs visible)
10. profile updates allowed fields (name change reflected in header)
11. theme switching persists across reload (data-theme + localStorage)
12. logout still works
13. Phase-1 gameplay remains reachable after onboarding (full game flow)
14. no Phase-1 game regressions (smoke + game-flow suites stay green)

Fixture change: `tests/e2e/helpers/auth-fixture.ts` gains an `onboarded`
flag/step (create users with or without profile fields); Phase-1 gameplay
specs use onboarded users. No live Google OAuth in CI.

## 13. CI / verification plan

- CI keeps unit-and-build / integration / e2e serialization; add
  `avatar-list` regeneration + `git diff --exit-code` step and the parity unit
  tests. New integration cases run in the existing mandatory integration job.
- Pre-commit verification (same shape as Phase 1): `bun run lint`, `check`,
  `test:unit`, `build`, `types:check`, `verify:bundle`, `auth:check`,
  `word-list`, `avatar-list`, `test:integration`, `test:e2e`, dry-run.
- Visual QA checkpoints A/B/C in §12 are also mandatory for the implementation
  chat, using screenshots at desktop (~1440x900) and mobile (~390x844) in both
  light and dark themes. Visual findings must be fixed before the Phase-2
  completion verdict; screenshots remain gitignored unless explicitly required.

## 14. Migration plan / rollback / risks

- **No DB migration.** Rollback of Phase 2 = revert commits; nothing persisted
  beyond user-profile rows (safe: columns already exist).
- Risks:
  - shadcn CLI interactive init in a non-TTY CI/sandbox (fallback documented);
  - FSD boundary vs shared display-name duplication (choose parity-tested twin
    or record deviation — never silent);
  - Theme rework touches `dark:` classes app-wide — verify all states incl.
    E2E screenshots after the `@custom-variant` switch;
  - Admin promotion adds a write path on every authenticated request for the
    admin user only — WHERE clause makes it a no-op after first promotion;
  - Phase-1 E2E fixture accounts now need profile fields (fixture update);
  - API response payloads must never include `display_name_normalized` internals
    beyond what the UI needs.

## 15. Definition of done

Visual QA is also required:
- `make-ui-not-ai` workflow used for the representative slice and final
  visual critique;
- Checkpoints A, B, and C completed with actual screenshot inspection;
- desktop + narrow/mobile and light + dark evidence captured where applicable;
- material visual issues fixed before the final verification pass;
- visual verification reported separately from functional verification.



1. Onboarding gating works for new users; `/play`/`/profile` guards correct.
2. Display name rules (charset/length/uniqueness/moderation/reserved) enforced
   server-side and unit/integration-tested; parity-tested shared helpers.
3. Avatar allow-list server-enforced; picker works on mobile+desktop.
4. Theme toggle persists; pre-paint application verified (no FOUC) light+dark.
5. Shell: 4 tabs (+Admin role-gated), active state, mobile OK, placeholders.
6. Visual QA checkpoints A/B/C passed in light+dark at desktop (~1440x900) and mobile (~390x844), with rendered screenshots inspected and no unresolved layout/accessibility/FOUC findings.
7. Admin bootstrap promotes exactly the ADMIN_EMAIL user, never demotes.
8. Full test matrix green (unit/integration/e2e incl. 14 E2E scenarios);
   Phase-1 gates all green (commands in §13).
9. Decision log updated; this plan's open items resolved or re-recorded.