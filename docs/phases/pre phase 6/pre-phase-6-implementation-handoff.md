# Pre-Phase 6 — Final Implementation Handoff (S1–S6 complete)

> **Naming:** this is the **pre-phase-6** implementation handoff (slices S1–S6: avatar picker + admin answer search). The REAL Phase 6 is **Deployment** — `Architecture-v3.md` §"Phase 6 — Deployment" (Cloudflare Workers + Neon Singapore; real-user latency measurement from the Philippines; evidence-driven optimization; production settlement-cron verification). Nothing in this folder is the Phase-6 (Deployment) phase itself; this handoff prepares it.

Authoritative plan: [`docs/phases/pre phase 6/pre-phase-6-plan.md`](./pre-phase-6-plan.md) (slices S1–S6, binding decisions P6-1…P6-14). Requirements source: `docs/phases/pre phase 6/pre-phase-6-planning-addendum.md`.

## Status

| Slice | Status | Notes |
|---|---|---|
| S1 — avatar data pipeline (group metadata + reproducible generator) | **DONE** | see §1 |
| S2 — avatar picker redesign (search/categories/windowing/a11y) | **DONE** | see §2 |
| S3 — admin answer search API | **DONE** | see §3 |
| S4 — admin answer search UI (combobox in puzzle form) | **DONE** | see §4 |
| S5 — secrecy/security verification | **DONE** | see §5 |
| S6 — documentation + final gates | **DONE (this file)** | receipts in §6 |

No schema change, no new dependency. All work remains **uncommitted in the working tree** (see §7; nothing has been committed for the pre-phase-6 work yet).

## 1. S1 — avatar data pipeline (done, verified)

- `src/server/data/emoji-test.source.txt` — pinned Unicode Emoji 17.0 `emoji-test.txt` (Version 17.0, Date 2025-08-04; provenance header with SHA-256). PUBLIC data.
- `scripts/import-avatar-data.ts` (`bun run avatar-data`) — parses the source, captures `# group:`, keeps fully-qualified only, rejects duplicates/unknown groups, sorts by codepoint, pins **3,944**, renders canonical `src/server/data/avatar-emojis.ts`.
- `src/server/data/avatar-emojis.ts` — `AvatarEmoji = { emoji, label, group }` + `AVATAR_GROUPS` (9 Unicode groups in file order); `isValidAvatarEmoji()` unchanged.
- `scripts/build-avatar-list.ts` — validates `group ∈ AVATAR_GROUPS`; renders `src/lib/shared/config/avatar-emojis.generated.ts` twin.
- `tests/unit/avatar-list.test.ts` — 8 tests (3,944 pin, shape+group, no dup, 9 groups+order, per-group counts, canonical↔twin parity, source-reproducibility, validator rejections).
- Determinism re-verified in S6: regeneration **byte-identical** (sha256 before/after match).

## 2. S2 — avatar picker redesign (done, verified)

- `src/lib/shared/lib/avatar-search.ts` (pure) — normalize/scoring (exact 0 / prefix 1 / substring 2 / -1), deterministic codepoint ordering, `entriesByGroup`, `pageEntries`, `AVATAR_PAGE_SIZE = 96`.
- `src/lib/shared/ui/avatar-picker.svelte` (rewritten, props `{ value, onselect, id }` unchanged) — search input, category Tabs (9 Unicode groups), windowed grid 96/page + "Show more", flat search results with `aria-live` count, Recently Used (localStorage `avatar-recent`, cap 24), roving arrow-key nav, `data-avatar-grid`, internal scroll.
- `tests/unit/avatar-search.test.ts` (8 tests); `tests/e2e/onboarding.spec.ts` / `profile.spec.ts` updated to search-first flows + windowed-count + keyboard pins.
- Perf probe (S2, real browser): default category **97 buttons**, People & Body 97→193 after "Show more"; **total page buttons 109** (vs 3,944 mounted before); no page-level overflow at 390×844.

## 3. S3 — admin answer search API (done, verified)

- **`GET /api/admin/puzzles/search?q=<query>&limit=<n>`** — read-only, registered in `src/server/admin/handlers.ts` (static path next to `/validate`). Inherits `requireAuth → requireAdmin → ADMIN_RATE_LIMITER`; handler adds `authenticatedAdmin()` defense-in-depth. zValidator strict query: `q` trimmed 1..64, `limit` coerced int 1..50 default 20.
- Response 200: `{ results: { word, usedOn }[], total }` — `total = COUNT(*) OVER ()` pre-limit; ordering exact → prefix → substring → alphabetical; used answers expose the puzzle date (admin-only, same data as `/validate`); LIKE-escaped (`\`/`%`/`_` literal); **queries `answer_dictionary` ONLY** (P6-14); hard SQL LIMIT (bounded ≤50).
- `src/server/admin/validation.ts` — `normalizeSearchQuery`, `escapeLikePattern`, `validateSearchParams` (pure; 400 BAD_REQUEST outside bounds; default limit 20).
- `src/server/admin/service.ts` — `AnswerSearchResult`/`AnswerSearchResponse` + `searchAnswers(rawQuery, limit)` (single SQL; read-only — mirrors `validateWord`).
- `src/lib/shared/api/admin.ts` — `adminApi.searchAnswers(q, limit?)` (hc RPC; note: hc serializes query params as strings — the client sends `String(limit)`, the server `z.coerce` parses back) + `adminKeys.search(q)`.
- Tests: unit (route contract 200/400/401/403, default+explicit limit, service-never-reached, pure helpers) + **`tests/integration/admin-search.test.ts` (9 tests)**.

## 4. S4 — admin answer search UI (done, verified)

- **`src/routes/admin/answer-search.svelte`** (new, page-owned; hand-rolled combobox per recorded decision **C6-9** — bits-ui `Combobox` rejected after inspection): input keeps `id="admin-puzzle-word"` + label "Answer word" + `maxlength=64` (existing `admin.spec.ts` `.fill()` typed-entry tests keep working); `role="combobox"` + `aria-expanded`/`aria-controls`/`aria-activedescendant`; `role="listbox"`/`role="option"`; ArrowDown/Up, Enter (select active, preventDefault), Escape (close list only — `stopPropagation` so the modal keeps its Escape-to-cancel), Home/End; closes on focus-out; loading ("Searching…") / error ("Search unavailable — type the full word") / empty ("No matching approved answers") states; used answers marked "⚠ used {date}" but selectable; `createQuery({ queryKey: adminKeys.search(q), enabled: open && q.trim().length >= 1, staleTime: 60_000, placeholderData: (p) => p })` — debounced 300 ms, bounded server results only, previous results kept while pending.
- **`src/routes/admin/puzzle-form.svelte`** — word `Input` replaced by `<AnswerSearch>`; `oninput` still drives D3 hint prefill + the debounced `validate` chip; `onselect` sets the field value, pre-fills the hint, and sets the chip from the **server-computed search metadata** (approved/used) — the final schedule/edit/replace mutation still independently validates (`resolveApprovedAnswer` unchanged).
- **Bugs found and fixed in real-browser verification** (recorded **C6-10**):
  1. Svelte-5 debounce `$effect` read `q` only inside the async `setTimeout` callback → never tracked → `debouncedQuery` froze on the first typed word (browser network probe proved the second request never fired). Fix: read `q` synchronously in the effect body.
  2. The highlight-clamp effect reset a freshly-opened `activeIndex=0` back to `-1` while results were still empty. Fix: clamp only when `results.length > 0`.
- Tests: **e2e E-A8** (click-select + ArrowDown/Enter keyboard select → schedule, hint prefill, approved chip) and **E-A9** (used marker in results, Escape dismisses without clearing, no-match empty state, route-abort error fallback) — all green alongside the existing typed-fill regressions (E-A2/E-A3/E-A5).

## 5. S5 — secrecy/security verification (done)

- `bun run verify:bundle` → **"bundle secrecy OK: 0 non-public pool word(s) absent from 120 build files"** (only the pre-existing expected dev-secret advisory).
- `tests/unit/admin-secrecy.test.ts` (static-embed pin) + `tests/unit/answer-pool-import.test.ts` (subset pin) → green (10/10).
- `tests/e2e/security.spec.ts` — `/api/admin/puzzles/search` added to the unauthenticated **401** matrix and a dedicated non-admin **403** assertion (player cannot enumerate the private dictionary) → green in browser.
- No new dependency (`package.json` diff: only the S1 `avatar-data` script). No answer word in any new static artifact (`avatar-emojis.generated.ts` and `answer-search.svelte` scanned; 0 hits). Search is runtime-only over the admin boundary; `LOCAL_PG`/`Neon` integration tests unchanged.

## 6. Final gate receipts (S6)

All commands run in this handoff's session against the non-production Neon DB (`.env`/`.dev.vars` in the sandbox; CI uses the same mechanism):

| Gate | Command | Result |
|---|---|---|
| Unit suite | `bun test tests/unit` | ✅ 260 pass / 0 fail (34 files, 73,941 expect calls) |
| Type check | `npm run check` | ✅ svelte-check 0 errors / 0 warnings |
| Lint | `npm run lint` | ✅ eslint clean |
| Build | `bun run build` | ✅ built (client+server) |
| Bundle secrecy | `bun run verify:bundle` | ✅ 0 non-public pool words in 120 build files |
| Avatar determinism | `sha256 before/after bun run avatar-list` | ✅ regeneration byte-identical |
| Integration (new, DB) | `bun test tests/integration/admin-search.test.ts` | ✅ 9/9 (tier ordering, usedOn, total, limits, literal `%`/`_`, no-match, read-only, 400s) |
| E2E admin | `npx playwright test tests/e2e/admin.spec.ts` | ✅ 9/9 incl. E-A8/E-A9 |
| E2E security | `npx playwright test tests/e2e/security.spec.ts` | ✅ 8/8 |
| **E2E full suite** | `npx playwright test` | ✅ **44 passed (1.6m)** — all specs (admin, security, onboarding incl. avatar search/windowing/keyboard pins, profile, leaderboard, game flow, csp, smoke) |
| Secrecy pins | `bun test tests/unit/admin-secrecy.test.ts tests/unit/answer-pool-import.test.ts` | ✅ 10/10 |

CI-only (unchanged; run in CI with the advisory-lock mutex): `bun run test:integration` via vitest (needs `DATABASE_URL`) and the modal/e2e suites against fresh `main` — the S3/S4 assertions are already part of the e2e files that CI runs.

## 7. Working-tree changes (uncommitted)

Modified: `package.json` (S1 script), `scripts/build-avatar-list.ts`, `src/lib/shared/config/avatar-emojis.generated.ts`, `src/lib/shared/ui/avatar-picker.svelte`, `src/server/data/avatar-emojis.ts`, `src/server/admin/validation.ts` (S3), `src/server/admin/service.ts` (S3), `src/server/admin/handlers.ts` (S3), `src/lib/shared/api/admin.ts` (S3), `src/routes/admin/puzzle-form.svelte` (S4), `tests/e2e/admin.spec.ts` (E-A8/E-A9), `tests/e2e/security.spec.ts` (S3 assertions), `tests/e2e/onboarding.spec.ts`, `tests/e2e/profile.spec.ts`, `tests/unit/avatar-list.test.ts`, `docs/contradictions-and-gaps.md` (C6-1…C6-10), this handoff, plus the plan + addendum files.
New: `scripts/import-avatar-data.ts`, `src/lib/shared/lib/avatar-search.ts`, `src/server/data/emoji-test.source.txt`, `tests/unit/avatar-search.test.ts`, `tests/integration/admin-search.test.ts`, `src/routes/admin/answer-search.svelte`, `docs/phases/pre phase 6/` (plan, addendum, this handoff).
Not ours: `.idea/material_theme_project_new.xml` (pre-existing modification).

Probe artifacts (`.cache/probe-search.mjs`, `test-results/`) were temporary and are deleted.

## 8. Operations checklist (not code — deployment time)

1. Seed the answer pool per target DB before any deployment that schedules real answers: `DATABASE_URL=<non-prod first> bun run seed:answers` (idempotent; re-validates `answers ⊂ valid guesses`).
2. Deployment `ADMIN_EMAIL` = BOTH `tee.johnlor@gmail.com` and `leaderboardwordle@gmail.com` (existing promotion semantics; no code change).
3. Thresholds weekly 3 / monthly 8 already in `src/server/leaderboard/constants.ts` — no change.
4. CI DB-consuming jobs remain gated to `main` pushes with the advisory-lock mutex — unchanged.
5. No schema migration is required by the pre-phase-6 work — do not add one.

## 9. Explicit invariants (all verified intact)

`answer_dictionary` never bundled / never in non-admin responses (verify:bundle + e2e 401/403); `/api/admin/*` stays behind `requireAuth` + `requireAdmin` + admin limiter; mutations keep `resolveApprovedAnswer` + locks + 23505 mapping (all admin.e2e mutation flows green); avatar validation stays `isValidAvatarEmoji` (onboarding/profile e2e green); avatar selection policy unchanged (3,944 RGI, codepoint order); no schema migration; no new dependency; thresholds/admin emails/datasets unchanged; Phase-5 gates green (security + csp e2e, headers, rate-limit unit tests).