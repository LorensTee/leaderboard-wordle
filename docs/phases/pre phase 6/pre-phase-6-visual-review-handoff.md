# Pre-Phase 6 — UI Visual Review Handoff (for the vision-capable review chat)

> **Status:** screenshots captured + automated layout checks passed. **Pixel-level multimodal inspection has NOT been performed yet** — that is this chat's job. Per the project's visual-verification honesty convention (recorded in `docs/gpt-replies/gpt-luna-reply-v25.md`/`v26.md`), only claim "visually verified" for screenshots you actually opened.

## 1. What changed UI-wise in pre-phase-6 (the surfaces to review)

Two surfaces changed (both committed on `main`, `c9bd92e` + the review-fix commit):

1. **Shared avatar picker** (`src/lib/shared/ui/avatar-picker.svelte`) used by **onboarding** (`/onboarding`) and **profile** (`/profile`) — redesigned for the 3,944-entry Unicode Emoji 17.0 allow-list:
   - CLDR-label search (flat windowed results + `aria-live` result count)
   - 9 Unicode category tabs (Smileys & Emotion … Flags)
   - 96-per-page windowed grid + "Show more"
   - "Recently Used" row (`localStorage` `avatar-recent`, cap 24)
   - selected state (green border + check badge, `aria-pressed`)
   - internal scroll container, dark/light themes, 6/8-col grid
2. **Admin answer combobox** (in the puzzle form used by schedule/edit/replace, routes under `/admin`) — replaces the plain word input:
   - search-as-you-type over the bounded admin API (`GET /api/admin/puzzles/search`)
   - results list with "⚠ used {date}" markers (still selectable)
   - loading / error / empty states; approved/used chip below the input; hint prefill
   - `role="combobox"`/`role="listbox"`/`role="option"` semantics + keyboard nav

A11y/HTML fix already applied prior to capture (from gpt-luna v28 review): the picker's `id` prop is now `labelledby` wired via `aria-labelledby` — the label id (`onboarding-avatar-label` / `profile-avatar-label`) is **no longer duplicated** onto the picker root; the group's accessible name is the "Avatar" label text, `aria-label="Choose an avatar"` remains as fallback.

## 2. The screenshots

- Location: **`.cache/ui-shots/prephase6/`** (gitignored — local files; listed here so every filename is known)
- Manifest: `.cache/ui-shots/prephase6/manifest.json` (file → route/state/viewport/theme)
- Reproducer: `.cache/capture-prephase6.ts` (deterministic session fixture — needs `DATABASE_URL`/`BETTER_AUTH_SECRET` from `.dev.vars`/`.env`, non-production Neon, plus a `vite preview` build)
- Conditions: real browser (Chromium), `vite preview` of the current build, viewports **1440×900 (desktop)** and **390×844 (mobile)**, **light + dark** themes.

Full inventory (32 files):

| File | Shows |
|---|---|
| `onb-default-{desktop,mobile}-{light,dark}.png` | onboarding — default grid (Smileys & Emotion, 96 emoji + Show more) |
| `onb-search-fox-{desktop,mobile}-dark.png` | onboarding — search "fox" (single result) |
| `onb-search-heart-{desktop,mobile}-light.png` | onboarding — search "heart" (139 matches, flat windowed list + count line) |
| `onb-search-nomatch-{desktop,mobile}-dark.png` | onboarding — search "xyzzy" → "0 results" |
| `onb-selected-{desktop,mobile}-light.png` | onboarding — Fox selected (check badge) |
| `onb-recent-{desktop,mobile}-light.png` | onboarding — Recently Used row + grid |
| `onb-people-{desktop,mobile}-light.png` | onboarding — People & Body tab (2,418 entries, Show more) |
| `prof-picker-{desktop,mobile}-{light,dark}.png` | profile — picker with Fox selected |
| `prof-search-panda-{desktop,mobile}-dark.png` | profile — search "panda" |
| `admin-combobox-results-{desktop,mobile}-{light,dark}.png` | admin form — search "abo" results list |
| `admin-combobox-used-{desktop,mobile}-light.png` | admin form — search "ligh", ⚠ used marker |
| `admin-combobox-empty-{desktop,mobile}-dark.png` | admin form — "No matching approved answers" |
| `admin-form-approved-{desktop,mobile}-light.png` | admin form — answer selected + ✓ Approved chip + prefilled hint |

## 3. What has already been verified (automated — do not re-check visually)

These ran in the capture script and passed for every shot:

- no page-level horizontal overflow at 1440×900 and 390×844, light and dark
- mounted button count ≤ 200 in the picker (windowed rendering proof — 100 observed)

Behavioral/accessibility correctness is separately pinned by e2e (full suite 44/44, `tests/e2e/onboarding.spec.ts`, `profile.spec.ts`, `admin.spec.ts` E-A8/E-A9, `security.spec.ts`) — keyboard, ARIA roles, selection, `aria-pressed`, search accessibility. **This pass is about how it LOOKS, not whether it behaves.**

## 4. What the review chat should do

1. Open each PNG in `.cache/ui-shots/prephase6/` (or use the manifest as the index) and inspect at actual size.
2. Judge per surface:

**Avatar picker**
- grid alignment/spacing at 1440 and 390 (6 cols mobile / 8 cols desktop), emoji rendering, tile sizing (≥48px targets on mobile)
- selected-state visibility in both themes (green border + check badge legible on colored backgrounds)
- search results: flat list readability, count line placement, "0 results" state
- Recently Used row placement/spacing; People & Body + Show more affordance
- text contrast in light AND dark (labels, muted hints, live-region count)
- category tab row at 390: wrapping acceptable, no page overflow, tabs legible

**Admin answer combobox**
- input adornment (search icon) alignment; results list contrast in both themes
- ⚠ used marker legibility (amber on light + dark)
- empty state and approved-chip placement; modal layout at 390 (no clipped content, sane scroll)
- overall visual coherence with the existing design language (buttons, inputs, modals)
3. Record a per-surface verdict + a numbered list of concrete issues (with file + expectation), following the Phase 3/4 visual-review format (see `docs/gpt-replies/` for prior examples).
4. Where to publish the result: a new file `docs/gpt-replies/gpt-luna-reply-v29.md` (or the review chat's own reply doc) so it stays with the other review receipts.

## 5. Honesty requirements (project convention)

- Distinguish: screenshots actually captured (done), automated checks (done), screenshots actually opened/inspected (yours to claim ONLY if true).
- If the review finds defects, list them concretely (file, element, expectation) — do not blanket-approve; the pre-phase-6 work is NOT considered visually signed off until this pass returns a verdict.