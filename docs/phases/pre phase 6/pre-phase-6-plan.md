# Pre-Phase 6 — Admin Answer Search & Scalable Avatar Picker: Implementation Plan (AUTHORITATIVE)

> **Naming (read first):** this plan lives in `docs/phases/pre phase 6/` and covers the **pre-phase-6** feature work (admin answer search + scalable avatar picker). The REAL Phase 6 is **Deployment** — `Architecture-v3.md` §"Phase 6 — Deployment" (deploy to Cloudflare Workers + Neon Singapore; measure real latency from Philippines users; optimize only when evidence supports it; production verification of the settlement cron). Inside this folder, every "Phase-6 plan/handoff/implementation" reference means the pre-phase-6 artifact/slice (S1–S6), never the deployment phase. Where this plan says "Phase-6 operational notes" it means operations executed at real Phase-6 (Deployment) time.

Source of requirements: `docs/phases/pre phase 6/pre-phase-6-planning-addendum.md` (mandatory product/UX requirements).
Planning input: `docs/phases/pre phase 6/handoff.md`, `docs/phases/pre phase 6/pre-phase-6-production-data-lock.md`, `docs/phases/pre phase 6/production-data-finalization.md`.
Status: **PLANNING COMPLETE (2026-09-05)** — inspected repository, integration points identified, decisions recorded, tests and slices defined. No implementation has started.
This plan supersedes nothing; it extends the Phase-4 plan (admin) and Phase-2/Pre-Phase-6 work (avatars) with the addendum requirements.

## Table of contents

1. Verified repository state (integration points)
2. Exact scope (pre-phase-6 feature work)
3. Production data constants (finalized, no placeholders)
4. Requirement A — Searchable admin answer selector
5. Requirement B — Scalable shared avatar picker
6. Binding decisions (P6-1 … P6-14)
7. Contradictions / decision log
8. Implementation slices S1–S6
9. Testing strategy
10. Operations / deployment items (non-UI)
11. Risks and mitigations
12. Verification gates (exact commands)
13. Definition of Done
14. Explicit invariants (must not break)
15. Planning verdict

---

## 1. Verified repository state (integration points)

### 1.1 Admin answer input (Requirement A host)

| File | Verified finding |
|---|---|
| `src/routes/admin/puzzle-form.svelte` | Page-owned modal (D2) used by schedule / edit / replace. Answer field = `<Input id="admin-puzzle-word">` labeled "Answer word", `maxlength=64`, `autocomplete=off`, `spellcheck=false`. `onWordInput` drives (a) field value, (b) D3 hint prefill (first letter, until `hintTouched`), (c) 300 ms debounced `adminApi.validate()` → chip states `idle / checking / approved / used(usedOn) / rejected`. On transient error the chip silently resets to `idle`; submit still calls server. No answer data is held client-side. |
| `src/server/admin/service.ts` | `validateWord()` — read-only exact match against `answer_dictionary`, LEFT JOIN `daily_puzzles` for `previouslyUsed`/`usedOn`. `resolveApprovedAnswer()` — normalize + shape assert + dictionary lookup, reused by `schedulePuzzle`, `updatePuzzle`, `replaceTodayPuzzle` (server-authoritative; NOT the UI). `answer_dictionary` = `{ id, word, normalizedWord }` with UNIQUE indexes on both; `daily_puzzles.answer_id` UNIQUE (one use per answer). |
| `src/server/admin/handlers.ts` | Registered under `/api/admin/*`. Existing read/validate endpoints use `zValidator` + `authenticatedAdmin()` (defense-in-depth after the middleware chain). Static `/validate` is registered before `:id` routes. |
| `src/server/routes.ts` | `/api/admin/*` chain: `requireAuth` → `requireAdmin` → `ADMIN_RATE_LIMITER` (Phase-5 S1; binding optional, pass-through when absent). `bodyLimit` 64 KB, 30 s timeout, CSRF for non-GET. |
| `src/lib/shared/api/admin.ts` | Hono RPC (`hc<AppType>`) surface: `adminApi.validate/list/schedule/update/remove/replaceToday`; `adminKeys` family `['admin','puzzles']`. |
| `tests/e2e/admin.spec.ts` | Uses `page.getByLabel('Answer word').fill('below'|'light'|'about')` then submits (typed entry, no selection). `tests/unit/admin-routes.test.ts` covers route guards with a fake service. |

**Answer-secrecy gates (must remain green):** `scripts/verify-bundle-secrecy.ts` (`bun run verify:bundle`), `tests/unit/admin-secrecy.test.ts` (static-EMBED detector: fail at ≥25 distinct quoted pool words per file), the answer-pool subset pin (`tests/unit/answer-pool-import.test.ts`), and the gitignored `scripts/seed/answer-pool.source.txt` (never committed).

### 1.2 Avatar picker (Requirement B host)

| File | Verified finding |
|---|---|
| `src/lib/shared/ui/avatar-picker.svelte` | Single shared component, props `{ value, onselect, id }`. Renders **all** `AVATAR_EMOJIS` (3,944) as buttons — `role="group" aria-label="Choose an avatar"`, per-button `aria-label="{label} avatar"`, `aria-pressed`, `title`, 48px+ targets, 6/8-col grid. Used by onboarding (required) and profile (optional edit); selection is local until form submit. |
| `src/server/data/avatar-emojis.ts` | Canonical server allow-list: `readonly AvatarEmoji[] = { emoji, label }`, 3,944 entries, deterministic codepoint order, `isValidAvatarEmoji()` (server authoritative). **No group/category field exists.** Provenance header: Unicode Emoji 17.0 / `emoji-test.txt` (2025-08-04). |
| `src/lib/shared/config/avatar-emojis.generated.ts` | Client twin generated by `bun run avatar-list` (`scripts/build-avatar-list.ts`: validates non-empty/no-duplicates, renders twin). Parity pinned by `tests/unit/avatar-list.test.ts` (3,944 + canonical↔twin equality) and CI `bun run avatar-list && git diff --exit-code`. |
| Canonical provenance gap | The canonical file was produced by a **one-off script** `.cache/pre-phase-6/gen-avatars.mjs` reading `/tmp/wordle-data/emoji-test.txt` (not in the repo). That script parsed `# group:` / `# subgroup:` headers from the Unicode file but **discarded them**. No group data is recoverable from the committed repo today. |
| `src/routes/onboarding/+page.svelte`, `src/routes/profile/+page.svelte` | Both embed `<AvatarPicker value={...} onselect={...} id="onboarding-avatar-label" / "profile-avatar-label">`; server errors map to `INVALID_AVATAR` ("Pick an avatar from the set"). |
| `src/server/profile/service.ts` | `isValidAvatarEmoji(patch.avatarEmoji)` — server allow-list validation unchanged by this phase. |
| `tests/e2e/onboarding.spec.ts`, `tests/e2e/profile.spec.ts` | Click by name `'Fox avatar'` / `'Panda avatar'`; onboarding test 7 pins keyboard focus + `aria-pressed`. **These break if the default view stops showing Fox/Panda** (both are Animals & Nature, not the first category). |
| UI primitives | `bits-ui@2.16.3` (exports `Combobox`, `Command`, `Tabs`, `Popover`, …), `shadcn-svelte` components (`src/lib/components/ui/{button,input,tabs,badge}`), `@tanstack/svelte-query` + `@tanstack/svelte-form`, `svelte-sonner`. No virtualization library installed. |

### 1.3 Dataset boundaries (do not conflate — addendum §4)

| Dataset | Count | Visibility | Used by |
|---|---|---|---|
| Valid guesses | 12,972 | public client bundle (intentional) | `src/server/data/valid-guesses.generated.ts`, `src/lib/shared/data/valid-guesses.json` |
| Answer pool | 2,315 | **private**, server/DB only | `answer_dictionary` via `bun run seed:answers` (gitignored source) |
| Avatars | 3,944 | public client artifact (intentional) | `avatar-emojis.generated.ts` → picker |

---

## 2. Exact scope (pre-phase-6 feature work)

### 2.1 In scope

1. **Requirement A**: searchable admin answer selector (combobox) for the puzzle form, backed by a new bounded, admin-authorized server search over `answer_dictionary`.
2. **Requirement B**: redesign of the shared `AvatarPicker` for 3,944 entries — search, category navigation, windowed rendering, a11y, responsive.
3. Avatar data pipeline extension: add Unicode group metadata (deterministic, sourced from the authoritative Unicode data) to canonical + generated client artifact, and commit the generator + upstream source for reproducibility.
4. Test/DoD updates required by the above (unit, integration, e2e, secrecy).
5. Real-Phase-6 operational notes (seed the answer pool per target DB, `ADMIN_EMAIL` deployment config) — documented here, executed at Phase-6 (Deployment) time (no code change).

### 2.2 Explicitly OUT of scope (addendum §8 + handoff)

- Authentication, authorization model (existing `requireAuth`/`requireAdmin`/`ADMIN_EMAIL` bootstrap is kept).
- Database schema changes / migrations. **No new tables, columns, or indexes are required** (see P6-6/P6-13).
- Game rules, leaderboard calculation, puzzle state machine, settlement, cron.
- Phase-5 security controls (CSP, rate-limit mechanism, headers) — the new endpoint merely inherits the existing admin class.
- Valid-guess client/server pipeline; private answer pipeline (seed flow unchanged).
- Admin emails / thresholds (product lock: `tee.johnlor@gmail.com`, `leaderboardwordle@gmail.com`, 3/8).
- Re-downloading or re-deriving word lists/emoji data from scratch (P6-5 reuses the pinned Unicode 17.0 source, commits it for reproducibility, does not change the selection policy).
- Any virtualization dependency, new UI framework, or unrelated visual system.

### 2.3 Production data constants (referenced, not re-derived)

- Valid guesses: **12,972** (public).
- Answer pool: **2,315** (private; `2315/2315 ⊂ guesses`).
- Avatars: **3,944** fully-qualified Unicode Emoji 17.0 RGI sequences.
- Weekly threshold: **3** completed eligible days; Monthly: **8** (`src/server/leaderboard/constants.ts`).
- Admin emails: `tee.johnlor@gmail.com`, `leaderboardwordle@gmail.com` (deployment config via `ADMIN_EMAIL`).

---

## 3. Requirement A — Searchable admin answer selector

### 3.1 UX specification

Replace the bare text input in `puzzle-form.svelte` with an accessible combobox while **keeping free typing** (the current debounced chip validation remains the fallback for hand-typed words).

```
Answer word
[ 🔍 Search approved answers…          ]  ← input (id="admin-puzzle-word", label "Answer word")
  ┌──────────────────────────────────────┐
  │ about                    ✓ Approved │  ← option list (bounded, max 20)
  │ above                               │
  │ abode                ⚠ used 2026-09-10 │
  └──────────────────────────────────────┘
✓ Approved answer
```

Behaviors:

- **Trigger**: focus or type in the field opens the list. Selecting an option sets the field value (and keeps the free-text editing capability).
- **Search**: debounced 300 ms (existing pattern) authenticated request; results are bounded; minimum 1 character (trimmed); no request while `q` is empty or only whitespace.
- **Result items**: word, plus inline "already scheduled/used on {date}" marker when the answer is already referenced by a puzzle. Used answers are **not disabled** — edit/replace of the row's own answer must remain possible; the server stays authoritative (existing 409 `ANSWER_ALREADY_SCHEDULED` behavior unchanged).
- **Selection state**: selected option highlighted; field value becomes the exact dictionary word; the D3 hint prefill runs; the existing chip shows `approved` (the word came from the server) or `used` when the server says so.
- **Empty state**: "No matching approved answers" (only after a successful empty response; never for a transient error).
- **Loading state**: inline spinner/“Searching…” in the input adornment; keep previous results visible while pending (no flicker).
- **Error state**: transient network/server error → quiet, non-blocking notice ("Search unavailable — type the full word"); the chip falls back to `idle`; submit-time server validation is unaffected (unchanged).
- **Keyboard**: Tab focus into input; ArrowDown/ArrowUp move through options; Enter selects the highlighted option; Escape closes the list and keeps the typed text; Home/End jump. Combobox/listbox semantics per WAI-ARIA (role, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-selected`, accessible name).
- **Selected-state announcement**: `aria-live="polite"` on the chip region so the approved/used feedback is announced.

### 3.2 API contract

**`GET /api/admin/puzzles/search?q=<query>&limit=<n>`** (new, read-only)

Authorization: inherits `/api/admin/*` → `requireAuth` → `requireAdmin` → admin rate limiter → `authenticatedAdmin()` defense-in-depth. Non-admins: 401/403 as today.

Query parameters (zod, strict):

| Param | Rule |
|---|---|
| `q` | required; after trim `1..64` chars (any input; server normalizes to lowercase; no shape restriction — search is a convenience, shape is enforced at mutation time). Max query size = 64. |
| `limit` | optional; integer `1..50`; default `20`. **Bounded result set — the response never contains more than 50 rows.** |

Response `200`:

```ts
{
  results: { word: string; usedOn: string | null }[]; // usedOn = puzzle_date ISO or null
  total: number; // total matching rows (pre-limit) — admin-only feedback "x of y"
}
```

Errors (standard envelope): `400` invalid/missing `q` or out-of-range `limit`; `401` unauthenticated; `403` non-admin; `429` rate limit (admin class); `408`/`413`/`500` as the platform already defines.

Route registration: `GET /api/admin/puzzles/search` is a static path (no conflict with `GET /api/admin/puzzles` or `PATCH/DELETE /:id`); registered alongside `/validate` before any param route.

### 3.3 Bounded result policy & privacy analysis

- **Never returns the full dictionary**: `LIMIT ≤ 50` is enforced in SQL (not just the client), `total` is a single integer (no words), and `q` is required.
- **Minimum query length 1** is acceptable because (a) results are hard-bounded in SQL, (b) the endpoint is admin-only behind two gates, (c) the admin rate limiter (Phase-5 S1) applies to every request on `/api/admin/*` including this one, and (d) enumeration is already possible for admins via the existing `validate` endpoint; the search endpoint adds no new capability to a non-admin. A stricter dedicated rate-limit binding was considered and rejected (P6-4): no additional enumeration risk for non-admins, and one class keeps the Phase-5 rate-limit surface simple.
- **No static leakage**: the endpoint is runtime-only; no words enter the bundle. `scripts/verify-bundle-secrecy.ts` and the admin-secrecy static-embed pin must stay green (S5 re-runs them).
- **Response shape**: only `word` + `usedOn`; no ids, no ordering metadata that could be abused, no pagination beyond the bounded page.
- **Rate-limit behavior**: inherits `ADMIN_RATE_LIMITER` (binding name unchanged); when the binding is absent (local/tests) the middleware passes through — same contract as all admin routes.

### 3.4 Client behavior

- `src/lib/shared/api/admin.ts`: add `adminApi.searchAnswers(q, limit?)` → `GET` via hc (`api.api.admin.puzzles.search.$get({ query: { q, limit } })`), typed from the server AppType (no hand-declared wire types).
- `adminKeys` gains `search: (q: string) => ['admin','search', q]`; used with `@tanstack/svelte-query` `useQuery({ enabled: q.trim().length >= 1, staleTime: 60_000 })`. Cache per query string; no cross-query leakage.
- `src/routes/admin/answer-search.svelte` (new, page-owned, matching D2): thin component owning the combobox states (loading/error/empty/data), emitting `onselect(word)`.
- `puzzle-form.svelte` integration: the combobox input IS the word field (same `id`/label so existing e2e `.fill()` tests keep working). Typing still runs `onWordInput` → D3 hint prefill + debounced `validate` chip. Selecting an option sets the field value, pre-fills the hint, and marks the chip `approved`/`used` from the server search metadata (chip still re-validated by the existing debounced path; no trust change).
- **Submission authority unchanged**: `onSubmit` still posts to the existing schedule/edit/replace endpoints, which independently call `resolveApprovedAnswer()` + all locks/guards. The combobox is pure UX.

### 3.5 Server implementation notes

- `validation.ts` (pure, unit-testable): `normalizeSearchQuery()` (trim/lowercase), `escapeLikePattern()` (`\` → `\\`, `%` → `\%`, `_` → `\_`), `validateSearchParams(q, limit)` (1..64, 1..50, defaults).
- `service.ts`: `searchAnswers(rawQ: string, limit: number): Promise<{ results: SearchResult[]; total: number }>` — single SQL:
  `answer_dictionary` LEFT JOIN `daily_puzzles` on `answer_id`, `WHERE normalized_word LIKE %escaped% ESCAPE '\'`, `ORDER BY (normalized_word = q) DESC, (normalized_word LIKE escaped% ESCAPE '\') DESC, normalized_word ASC` (exact match → prefix → substring, then deterministic alphabetical), `LIMIT limit`, `COUNT(*) OVER () AS total`.
- Search **must query `answer_dictionary` only** — never `valid-guesses` (12,972 public guesses ≠ approved answers; NG13 only guarantees answers ⊂ guesses, not the reverse).
- No new index: the UNIQUE btree on `normalized_word` serves exact/prefix; substring is a scan over 2,315 rows (single-digit ms at this size) — measured in S3 and documented; no migration.

---

## 4. Requirement B — Scalable shared avatar picker

### 4.1 Data pipeline extension (category source)

**Finding**: Unicode `emoji-test.txt` provides authoritative grouping headers — `# group:` (9 groups: Smileys & Emotion, People & Body, Animals & Nature, Food & Drink, Activities, Travel & Places, Objects, Symbols, Flags) and `# subgroup:` (e.g. `face-smiling`, `hand-fingers-open`). The current canonical file lost them (one-off generator discarded them; source not in repo).

**Decision P6-5**: use the Unicode **group** level (9 categories — matches the addendum's target model exactly); subgroup is deferred (recorded, not needed for the required UX; avoids a second level of nav). Category order = the Unicode file's group order (Smileys & Emotion → … → Flags), pinned as `AVATAR_GROUPS` — **not** first-appearance order in the codepoint-sorted array (which would put Symbols first; see current first entries `#️⃣`/`©️`).

Pipeline (mirrors the word-list pattern):

```
src/server/data/emoji-test.source.txt   ← committed upstream source (pinned Unicode 17.0, sha256 in header)
        ↓ scripts/import-avatar-data.ts  (promoted from .cache/pre-phase-6/gen-avatars.mjs; adds group capture)
src/server/data/avatar-emojis.ts         ← canonical: { emoji, label, group } + AVATAR_GROUPS + isValidAvatarEmoji (unchanged logic)
        ↓ bun run avatar-list (scripts/build-avatar-list.ts)
src/lib/shared/config/avatar-emojis.generated.ts ← client twin: { emoji, label, group } + AVATAR_GROUPS
```

- `AvatarEmoji` gains `group: string` (one of `AVATAR_GROUPS`). Canonical and twin stay byte-parity (CI `git diff --exit-code`).
- `scripts/build-avatar-list.ts` validation extends: non-empty group, group ∈ `AVATAR_GROUPS`, no duplicate emoji/label (unchanged), stable order (unchanged).
- `isValidAvatarEmoji()` unchanged (server validates membership by emoji only — group is client UX metadata; the server never trusts the client).
- The selection policy (fully-qualified RGI only, codepoint order, CLDR labels) is **unchanged** — this is reproducibility + metadata, not a data re-derivation.

### 4.2 UX specification (shared component)

```
Choose your avatar

[ 🔍 Search emoji… ]                 ← input type=search, label "Search emoji", results announced
(Recent: [🦊] [🐼] [😀] …)           ← "Recently Used" row (localStorage, cap 24) — P6-8 enhancement

Smileys & Emotion  People & Body  Animals & Nature  Food & Drink
Activities  Travel & Places  Objects  Symbols  Flags   ← category tabs (existing Tabs components)

[group section]
😀 😃 😄 😁 😂 🥲 …                 ← visible page of the active group (96 per page)
[Show more]                          ← appends the next 96 (windowed rendering)
```

Behaviors:

- **Categories**: 9 Unicode groups via the existing accessible Tabs (`src/lib/components/ui/tabs/*`). Default = first group (Smileys & Emotion). Active group shown; only that group's entries are mounted.
- **Windowed rendering**: within a category (or within flat search results) render **96 per page**, "Show more" appends the next 96 (deterministic; same ordering as the data). No virtualization library (P6-7, justified by measurement §4.3).
- **Search**: client-side over the generated metadata (3,944 public entries — allowed; no per-keystroke server call). Matching on CLDR `label` (case-insensitive, partial, substring); no code-point knowledge needed. Ordering: exact label match → label starts-with → label contains, then alphabetical (codepoint compare — deterministic across environments). Precompute lowercase labels once (module load) — 3,944-entry linear scan per keystroke is sub-ms; no index needed.
- **Search results view**: flat windowed list (same 96/show-more paging) with a small group name per item; clearing the search restores the category view.
- **Selected state**: unchanged — `aria-pressed` + green border + check badge (existing visual language). Selection remains local until form submit; server `isValidAvatarEmoji` remains authoritative.
- **Recently Used** (P6-8): `localStorage` key `avatar-recent` (dedupe, most-recent-first, cap 24); rendered above categories when non-empty; clicking updates it. Low risk; included as enhancement, not DoD-mandatory (see §13).

### 4.3 Rendering / performance strategy (measured, no dependency)

- **Baseline (current)**: 3,944 buttons mounted at once (grid) → ~4k DOM nodes + grid layout cost on mount; onboarding/profile both pay it.
- **Target**: visible DOM ≤ ~200 nodes (96 items + chrome + "Show more"), constant regardless of dataset size. Category tabs + windowed paging is the simplest approach that stays responsive; it needs **no virtualization dependency** (justification: 96-item pages render in single-digit ms; virtualization only pays off when thousands must be visible simultaneously, which the UX does not require — addendum explicitly says choose the simplest measured strategy).
- **Measurement step (S2)**: Playwright probe — before: `document.querySelectorAll('button').length` and mount→interactive time on `/onboarding` with the 3,944-item picker; after: same probe on the new picker. Record both in the implementation handoff; if the new picker is not materially faster or ≤200 nodes, revisit (documented escalation, not silent).

### 4.4 Accessibility & responsive

- **Keyboard**: search input (standard); category tabs (existing Tabs keyboard model); grid: roving `tabindex` (one focusable per visible page), Arrow keys move within the visible window (Left/Right/Up/Down), Home/End jump, Enter/Space select (native button), "Show more" is a focusable button. Focus never lands on unmounted items.
- **Screen reader**: container `role="group" aria-label="Choose an avatar"` (kept — e2e pin), per-button `aria-label="{label} avatar"` (kept — e2e pin), `aria-pressed` (kept), search input labeled, results count announced (`aria-live="polite"` status "12 results"), category tabs labeled.
- **Responsive**: picker lives inside the existing onboarding/profile forms (not a modal on onboarding; profile already uses the form). Ensure the container scrolls internally (max-height + overflow-y-auto) at both breakpoints; grid `grid-cols-6 sm:grid-cols-8` kept (48px+ targets); **no page-level horizontal overflow**. Category tabs may approach mobile: the shipped implementation lets the tabs row WRAP (`flex-wrap` on `TabsList`) — page-level horizontal overflow must never occur (there is no horizontal scroll of the tabs row; wrapping is the accepted behavior).
- Existing a11y standards/tests preserved; only concrete improvements (arrow keys, live regions) are added.

### 4.5 Shared component design

- Keep `src/lib/shared/ui/avatar-picker.svelte` as THE shared component (props `{ value, onselect, id }` unchanged → onboarding/profile pages need no prop changes; only their e2e selectors change because default view changes).
- Extract pure logic to `src/lib/shared/lib/avatar-search.ts` (search scoring/ordering + paging + group helpers) — unit-testable, mirrors `leaderboard-format.ts`/`wordle-ux.ts`.
- The picker stays a grid-of-buttons (not a combobox/listbox): it is a multi-choice visual picker, not a single-select combo; existing ARIA semantics (group + aria-pressed) are the correct, pinned pattern.
- No new dependencies (bits-ui Tabs already installed for category nav).

---

## 5. Binding decisions (P6-1 … P6-14)

| # | Decision | Rationale |
|---|---|---|
| **P6-1** | Answer search = `GET /api/admin/puzzles/search?q&limit` (read-only, query params, strict zod) | Read-only operation; no CSRF surface (GET); matches RPC client patterns; no body-size cost. |
| **P6-2** | Search algorithm: trim+lowercase; `q` 1..64; `limit` default 20, max 50; exact → prefix → substring; deterministic alphabetical | Bounded, predictable UX; substring covers fragment recall; 2,315 rows make substring trivial. |
| **P6-3** | Response `{ results, total }` with `total = COUNT(*) OVER ()` (pre-limit) | One round trip; "x of y" feedback; no unbounded data (only an integer + ≤50 words). |
| **P6-4** | Rate limiting: reuse the existing admin class (`ADMIN_RATE_LIMITER`); no new binding | Endpoint is admin-only behind two gates + hard SQL LIMIT; dedicated binding adds config surface with no non-admin risk reduction. Tested for 429 when binding present. |
| **P6-5** | Avatar categories = Unicode **groups** (9), order = Unicode file order (Smileys & Emotion first), pinned `AVATAR_GROUPS`; subgroup deferred | Authoritative data (addendum §"Category source"); group matches the suggested model; deterministic; avoids inventing categories. |
| **P6-6** | Commit `src/server/data/emoji-test.source.txt` (pinned Unicode 17.0, sha256 + provenance header) + promote the generator into `scripts/import-avatar-data.ts` | Reproducibility: the canonical file currently has no committed generator/source (one-off in `.cache`). Mirrors `valid-guesses.source.txt`. No selection-policy change. |
| **P6-7** | Rendering: category tabs + 96/page windowed "Show more"; NO virtualization dependency | Simplest measured approach; DOM budget ≤ ~200 nodes; measurement gate in S2; addendum explicitly prefers measured simplicity. |
| **P6-8** | "Recently Used" (localStorage, cap 24) included as an enhancement | Shown in the addendum's target model; cheap; reversible; not DoD-mandatory. |
| **P6-9** | Picker semantics unchanged: `role="group"` + buttons + `aria-pressed` (add arrow-key roving nav + live region) | Preserves existing e2e pins and the established pattern; a listbox/option model would be a semantics rewrite for no UX gain. |
| **P6-10** | Answer selector: bits-ui `Combobox` (already installed) for ARIA combobox/listbox + keyboard nav; free typing kept; used answers selectable but marked; chip stays | Existing chip flow + typed fallback preserved (admin.spec `.fill()` tests keep working); server remains authoritative. |
| **P6-11** | Search endpoint returns `usedOn` (admin-only, already exposed by `/validate`) | "Already scheduled/used" feedback per addendum; no new secrecy exposure (admin plane only). |
| **P6-12** | e2e onboarding/profile specs updated to search "fox"/"panda" before clicking; admin.spec typed-fill tests retained | Default category is now Smileys & Emotion; Fox/Panda are no longer on the initial screen. Test update, not product behavior change (recorded). |
| **P6-13** | No schema change, no migration, no new index | Existing UNIQUE btree serves exact/prefix; substring scans 2,315 rows (measured); addendum forbids schema redesign. |
| **P6-14** | Search queries `answer_dictionary` only — never `valid-guesses` | 12,972 guesses ≠ 2,315 approved answers; exposing guesses would be wrong data, and answers must stay private. |

---

## 6. Contradictions / decision log

Full records are appended to `docs/contradictions-and-gaps.md` (Pre-Phase-6 planning section). Summary:

- **C6-1 (recorded, not a defect)**: The canonical avatar file lost Unicode group data (one-off generator discarded it; source absent from repo). Resolution: P6-5/P6-6 — commit source + promoted generator, add `group` to canonical/twin.
- **C6-2 (recorded)**: The e2e selectors (`'Fox avatar'`) depend on the old 24-item curated default view; the production set changes what is on screen by default. Resolution: P6-12 — tests search first; no product-behavior claim.
- **C6-3 (confirmed non-issue)**: `COUNT(*) OVER ()` with `LIMIT` in one query returns the pre-limit total — no second query needed.
- **C6-4 (recorded)**: No deviation from architecture (auth/authz/schema/game/Phase-5 security) — only additive UX/API work plus the avatar metadata pipeline extension, which is additive and justified.
- **C6-5 (recorded)**: The 24-item curated avatar set was already superseded by the 3,944 production set in Pre-Phase-6; this pre-phase-6 work is the UX consequence, not a data change.

---

## 7. Implementation slices

### S1 — Avatar data pipeline (group metadata + reproducibility)

- Commit `src/server/data/emoji-test.source.txt` (Unicode Emoji 17.0, `emoji-test.txt` 2025-08-04, sha256 header).
- Add `scripts/import-avatar-data.ts` (promoted from `.cache/pre-phase-6/gen-avatars.mjs`): parse source → capture `# group:` per entry → emit canonical `avatar-emojis.ts` with `{ emoji, label, group }` + `AVATAR_GROUPS` + unchanged `isValidAvatarEmoji`; fails on count ≠ 3,944 / unknown group / duplicate.
- Extend `scripts/build-avatar-list.ts` validation (group rules) → regenerate client twin (`bun run avatar-list`).
- `package.json`: add `"avatar-data": "bun ./scripts/import-avatar-data.ts"` (mirrors `word-list`/`avatar-list`).
- Tests: `tests/unit/avatar-list.test.ts` — pin 9 groups + `AVATAR_GROUPS` order, every entry's group ∈ set, per-group counts (deterministic), canonical↔twin parity incl. group, 3,944 total. `tests/unit/build-avatar-list.test.ts`-style generator validation for group rules.
- Verify: `bun run avatar-list && git diff --exit-code`, `bun run lint`, `bun run check`, `bun run test:unit`.

### S2 — Avatar picker redesign

- `src/lib/shared/lib/avatar-search.ts` (pure): `searchAvatars(entries, query)` (exact → prefix → substring → codepoint alpha), `pageAvatars(list, pageSize=96)`, group helpers from `AVATAR_GROUPS`.
- `src/lib/shared/ui/avatar-picker.svelte`: category tabs (existing Tabs), windowed grid (96/show-more), search input + flat windowed results, Recently Used row, roving arrow-key nav, live region, internal scroll container.
- Pages: no prop changes; verify onboarding/profile still compile.
- Tests: unit (avatar-search: scoring/ordering/determinism/paging/group mapping; label case-insensitivity; "fox" → Fox; "heart" → multiple hearts; non-matching → empty), e2e updates (P6-12: search before selecting in onboarding/profile; keep aria-pressed pins; add: search → select → submit works on both pages; "Show more" appends; category switch persists selection).
- Perf probe before/after (DOM node count + mount time) recorded in the handoff.

### S3 — Admin answer search API

- `validation.ts`: `normalizeSearchQuery`, `escapeLikePattern`, `validateSearchParams` (pure).
- `service.ts`: `searchAnswers(rawQ, limit)` (single SQL, LEFT JOIN, window count, LIMIT, ordering; query `answer_dictionary` only).
- `handlers.ts`: `GET /api/admin/puzzles/search` (zValidator strict query; `authenticatedAdmin`).
- `src/lib/shared/api/admin.ts`: `adminApi.searchAnswers` + `adminKeys.search`.
- Tests: unit (route guards 401/403, 400 on missing/long q / bad limit, response shape, bounded limit, like-escaping, ordering pure logic); integration (seeded pool: prefix/substring/exact ordering, `usedOn` flags, `total`, limit respected, wildcard input literal, no-match; `answers ⊂ guesses` untouched). Rate-limit 429 covered by the existing rate-limit harness against the admin class.

### S4 — Admin answer search UI

- `src/routes/admin/answer-search.svelte` (page-owned): bits-ui Combobox over `useQuery(adminKeys.search(q))`; states (loading/error/empty/data); used-marker; keyboard/ARIA; emits `onselect(word)`.
- `puzzle-form.svelte`: replace the word input with the combobox (same `id`/label/`maxlength`); keep `onWordInput` (hint prefill + debounced chip) on the input; selection sets value + hint + chip.
- Tests: e2e admin — schedule via search selection (click + keyboard Enter), used answer marker visible, Escape closes, no-match empty state, transient-error fallback (route abort), typed `fill('below')` regression (existing tests keep passing), non-admin blocked (security.spec already covers `/api/admin/*`; add search-specific 403 assertion).

### S5 — Secrecy / security verification

- Re-run `bun run verify:bundle` (0 non-public pool words), `tests/unit/admin-secrecy.test.ts` (static-embed pin), `tests/unit/answer-pool-import.test.ts` (subset pin).
- `tests/e2e/security.spec.ts`: add `/api/admin/puzzles/search` 401 (unauthenticated) + 403 (non-admin) assertions.
- Confirm no answer word appears in any new static artifact (`src/lib/shared/config/avatar-emojis.generated.ts` contains emoji/label/group only — no word data).
- Verify no new dependency is introduced.

### S6 — Documentation + operations handoff

- Update `docs/contradictions-and-gaps.md` (Pre-Phase-6 section), pre-phase-6 implementation handoff (perf numbers, gate receipts), `scripts/seed/README.md` note if needed.
- Record operational checklist (not code): (1) per target DB `DATABASE_URL=<non-production> bun run seed:answers` before any deployment scheduling real answers; (2) deployment `ADMIN_EMAIL` set to BOTH `tee.johnlor@gmail.com` and `leaderboardwordle@gmail.com`; (3) thresholds 3/8 already in code (no change); (4) integration/e2e run against the non-production DB in CI with the updated avatar cases.
- Final gates (§12) run and receipts recorded in the pre-phase-6 implementation handoff.

---

## 8. Testing strategy

### 8.1 Unit (DB-free — `tests/unit/`)

| File | Covers |
|---|---|
| `avatar-search.test.ts` (new) | search scoring/ordering, case-insensitivity, exact/prefix/substring, deterministic codepoint ordering, paging math, group derivation, no-match |
| `avatar-list.test.ts` (extend) | 9 groups + order, per-group counts, group membership, parity incl. group, 3,944 pin |
| `admin-validation.test.ts` (extend) | search param validation (q bounds, limit bounds/defaults), LIKE escaping |
| `admin-routes.test.ts` (extend) | search route: 401/403/400, response shape, strict query, bounded limit, defense-in-depth |
| `admin-secrecy.test.ts` (extend) | static-embed pin still green; search adds no static word data |

### 8.2 Integration (live non-production Neon — `tests/integration/`)

| File | Covers |
|---|---|
| `admin-search.test.ts` (new) | seeded pool search: exact→prefix→substring ordering; `usedOn` for scheduled answers; `total` pre-limit; limit respected; wildcard `%`/`_` literal; no-match; bounded (never > limit) |
| `admin-service.test.ts` (extend) | search through the service seam; read-only (no mutation) |

### 8.3 E2E (Playwright — `tests/e2e/`)

| File | Change |
|---|---|
| `admin.spec.ts` | Add search-selection flows (click + keyboard), used-marker, empty state, error fallback; keep typed `.fill()` regressions |
| `onboarding.spec.ts` | Search "fox" before selecting (default view changed); keyboard test 7 updated (search input + arrow + Enter); keep aria-pressed pin |
| `profile.spec.ts` | Search "fox"/"panda" before selecting; keep aria-pressed pin |
| `security.spec.ts` | Add search endpoint 401/403 |

### 8.4 Regression / build

- `bun run lint`, `bun run check` (0 errors/warnings), `bun run test:unit`, `bun run build`, `bun run verify:bundle`, `bun run avatar-list && git diff --exit-code` (parity), `bun run test:integration`, `bun run test:e2e` (CI, non-production DB, advisory-lock mutex — unchanged).

---

## 9. Operations / deployment items (non-UI, from handoff)

1. **Seed the answer pool** into each target DB before any deployment that schedules real answers: `DATABASE_URL=<non-production first> bun run seed:answers` (idempotent; re-validates `answers ⊂ valid guesses`).
2. **Deployment config**: set `ADMIN_EMAIL` to BOTH `tee.johnlor@gmail.com` and `leaderboardwordle@gmail.com` (existing promotion semantics in `src/server/middleware/auth.ts`; not a code change).
3. **No schema migration** is required by these UX changes (P6-13) — do not add one.
4. CI DB-consuming jobs remain gated to `main` pushes with the advisory-lock mutex (Phase-5 CI fixes) — unchanged.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Combobox breaks the existing typed-entry admin flow (admin.spec `.fill()` tests) | Same `id`/label; free typing preserved; chip fallback; e2e regressions kept |
| Search endpoint abused as a dictionary oracle | Admin-only (2 gates) + SQL LIMIT ≤50 + admin rate limiter + 64-char query cap; secrecy unit tests |
| 3,944-emoji grid perf (current picker already mounts all) | Category tabs + 96/page windowing; measured before/after; no virtualization dep |
| e2e staleness after the default view change | P6-12 test updates in S2; CI gate catches drift |
| Group metadata regen diverges from canonical | Committed generator + source + `git diff --exit-code` parity + pinned counts |
| Unicode data licensing/provenance | Existing provenance header + source file header with terms; no new upstream |
| Answer leakage into any artifact | `verify:bundle` + admin-secrecy pin re-run in S5; search is runtime-only |

---

## 11. Verification gates (exact commands)

```bash
bun run lint                       # eslint clean
bun run check                      # svelte-check 0 errors/warnings
bun run test:unit                  # all unit suites incl. new avatar-search/admin-search
bun run test:integration           # CI, non-production DB, mutex
bun run test:e2e                   # CI, non-production DB, mutex
bun run build                      # production build
bun run verify:bundle              # 0 non-public pool words
bun run avatar-list && git diff --exit-code   # parity + regenerated artifacts committed
bun run test:unit tests/unit/answer-pool-import.test.ts  # answers ⊂ guesses pin
```

Receipts for each gate are recorded in the pre-phase-6 implementation handoff (not substituted by plan text).

---

## 12. Definition of Done

### Admin answer selection

- [ ] An admin can efficiently search the 2,315 approved answers (bounded combobox).
- [ ] The full private answer list is never sent to the browser (runtime-only, SQL-bounded; verify:bundle green).
- [ ] Search results are bounded (≤50, SQL-enforced) and authorized (admin-only, 401/403 tested).
- [ ] Final mutation validation remains server-authoritative (`resolveApprovedAnswer` unchanged).
- [ ] Existing scheduling/edit/replacement behavior still works (typed + selected flows).
- [ ] Duplicate/already-used answer behavior remains correct (marker + server 409 unchanged).
- [ ] Tests cover authorization, privacy, result limits, search correctness, and selection.

### Avatar picker

- [ ] The shared picker supports all 3,944 production avatar entries (search + categories + windowing).
- [ ] Onboarding and profile both use the redesigned shared picker (same component, no duplication).
- [ ] Search works against CLDR labels (case-insensitive, partial, exact-first ordering).
- [ ] Categories work consistently (9 Unicode groups, deterministic order).
- [ ] The UI does not mount thousands of DOM nodes at once (≤ ~200 visible; measured).
- [ ] Desktop and mobile layouts remain usable (internal scroll, no page overflow, 48px+ targets).
- [ ] Keyboard and screen-reader behavior remain correct (roving nav, live region, labels, aria-pressed).
- [ ] Server-side avatar allow-list validation remains authoritative (`isValidAvatarEmoji`).
- [ ] Client/server avatar artifacts remain synchronized (parity + CI diff gate).

### Regression / security

- [ ] Existing Phase-5 security gates remain green (CSP, rate limit, headers, security e2e).
- [ ] Answer secrecy remains green (verify:bundle + admin-secrecy pin).
- [ ] No answer-pool data introduced into public artifacts.
- [ ] No schema migration added for these UX changes (P6-13).
- [ ] Existing CI gates remain intact (incl. DB mutex, main-push gating).

(These are the pre-phase-6 acceptance commitments; each is checked off in the pre-phase-6 implementation handoff with the gate receipts from §11 — the plan itself does not mark them done.)

---

## 13. Explicit invariants (must not break)

1. `answer_dictionary` stays server/DB-only; never bundled, never in non-admin responses.
2. `/api/admin/*` stays behind `requireAuth` + `requireAdmin` + admin rate limiter; search adds no bypass.
3. Final schedule/edit/replace mutations keep their own locks + `resolveApprovedAnswer` + 23505 mapping.
4. Avatar validation stays `isValidAvatarEmoji` on the server; the client twin is a UX mirror only.
5. Avatar selection policy (fully-qualified RGI, codepoint order, CLDR labels, 3,944) is not changed by this phase.
6. No schema migration; no new table/column/index.
7. No new dependency (bits-ui/Tabs already present; no virtualization library).
8. Thresholds (3/8), admin emails, and the 12,972/2,315/3,944 datasets are not re-derived or altered.
9. Existing Phase-5 CI/security gates stay green.

---

## 14. Planning verdict

The repository was inspected at the exact integration points named by the addendum (§10): `puzzle-form.svelte`, admin API/service/validation, `answer_dictionary` access patterns, `avatar-picker.svelte`, `avatar-emojis.ts` + generated twin, onboarding/profile usage, and the relevant unit/integration/e2e/secrecy tests. Both requirements are **additive UX/API work plus one justified metadata-pipeline extension**; no completed architecture (auth, authz, schema, game, leaderboard, Phase-5 security) is redesigned. Decisions and contradictions are recorded (§5/§6 and `docs/contradictions-and-gaps.md`). Slices S1–S6 are ordered so data precedes UI and API precedes client. Pre-phase-6 implementation may proceed from this plan; any deviation must be logged in the Pre-Phase-6 decision log first.
