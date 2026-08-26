# Phase-1 Game API Contract

Settled before the UI became dependent on it (Phase-1 prompt §7). The Hono
RPC types (`hc<AppType>`, `src/lib/shared/api/client.ts`) are the source of
truth for wire shapes; this document records the contract semantics. All
endpoints are registered in `src/server/routes.ts` (the single composition
point) behind the Phase-0 middleware chain: requestId → timeout → bodyLimit
→ secure headers → CSRF → authContext → requireAuth (`/api/game/*`).

## Common conventions

- **Authentication:** every endpoint requires a valid Better Auth session;
  `requireAuth` rejects unauthenticated requests with `401 UNAUTHORIZED`.
  Hono resolves the session independently (`c.get('auth')`) — never
  SvelteKit `event.locals`.
- **Errors:** every failure returns `{ error: { code, message, requestId, issues? } }`
  (NG21). Game-domain codes: `INVALID_WORD`, `GUESS_LIMIT_EXCEEDED`,
  `GAME_NOT_FOUND`, `GAME_NOT_ACTIVE`, `GAME_EXPIRED`, `PUZZLE_UNAVAILABLE`,
  `INVALID_STATE` plus the baseline codes.
- **Answer secrecy:** no response from any endpoint ever contains the answer
  text, the answer id, or the answer dictionary. The hint letter is exposed
  **only** once a game exists (N14 — no hint pre-start).

## POST /api/game/start

Starts today's game or returns the existing one.

- **Request body:** none.
- **Auth:** required. **Ownership:** implicit (today's game for the caller).
- **Idempotency:** yes — `UNIQUE(user_id, puzzle_id)` plus insert-ignore;
  concurrent starts converge on one game row (puzzle-row lock serializes).
- **Lazy activation (M3):** if today's puzzle is `SCHEDULED`, the same
  transaction activates it under `FOR UPDATE` when all guards pass
  (today's Asia/Manila date, `SCHEDULED`, `expires_at > transaction_timestamp()`,
  no other ACTIVE puzzle for the date).
- **Expiry behavior:** a start whose transaction begins after `expires_at`
  is rejected with `409 GAME_EXPIRED`; a missing today-puzzle fails closed
  with `404 PUZZLE_UNAVAILABLE` (missing-puzzle invariant).
- **Response 200:** `{ game: SafeGameState }` — `{ id, status, startedAt,
  completedAt, completionTimeMs, guessCount, puzzle: { id, date, hintLetter },
  guesses: [{ guessNumber, word, feedback }] }`. `hintLetter` present only
  because a game exists.
- **Timer authority:** `started_at` is generated server-side (DB time) once;
  it never moves across resume.

## GET /api/game/current

Read-only reconstruction of today's game (reload/resume).

- **Auth:** required. **Side effects:** none (a GET never mutates — no lazy
  activation here; only `POST /api/game/start` may activate).
- **Response 200:** either `{ game: SafeGameState }` (same shape as start),
  `{ game: null, puzzle: { date } }` (pre-game: no hint), or
  `{ game: null, puzzle: null }` (no puzzle for today).

## POST /api/game/:gameId/guess

Submit exactly one guess.

- **Request body:** `{ word: string }` — strict Zod schema (client-supplied
  timing/score/state fields are **rejected** with 400). Malformed JSON → 400.
- **Auth:** required. **Ownership:** the game row's `user_id` must match the
  authenticated user, checked under the game lock: `403 FORBIDDEN` otherwise.
  A uuid-shaped id that matches no game → `404 GAME_NOT_FOUND`; a
  non-uuid-shaped id short-circuits to 404 without a DB round-trip.
  (Existence surface: game ids are unguessable `gen_random_uuid` values the
  caller can only know by owning them, and the 403 path is mandated by the
  Phase-1 spec — the exact 404-vs-403 difference for a foreign valid uuid is
  accepted.)
- **Server authority (in one transaction, puzzle lock FIRST):**
  1. `transaction_timestamp()` establishes the eligibility anchor;
  2. the puzzle row is locked `FOR UPDATE`, re-read after the lock
     (NG9 lock order A/B); `status ≠ ACTIVE` or expired → `409 GAME_EXPIRED`;
  3. the game row is locked; ownership + `status = ACTIVE` re-checked
     (`409 GAME_NOT_ACTIVE` for terminal games);
  4. guess number = `guess_count + 1`; `> 6` → `409 GUESS_LIMIT_EXCEEDED`
     (UNIQUE(game_id, guess_number) is the DB-level final guard);
  5. the word is validated against the server dictionary
     (`400 INVALID_WORD` otherwise);
  6. feedback is computed with `evaluateGuess` (Wordle duplicate-letter
     semantics) against the answer — which never leaves the service;
  7. guess persisted; `guess_count` updated; on solve `COMPLETED` +
     `completed_at` + `completion_time_ms` are set exactly once (DB-computed);
     on the 6th non-solving guess the game becomes `FAILED`.
- **Idempotency:** not applicable — a submitted guess is a fact; a replay
  arrives as guess number `N+1`, and a terminal game rejects it.
- **Response 200:** `{ game: SafeGameState, guess: { guessNumber, word,
  feedback }, solved: boolean, terminal: boolean }`.

## Secrecy guarantees (verified by tests)

- `serializeGameState` unit test asserts the response payload cannot contain
  the answer/answerId keys; the service-level integration suite asserts the
  answer word never appears in serialized state (start/current/guess).
- Route-level tests assert the wire JSON carries no answer text.
- `bun run verify:bundle` proves the answer pool is absent from the build;
  the client bundle contains no server internals (checked post-build).
- E2E asserts the answer text is absent from the rendered page pre-solve and
  from the `/play` payload path.

## Client usage

`src/lib/shared/api/game.ts` wraps the RPC client (`hc<AppType>`); TanStack
Query calls it from `src/routes/play/+page.svelte` (query key
`['game','current']`; start/guess mutations update the cache from the server
response). No parallel fetch wrappers exist for these endpoints.