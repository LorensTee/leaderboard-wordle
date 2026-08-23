# Phase 1 — Authenticated Game Vertical Slice: START PROMPT

Paste the entire contents of this file into a NEW chat. Do not include this
header line — start from "You are implementing Phase 1".

---

You are implementing **Phase 1** of Leaderboard Wordle, a Wordle-style game for a
private group of friends, in the repository at
`/home/greant/WebstormProjects/leaderboard-wordle` (branch `main`).

**Phase 0 is COMPLETE and all external gates are closed.** The foundation is
proven: SvelteKit + Hono + Better Auth (Google OIDC) + Drizzle/Neon on
Cloudflare Workers; CI is green on GitHub Actions; the live non-prod Neon
database works with real `SELECT ... FOR UPDATE` transactions; a real Google
OAuth login has been completed once against the dev server.

## 1. Read these first (in order) — they are authoritative

1. `Architecture-v3.md` — full architecture; especially `# Phase 1 — Authenticated game vertical slice` (~line 1201) and the `# Database` section (schema, invariants, concurrency, expiry contract, answer lock).
2. `docs/contradictions-and-gaps.md` — decision log. The **Phase 0 resolutions** section at the end shows what is already implemented; record every new decision you make here.
3. `docs/proposed-repo-tree.md` — the directory ownership rules. `src/routes` = SvelteKit composition only; `src/lib` = FSD application code (minimal: `app/` + `shared/` — extract `features/`/`entities/` only when real reuse appears); `src/server` = Hono/domain/backend.
4. `src/server/routes.ts` — the single Hono composition point. All new API routes are registered here.
5. `src/server/db/schema.ts` + `src/server/db/client.ts` — the tables and the Neon WebSocket client (`drizzle-orm/neon-serverless` + `@neondatabase/serverless` Pool).
6. `src/server/auth/auth.ts` + `src/hooks.server.ts` + `src/routes/api/[...path]/+server.ts` — auth factory (`getAuth(env)`), hooks session fast-path, and the SvelteKit→Hono bridge.
7. `tests/integration/*` — the transaction-contract tests you must re-point at the real services.
8. `docs/proposed-dependencies.md` — package intent; the lockfile (`bun.lock`) is authoritative.

## 2. Stack and environment facts (verified, do not re-derive)

- Bun 1.4 (runtime + package manager). All commands below use `bun run`.
- SvelteKit 2.70.3, Svelte 5.56 (RUNES mode — the scaffold enforces runes), Vite 8.2.2, TypeScript 6.0.3, `@sveltejs/vite-plugin-svelte` 7.3.0.
- Hono 4.13.3 (v4; `hono/client` RPC). Better Auth 1.7.1. Drizzle ORM 0.45.2 / drizzle-kit 0.31.10 (WebSocket driver = `drizzle-orm/neon-serverless`; `drizzle-orm/neon` is the Neon-Auth/RLS module — do not confuse them). Zod 4. `@lucide/svelte` for icons (NOT `lucide-svelte` — deprecated). `svelte-sonner` for toasts. `animejs` for animations. Tailwind CSS is v4 (CSS-first, `@import "tailwindcss"`) — install it as part of the Phase-1 UI work via `sv add tailwindcss` or the official v4 instructions; shadcn-svelte 1.5.0 targets Tailwind v4; do not mix v3 conventions.
- Cloudflare: `@sveltejs/adapter-cloudflare`; `wrangler.toml` has `nodejs_compat`, cron `0 16 * * *` (Asia/Manila midnight, UTC-only). `worker-configuration.d.ts` = committed wrangler-generated baseline (env-only).
- Scripts: `dev`, `build`, `check` (svelte-check), `types` / `types:check` (wrangler), `auth:schema` / `auth:check` (Better Auth schema + parity guard), `db:generate` / `db:migrate` (CLI) — CI uses `scripts/ci-migrate.ts` (programmatic), `word-list`, `verify:bundle` (post-build answer-pool secrecy scan), `test:unit` (22 tests, DB-free), `test:integration` (7 tests, needs `DATABASE_URL`), `test:e2e` (Playwright).

### Environment variables and local dev (critical)

- Real credentials live in `.env` AND `.dev.vars` (both gitignored, both populated). Never print/commit them.
- Local dev bindings flow through **platformProxy**: the app reads env from `.dev.vars`/wrangler config, NOT `process.env`. `process.env.NODE_ENV` is only used by the auth factory (production is the default; `development`/`test` select the dev fallback secret — do not change this policy).
- The dev server in this sandbox needs `XDG_CONFIG_HOME="$PWD/.cache/xdg-config" bun run dev` (miniflare registry writes are blocked in `~/.config`).
- CSRF rules for API mutations: browsers pass automatically; non-browser tooling must send `Origin: http://localhost:5173` (or the configured origin). Headerless mutations and `Sec-Fetch-Site: none` are rejected (403) BY DESIGN — fail-closed.
- Better Auth endpoints (`/api/auth/*`) are CSRF-exempt and mounted at `app.all('/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw))`.
- A real Google login is possible right now: serve a small page that does `POST /api/auth/sign-in/social {provider:"google"}` (the `/api/auth/sign-in/google` path does NOT exist in this Better Auth version — the endpoint is `/sign-in/social`), follow `{url}` to Google, complete consent, and call `GET /api/auth/get-session` to verify.
- The non-prod Neon DB (`DATABASE_URL`) is reset-safe by user decision — integration tests TRUNCATE the app tables.

## 3. Phase 1 scope (from Architecture-v3 — implement exactly this)

The full Wordle vertical slice with auth in place:

1. **Daily puzzle UI** — board (6×5), in-app keyboard (all devices) + physical keyboard on desktop, timer display, hint letter display.
2. Six guesses with green/yellow/gray feedback; word evaluation server-authoritative.
3. **Local valid-guess checking is UX-only** — the client may pre-check against the PUBLIC `valid-guesses.json` artifact, but the server re-validates everything. The client NEVER knows the answer.
4. **Server-authoritative timer** — `started_at`/`completed_at`/`completion_time_ms` computed and stored server-side; client only renders elapsed time.
5. **Session-based resume** — reloading restores the in-progress game from the server.
6. **Auto-expiration** at the daily reset — a game whose puzzle has expired cannot accept guesses; `MISSED` is a derived state (absence of a game row), never stored.
7. **One attempt per user per day** — `UNIQUE(user_id, puzzle_id)` is the invariant; a second start returns the existing game (idempotent start).
8. **Ownership authorization** — every game endpoint checks `user_id === session.user.id`; 403 otherwise.
9. Responsive/mobile UI; animations (Anime.js) for flips/shakes/celebrations; Play/start screen with pre-game hiding.
10. A real sign-in UI (Better Auth client) — sign-in with Google button + signed-in state in the header/shell.

**Out of scope (later phases — do NOT build):** leaderboard/history/statistics (Phase 3), settlement/finalization job beyond what lazy activation requires (Phase 0–1 contract), onboarding/display-name/avatar editing (Phase 2), admin puzzle management (Phase 4), rate limiting beyond the baseline (add only if trivially local), CSP (Phase 5).

## 4. Non-negotiable invariants (never regress these)

- **Server authority**: the browser is untrusted. Hono verifies auth, ownership, game status, expiry, the dictionary, evaluates the guess, and persists everything.
- **Answer secrecy**: the answer is never exposed to browser JS. Approved answers live only in `answer_dictionary` (DB). The scheduled answer reaches the server only. `verify:bundle` must keep passing; add a test asserting today's answer is not in any client payload.
- **Lock ordering**: every game mutation locks the **puzzle row first**, then the game row; the puzzle row is the serialization point for daily-boundary operations. Eligibility anchor = `transaction_timestamp()` at START of the transaction; **never use `clock_timestamp()`**.
- **Expiry rule**: a guess is eligible only if the puzzle's `expires_at > transaction_start`; the puzzle-row lock serializes against finalization.
- **Lazy activation (M3)**: if the puzzle is `SCHEDULED` for today, the first legitimate `POST /api/game/start` activates it in the same transaction under `FOR UPDATE` with the documented guards (date matches today, SCHEDULED, `expires_at` in future, no other ACTIVE puzzle for that date).
- **Error contract**: every API error is `{ error: { code, message, requestId, issues? } }`; use `AppError` from `src/server/lib/errors.ts`; never leak internals.
- **CSRF/security middleware**: do not bypass or weaken `src/server/middleware/*`. New mutation endpoints go through the existing chain automatically (registered on `app.use('*')`).
- **Architecture boundaries**: `src/server` never imports SvelteKit `RequestEvent`; the bridge (`src/routes/api/[...path]/+server.ts`) is the only place platform bindings are translated; game logic lives in `src/server/game/`, puzzle lifecycle in `src/server/puzzle/`.
- **No React packages** anywhere. Framework-specific packages must be the Svelte variants (`@lucide/svelte`, `@tanstack/svelte-query`, `@tanstack/svelte-form`, `svelte-sonner`, `shadcn-svelte`).
- **Don't break the Phase-0 gates**: keep `test:unit` (22) + `test:integration` (7) green, `check`, `build`, `verify:bundle`, `types:check` (hermetic), `auth:check` (see watch-outs).

## 5. Implementation requirements

1. Load the relevant development skills before coding:
   - `npx @tanstack/intent@latest list` from the repo root, then load the matching TanStack skills for `@tanstack/svelte-query` and `@tanstack/svelte-form` usage.
   - Use the indexed docs (JDocMunch handles are in `docs/jdocmunch-index-history.md`, e.g. `sveltejs/kit`, `sveltejs/svelte`, `honojs/hono`, `better-auth/better-auth`, `drizzle-team/drizzle-orm`, `neondatabase/neon`, `lucide-icons/lucide`, `wobsoriano/svelte-sonner`, `vitejs/vite`) for current APIs of the INSTALLED versions.
2. **Test-Driven Development.** Write the failing test first for every unit of logic, then implement. Key unit targets: `evaluateGuess` (INCLUDING duplicate-letter handling — the classic Wordle bug), dictionary/word-list validation, expiry eligibility helper, completion-time computation, hint display rule (single letter, occurs in answer — validated at scheduling in Phase 4; Phase 1 only displays the persisted hint).
3. **Re-point the Phase-0 contract tests at the real services**: `tests/integration/midnight-lock-order.test.ts` (guess-first → valid completion; finalize-first → guess rejected) and `tests/integration/lazy-activation.test.ts` must call your real `submitGuess`/`finalizePuzzle`/game-start services instead of raw SQL, while preserving the asserted transaction semantics. Add: game-start idempotency, one-attempt-per-day, ownership denial, expired-game rejection, resume.
4. **API shape**: Hono routes under `/api/game/...` registered ONLY in `src/server/routes.ts`; export the typed `AppType` and build the client in `src/lib/shared/api/` with `hc<AppType>` (Hono RPC, `hono/client`). The bridge passes `platform.env` cast to `HonoBindings` — extend `HonoBindings` for any new bindings you need (prefer reading via `c.env`).
5. **Server state on the client**: `@tanstack/svelte-query` for query/mutation caching (current game, start, guess, session); follow the installed package's Svelte usage docs.
6. UI in the runes style; components in `src/lib/shared/ui/` (reuse shadcn-svelte conventions where they fit); app shell/theme in `src/lib/app/`.
7. Word lists: the public `valid-guesses.json` is a generated artifact — regenerate with `bun run word-list` if you touch the source. The answer pool input stays gitignored (`scripts/seed/*.txt`); don't create answer data in the repo.
8. Session on the client: use the Better Auth Svelte client (`createAuthClient`) pointed at `/api/auth`; the server resolves sessions independently via `getAuth(env).api.getSession({ headers })`.
9. Keep commits small and conventionally prefixed (e.g., `phase1(game): ...`). Update `docs/contradictions-and-gaps.md` and `Architecture-v3.md` (Phase 0→1 notes) as decisions land.

## 6. Watch-outs learned in Phase 0 (read before you touch these areas)

- **Auth schema generation is unpinned**: `bunx auth@latest` may drift (fingerprints: `defaultNow()` + `@__PURE__`). Use `bun run auth:check` after any `auth:schema` run; keep the committed file canonical; the fix (pin `bun add -d auth@1.7.1`) may not have been applied yet — apply it on the first networked run and then re-run `auth:check`.
- **`types:check` is build-state-dependent**: it passes only AFTER `bun run build` (wrangler emits `mainModule` only when `.svelte-kit/cloudflare/_worker.js` exists). CI runs it post-build; locally reproduce that order.
- **drizzle driver naming**: WebSocket = `drizzle-orm/neon-serverless`; `drizzle-orm/neon` = Neon-Auth/RLS. Transactions need a DEDICATED connection (see `tests/integration/helpers.ts` `connectClient`) — pooled drizzle may dispatch statements to different connections.
- **The migration journal is versioned**: `src/server/db/migrations/meta/` is committed; keep new migrations via `bun run db:generate` and commit `meta/` too.
- **`bun run dev`** in this sandbox needs the `XDG_CONFIG_HOME` override; interacting with the live OAuth flow requires `.dev.vars` values (already present).
- Staging/commits: `.env`, `.dev.vars`, `.cache/` are gitignored — keep it that way. Never echo secret values in logs, tests, or commit messages.

## 7. Mandatory verification before declaring Phase 1 done

Run, in this order, and report actual outputs:

```sh
bun run auth:check          # parity guard (fingerprints only)
bun run word-list           # regenerate artifact
bun run check               # svelte-check: 0 errors
bun run test:unit           # ≥ 22 passing (new unit tests on top)
DATABASE_URL=$DATABASE_URL bunx vitest run tests/integration   # ≥ 7 passing, including the re-pointed lock-order + lazy activation
bun run build
bun run verify:bundle       # answer-pool secrecy scan over client+server bundles
bun run test:e2e            # Playwright smoke (extend with a game-flow e2e if feasible; Google login itself may be a manual step)
```

Then push to `main` and confirm the GitHub Actions run is green (CI mirrors the above plus `types:check` after build).

## 8. Phase 1 exit criteria (all must hold)

1. Authenticated user → `POST /api/game/start` → today's puzzle (lazy activation path exercised live) → guesses evaluated server-side with correct duplicate-letter feedback → completion stores `completion_time_ms` once; reload resumes the game from the server.
2. Second start is idempotent (same game); a second user's game is independent.
3. Expired puzzle → guesses rejected; missing game for a finalized puzzle = MISSED (derived, no row).
4. Ownership: user A cannot read/mutate user B's game (403).
5. The two NG9 lock-order tests and the M3 lazy-activation test now call the REAL services and pass on Neon.
6. No answer text ever appears in client payloads or build output (`verify:bundle` passes; a test asserts the scheduled answer is absent from `/api/game/current`-style responses).
7. Full suite green locally AND in CI (pushed run), including `types:check`, `verify:bundle`, unit, integration (non-prod Neon), e2e.
8. Decisions recorded in `docs/contradictions-and-gaps.md` (Phase-1 statuses) and `Architecture-v3.md`.

## 9. Report format when done

Report: scope delivered (route/UI inventory), packages ADDED with versions (and why), test delta (unit/integration/e2e counts), the re-pointed transaction tests' results, verification outputs (the command list above), any deviation from the invariants with justification, and any unresolved issues. Do not claim completion without the exit criteria above.