# Leaderboard Wordle — Product Specifications

> **Implementation gate:** product decisions that supersede wording in this document are tracked in `docs/contradictions-and-gaps.md` (open items NC1–NC3, NG1–NG21, M1–M5). Where this document conflicts with that file, the contradictions file governs until this document is updated.

## Product overview

A private Wordle-style website for friends, focused on daily speedrunning, persistent history, and competitive leaderboards.

The initial navigation has three user tabs:

```text
Play | Leaderboard | Profile
```

A fourth **Admin** tab exists only for users with the `admin` role.

The website must be fully usable on mobile and desktop.

---

# 1. Authentication and onboarding

## Landing page

When a visitor opens the site while unauthenticated, the only authentication action should be:

**Continue with Google**

There is no separate password login/signup system.

## Existing user

```text
Google authentication
  ↓
existing account found
  ↓
automatically logged in
  ↓
application
```

## New user

```text
Google authentication
  ↓
new identity
  ↓
onboarding
  ├── choose display name
  └── choose emoji avatar
  ↓
account created
  ↓
automatically logged in
  ↓
application
```

Display name requirements:

- minimum 2 characters
- maximum 15 characters
- explicit V1 charset: ASCII `[a-z0-9 _-]` (letters, numbers, spaces, underscore, hyphen; case-insensitive)
- two separate normalizations: a canonical form for uniqueness and a separate aggressive moderation key for filtering
- profanity/moderation check required

The server must validate all onboarding/profile changes; the client picker is not trusted.

---

# 2. User profile

The Profile tab allows the user to:

- change display name
- change emoji avatar
- switch between light and dark mode (persisted in `localStorage`, applied before first paint)
- log out

Exact color palette is intentionally undecided for now.

Store the selected avatar as a Unicode emoji string. The application will expose a curated set of approved emojis rather than an unrestricted arbitrary-emoji input.

The curated picker should be version-controlled application data, not a database table. The database stores only the user's selected emoji and the server verifies that submitted values belong to the approved set.

Potential later expansion: add more approved emojis without changing the user model.

---

# 3. Main navigation

## Play

The Play tab is the primary game experience.

## Leaderboard

Shows competitive results.

## Profile

Shows user settings/profile controls.

## Admin

Visible only to users with the `admin` role.

---

# 4. Daily puzzle / Play experience

## Daily schedule

The canonical daily reset timezone is:

**Asia/Manila**

A new puzzle begins at midnight Asia/Manila.

All users receive the same puzzle for the same calendar date.

Do not use each user's local timezone for puzzle identity.

## Pre-game screen

Before the user presses Play, the Wordle board, in-app keyboard, timer, and daily hint are hidden.

The user should not be able to study the hint and think about words before starting the official timed attempt.

Conceptually:

```text
Today's Wordle

[ PLAY ]
```

## Starting a game

When Play is pressed:

1. The server creates/activates the user's daily game if they have not started it.
2. The server generates `started_at`.
3. The server determines the puzzle expiration time.
4. The server returns the allowed hint letter and the game/session data needed by the client.
5. Board, keyboard, clue, and timer become visible.
6. The client begins displaying the timer.

The user may have only **one scored attempt per puzzle/day**.

Starting a puzzle permanently consumes that day's attempt; the user cannot start another fresh attempt after abandoning or completing it.

---

# 5. Daily hint

Every daily puzzle has exactly one stored hint letter.

The hint:

- is exactly one ASCII letter (A–Z)
- is a letter that occurs in the answer
- does not reveal its position
- is validated and stored when the puzzle is scheduled — never at activation; a hint that is not a single letter or does not occur in the answer is rejected at scheduling time
- is revealed only after Play is pressed
- is never shown on the pre-game screen

Example:

```text
Answer: WATER
Hint: W
```

The server must not derive/send the complete answer to the client.

---

# 6. Wordle rules

Follow the standard six-guess, five-letter Wordle-style interaction:

- six maximum guesses
- five-letter guesses
- green = correct letter and position
- yellow = letter exists in the answer but is in the wrong position
- gray = letter not available in the answer according to normal Wordle duplicate-letter rules
- game ends immediately when solved
- game ends as FAILED after six unsuccessful valid guesses

The exact duplicate-letter evaluation logic should follow standard Wordle behavior and be implemented server-side.

---

# 7. Keyboard

Use an in-app keyboard on **all devices**, including desktop.

On desktop, the physical keyboard is an additional input method.

The on-screen keyboard should track letter state from submitted feedback:

```text
unused
present/yellow
correct/green
absent/gray
```

Higher-confidence states should not be downgraded by weaker later feedback.

---

# 8. Valid guesses and answer words

There are two separate word sets.

## Approved answer list

Words that are allowed to become daily answers.

This list is stricter than the valid-guess list and must remain server-side because it may contain future answers.

## Valid-guess list

Words that players are allowed to submit.

It may contain words that are valid guesses but are never selected as daily answers.

The relation is:

```text
approved answers ⊂ valid guesses
```

Not every five-letter English word is automatically a valid guess.

### Client validation

In V1, ship the valid-guess dictionary to the client for instant local validation and UI feedback.

The browser should avoid sending guesses that are clearly not in the dictionary.

### Server validation

The server must always re-check the guess against its authoritative valid-guess dictionary. Client validation is only a performance/UX optimization.

An attacker must not be able to bypass the UI and submit arbitrary words directly to the API.

### Answer secrecy

The current answer and future answer pool must never be included in the client bundle, page data, or public repository.

The client receives only:

- the hint letter
- submitted-guess feedback
- other non-secret game state

---

# 9. Timer

The timer is a central competitive feature.

## Authoritative timestamps

The server creates:

```text
started_at
completed_at
```

and computes:

```text
completion_time_ms = completed_at - started_at
```

The client-side timer is **display only**.

It must never be trusted as the official result.

Do not accept client-provided start time, finish time, or completion duration.

## Continue behavior

If the player leaves, reloads, or closes the page and later returns before the daily reset, they can continue the active game.

The timer does not pause.

When the player returns, the displayed time is reconstructed from the authoritative server `started_at`.

A player therefore gains no extra thinking-time advantage by leaving the website.

## Daily expiration

When the next Asia/Manila daily reset is reached, an unfinished active game automatically becomes **FORFEITED**.

There is no manual forfeit button.

The maximum theoretical duration is just under 23:59:59 for a game started immediately after the daily reset.

---

# 10. Game result states

A daily game has exactly one final status among:

### COMPLETED

The player solved the puzzle within six valid guesses.

Stores:

- `completion_time_ms`
- `guess_count`
- `completed_at`

### FAILED

The player used all six valid guesses without solving the puzzle.

A failed game must receive the same competitive penalty treatment as a forfeit. Its very short actual elapsed time must **not** give the player an artificially excellent leaderboard score.

Raw facts are retained for history/statistics.

### FORFEITED

The player started the game but did not complete it before the daily reset.

### MISSED

The player never started the day's game.

MISSED is a derived state — the absence of a game row for a finalized puzzle — not a stored status. No game row is created for players who never started. MISSED, FAILED, and FORFEITED are distinct final states for history/statistics, but all three are penalized for multi-day leaderboard computation.

---

# 11. Non-completion penalty

For leaderboard aggregation across multiple days:

```text
COMPLETED → actual completion time + actual guesses
FAILED    → finalized daily penalty + 6 guesses
FORFEITED → finalized daily penalty + 6 guesses
MISSED    → finalized daily penalty + 6 guesses
```

The penalty time is:

```text
that day's final average completed-game finish time + 20 minutes
```

The average is calculated **only after the puzzle period ends**, because the completed average can change during the day. The daily penalty is then frozen for historical leaderboard calculations.

If zero players completed the puzzle:
```text
average_completion_time_ms = NULL
non_completion_penalty_ms = NULL
```
and the entire puzzle/day is excluded from multi-day calculations. The puzzle row remains in the database.

Store the raw game status and actual timestamps/guess count; never overwrite raw data with the penalty value. In particular:
- COMPLETED: `completed_at` and `completion_time_ms` are populated.
- FAILED: `completed_at = NULL`, `completion_time_ms = NULL`, `guess_count = 6`.
- FORFEITED: `completed_at = NULL`, `completion_time_ms = NULL`, `guess_count` is the actual number of valid guesses made.
- MISSED: no game row is stored (derived state). Aggregation placeholder only: `started_at = NULL`, `completed_at = NULL`, `completion_time_ms = NULL`, `guess_count = 0`.

Today and Yesterday leaderboards exclude all non-completed results.

---

# 12. Leaderboards

The Leaderboard tab shows the top 10 ranks for:

- Today
- Yesterday
- This week
- This month

Top ranks use a dense-rank cutoff (`rank <= 10`): ties may show more than 10 players. The response includes the viewer's own rank alongside the top entries, so the result screen can show "Current position" at any rank.

## Time semantics

### Today

Only the current Asia/Manila day's completed results.

### Yesterday

Only the previous Asia/Manila day's completed results.

### This week

All daily puzzles from the start of the current week (Monday — ISO-8601, a product constant `WEEK_START = MONDAY` in the Asia/Manila calendar) through today. For the active current day, only COMPLETED games contribute until the puzzle finalizes.

### This month

All daily puzzles from the first day of the current month through today. For the active current day, only COMPLETED games contribute until the puzzle finalizes.

## Aggregation

For a single-day period, display actual completed result values.

For multi-day periods:

```text
average completion/penalty time
average guess count
```

Only finalized puzzle-days contribute penalty results. A puzzle with zero completed players contributes nothing. The current active day contributes only its COMPLETED games until it finalizes; current-day FAILED/FORFEITED/MISSED results are ignored until finalization.

Raw game records remain the source of truth. Daily finalized averages/penalties are derived values.

## Ranking order

Primary metric:

```text
average time ascending
```

Tiebreaker:

```text
average guesses ascending
```

Final tiebreaker (deterministic):

```text
earliest qualifying completion timestamp
```

Definition: the minimum `completed_at` among the player's COMPLETED games on eligible finalized days in the period — the same day set used for the score average.

Do not combine seconds and guesses into an arbitrary weighted single score for V1.

This makes the application's identity a speedrun leaderboard while still rewarding efficient solving.

Future ranking systems can be added later without redesigning the stored raw game data.

## Participation minimums

A player must have a minimum number of successfully COMPLETED daily puzzles to qualify for a weekly/monthly leaderboard. FAILED, FORFEITED, and MISSED do not count toward the threshold. Keep the exact thresholds configurable as product constants so they can change without changing the database model.

## Result-page ranking

Immediately after a game, show **Current position**, not a definitive final rank, because more players may finish later. The leaderboard response includes the viewer's own rank, so this works even when the player is outside the top 10.

Example:

```text
You solved it!
00:48.21
4 guesses
Current position: #3
```

The UI should make clear that the leaderboard can change.

---

# 13. Result screen

After completion:

- show win/loss state
- show elapsed time
- show guess count
- show current leaderboard position if applicable
- provide a route/action to view the leaderboard

After a failed/forfeited game, clearly show the result and that the competitive penalty applies.

Do not reveal future puzzle answers through the result UI.

---

# 14. Leaderboard/game data model behavior

Raw game facts should live on the game/result data rather than a separate ranking-result table in V1.

At minimum:

```text
status
started_at
completed_at
completion_time_ms
guess_count
```

Leaderboard statistics are derived from these facts.

A separate materialized ranking table can be introduced later if performance requires it.

---

# 15. Profile/avatar specification

## Display name

- 2–15 characters
- explicit V1 charset: ASCII `[a-z0-9 _-]` (case-insensitive)
- profanity filtered via a separate aggressive moderation key (not the uniqueness canonical form)
- uniqueness via the canonical form (`display_name_normalized`)
- server validates all changes

## Profanity/moderation

Use a baseline English profanity list plus a project-specific custom banned list (`src/lib/shared/config/banned-words.json`, versioned).

Moderation uses a separate aggressive detection key (`moderationKeyForDisplayName()` — leet/confusable mapping, separator removal), distinct from the canonical form used for uniqueness.

Do not rely on a third-party profanity list as perfect moderation. The application should retain the ability to extend/override the list.

## Emoji avatar

Use a curated set of approved Unicode emoji.

Do not initially expose every Unicode emoji/sequence because that creates unnecessary picker complexity and consistency problems across platforms.

The picker list is version-controlled application data at `src/lib/shared/config/avatar-emojis.ts`, not a database table.

The database stores the chosen Unicode emoji string only.

The server verifies submitted avatar values are in the approved set.

The curated set can be expanded later without changing the database model.

---

# 16. Admin

There is one initial admin account associated with the project owner's Google identity.

The application should use an explicit `admin` role rather than hard-coding an email check throughout the application.

## Admin tab

The Admin tab is visible only to admin users.

Its primary purpose is daily puzzle scheduling.

## Calendar view

Show a calendar where each date represents a puzzle slot.

Admin can queue future words in advance rather than logging in every day.

Each day can show its scheduled word and relevant state.

## Scheduling window

Puzzles may be scheduled or edited only for future dates. Scheduling or editing a past date is rejected. Delete is allowed only for future, unstarted, scheduled puzzles; a puzzle for the current date can never be plain-deleted.

Once a puzzle's effective date begins, its answer/hint may not be changed. If the daily activation did not run (the puzzle is still `SCHEDULED` on its own date and no player has started it), an admin may use the **atomic same-day replacement**: a single recovery operation that swaps the answer (and hint) for another approved word on the same date. This is a recovery operation, not ordinary scheduling.

## Scheduling validation

When an admin enters a word:

1. Normalize the word.
2. Verify it exists in the server-side approved answer list.
3. Detect if the answer has already been used on another day.
4. Detect duplicate scheduling.
5. Validate basic constraints.
6. Allow scheduling only after validation passes.

Example states:

```text
WATER
✓ Approved answer
✓ Not previously used

WATER
✓ Approved answer
⚠ Already scheduled/used

QWERT
✕ Not in approved answer list
```

## Puzzle lifecycle

Use a lifecycle concept such as:

Lifecycle status:

```text
SCHEDULED → ACTIVE → FINALIZED
```

Mutability (explicit state model, not a side effect of `locked_at`):

```text
future date + SCHEDULED  → answer/hint may be edited or replaced
today + SCHEDULED, never started (cron missed) → atomic same-day replacement only
today + ACTIVE / FINALIZED → answer/hint immutable
```

A puzzle must become immutable once its first player starts it. Do not silently change the answer/hint after gameplay has begun. A puzzle whose effective date has begun is immutable even if the first player has not started (the same-day replacement is the only recovery path).

Future answers can be edited while they remain safely in the future and have not been played.

---

# 17. Mobile/responsive behavior

The website must be mobile-friendly from the beginning.

On all devices, use the in-app Wordle keyboard.

On desktop, also support the physical keyboard.

The game board, timer, clue, keyboard, leaderboard tables, admin calendar, and profile controls must remain usable on narrow screens.

Avoid desktop-only hover interactions for essential game functions.

---

# 18. Expected UI component usage

Likely shadcn-svelte components:

- Button
- Tabs
- Dialog
- Input
- Badge
- Table/Data Table
- Calendar
- Dropdown Menu
- Sheet/Drawer
- Sonner
- Select/Command if useful for emoji/admin selection

Likely Lucide icons:

- Play
- Trophy
- User
- Settings
- LogOut
- Sun/Moon
- Calendar
- Clock
- ChevronLeft/ChevronRight
- Check/X
- AlertTriangle
- Shield/Lock
- Search
- Plus
- Trash2/Pencil

Do not treat this list as mandatory. Avoid icon/emoji clutter.

---

# 19. Animation guidelines

Use Anime.js selectively for:

- tile flip sequence
- invalid guess shake
- tile/key interaction
- win celebration
- leaderboard transitions
- statistics transitions

Use CSS transitions for simple UI effects.

Animations must not prevent keyboard input, obscure the timer, or make the game feel slower than the actual network operation.

---

# 20. Security requirements

At minimum, the application must enforce:

- Google authentication through a mature OIDC implementation
- secure server-side sessions
- role-based authorization
- ownership checks on all user resources
- server-side word validation
- server-side answer secrecy
- server-side game-state validation
- server-generated timestamps
- server-derived completion time
- protection against forged scores/results
- prevention of duplicate/extra submissions
- validation of profile/avatar changes
- admin-only puzzle management
- rate limiting appropriate for public APIs
- security-conscious headers/cookie settings
- production secrets kept outside the public repository

The public repository must contain no production credentials, OAuth secrets, database URLs with credentials, or future answer pool.

---

# 21. Security testing requirements

The project should have a dedicated security verification process.

## ASVS

Use OWASP ASVS as the requirements/checklist baseline.

## Playwright

Automate security regression cases such as:

- unauthenticated access blocked
- user A cannot access user B's data
- user A cannot modify user B's game
- fake completion times are rejected
- fake scores/win flags are rejected
- extra guesses are rejected
- completed/expired games cannot be changed
- duplicate completion is rejected
- malformed/oversized/wrong-type requests fail safely
- logout invalidates protected access

## OWASP ZAP

Run baseline/passive dynamic scans against local/preview deployments. Review findings rather than treating scanner output as a complete security verdict.

## Dependency security

Use Dependabot or equivalent automated dependency vulnerability/update management.

## Friend adversarial testing

Friends should deliberately attempt API bypasses, ID manipulation, game tampering, replay, malformed input, rapid requests, authorization bypasses, and profile/role manipulation.

---

# 22. Initial scope and future extensibility

V1 should focus on:

- Google auth/onboarding
- Play
- daily puzzle + one-letter clue
- timed Wordle
- continue-after-leaving behavior
- automatic daily expiration
- completed/failed/forfeited/missed states
- personal profile
- today/yesterday/week/month leaderboard
- admin calendar/scheduling
- answer validation/duplicate detection
- responsive UI
- basic statistics/history needed to support the leaderboard
- security verification foundation

The codebase should make it easy to add later:

- friend requests
- friend groups
- head-to-head statistics
- achievements
- richer history
- sharing
- activity feeds
- multiple ranking systems
- advanced statistics
- admin tools

Do not build those features into V1 unless they become necessary for the core design.

---

# 23. Intentional open decisions

The following should remain flexible until there is enough real usage/data to justify a final choice:

- exact weekly/monthly minimum-participation threshold
- exact future ranking algorithms beyond time-first/guess-tiebreaker
- exact color palette/theme details
- exact size/composition of the curated emoji set
- whether more detailed statistics are added to the first profile/history release

These should not require changes to the fundamental game/security/data model.
