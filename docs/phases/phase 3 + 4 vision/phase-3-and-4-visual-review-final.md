# Phase 3 + Phase 4 — Final Visual Review Receipt (make-ui-not-ai)

> **Status: COMPLETE (post-implementation).** This is the durable record of the Phase 3/4
> visual review and the resulting UI corrections. It complements (and, for UI descriptions,
> supersedes) the earlier phase handoffs: the implementation HEAD was `3d22519…`; the
> visual-review fix commit is `1de4c02…`; the repository HEAD at audit time was
> `4a06987…` (this receipt is a docs-only commit on top of it).
>
> Companion: `docs/phases/phase 3 + 4 vision/phase-3-and-4-multimodal-prompt.md` (the
> review prompt), `docs/contradictions-and-gaps.md` (decisions/deviations log).

## 1. What was reviewed

Any reference to "reviewed" below means the rendered images were supplied as **actual
image inputs and inspected visually** (repeated rounds, 2026-08-30) — never inferred from
DOM measurements alone. DOM measurements were used only to corroborate specific findings
(overflow widths, cell geometry, contrast ratios).

Surfaces and states covered: `/leaderboard` (Today, This month), `/play` (completed and
failed/forfeited results), `/admin` (populated calendar, schedule/edit forms with all
three D5 validation states, same-day replacement panel, day-detail modal, delete
confirmation, gap warning). Viewports: 1440×900 and 390×844; themes: light and dark.

## 2. Screenshot set actually reviewed (21 files, `.cache/ui-shots/phase34/`)

`p3-leaderboard-today-desktop-light|dark`, `p3-leaderboard-today-mobile-light|dark`,
`p3-leaderboard-month-desktop-light`, `p3-play-result-desktop-light`,
`p3-play-result-mobile-light`, `p3-play-failed-desktop-light`,
`p4-admin-desktop-light|dark`, `p4-admin-mobile-light|dark`,
`p4-admin-mobile-light-full`, `p4-admin-schedule-approved|used|rejected`,
`p4-admin-replace-panel`, `p4-admin-replace-mobile-light`, `p4-admin-day-detail`,
`p4-admin-delete-confirm`, `p4-admin-gap-banner`.

All 21 were generated from realistic seeded data (13 players, dense-rank ties, viewer
highlight/callout, 29 finalized days, ACTIVE+locked and SCHEDULED and today-SCHEDULED
states, 28-char stress name) and each was re-rendered after the final meaningful change
before the final verdict.

## 3. Findings (initial review round, severity-classified)

| ID | Sev | Finding |
|---|---|---|
| F3-1 | P2 | FAILED/FORFEITED penalty line `text-xs text-black/50` ≈3.9:1 (sub-AA); it carries sole consequence copy |
| F3-2 | P3 | Month callout used the today caption ("as others finish") |
| F4-1 | P1 | Mobile 390×844 admin: page-level horizontal overflow (`scrollWidth` 456px vs 390), badges/words colliding |
| F4-2 | P2 | "Needs replacement" badge escaped its day cell (desktop) |
| F4-3 | P2 | Gap warning banner styled as neutral info despite warning semantics |
| F4-4 | P2 | Admin primary actions black/white vs product green (two accent systems) |
| F4-5 | P2 | 24px edit/delete icon targets on mobile |
| F4-6 | P3 | Page-title scale drift (admin `text-2xl` vs `text-xl`) |
| F4-7 | P3 | Soft pale delete button for an irreversible action |
| F4-8 | P3 | 10px "HINT"/"Locked" micro-labels at mobile |

## 4. Fixes made

| ID | Fix | Where (commit `1de4c02`) |
|---|---|---|
| F3-1 | `text-sm /65` (≈7.0:1 light / ≈8.3:1 dark) | `src/routes/play/+page.svelte` |
| F3-2 | Period-aware caption via `positionBlockCopy(rank, period).note` | `src/routes/leaderboard/+page.svelte` |
| F4-1/2/5/8 | **User-directed redesign** (§5) — structural, not text fitting | `src/routes/admin/puzzle-calendar.svelte`, `day-detail.svelte` (new) |
| F4-3 | Amber warning treatment | `src/routes/admin/+page.svelte` |
| F4-4 | New `green` Button variant; submit/replace buttons use it | `src/lib/components/ui/button/button.svelte`, `puzzle-form.svelte`, `+page.svelte` |
| F4-6 | `text-2xl` → `text-xl` | `src/routes/admin/+page.svelte` |
| F4-7 | Solid destructive (`bg-destructive`, white text; verified 4.77:1 light / 6.48:1 dark) | `src/routes/admin/+page.svelte` |

## 5. User-directed design changes (rounds 2–3)

1. **Word-only calendar cells + state colors.** Cells show day number + word only; status
   (Scheduled / Live today / Finalized / Needs replacement / Locked) is encoded by cell
   tint (solid green for Live) with a **text legend** below the grid so color is never the
   only indicator; every cell is a `<button>` with a descriptive accessible name.
2. **Click-to-view day detail.** All detail (word, hint, state, lock note) and
   state-appropriate actions (Edit + Delete for future SCHEDULED; "Replace today's
   puzzle" for today SCHEDULED + unlocked; "Schedule puzzle" for empty future; view-only
   for ACTIVE/FINALIZED) live in a day-detail modal. Empty future cells open the schedule
   form directly. The top replacement panel still works as a shortcut.
3. **Full-month mobile grid.** The seven columns now fit 390px (no swipe, no cut columns;
   wider words elide with `truncate` — full word one tap away in the modal).
4. **Leaderboard column headers.** "PLAYER / TIME · GUESSES" (today, yesterday) and
   "PLAYER / AVG TIME · AVG GUESSES · DAYS" (week, month) — a visual hint row, not an
   ARIA row, so row semantics and E2E row counts are unchanged.
5. **Name countermeasures.** Display names are hard-capped at 2–15 chars server-side
   (unit-tested); belt-and-braces row truncation verified with a 28-char stress name
   (desktop renders full; mobile ellipsizes without breaking layout).

## 6. Verification

- Local gates re-run on the final tree: `lint` clean · `svelte-check` 0/0 ·
  `test:unit` 206 passed / 89 skipped · `build` ✔ (+ patched worker) ·
  e2e 17/17 (admin E-A1–E-A7, leaderboard E1/E3/E4/E8/E9/E10, game-flow E5–E7, smoke).
- E2E admin spec updated to the click-cell → modal flow (E-A2, E-A3, E-A4); no assertions weakened.
- Responsive/geometry probes: mobile `/admin` `scrollWidth` 390 = viewport; cells ≈43px;
  ⩾0 badge/state text inside cells; legend present.
- GitHub Actions: run **#26** (after `1de4c02`) reported green for **unit-and-build**,
  **integration**, and **e2e** (external verification; local gates corroborate).

## 7. Final verdict

**READY.**

- No P0/P1/P2 defects remain; the original defect clusters (badge/word overflow, cut
  columns, page-level horizontal scroll, weak hierarchy, busy cells) are resolved.
- P3 residuals accepted (documented trade-offs, not defects): mobile word elision on the
  fitted 7-column grid; FINALIZED tint subtle vs empty in light mode (legend carries the
  state); "Puzzle deleted" toast briefly overlaps the title (existing sonner pattern).
- Not re-reviewed this pass (documented limitation): keyboard/focus-traversal behavior in
  the dialogs (not observable in stills); 320px / intermediate widths.

## 8. Visual verification status

- **Visually verified:** yes — every screenshot in §2 was supplied as an actual image
  input and inspected by the vision model after the final meaningful render, in
  attachment rounds (initial 19, then 20, then 21 files). The final verdict applies to the
  final render, not to earlier states.
- **Functionally verified:** yes (gates in §6), reported separately from visual evidence.

## 9. Phase 5 readiness

Phase 3/4 are closed for the purpose of Phase 5 (security hardening). Domain, schema,
API contract, and secrecy invariants are unchanged by this review; the changes are
UI-only (plus one e2e spec update to the new interaction).
