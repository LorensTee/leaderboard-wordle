# Phase 2 — Onboarding, Profile, Application Shell: START PROMPT

Paste the entire contents of this file into a **NEW chat**, starting from the
line below. Do not include this header.

---

You are implementing **Phase 2** (onboarding, profile, application shell) of
Leaderboard Wordle, a private Wordle-style speedrun game for a group of
friends, in the repository at:

`/home/greant/WebstormProjects/leaderboard-wordle`

Branch: `main`

## 0. The repository is the source of truth

Do NOT trust historical handoff prose, commit messages, or the statements in
this prompt as authoritative. The actual repository state outranks every
document. Before any implementation:

1. Read `../../Architecture-v3.md` in full (architecture is authoritative).
2. Read `../../Specifications-v1.md` in full (product spec).
3. Read `../contradictions-and-gaps.md` (decision log — record every new
   Phase-2 decision here).
4. Read `phase-2-plan.md` (the authoritative Phase-2 plan: decisions,
   API contract, test matrix, definition of done).
5. Read `../phase-2-implementation-handoff.md` (state transfer; describes
   the repository as it was at planning time).
6. Inspect the ACTUAL repository: `git log -5`, `git status`, `../../bun.lock`,
   source tree, tests, CI.
7. Verify the planning assumptions: HEAD, shadcn-not-initialized state, empty
   `../../src/server/profile`, missing theme, existing DB columns
   (`avatarEmoji`/`role`/`display_name_normalized`/`onboarding_completed_at`).
8. Run the pre-implementation gates that are practical:

```sh
bun install --frozen-lockfile
bun run lint
bun run check
bun run test:unit
bun run build
bun run types:check   # hermetic: clean clone without .env/.dev.vars (CI condition); locally it fails by design with those files present
bun run verify:bundle
bun run auth:check
```

For DB-dependent verification confirm `DATABASE_URL` points to the dedicated
non-production Neon database, then:

```sh
bun run test:integration
```

9. If any mandatory Phase-1 requirement is broken, fix Phase 1 first and
   record it. Do not paper over failures by weakening tests or gates.
10. If a documentation contradiction blocks a decision, resolve it in
    `../contradictions-and-gaps.md` BEFORE coding.

## 1. Scope — implement exactly this

Phase 2 = onboarding, display name, avatar, profile, theme, and the
application shell, per `phase-2-plan.md`:

1. `/onboarding` flow: display name + curated emoji avatar; atomic completion;
   guards on EVERY application route (`/play`, `/profile`, `/leaderboard`,
   `/admin`); onboarding-complete redirect away from `/onboarding`.
2. Display-name domain: charset `[a-z0-9 _-]` (case-insensitive), 2–15
   canonical characters; `canonicalizeDisplayName` (uniqueness) SEPARATE from
   `moderationKeyForDisplayName` (aggressive leet/confusable/separator key);
   banned-word substring detection against the curated baseline in
   `../../src/lib/shared/config/banned-words.json` (provenance fields inside);
   reserved names (admin, wordle, leaderboard, moderator, system) rejected
   with the same `NAME_TAKEN` 409 as duplicates; generic `NAME_MODERATED`
   message (never reveal the offending word).
3. Avatar: canonical curated list `../../src/server/data/avatar-emojis.ts`
   (`{ emoji, label }[]`, ~24, stable order) + generated client artifact
   `../../src/lib/shared/config/avatar-emojis.generated.ts` via
   `../../scripts/build-avatar-list.ts` (`bun run avatar-list`) with a parity unit
   test and a CI `git diff --exit-code` step (mirror the word-list pipeline).
   Server allow-list validation; picker with a11y labels, 48px+ targets,
   keyboard-native, mobile grid. **Commit and document the EXACT chosen set
   (emoji + label + ordering) in the artifact and the decision log — tuning
   is allowed, an undocumented set is not.**
4. Theme: binary light/dark; `localStorage['theme']`; default from
   `prefers-color-scheme`; pre-paint inline script in `../../src/app.html` setting
   `document.documentElement.dataset.theme`; Tailwind v4 dark variant switched
   to the data attribute via `@custom-variant dark` in `../../src/app.css` (replace
   the current `@media (prefers-color-scheme: dark)` blocks); toggle in header
   and/or profile; verify no FOUC and all existing `dark:` surfaces.
5. Shell: Play | Leaderboard | Profile nav tabs (+ Admin for `role ===
   'admin'`), active-route state, mobile-friendly; Leaderboard and Admin are
   placeholder pages with REAL route guards (auth; admin role for /admin);
   not-onboarded users see a header without tabs; logout in header and on the
   profile page.
6. `GET /api/me` and `PATCH /api/me/profile` (contract in plan §9) registered
   only through `../../src/server/routes.ts` (chained — never break AppType/RPC).
   Services live in `../../src/server/profile`.
7. Admin bootstrap (NG18): promote-only step inside the Hono `authContext`
   middleware keyed on the `ADMIN_EMAIL` binding (`UPDATE ... SET
   role='admin' WHERE id=$id AND role <> 'admin'`, then refresh the context
   user). Never demotes. No-admin recovery is manual (documented).
8. TanStack Query: `['me']` query + profile mutation updating the cache;
   profile/onboarding form with `@tanstack/svelte-form`; theme and form input
   stay LOCAL Svelte state (not TanStack). No optimistic profile mutations.
9. shadcn-svelte: initialize the CLI (interactive preset — handle non-TTY;
   fallback to hand-rolled components only with the deferred-init note
   re-recorded in the decision log) and use Input/Button/Badge (and Dropdown
   Menu/Sheet only if genuinely useful) for the profile/onboarding/shell.
   The board/keyboard/tiles remain custom — do not convert the game UI.
10. Dependency additions: `@tanstack/svelte-form` (record exact resolved
    version + reason in the decision log); shadcn CLI deps as they land.

## 1A. UI implementation skill — make-ui-not-ai

Phase 2 is UI-heavy. Use the installed `make-ui-not-ai` skill from:
https://github.com/nanfei892/ship-it-skills/tree/master/make-ui-not-ai

Treat this skill as the required visual-design and visual-QA workflow for
Phase 2 UI work. It is subordinate to the repository, `../../Architecture-v3.md`,
`../../Specifications-v1.md`, `../contradictions-and-gaps.md`, the Phase-2 plan,
security invariants, and this implementation handoff.

### Required workflow

1. **Establish product truth before styling**
   - inspect the existing landing/game UI, Phase-2 requirements, real content
     shape, responsive constraints, and existing conventions;
   - distinguish verified repository evidence from inherited assumptions.

2. **Choose a direction before completing the UI**
   - for substantial new UI, compare two compact candidate directions
     internally;
   - choose one based on product evidence, usability, implementation cost,
     and product specificity;
   - explicitly reject a generic AI-template direction when appropriate.

3. **Build a representative slice first**
   - prove the direction with a representative shell/onboarding slice before
     completing all Phase-2 surfaces;
   - include realistic content, navigation, primary actions, and enough
     responsive behavior to expose layout problems.

4. **Mandatory early visual checkpoint**
   - run the application;
   - render the representative slice;
   - inspect the actual screenshots, not just capture them;
   - inspect desktop and narrow/mobile viewports;
   - inspect light and dark mode where applicable;
   - critique hierarchy, composition, typography, color, density,
     product-specificity, responsiveness, accessibility, and operability;
   - fix the largest visual weaknesses;
   - render and inspect again.

5. Do not continue to full UI completion until the representative direction
   is visually credible.

6. **Mandatory independent final visual critique**
   - inspect final screenshots without first defending the implementation
     rationale;
   - identify hierarchy, composition, typography, density, color,
     product-specificity, responsiveness, accessibility, and template-like
     problems;
   - fix material issues and render again.

### Mandatory screenshot checkpoints

- **Checkpoint A — shell + onboarding:** desktop + narrow/mobile; light +
  dark; inspect first viewport, navigation, display-name form, avatar picker,
  primary action, focus/target sizing, and responsive composition.
- **Checkpoint B — profile + theme:** desktop + narrow/mobile; light + dark;
  inspect profile controls, avatar picker, theme toggle, feedback states,
  navigation, and persistence behavior.
- **Checkpoint C — final regression:** desktop + narrow/mobile; light + dark;
  inspect onboarding, profile, authenticated shell, placeholders, and the
  existing `/play` surface for unintended Phase-1 regressions.

Store temporary screenshots in `../../.cache/ui-shots` (gitignored).

A screenshot only counts as visual verification when it was actually opened
and inspected. Capturing a screenshot without viewing it does NOT satisfy
the checkpoint.

### Functional vs visual evidence

Report these separately:

- **Functionally verified:** code, interactions, tests, and runtime behavior
  were exercised.
- **Visually verified:** rendered screenshots were actually viewed and
  critiqued after the last meaningful UI change.
- **Not visually verified:** screenshots could not be viewed; report this
  plainly and do not claim visual polish.

### Project-specific constraints

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


## 2. Explicitly out of scope

- Leaderboard content/aggregation (Phase 3) — placeholder page only.
- Admin puzzle scheduling/calendar (Phase 4) — placeholder page only.
- Settlement cron wiring, history/statistics (Phase 3).
- CSP, rate-limiting, ZAP/ASVS hardening (Phase 5).
- Real valid-guess dictionary import (NG16).
- Any schema change or migration (Phase-0 columns already exist).
- Reforming Phase-1 gameplay, lock order, or answer-secrecy mechanics.
- New session/auth systems.

## 3. Non-negotiable invariants

- Better Auth remains the ONLY identity/session system; Hono `authContext`
  authenticates independently; SvelteKit `locals` are never an API
  authorization source.
- The answer and answer pool never reach the browser; `verify:bundle` stays
  green; type-only server imports in client code only.
- `../../src/server/routes.ts` remains the single Hono composition point,
  chain-typed; the bridge stays thin; `../../src/server` never imports SvelteKit
  `RequestEvent` and does NOT import FSD `../../src/lib` (use the parity-tested
  twin for shared display-name logic — or record a documented deviation, never
  a silent one).
- CSRF stays fail-closed; `/api/auth/*` exemptions unchanged.
- Game mutation lock order, `transaction_timestamp()` anchor, NG21 envelope,
  and error sanitization unchanged.
- `auth-schema.generated.ts` is never hand-edited; `auth:check` parity green.
- No React packages; Svelte variants only.

## 4. API contract (from the plan — Hono RPC types are the wire source of truth)

- `GET /api/me` (auth) → `{ user: { id, name, avatarEmoji, role, onboardingCompleted } }`
- `PATCH /api/me/profile` (auth; CSRF applies) — strict Zod body
  `{ displayName?, avatarEmoji? }`, ≥1 field, BOTH required while onboarding
  incomplete; validations per plan §5/D2/D4; responses and error codes per
  plan §9. Ownership implicit (authenticated user).

## 5. UI state machine (from the plan §10)

Shell states: unauthenticated (landing + Continue with Google) ·
authenticated-not-onboarded (minimal header; EVERY application route —
`/play`, `/profile`, `/leaderboard`, `/admin` — redirects to `/onboarding`)
· authenticated-onboarded (full tabs; `/onboarding` → `/play`; `/admin`
additionally role-gated) · loading · validation error (inline) · server
error (toast + retry, input preserved) · mutation success (cache update;
onboarding success navigates to /play) · retry. No silent "it should
probably redirect" — every transition is explicit and tested.

## 6. Test plan (from the plan §12 — all mandatory)

Unit: display-name validation/canonicalization/moderation-key/reserved —
with **table-driven/property-based PARITY across all five behaviors
(charset, whitespace normalization, canonicalization, moderation
transformation, reserved names)**, not a handful of examples; moderation in
BOTH directions — evasions rejected AND realistic benign names containing
ordinary substrings accepted — where the benign-name tests are the acceptance
gate for the SELECTED banned-word dataset (entries too short/ambiguous for
literal substring matching must be excluded or reworded; never weaken the
detector to pass the gate); avatar allow-list + parity; theme helpers;
profile validation branches.
Integration (live Neon): me read/401; onboarding completion persistence;
atomicity (one field while incomplete → 400, nothing written); uniqueness 409
(incl. reserved); moderation rejection (leet/separator variants); avatar
allow-list enforcement; post-onboarding single-field edit; admin bootstrap
(match promotes once, never rewrites, non-match untouched, ADMIN_EMAIL change
never demotes); **Google re-auth name preservation** (after onboarding, a
fresh session resolution leaves user.name/display_name_normalized untouched).
E2E (deterministic fixtures; fixtures gain an `onboarded` flag; no live Google
OAuth in CI): the 14 scenarios in plan §12 (onboarding flow, invalid/banned/
duplicate names, avatar selection, refresh persistence, shell reachability,
profile update, theme persistence across reload, logout, Phase-1 gameplay
reachable, no Phase-1 regressions).

## 7. Visual QA checkpoints (mandatory for this UI phase)

This Phase 2 has explicit visual checkpoints because onboarding, profile, navigation, avatar selection, and theme are user-interface deliverables.
Use the multimodal model's image input at these checkpoints when available. The agent must actually run the app, capture screenshots, inspect them, and fix issues found; do not claim visual validation from source code alone.

### Checkpoint A — shell + onboarding

After the onboarding route and authenticated shell exist, capture and inspect:
- light + dark at approximately `1440x900`
- light + dark at approximately `390x844`
- onboarding layout, display-name field, avatar grid, header/nav fit, active state, focus states, button sizing, spacing, readability, and horizontal overflow

### Checkpoint B — profile + theme

After profile editing and theme switching exist, capture and inspect the same four viewport/theme combinations for:
- profile form and avatar picker
- logout placement
- light/dark consistency across existing Phase-1 surfaces
- dark-mode contrast/readability
- theme persistence and wrong-theme flash on reload

### Checkpoint C — final Phase-2 regression

Before declaring Phase 2 complete, capture final light + dark screenshots at approximately `1440x900` and `390x844` for `/onboarding`, `/profile`, and the authenticated shell, plus `/play` to verify no Phase-1 visual regression.
Inspect responsive behavior, typography, spacing, navigation fit, focus/hover/disabled states, avatar target size, custom-vs-shadcn visual consistency, and overflow.

Keep temporary screenshots in a gitignored location such as `../../.cache/ui-shots`. Do not commit screenshots unless the repository explicitly requires them.

A visual checkpoint complements automated tests; it does not replace unit/integration/E2E/accessibility verification. Any visual issue discovered is a blocker until fixed and the relevant automated checks are re-run.

## 8. Verification before declaring completion (in this order)

```sh
bun install --frozen-lockfile
bun run lint
bun run check
bun run test:unit
bun run build
bun run types:check        # MUST be run in the hermetic condition: fresh clone WITHOUT .env/.dev.vars (CI state). A failure IN THAT CONDITION IS A BLOCKER — do not dismiss a local failure as "expected" without reproducing the clean-checkout condition and recording its result.
bun run verify:bundle
bun run auth:check
bun run word-list
bun run avatar-list
bun run test:integration   # non-prod DATABASE_URL (mandatory)
bun run test:e2e           # DATABASE_URL + BETTER_AUTH_SECRET + ALLOW_DB_WIPE=1
wrangler deploy --dry-run
# Schema-purity proof (must produce NO diff):
git diff --exit-code -- src/server/db/schema.ts src/server/db/migrations
```

Re-run downstream checks if any command changes generated output. Then:
inspect `git status`; scan the tracked tree for secrets/artifacts; commit in
small conventionally-prefixed commits (e.g. `phase2(api): …`,
`phase2(ui): …`, `phase2(test): …`); push to `main` (if you have
credentials) and report the exact commit + CI run you actually verified. If
you cannot push, say so plainly.

## 9. Required final report

1. Phase-2 verdict (`COMPLETE` / `COMPLETE WITH NON-BLOCKING FOLLOW-UPS` /
   `NOT COMPLETE`)
2. Scope delivered (routes, services, components, fixtures, tests)
3. Packages added/changed with exact resolved versions + reasons
4. Test delta (unit / integration / E2E — passing, skipped, failing)
5. API/tx/service verification results (me/profile endpoints, uniqueness,
   moderation, avatar allow-list, onboarding persistence, admin bootstrap)
6. Security/secrecy verification (auth boundary, CSRF, envelope, bundle,
   theme no-FOUC)
7. Command verification (each command above with actual result)
8. Visual QA results for checkpoints A/B/C, including viewport/theme combinations inspected and any fixes made
9. Decision-log updates (exact entries added to
   `../contradictions-and-gaps.md`)
10. Remaining issues (blockers / non-blocking / deferred)

## Final working rules

1. Audit before editing.
2. The repository outranks every handoff claim.
3. Implement ONLY Phase 2; do not start Phase 3/4/5 features.
4. Do not weaken Phase-1 tests, security, or invariants.
5. Record every architectural decision in `../contradictions-and-gaps.md`.
6. No schema changes; no generated-schema hand-edits; `auth:check` green
   (prove it with `git diff --exit-code` on schema + migrations).
7. Client UI validation is UX-only; the server re-validates everything.
8. Do not claim completion without final-state evidence.
9. **Library-guidance honesty:** if the `@tanstack/*` intent/skill tooling
   produces no usable documentation in this environment, do NOT claim or
   imply the library skill was consulted — inspect the installed package's
   actual types/API and the official TanStack documentation instead.