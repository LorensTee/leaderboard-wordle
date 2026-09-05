# Pre Phase 6 Planning Addendum
## Production UX requirements: Answer-word selection and 3,944-entry avatar picker

> **Naming:** this addendum plans the **pre-phase-6** feature work (admin answer search + scalable avatar picker) that lives in `docs/phases/pre phase 6/`. The REAL Phase 6 is **Deployment** — `Architecture-v3.md` §"Phase 6 — Deployment" — and is NOT the subject of this addendum.

You are continuing the pre-phase-6 planning work for `leaderboard-wordle`.

This addendum contains **mandatory product/UX requirements** discovered during review of the completed Pre-Phase-6 work.

Do not treat these as optional polish.

Before implementation, integrate them into the authoritative pre-phase-6 plan, architecture notes where appropriate, test matrix, and definition of done.

---

# 1. Context

Pre-Phase-6 production data finalization is complete.

The repository now contains:

- **12,972 valid guesses** in the public/client-safe dictionary.
- **2,315 approved answers** in the private answer dictionary.
- **3,944 Unicode Emoji 17.0 RGI sequences** in the avatar allow-list.
- Final admin emails:
  - `tee.johnlor@gmail.com`
  - `leaderboardwordle@gmail.com`
- Final leaderboard qualification thresholds:
  - Weekly: **3 completed eligible days**
  - Monthly: **8 completed eligible days**

The existing architecture must remain intact:

- The server is authoritative.
- The valid-guess list may be public and bundled to the client for UX.
- The answer dictionary is private and must never be exposed to the client.
- The avatar allow-list remains server-authoritative with a generated client twin.
- No database schema redesign is implied by these UX changes.

Read the existing Phase-5 and Pre-Phase-6 handoffs before planning.

---

# 2. Requirement A — Searchable admin answer selector

## Problem

The current admin puzzle form uses a free-text answer input with debounced server validation.

That worked with a tiny test dataset, but production now has **2,315 possible answers**.

Admins need an efficient way to find an approved answer for a particular day.

## Required UX

Plan a replacement or enhancement for the current answer-word field so that an admin can:

1. Click/focus the answer selector.
2. Search by typing part or all of a word.
3. See matching approved answers.
4. Select an answer.
5. Continue through the existing hint/scheduling workflow.
6. Still receive clear feedback when an answer is already scheduled/used.

Example:

```text
Answer word

[ Search approved answers... ]

abou
 └─ about
```

The UI may use a combobox/autocomplete pattern or an equivalent accessible searchable selector.

## Critical privacy requirement

**NEVER send the entire 2,315-word answer dictionary to the browser.**

The browser must not receive:

- the complete answer list,
- a generated client answer JSON file,
- the full answer dictionary embedded in JavaScript,
- or another statically recoverable copy.

Searching must happen through the existing authenticated admin/server boundary.

Suggested architecture:

```text
Admin types query
       ↓
authenticated admin request
       ↓
server searches private answer_dictionary
       ↓
bounded result set
       ↓
browser displays matches
```

The exact endpoint/API shape should be determined during pre-phase-6 planning.

## Result requirements

Plan for a bounded result set.

Do not return all 2,315 words for a short query.

The implementation should define:

- minimum query length if appropriate;
- result limit;
- normalization rules;
- ordering;
- handling of exact matches;
- handling of already-used answers;
- behavior when there are no matches;
- behavior on transient network errors;
- keyboard navigation;
- selection state;
- loading state.

The result should remain server-authoritative.

## Existing validation

Do not remove the existing authoritative server-side answer validation.

The search selector is a UX convenience.

The final schedule/edit/replacement mutation must still independently verify the selected answer on the server.

---

# 3. Requirement B — Redesign the avatar picker for 3,944 emoji

## Problem

The old avatar picker was designed for a **24-entry curated set**.

It currently renders the allow-list as a simple grid.

That is no longer appropriate now that the production set contains:

**3,944 fully-qualified Unicode Emoji 17.0 RGI sequences.**

Do not simply render all 3,944 entries as one huge static grid.

## Required UX

Redesign the shared avatar picker used by BOTH:

- onboarding;
- profile → change avatar.

It must support:

- emoji search;
- category navigation;
- efficient rendering;
- selected-state indication;
- keyboard accessibility;
- screen-reader accessibility;
- mobile usability;
- desktop usability.

The two pages must continue using the same reusable picker component rather than duplicating implementations.

## Suggested interaction model

A good target is:

```text
Choose your avatar

[ 🔍 Search emoji... ]

[ Recently Used ]

😀 😃 😄 😁 😂 ...

Smileys & Emotion
[emoji grid]

People & Body
[emoji grid]

Animals & Nature
[emoji grid]

Food & Drink
[emoji grid]

Activities
[emoji grid]

Travel & Places
[emoji grid]

Objects
[emoji grid]

Symbols
[emoji grid]

Flags
[emoji grid]
```

The exact visual design should follow the existing application's design language and Phase-1/2 UI decisions.

Do not introduce a completely unrelated visual system.

## Search behavior

Search should operate over the generated client avatar metadata rather than requiring a server request for every keystroke.

The final client artifact may contain the **3,944 avatar entries**, because these are public profile-avatar choices and are not secret answer data.

Search should ideally support:

- CLDR short name / accessibility label matching;
- case-insensitive matching;
- partial matching;
- exact-match preference;
- sensible result ordering.

Example:

```text
Search: fox

→ 🦊 Fox
```

and:

```text
Search: heart

→ ❤️ Red Heart
→ 🩷 Pink Heart
→ 🧡 Orange Heart
...
```

Do not require users to know Unicode code points.

## Rendering/performance

The implementation must not unnecessarily mount thousands of DOM buttons simultaneously.

Evaluate an efficient approach such as:

- category-based paging;
- virtualized scrolling;
- windowed rendering;
- lazy rendering;
- or another measured strategy.

Choose the simplest approach that remains responsive with 3,944 entries.

Do not introduce a virtualization dependency merely because it sounds sophisticated. Measure/justify the approach.

## Category source

Do not invent arbitrary categories if the Unicode data already supplies useful grouping information.

Use the authoritative Unicode Emoji 17.0 data and its available grouping/property information where practical.

The category organization must remain deterministic.

## Emoji data integrity

Keep:

```text
server canonical allow-list
        ↓
generated client artifact
        ↓
shared AvatarPicker
```

The browser-side picker is a UX mirror.

The server remains authoritative for submitted values.

Do not allow arbitrary Unicode emoji merely because the browser displays them.

---

# 4. Important distinction — word list vs answer list vs avatar list

Do not accidentally conflate these datasets.

## Public valid guesses

**12,972 words**

Purpose:

- local client UX;
- instant guess-shape/list checking;
- server authoritative validation.

Public/client bundle is intentional.

## Private answers

**2,315 words**

Purpose:

- daily puzzle selection;
- admin scheduling;
- answer validation;
- settlement/game logic.

Must remain server/database-side.

Must NOT be bundled into the client.

## Public avatar choices

**3,944 Unicode Emoji 17.0 RGI sequences**

Purpose:

- onboarding;
- profile avatar selection;
- display.

These may be included in the client artifact because they are not secret.

---

# 5. Security requirements

The pre-phase-6 plan must explicitly verify:

### Answer secrecy

The full 2,315 answer dictionary must not be statically recoverable from:

- client JavaScript;
- generated client JSON;
- HTML;
- public assets;
- non-admin API responses.

The existing Phase-5 secrecy gates must remain intact.

### Admin search authorization

The answer-search operation must require the same appropriate admin authorization boundary as existing puzzle-management operations.

Non-admin users must not be able to enumerate or search the private answer dictionary.

### Bounded querying

Prevent an answer-search endpoint from becoming an unintended dictionary-download endpoint.

Define and test:

- maximum query size;
- maximum result count;
- rate-limit behavior;
- authorization;
- response shape.

### Submission authority

Selecting an answer from the UI must never be treated as proof that the mutation is valid.

The final server-side mutation remains authoritative.

---

# 6. Accessibility requirements

Both redesigned controls must remain keyboard-accessible.

## Admin answer selector

Must support:

- Tab focus;
- keyboard navigation through results;
- Enter to select;
- Escape to dismiss;
- correct combobox/listbox semantics if that pattern is used;
- accessible labels;
- selected-state announcement where appropriate.

## Avatar picker

Must support:

- keyboard navigation;
- visible focus;
- accessible names;
- selected-state semantics;
- sufficiently large targets;
- search control accessibility;
- mobile touch usability.

Preserve the existing accessibility standards and tests unless there is a concrete reason to improve them.

---

# 7. Responsive UX

Test the two pickers at both existing project target sizes:

- desktop;
- mobile.

Pay particular attention to:

- modal/panel height;
- scrolling behavior;
- viewport overflow;
- touch target size;
- keyboard behavior;
- search usability;
- category navigation;
- selected-state visibility.

Do not allow the 3,944-entry dataset to create page-level horizontal or uncontrolled vertical layout problems.

---

# 8. Do not change completed architecture without justification

Do NOT redesign:

- authentication;
- authorization;
- database schema;
- game rules;
- leaderboard calculation;
- puzzle state machine;
- Phase-5 security controls;
- valid-guess client/server pipeline;
- private answer pipeline.

These requirements are primarily UX/API integration work.

Any deviation from the existing architecture must be recorded in the pre-phase-6 contradictions/decision log before implementation.

---

# 9. Pre-Phase-6 planning deliverables

Update/create the authoritative pre-phase-6 planning artifacts so they explicitly contain:

### Admin answer search

- UX specification;
- API contract;
- authorization rules;
- bounded result policy;
- privacy analysis;
- client behavior;
- loading/error/empty states;
- tests.

### Avatar picker

- UX specification;
- shared-component design;
- search behavior;
- category behavior;
- rendering/performance strategy;
- accessibility requirements;
- responsive behavior;
- tests.

### Production-data integration

Document that:

- valid guesses = 12,972 public;
- answers = 2,315 private;
- avatars = 3,944 public choices;
- weekly threshold = 3;
- monthly threshold = 8;
- admin emails are `tee.johnlor@gmail.com` and `leaderboardwordle@gmail.com`.

---

# 10. Required planning checks

Before implementation, inspect the existing code for:

- `src/routes/admin/puzzle-form.svelte`
- current admin answer-search/validation APIs
- `src/server/admin/*`
- `answer_dictionary` access patterns
- `src/lib/shared/ui/avatar-picker.svelte`
- `src/server/data/avatar-emojis.ts`
- generated avatar configuration
- onboarding avatar usage
- profile avatar usage
- relevant unit/integration/e2e tests
- Phase-5 secrecy tests
- existing UI conventions

Determine the minimum changes needed.

Do not duplicate functionality that already exists.

---

# 11. Definition of Done additions

The pre-phase-6 deliverable cannot be considered complete until:

### Admin answer selection

- [ ] An admin can efficiently search the 2,315 approved answers.
- [ ] The full private answer list is never sent to the browser.
- [ ] Search results are bounded.
- [ ] Admin authorization is enforced.
- [ ] Final mutation validation remains server-authoritative.
- [ ] Existing scheduling/edit/replacement behavior still works.
- [ ] Duplicate/already-used answer behavior remains correct.
- [ ] Tests cover authorization, privacy, result limits, search correctness, and selection.

### Avatar picker

- [ ] The shared picker supports all 3,944 production avatar entries.
- [ ] Onboarding uses the redesigned picker.
- [ ] Profile avatar editing uses the redesigned picker.
- [ ] Search works against labels/metadata.
- [ ] Categories work consistently.
- [ ] The UI does not mount thousands of unnecessary DOM nodes at once.
- [ ] Desktop and mobile layouts remain usable.
- [ ] Keyboard and screen-reader behavior remain correct.
- [ ] Server-side avatar allow-list validation remains authoritative.
- [ ] Client/server avatar artifacts remain synchronized.

### Regression/security

- [ ] Existing Phase-5 security gates remain green.
- [ ] Answer secrecy remains green.
- [ ] No answer-pool data is accidentally introduced into public artifacts.
- [ ] No schema migration is added merely for these UX changes.
- [ ] Existing CI gates remain intact.

---

# 12. Planning-first rule

Do NOT immediately implement these changes.

First:

1. inspect the current repository;
2. identify the exact existing integration points;
3. update the authoritative pre-phase-6 plan;
4. record any new decisions/contradictions;
5. define the tests;
6. define the implementation slices;
7. only then proceed to pre-phase-6 implementation.

The goal is a **production-ready pre-phase-6 plan**, not a quick UI patch.