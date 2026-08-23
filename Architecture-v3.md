# Leaderboard Wordle — Architecture & Technology Plan

> **Implementation gate:** decisions that supersede wording in this document are tracked in `docs/contradictions-and-gaps.md` (open items NC1–NC3, NG1–NG21, M1–M5). Where this document conflicts with that file, the contradictions file governs until this document is updated.

## Project goal

Build a mobile-friendly Wordle-style web application for a private group of friends. It is both a real deployed product and a learning/reusable full-stack template.

The application must keep gameplay responsive while making the server authoritative for identity, game state, scoring, timers, and leaderboard data. The public GitHub repository must not expose future puzzle answers.

## Architecture

```text
Browser
  │
  ▼
SvelteKit
  ├── hooks.server.ts → shared session resolution / locals / page redirects
  ├── pages / layouts / navigation / SSR where useful
  ├── Svelte UI
  └── /api/* catch-all → platform bridge
                         │
                         ▼
                       Hono
                 ├── API authentication/authorization
                 ├── game/domain logic
                 ├── request validation
                 └── API routes / Hono RPC
          │
          ▼
      Drizzle ORM
          │
          ▼
   Neon PostgreSQL (Singapore)

Deployment: Cloudflare Workers
Alternative: Vercel, with compute deliberately placed in Singapore
```

SvelteKit owns the web application and routing. Hono owns `/api/*`. Do not deploy a separate public API for the initial version.

Keep domain/game logic separate from platform-specific Cloudflare/Vercel entry-point code so the core application remains portable.

---

# Frontend

## SvelteKit

Use **SvelteKit** as the frontend/application framework.

Responsibilities:

- page routing
- layouts
- client-side navigation
- page loading
- SSR where useful
- protected-page redirects where appropriate
- application error handling
- frontend application shell

Use SvelteKit's built-in routing. Do not use React TanStack Router.

## Vite

SvelteKit uses **Vite** internally for development/build tooling:

- development server
- hot module replacement
- dependency handling
- production builds
- asset processing

Vite is not a separate competing framework in this architecture.

## TanStack Query for Svelte

Use `@tanstack/svelte-query` for asynchronous server state:

- current user
- today's game
- game history
- leaderboards
- statistics
- mutations
- cache invalidation/refetching

## TanStack Form for Svelte

Use `@tanstack/svelte-form` for forms that benefit from structured state/validation, such as profile editing, admin puzzle management, and future settings/forms. Do not force the basic Wordle keyboard interaction into TanStack Form.

# Frontend architecture: Feature-Sliced Design (FSD)

Use **Feature-Sliced Design (FSD) v2.1** for application code under `src/lib/`, adapted to SvelteKit rather than forcing SvelteKit into a React-oriented directory structure. The `feature-sliced/skills` skill should be used by coding agents when deciding frontend code placement and import boundaries.

FSD applies to `src/lib`; **`src/routes/` remains SvelteKit-owned routing/composition**. Do not create a second routing architecture inside FSD.

Follow FSD's core rule: **start simple, extract when needed**. Do not create every FSD layer at project initialization. Extract into `features/` or `entities/` only when code is genuinely reused and has a stable responsibility. The `widgets/` layer is discouraged.

Initial FSD structure (minimal):

```text
src/
├── routes/                      # SvelteKit routing/pages/API bridge
└── lib/                         # FSD application code
    ├── app/                     # app-wide setup (providers, theme)
    └── shared/                  # UI components, utils, API client, config
```

Extract `features/` and `entities/` only when real reuse emerges. Do not create speculative slices.

Import `$lib` paths consistently, e.g.:

```text
$lib/shared/ui/...
```

FSD import-direction rules apply to these `src/lib` paths. Do not interpret `$lib` as a reason to move SvelteKit `src/routes` into FSD.

FSD import-direction rules apply within `src/lib`: higher layers may import lower layers; same-layer slice cross-imports should be avoided. Keep each slice's public API explicit. Do not create speculative entities/features simply to satisfy a folder pattern.

**Future extracted structure** (not initial — extract only when real reuse emerges):

```text
src/lib/
├── app/
├── features/
├── entities/
└── shared/
```

**Do not apply FSD directory rules to the Hono backend.** The backend is organized by server/domain responsibility instead.

## Styling/UI

Use:

- **Tailwind CSS** — layout, spacing, responsive design, colors, typography, themes.
- **shadcn-svelte** — accessible reusable UI components.
- **Lucide** — icons, used selectively rather than decoratively.
- **Anime.js** — richer/coordinated animations when CSS transitions are insufficient.
- **Sonner** (`svelte-sonner`) — toast notifications for Svelte; it is a separate library integrated with shadcn-svelte, not a built-in part of shadcn itself.
- **Theme** — light/dark persists in `localStorage` (`theme` key); applied before first paint by the `src/lib/app/theme` provider via a CSP-compatible inline head script (nonce or script hash) to avoid FOUC; initial default from `prefers-color-scheme`; no SSR or database dependency.

Likely shadcn-svelte components include Button, Tabs, Dialog, Input, Badge, Table/Data Table, Calendar, Dropdown Menu, Sheet/Drawer, and Sonner. Add components only when actually needed.

Likely Lucide icons include Play, Trophy, User, Settings, LogOut, Sun, Moon, Calendar, Clock, ChevronLeft/Right, Check, X, AlertTriangle, Shield, Lock, Search, Plus, Trash2, and Pencil. Do not add icons/emojis solely for decoration.

Anime.js is intended for game feel: tile flips, invalid-word shakes, keyboard feedback, win celebrations, leaderboard/stat transitions, and similar sequences. Prefer CSS for simple transitions.

---

# Runtime and backend

## Bun

Use **Bun** as the JavaScript/TypeScript runtime and package manager.

Typical commands:

```bash
bun install
bun add <package>
bun run dev
```

The repository uses Bun's `bun.lock`. An empty project with no dependencies does not need an empty lockfile committed.

### Preflight verification (2026-08-23)

Authoritative dependency state is `bun.lock`. Installed core stack: `@sveltejs/kit` 2.70.3, `svelte` 5.56.10, `vite` 8.2.2, `@sveltejs/vite-plugin-svelte` 7.3.0, `@sveltejs/adapter-cloudflare` 7.2.9, `typescript` 6.0.3, `svelte-check` 4.7.6. Per-package verification record (npm registry receipts + docs): `docs/proposed-dependencies.md` → "Preflight verification record (2026-08-23)".

Version-relevant corrections to this document:

- The `sv` CLI (0.17.0 — supersedes `create-svelte`) scaffolds the Cloudflare adapter into **`vite.config.ts`** (`sveltekit({ adapter: adapter() })`) and no longer emits `svelte.config.js`. The proposed tree's `svelte.config.js ← adapter-cloudflare` row now means "optional SvelteKit config for kit options"; the adapter lives in `vite.config.ts` (revisit at Phase 0 B1 for `kit.files`/alias needs).
- Tailwind targets **v4** (CSS-first `@import "tailwindcss"`, no `tailwind.config.js` by default) to match current shadcn-svelte.
- Zod is on **v4**: `better-auth` 1.7.1 depends on `zod ^4.3.6`; `drizzle-zod` 0.8.3 supports `zod ^3.25 || ^4`.
- Cloudflare/TypeScript tooling: `@cloudflare/workers-types` v5 (peer of wrangler 4.125.0) plus Wrangler-generated binding types (`wrangler types` → `worker-configuration.d.ts`), surfaced via `App.Platform` in `src/app.d.ts`.

### Phase 0 B1 (2026-08-23)

- `wrangler.toml` created: name `leaderboard-wordle`, `main = ".svelte-kit/cloudflare/_worker.js"`, `compatibility_date = "2026-08-23"`, `compatibility_flags = ["nodejs_compat"]` (Better Auth/AsyncLocalStorage), `[assets]` → `.svelte-kit/cloudflare` (Workers Static Assets; binding `ASSETS`), `[triggers] crons = ["0 16 * * *"]` — Asia/Manila midnight in UTC-only Cloudflare Cron (**NG1 encoded**). Validated with `wrangler deploy --dry-run`.
- **Binding types:** `wrangler types --include-runtime=false` → `worker-configuration.d.ts` (env-only). Full workerd **runtime** types were tried first but conflict with the DOM lib in the SvelteKit program; env-only types coexist. Regeneration: `bun run types`; CI gate: `bun run types:check`.
- `tsconfig.json`: `checkJs: false` — the generated `worker-configuration.d.ts` references the built worker via `Cloudflare.GlobalProps.mainModule`, which pulled the `.svelte-kit` build output into `svelte-check` (470 errors under `checkJs: true`). `.ts`/`.svelte` checking is unaffected.
- DevDeps added: `wrangler` 4.125.0, `@cloudflare/workers-types` 5.20260823.1, `@types/node` 26.x (wrangler's recommendation for `nodejs_compat`).
- `src/app.d.ts`: `App.Platform.env: Env` (the adapter's ambient types provide `ctx`/`context`/`caches`/`cf` and deliberately leave `env` app-owned).
- `.env.example`: `DATABASE_URL` (Neon WebSocket), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL` (NG18).
- FSD-minimal skeleton directories created (`src/lib/app`, `src/lib/shared/{ui,lib,api,data,config}`, `src/server/{auth,middleware,lib,game,puzzle,leaderboard,profile,admin,db,data}`) with `.gitkeep`; no invented code (per proposed-repo-tree).

### Phase 0 B2 (2026-08-23)

- **Better Auth schema mechanism (v19 change #3):** `src/server/auth/auth.ts` (config: Google provider with per-provider `requireEmailVerification` — NG18, `drizzleAdapter`, `user.additionalFields` for `avatarEmoji`/`role`/`display_name_normalized`(unique, required:false)/`onboarding_completed_at`(required:false)) → `bunx auth@latest generate` (installed Better Auth CLI mechanism) → `src/server/db/auth-schema.generated.ts` (`user`/`account`/`session`/`verification`). The application does **not** hand-author these tables; config, generated schema, and migration stay in sync (NC2). Optionality uses `required: false` (this Better Auth version's field attribute — `nullable` is not part of the shape).
- **App tables** (`src/server/db/schema.ts`): `answer_dictionary`, `daily_puzzles`, `games`, `guesses` per Architecture §374–491. Decisions: `uuid` PKs (`gen_random_uuid`); `puzzle_date` as DATE with `mode: 'string'` (ISO, no JS-Date TZ pitfalls at the Manila boundary); statuses as `pgEnum` (`puzzle_status`, `game_status`); `feedback` JSONB; the two NG3 candidate indexes plus UNIQUE indexes from the documented constraints; app-table FKs `ON DELETE no action`, Better Auth FKs cascade (generated).
- **Client** (`src/server/db/client.ts`): `drizzle-orm/neon-serverless` + `@neondatabase/serverless` `Pool` (WebSocket interactive-transaction path, Architecture §343–361). Driver-module rename recorded in `proposed-dependencies.md`.
- **Migration** `src/server/db/migrations/0000_init.sql` (8 tables): verified statically — NG2 `hint_letter_shape` CHECK, NG3 types/unique indexes, NG24 nullable `completion_time_ms`, `user.display_name_normalized` UNIQUE nullable, `verification` table (email verification), `session.token` UNIQUE, `account(issuer, account_id)` UNIQUE.
- **Structural verification:** `bun run check` 0 errors; migration SQL reviewed. **Live apply is an external gate** (B6/credentials): no Postgres/docker available in this sandbox (docker daemon socket denied; no `postgres`/`psql` binaries) — the sandbox cannot run a local DB, so migration application + Neon WS `SELECT ... FOR UPDATE` verification require the Neon `DATABASE_URL` at the external gate.
- Scripts: `bun run auth:schema`, `db:generate`, `db:migrate` (plus `types`/`types:check` from B1).

### Phase 0 B3 (2026-08-23)

- **Hono bridge** (`src/routes/api/[...path]/+server.ts`): the single platform boundary — `app.fetch(request, platform.env → HonoBindings, platform.ctx)`; one `bridge` impl exported as explicit `GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD` (the installed kit does **not** support an `ALL` export).
- **Composed app** (`src/server/routes.ts`): middleware order = requestId (NG21) → timeout 30 s → JSON 408 (NG19) → bodyLimit 64 KB → JSON 413 (NG20) → secure headers (NG22) → HSTS over TLS only → CSRF (NG4). Centralized `onError`/`notFound` emit the `{ error: { code, message, requestId, issues? } }` envelope (NG21); internal errors log with requestId, never leak details.
- **CSRF** (`middleware/csrf.ts` + `lib/origin.ts`): unsafe methods rejected unless same-origin — Sec-Fetch-Site ∈ {same-origin, none}, Origin === request origin or `ALLOWED_ORIGINS`; requests with neither signal pass only outside TLS (dev); `/api/auth/*` excluded (OAuth flow).
- **Alias** `$server` → `./src/server` configured in `vite.config.ts` (`sveltekit({ alias })`) — kit 2.62+ ignores `svelte.config.js` when options are passed via the Vite config (verified; the file was removed).
- **Verified by live smoke test** (dev server, port 5199): GET /api/nope → 404 JSON envelope + `x-request-id` + nosniff/DENY/referrer-policy; POST with cross-site Origin → **403 CSRF** envelope; POST with `Sec-Fetch-Site: cross-site` → **403**; POST with same-origin Origin → 404. `bun run check` 0 errors; production build green.
- Dev-environment note: adapter-cloudflare's dev `platformProxy` (miniflare) needs a writable registry; this sandbox blocks `~/.config/.wrangler`, so dev runs with `XDG_CONFIG_HOME=.cache/xdg-config` (gitignored via `.cache/`).

### Phase 0 B4 (2026-08-23)

- **Auth factory** (`src/server/auth/auth.ts`): `createAuth(env)` + memoized `getAuth(env)` — runtime values (secret, baseURL, Google creds, `DATABASE_URL`) come from **Worker bindings**, not `process.env`; process.env looked at nothing at import time. Config: Google provider with per-provider `requireEmailVerification` (NG18), global `requireEmailVerification`, `user.additionalFields` (NC2, unchanged), `drizzleAdapter(createDb(...))`.
- **Mount** (`routes.ts`): `app.all('/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw))` — the current Hono integration pattern (better-auth docs). **Current social endpoint is `/api/auth/sign-in/social` with `{ provider: "google" }`** (not `/sign-in/google` — that path 404s on this version; verified live).
- **Hooks** (`src/hooks.server.ts`): per the current SvelteKit integration docs — `auth.api.getSession({ headers })` → `event.locals.session/user`; `App.Locals` typed in `app.d.ts`.
- **Bindings pipeline proven live:** `.dev.vars` → dev `platformProxy` → `platform.env` → bridge cast → `c.env` → `getAuth` (dev needs `.dev.vars`, not process.env — verified empirically).
- **Structural verification (all credential-free):** GET / → 200 (hooks + session resolution run); GET `/api/auth/get-session` → 200 `null`; POST `/api/auth/sign-out` without Origin → 200 (**CSRF `/api/auth` exclusion works**); POST `/api/auth/sign-in/social` → 500 **only** because the inert `DATABASE_URL` cannot connect — the stack trace proves the full path: `generateGenericState → createVerificationValue → @better-auth/drizzle-adapter → drizzle-orm/neon-serverless (NeonPreparedQuery)`, inserting into `verification`. `bun run check` 0 errors.
- **External gate (B7):** live Google OAuth flow + real Neon connection require credentials; `.dev.vars` (gitignored) holds local dummy values.

### Phase 0 B5 (2026-08-23)

- **CI (NG23)** `.github/workflows/ci.yml`: job `unit-and-build` (bun install --frozen-lockfile → `types:check` → `word-list` → `check` → `test:unit` → `build` → `verify:bundle`) and job `e2e` (Playwright chromium + `test:e2e` against `vite preview`, needs `unit-and-build`). Integration tests against a non-production DB are wired in B6 (credentials as GitHub secrets).
- **Test harness:** `vitest` 4 (vitest.config.ts, node env, `tests/unit` + `tests/security`) — 14 unit tests: NG4 origin validation (7), NG21 error envelope (4), NC3/NG7 word-list artifact + private-pipeline separation (3). `@playwright/test` + playwright.config.ts + `tests/e2e/smoke.spec.ts` (homepage + NG21 404 envelope through the full chain). B6 adds the midnight lock-order, FOR UPDATE, lazy-activation, and adversarial suites.
- **Word-list tooling (NC3/NG7):** `scripts/build-word-list.ts` (canonical `src/server/data/valid-guesses.source.txt` → public artifact `src/lib/shared/data/valid-guesses.json`; build-fails on non-lowercase-5-letter or duplicates; sorted/deduped) — sample source currently (provenance TODO for the real import, recorded in the file header). Private answer pool: `scripts/seed/` (gitignored `*.txt`, README documents NC3/NG16 provenance rules).
- **Bundle-secrecy proof:** `scripts/verify-bundle-secrecy.ts` (`bun run verify:bundle`, CI gate after build) — greps all build output for answer-pool words; public artifact is client-side by design. Unit test proves `src/` never references the seed pipeline.
- `tests/integration/` + `tests/security/` dirs scaffolded for B6.

### Phase 0 B6 (2026-08-23)

- **Integration suite (7 tests, all green against real PostgreSQL 17):**
  - `db.test.ts`: 8 tables created by the migration; **NG2** `hint_letter_shape` CHECK enforced; **NG3** `UNIQUE(user_id, puzzle_id)`; **`SELECT … FOR UPDATE` serializes concurrent transactions** (dedicated-connection probe: B blocks while A holds the lock, then sees A's committed change — READ COMMITTED re-evaluation, 424 ms observed lock wait).
  - `midnight-lock-order.test.ts` — **NG9 both mandatory orders**: A) guess locks puzzle first → completion valid (finalize queues, observes ACTIVE, guess committed); B) finalize locks first → guess blocked until FINALIZED, re-read observes FINALIZED and writes nothing (ROLLBACK, guess_count 0).
  - `lazy-activation.test.ts` — **M3**: first-start activation of a SCHEDULED puzzle under `FOR UPDATE` with the documented guards (date, SCHEDULED, `expires_at > now()`, no other ACTIVE for the date).
- **Driver seam** (`tests/integration/helpers.ts`): default = app production path (`@neondatabase/serverless` Pool + `drizzle-orm/neon-serverless`); `LOCAL_PG=1` = `drizzle-orm/node-postgres` + `pg` Pool for local executions. **Empirically confirmed: the neon driver is WebSocket-proxy-only** (connects to `wss://<host>/v2`; a plain local Postgres cannot be reached by it) — so local semantics proofs run via the pg path, and the Neon WebSocket transport verification stays at the B7 external gate. Transactional sequences use dedicated connections (`connectClient`) — pooled drizzle dispatch would break BEGIN/COMMIT spans.
- **Execution:** migrations applied to a throwaway local PostgreSQL 17 (embedded binaries under `.cache/pg`, gitignored; downloaded 2026-08-23, PG 17.2.0) via `bun run db:migrate`; `LOCAL_PG=1 bun run test:integration` → 7/7 passed; integration files auto-skip without `DATABASE_URL`. Throwaway server stopped and cleaned up.
- **CI:** new `integration` job (gated on `secrets.DATABASE_URL`, applies migrations then `test:integration` against the non-prod DB — the neon driver path). Unit job stays DB-free. `fileParallelism: false` in vitest (locks/fixtures are serial).
- Phase 1 will re-point the NG9 lock-order tests at the real `submitGuess`/`finalizePuzzle` services; the asserted transaction contract is what they must preserve.

### Phase 0 B7 — exit-criteria verification (2026-08-23, v19 §14 order)

| # | Gate | Status | Evidence |
|---|---|---|---|
| 1 | package installation / `bun.lock` | ✅ PASS | `bun.lock` committed (e185dbf); reproducible `bun install --frozen-lockfile` (CI) |
| 2 | TypeScript check | ✅ PASS | `bun run check` 0 errors (post-B7 re-run) |
| 3 | Cloudflare production build | ✅ PASS | `vite build` + adapter-cloudflare → `.svelte-kit/cloudflare/_worker.js` (`✓ built in 4.57s`) |
| 4 | Wrangler configuration validation | ✅ PASS | `wrangler deploy --dry-run` parsed config + bundle; `types:check` is the CI gate. **Note:** `wrangler types` folds local `.dev.vars` into `Env` — the committed `worker-configuration.d.ts` is the clean CI baseline; regenerate locally only when bindings change (never commit a `.dev.vars`-dependent file) |
| 5 | Neon connection | ✅ PASS (2026-08-23) | live: `db=neondb`, Neon `ap-southeast-1`, non-destructive probe via pg; dedicated non-prod DB (user-confirmed reset-safe) |
| 6 | migration application | ✅ PASS | applied on live Neon via `bun run db:migrate` (drizzle-kit → `[✓] migrations applied successfully!`); previously also proven on throwaway PG 17 |
| 7 | transaction + `SELECT ... FOR UPDATE` proof | ✅ PASS (live Neon WS) | integration suite through the REAL `@neondatabase/serverless` WebSocket + `drizzle-orm/neon-serverless` path — FOR UPDATE serialization (1059 ms lock wait, READ COMMITTED visibility), NG9 order A/B, M3, NG2/NG3: **7/7 on live Neon** (2026-08-23) |
| 8 | Hono bridge | ✅ PASS | live smoke: 404 envelope + requestId + headers; CSRF 403 vs passed flows; `app.request` unit tests |
| 9 | Better Auth config/session resolution | ✅ PASS (structural) | mount live (`get-session` 200 null, `sign-out` 200, `sign-in/social` reached OAuth state → DB layer), hooks session resolution on `/`; live Google flow = external |
| 10 | CSRF / error / timeout / body-limit / secure headers | ✅ PASS | unit (4 tests incl. 413 + requestId, 403 CSRF, 404 envelope, headers) + live smoke (B3/B4). requestId reordered FIRST so 408/413 envelopes carry it (B7 fix) |
| 11 | word-list generation | ✅ PASS | 20 words source → artifact; rule-enforcing script |
| 12 | answer-pool secrecy / build inspection | ✅ PASS | `verify:bundle` (post-build grep) + unit separation test |
| 13 | lazy activation (M3) | ✅ PASS | integration green |
| 14 | midnight concurrency tests (NG9) | ✅ PASS | both orders green (B6) |
| 15 | CI | ✅ PASS (2026-08-23) | run 6 (`6b646a2`): **all three jobs green** — `unit-and-build` (10/10 steps), `integration` (probe connect OK → programmatic migrator applied/verified → integration suite green against Neon), `e2e` (Playwright smoke). Earlier runs fixed: secrets-in-`if` parse error (job env + step gate), types:check order (wrangler generation is build-state-dependent — post-build), silent `drizzle-kit` CLI failure (missing committed migration journal — `meta/_journal.json` + snapshot were never staged at B2; programmatic migrator surfaced it). Retained CI diagnostics: redacted `ci-db-probe.ts` + programmatic `ci-migrate.ts` (deterministic, prints real errors; local dev keeps `bun run db:migrate`) |
| 16 | live Google OAuth | ✅ PASS (2026-08-23) | full live flow on the dev server: sign-in/social → Google authorize URL (PKCE S256, real client_id, callback `http://localhost:5173/api/auth/callback/google`) → user-assisted consent → session issued (get-session: user tee.johnlor@gmail.com, `emailVerified: true`, `role: player`, `avatarEmoji: 🙂`, onboarding fields null) → Neon rows verified: `user`/`session` (expiry matches)/`account` (provider google). Per-provider `requireEmailVerification` gate confirmed; `ADMIN_EMAIL` (dedicated account) ≠ signed-in email → no promotion (correct). Temp dev page removed; no committed code touched |

- **CI fix (2026-08-23, run 1 failed then fixed):** the first pushed run failed at `bun run types:check` ("out of date"). Root cause: wrangler 4.125.0's types generation is **build-state-dependent** — the `Cloudflare.GlobalProps.mainModule` block (and the header hash) is only emitted when the configured `main` (`.svelte-kit/cloudflare/_worker.js`) exists; on a fresh checkout (CI, pre-build) the generated types differ from the committed baseline. The earlier local "hermetic parity" verification was a false positive (leftover `.svelte-kit` from prior builds — reproduced and corrected: with `.svelte-kit` removed the check fails identically). Fix: `types:check` moved AFTER the production build in `.github/workflows/ci.yml`; validated in a genuinely fresh state (no `.svelte-kit`): word-list → check → unit (22 pass/7 skip) → build → types:check ok → verify:bundle ok. `actions/checkout` bumped v4→v5 (Node 20 deprecation warning). The integration-job secrets-gate fix from the first failed run (parse error "Unrecognized named-value: secrets" — `secrets` is illegal in any `if:`; job-level `env:` + step-level `if: env.DATABASE_URL != ''` per the contexts availability table) is unchanged.
- **Test-count snapshot (corrected 2026-08-23):** per-commit suite totals (unit + integration): B6 = 14+7 = **21**; B7 (`c228196`) = 18+7 = **25** (the "25/25" figure referred to this pre-fix run); `c90716f` = 21+7 = **28**; final (`4b83167`+ — one unit test added: the deployed-Worker secret regression) = 22+7 = **29**. The "21 unit + 7 integration = 28 total" wording corresponded to the `c90716f` snapshot; the current suite is **22 unit + 7 integration = 29 total**.
- **CI diagnostics retained by design:** `scripts/ci-db-probe.ts` (redacted connection facts + pg error) and `scripts/ci-migrate.ts` (programmatic migrator, full error output) stay in the workflow — they cost ~1 s and cleanly separated connection vs tooling failures during Gate 3; local dev continues with `bun run db:migrate` (drizzle-kit CLI).
- **Gate 3 CLOSED (run 6 `6b646a2`, 2026-08-23):** all three jobs green — B7 checklist row 15 → PASS; security-relevant files remain byte-identical to reviewed `4b83167` (only CI scripts, workflows, migration metadata, and records changed since).

### Phase 0 B7 follow-up — independent + security review fixes (2026-08-23)

Independent (`tool:review`, verdict warn) and security (`tool:security_review`, verdict block: 1 critical / 1 high / 3 medium) reviews ran against e185dbf..HEAD. Fixes applied:

- **CRITICAL — hardcoded fallback auth secret usable in production** (`auth.ts`): now fails hard — `createAuth` throws when `BETTER_AUTH_SECRET` is missing under `NODE_ENV === 'production'` (folded at build time); dev/tooling keep the explicit `DEV_SECRET`. Restored `auth:schema` (the B4 factory refactor had broken the CLI's config convention) via a **generation-only** `auth.generate.ts` (never imported by app code); regenerated schema is byte-identical to the committed file. Unit tests: `tests/unit/auth.test.ts` (3).
- **HIGH — CSRF fail-open** (`lib/origin.ts`): removed the spoofable `x-forwarded-proto` dev-permissive heuristic — unsafe methods with **no** Origin/Sec-Fetch-Site are now rejected unconditionally, and `Sec-Fetch-Site: none` is rejected for mutations (ambiguous context). Live probes: headerless POST → 403, `Sec-Fetch-Site: none` POST → 403, same-origin POST → passes.
- **HIGH — 408 timeout degraded to 500 INTERNAL** (`lib/errors.ts`): custom `onError` replaces Hono's default, which is the only place `HTTPException` responses are preserved — `onErrorHandler` now returns `err.getResponse()` for `HTTPException`; regression test in `middleware.test.ts`.
- **MEDIUM — per-request DB session lookup in hooks** (`hooks.server.ts`): cookie fast-path — without the `better-auth.session_token` cookie, `locals` are nulled without touching Better Auth/the DB (keeps asset requests and logged-out browsing DB-free, fixes dev-without-DB page breakage).
- **MEDIUM — integration TRUNCATE parallelism**: already addressed at B6 (`fileParallelism: false`).
- **Accepted/documented LOW+INFO items** (no code change): answer-pool RLS deferred to Phase 5 hardening (server-only access path + bundle-secrecy gates in place); error-envelope `issues` passthrough is by design for validation; CI `integration` job targets the non-production DB from `secrets.DATABASE_URL` (operator boundary); `verify:bundle`/word-list scripts only ever hold public words.

Verification after fixes: `bun run check` 0 errors; unit suite 21/21 (5 files); production build green; `auth:schema` regenerates identically; live dev-server probes above.

Second review round (fresh `tool:review` + `tool:security_review` scoped to c90716f): verdicts **OK to ship** / **no blocking issues** — applied their micro-findings:
- `lib/origin.ts` docstring updated (no stale "allow in dev" that could be reverted into a fail-open).
- `auth.generate.ts` pins an explicit dummy `BETTER_AUTH_SECRET` → `auth:schema` is independent of the invoking shell's `NODE_ENV`.
- `getAuth` cache key now includes `BETTER_AUTH_SECRET` (rotation rebuilds; misconfigured deploy fails fast on first request — module scope cannot read env earlier in workers).
- `onErrorHandler` preserves `HTTPException` responses only for `status === 408` (the single intentional payload; anything else stays sanitized).
- `verify:bundle` additionally fails if the dev fallback secret literal appears in build output (NODE_ENV fold regression guard — verified absent).

**Correction (same round, third review pass):** the fold assumption was wrong. The expanded bundle walk (now covering `.svelte-kit/output/server`, where the app code actually lives — `_worker.js` is only the ~4 KB adapter shell) found `process.env.NODE_ENV === 'production'` emitted **dynamically** in the SSR chunk with `DEV_SECRET` intact — on a deployed Worker `NODE_ENV` is never set, so the previous check would have selected the dev secret. Replaced with **runtime-conditional, fold-independent** policy: production is the default; the dev fallback is allowed only when `process.env.NODE_ENV ∈ {development, test}` (tooling-controlled: vite dev / vitest). Unit test covers the unset-NODE_ENV (deployed Worker) condition. The bundle literal scan became advisory (literal presence is expected; the effective-secret policy is runtime-enforced + tested). `verify:bundle` now scans client + server bundles for answer-pool words.

## Hono

Use **Hono** as the dedicated API/business boundary beneath SvelteKit's `/api/*` routes.

Hono responsibilities:

- authentication/session enforcement
- authorization
- game start/continue/guess/finish operations
- server-authoritative game verification
- leaderboard/history/statistics API
- input validation
- admin authorization and puzzle management
- cross-cutting middleware composition (CSRF for JSON mutations, authorization, rate limiting, secure headers, request timeout, payload-size limits, requestId/error envelope, error handling) in `src/server/middleware/`

Hono should remain platform-neutral where practical.

## Backend code location

Keep the actual Hono/backend/domain implementation under `src/server/`. The SvelteKit API catch-all is only an integration boundary.

Suggested structure:

```text
src/
├── routes/
│   └── api/
│       └── [...path]/
│           └── +server.ts       # SvelteKit → Hono bridge only
│
├── lib/                         # FSD frontend/application code
│   ├── app/
│   ├── features/
│   ├── entities/
│   └── shared/
│
└── server/                      # Hono/backend/domain code
    ├── middleware/              # cross-cutting: CSRF (Origin/Sec-Fetch-Site for JSON mutations), authz, rate-limit, timeout, body-limit, requestId/envelope, headers, errors
    ├── lib/                     # shared server helpers: error envelope, origin validation, logging
    ├── auth/
    ├── game/
    ├── puzzle/
    ├── leaderboard/
    ├── profile/
    └── admin/
```

`src/routes/api/[...path]/+server.ts` must not contain game logic, database queries, authorization rules, or other domain behavior. It adapts the SvelteKit/Cloudflare request environment into Hono and delegates to the Hono application.

## SvelteKit ↔ Hono integration

Mount Hono behind a SvelteKit API catch-all, conceptually:

```text
/api/game/*
/api/history
/api/leaderboard/*
/api/stats
/api/me
/api/admin/*
        ↓
SvelteKit catch-all API route
        ↓
Hono
```

SvelteKit pages do not duplicate Hono's business logic.

### SvelteKit form actions vs Hono

Do not create two competing mutation APIs. **Application/domain mutations must go through Hono `/api/*`**.

SvelteKit server capabilities such as `load`, hooks, and route/page composition may be used for page rendering and navigation/auth redirects, but do not use SvelteKit form actions for business mutations such as:

- starting/submitting a game
- editing profile data
- scheduling puzzles
- admin mutations
- leaderboard-affecting operations

A Svelte form can still call the typed Hono client. The rule is about backend ownership, not about whether a UI control happens to be an HTML `<form>`.

## Hono RPC

Use Hono RPC so the frontend can consume the server route types rather than duplicating endpoint/response types manually.

### Hono RPC client pattern

Export the type from the fully composed Hono application and create one shared typed client for the frontend. The conceptual shape is:

```ts
// server/routes.ts
export type AppType = typeof app

// frontend shared API client
const api = hc<AppType>("/api", {
  init: { credentials: "include" }
})
```

TanStack Query should call this typed client from `queryFn`/mutation functions rather than building handwritten `fetch()` wrappers for the same endpoints. Check `response.ok` and throw an application error when appropriate before returning `response.json()`.

The exact Svelte Query syntax can evolve with the current `@tanstack/svelte-query` version, but the architectural rule is stable: **Hono RPC owns the typed HTTP contract; TanStack Query owns server-state caching/fetching.** Do not maintain a parallel manually typed API client.

The shared client accepts an injectable `fetch` implementation (`fetchImpl`) so it works from SvelteKit `load()` functions and tests. SvelteKit's `event.fetch` already forwards cookies on same-origin relative requests; keep the injection seam for test doubles and for any server-side call site that needs explicit cookie forwarding.

### Type boundary rule

Frontend may import **types** from `src/server` (e.g. `import type { AppType }`), but must never import server runtime code. This prevents server-only dependencies from crossing into the browser build. The type export path should go through `src/lib/shared/api/` which re-exports only the type, not the runtime.


---

# Validation

## Zod

Use **Zod** for runtime validation of all untrusted data:

- API bodies
- path/query parameters
- profile forms
- guesses
- admin input
- business/domain rules

TypeScript types alone are not sufficient for network input.

## Drizzle-Zod

Use **Drizzle-Zod together with Zod**, not instead of Zod.

Drizzle-Zod derives Zod schemas from database tables where appropriate. Ordinary Zod schemas remain appropriate for game/business rules that do not naturally map to a database table.

Example:

```text
Drizzle schema → Drizzle-Zod → Zod runtime schema

submitGuess request → ordinary Zod schema
```

---

# Database

## PostgreSQL / Neon

Use **PostgreSQL hosted by Neon**. The target Neon region is **Singapore (`ap-southeast-1`)** because the expected audience is primarily in the Philippines/nearby region.

Neon is intentionally used as database infrastructure rather than as an all-in-one application backend.

## Cloudflare database connection strategy

Because production runs on Cloudflare Workers, use Neon's serverless driver with WebSocket support for interactive transactions. The V1 strategy is:

```text
@neondatabase/serverless
        ↓
drizzle (WebSocket-capable driver)
        ↓
Drizzle
        ↓
Neon PostgreSQL
```

The architecture requires interactive transactions with `SELECT ... FOR UPDATE` for game submission concurrency and settlement finalization. The HTTP-only driver (`drizzle-orm/neon-http`) does not support these operations. Use the WebSocket-capable driver from `@neondatabase/serverless` for all database operations.

If a future feature genuinely requires a different connection mode, verify the current Neon Worker-compatible approach before changing the architecture.

The database client should be created in the server/database layer and receive runtime credentials from the Worker environment/bindings. Do not embed `DATABASE_URL` or other credentials in source code or the client bundle.

## Drizzle ORM

Use **Drizzle ORM** for:

- table/schema definitions
- type-safe queries
- database access
- migrations via Drizzle Kit

Do not reject Drizzle based on generic ORM-latency claims. For this application, network/database placement, connection handling, query design, and indexes matter much more than the small abstraction overhead. Optimize from measurements.

## Initial database model

### `user` (Better Auth managed)

Better Auth owns the `user` table schema via its Drizzle adapter. The application extends it with custom fields configured through Better Auth `user.additionalFields`; the same columns must also exist in the Drizzle schema passed to the adapter, kept in sync through migrations (config alone does not create columns). Do not create a separate custom users table.

```text
user (Better Auth managed)
────────────────────────────
id                    # Better Auth primary key
name                  # display name (from Google or onboarding)
email
emailVerified
image                 # Google profile image
createdAt
updatedAt

# Application extensions (configured via Better Auth `user.additionalFields` +
# matching Drizzle schema columns, kept in sync through migrations):
avatarEmoji               # curated Unicode emoji, validated server-side
role                      # "player" | "admin", server-controlled (input: false)
display_name_normalized   # UNIQUE — canonical display-name form (see Display-name rules)
onboarding_completed_at   # nullable timestamp; set when onboarding completes
```

Better Auth's `account` table handles Google provider linkage. Better Auth's `session` table manages session lifecycle.

The `answer_dictionary`, `daily_puzzles`, `games`, and `guesses` tables are application tables managed by Drizzle directly, not by Better Auth.

### `answer_dictionary`

Server-only approved pool of words that are allowed to become daily answers.

```text
id
word              # UNIQUE — each approved answer word is used at most once
normalized_word   # UNIQUE — lowercase, trimmed; prevents near-duplicate answers
```

This must **not** be stored in the public Git repository if it contains future answers.

### `daily_puzzles`

```text
id
puzzle_date              # DATE NOT NULL UNIQUE — one puzzle per Asia/Manila calendar date
answer_id                # FK to answer_dictionary, UNIQUE (one use only)
hint_letter              # exactly one ASCII letter (A-Z); must occur in the answer;
                         # validated and persisted at scheduling time, never at activation
status                   # SCHEDULED | ACTIVE | FINALIZED
locked_at                # nullable timestamp; set when first player starts
expires_at               # TIMESTAMPTZ NOT NULL = (puzzle_date + 1) AT TIME ZONE 'Asia/Manila';
                         # computed at schedule time; recomputed on date move or same-day replacement
average_completion_time_ms  # frozen at finalization (COMPLETED games only)
non_completion_penalty_ms   # frozen at finalization (average + 20 min)
finalized_at             # nullable timestamp; set at settlement
created_at
```

Index candidates (confirm against actual query plans; UNIQUE constraints already create indexes): `daily_puzzles(status, puzzle_date)`, `games(puzzle_id, status)`.

Lifecycle:

```text
status:    SCHEDULED → ACTIVE → FINALIZED
locked_at: null      → set on first player start → unchanged
```

Note: `locked_at` is a **mutability state**, not a lifecycle status. It indicates answer/hint immutability. The lifecycle status (`SCHEDULED→ACTIVE→FINALIZED`) controls the puzzle period. `locked_at` being set means the answer/hint cannot be changed, regardless of the lifecycle status.

Invariants:
- `locked_at != null` → answer and hint cannot be changed
- `FINALIZED` → puzzle is immutable, penalty values are frozen
- `hint_letter` satisfies `char_length(hint_letter) = 1 AND hint_letter ~ '^[A-Z]$'` (DB CHECK); membership in the answer is enforced by application validation at scheduling time (a CHECK cannot reference another row)
- At most one puzzle per `puzzle_date`
- Finalization is idempotent and atomic (see Settlement section)

### `games`

```text
id
user_id
puzzle_id
status                   # ACTIVE | COMPLETED | FAILED | FORFEITED
started_at               # server-generated, set once
completed_at             # server-generated, nullable
completion_time_ms       # computed and stored once at completion (COMPLETED only); nullable
guess_count              # actual number of valid guesses made
created_at
updated_at
```

Constraints:
- `UNIQUE(user_id, puzzle_id)` — at most one game per user per puzzle
- `UNIQUE(game_id, guess_number)` on guesses — sequential, no duplicates

Statuses:
- `ACTIVE` — game in progress, accepts guesses
- `COMPLETED` — solved within six guesses
- `FAILED` — six guesses used without solving
- `FORFEITED` — game expired at daily reset

`completion_time_ms` is authoritative only for COMPLETED games. FAILED and FORFEITED games retain NULL `completion_time_ms`.

MISSED is **not a stored status**. It is a derived state: the absence of a game row for a user + finalized puzzle means MISSED. Do not create game rows for players who never started.

### `guesses`

```text
id
game_id
guess_number             # 1-6, UNIQUE(game_id, guess_number)
word                     # the guessed word
feedback                 # green/yellow/gray result for historical reconstruction
created_at
```

Guesses are sequential. Only ACTIVE games accept new guesses. The guess number is validated server-side against the current `guess_count`.

### Concurrency and transaction semantics

All game mutations use a consistent lock ordering: **puzzle row first, then game row**. The puzzle row is the serialization point for daily boundary operations.

**Guess submission:**

```text
1. BEGIN TRANSACTION
2. Lock puzzle row (SELECT ... FOR UPDATE)
3. Verify puzzle status = ACTIVE and expires_at > transaction_timestamp() (eligibility anchor; see Expiry deadline contract)
4. Lock game row (SELECT ... FOR UPDATE)
5. Verify game status = ACTIVE
6. Determine next guess number
7. Insert guess
8. Update game (guess_count, status if terminal)
9. COMMIT
```

**Game start:**

```text
1. BEGIN TRANSACTION
2. Lock puzzle row (SELECT ... FOR UPDATE)
3. Verify puzzle status = ACTIVE and expires_at > transaction_timestamp() (eligibility anchor; see Expiry deadline contract)
4. Set locked_at = now() if null (answer/hint immutability)
5. Create new game row (UNIQUE(user_id, puzzle_id) ensures idempotency)
   or retrieve existing game if one already exists
6. COMMIT
```

This ensures game creation and answer locking are atomic. Whichever transaction obtains the puzzle row lock first determines whether the answer can still be edited.

Terminal state transitions (ACTIVE → COMPLETED/FAILED) must be atomic within the same transaction.

### Expiry deadline contract

Eligibility and serialization are two separate concepts:

- **Eligibility (arrival anchor):** a mutation is eligible only when its transaction begins before `expires_at`. `transaction_timestamp()` is the authoritative transaction-start eligibility anchor — not a proxy for HTTP arrival (`statement_timestamp()` is server-receipt time).
- **Serialization (lock order):** after eligibility, the puzzle-row lock decides the outcome against `finalizePuzzle`. Whichever transaction acquires the puzzle-row lock first serializes.

Do **not** use `clock_timestamp()` as the authority: it shares the same check-then-commit gap and would make acceptance depend on lock-wait timing.

Invariant: a request whose transaction-start eligibility time is after `expires_at` can never pass the expiry check. Lazy finalization (below) remains the recovery path for expired-but-unfinalized puzzles.

Mandatory midnight-crossing integration tests, both lock orders:

- **A — guess wins:** the guess transaction acquires the puzzle-row lock before finalization → guess commits, game is COMPLETED; finalization converts only remaining ACTIVE games to FORFEITED.
- **B — finalize wins:** finalization acquires the lock first and commits FINALIZED; the guess transaction then acquires the lock, its post-lock `status = ACTIVE` check fails (it observes FINALIZED), and the guess is rejected.

### Settlement (daily finalization)

Settlement runs at Asia/Manila midnight via Cloudflare Cron Trigger (`triggers.crons = ["0 16 * * *"]` — Cloudflare cron is UTC-only; Asia/Manila is UTC+8 and observes no DST; the boundary is evaluated in the database as `expires_at <= now()`). The cron is a reconciliation job that handles missed executions:

```text
1. Find any expired non-finalized puzzles → finalize them (idempotent)
2. Find today's SCHEDULED puzzle → activate it
3. Ensure no other puzzle for today's date is ACTIVE
4. Alert if today's puzzle is missing
```

Each operation (finalize, activate) is independently retryable and idempotent. The cron handles both the normal midnight transition and recovery from missed executions.

`activatePuzzle(date)`:
```text
  1. BEGIN TRANSACTION
  2. Find SCHEDULED puzzle for date
  3. If none found → fail closed + operational alert (see missing-puzzle invariant)
  4. Set status = ACTIVE
  5. COMMIT
```

`finalizePuzzle(puzzleId)`:
```text
  1. BEGIN TRANSACTION
  2. Lock puzzle (SELECT ... FOR UPDATE)
  3. Skip if already FINALIZED (idempotent)
  4. Convert remaining ACTIVE games → FORFEITED
  5. Calculate average_completion_time_ms from COMPLETED games only
  6. Calculate non_completion_penalty_ms (average + 20 min)
  7. If zero COMPLETED games: set averages to NULL
  8. Mark puzzle FINALIZED with finalized_at timestamp
  9. COMMIT
```

Lazy fallback: if a request arrives for an expired puzzle that hasn't been finalized, attempt idempotent finalization before processing the request.

Lazy activation: if `POST /api/game/start` arrives while today's puzzle is still `SCHEDULED` because the cron activation was missed, the game-start transaction may lazily activate it — after acquiring the puzzle-row lock (`SELECT ... FOR UPDATE`) and verifying `puzzle_date` = current Asia/Manila date, `status = 'SCHEDULED'`, `expires_at > transaction_timestamp()`, and that no other ACTIVE puzzle exists for today's date. Fail-closed + alert applies only when the puzzle row for today is absent (missing-puzzle invariant).

### Clock and late-request contract

All competitive timestamps use **PostgreSQL database time** consistently:

- `started_at` — generated by database at game creation
- `completed_at` — generated by database at game completion
- `expires_at` — compared against database time
- `locked_at` — generated by database at lock
- `finalized_at` — generated by database at settlement

Never use Worker clock or browser time for game validity decisions. The database is the single authoritative clock domain for all competitive timing.

Requests arriving after `expires_at` (compared against database time) are rejected or trigger lazy finalization.

### Answer lock

The answer lock is race-safe:

```text
UPDATE daily_puzzles
SET locked_at = now()
WHERE id = ?
  AND locked_at IS NULL
  AND status = ACTIVE
```

Admin answer updates require `locked_at IS NULL`. If `locked_at` is set, the answer cannot be changed.

### Answer uniqueness

Each approved answer may only be used once across all puzzles. Enforce with a database constraint:

```text
UNIQUE(daily_puzzles.answer_id)
```

Application validation provides friendly error messages; the database constraint is the final guard against races.

### Missing-puzzle invariant

A puzzle must exist before a date becomes the next active date. If the midnight cron finds no `SCHEDULED` puzzle for the next date:

- fail closed (no game available for that day)
- raise an operational alert
- do not automatically generate a puzzle (answer secrecy is a deliberate product requirement)

This is a hard invariant, not a soft degradation.

### Admin scheduling window and same-day replacement

Admin mutation rules are an explicit state model, not a side effect of `locked_at`:

- Ordinary scheduling/editing applies to **future dates only**. Scheduling or editing a past date is rejected.
- `DELETE` is allowed only for future puzzles: `locked_at IS NULL AND status = 'SCHEDULED' AND puzzle_date > current Asia/Manila date`, else 403. A current-date puzzle can never be plain-deleted.
- Once a puzzle's effective date begins, its answer/hint is immutable:
  - future date → normal scheduling/editing;
  - today + `SCHEDULED` + never started (cron missed) → **atomic same-day replacement** only;
  - today + `ACTIVE` → immutable;
  - `FINALIZED` → immutable.
- The **atomic same-day replacement** is a single recovery transaction (never delete+reschedule): lock the row, verify `puzzle_date` = current Asia/Manila date, `status = 'SCHEDULED'`, `locked_at IS NULL`, then UPDATE `answer_id`/`hint_letter` in place — re-checking `UNIQUE(answer_id)`, regenerating/persisting the hint per the hint rule, and recomputing `expires_at`. No transient gap, and no spurious missing-puzzle alert.
- Moving a scheduled puzzle to another future date recomputes `expires_at` and re-checks `UNIQUE(puzzle_date)`. Resulting date gaps trigger the missing-puzzle alert.

### Display-name rules (uniqueness and moderation)

The user table includes a `display_name_normalized` column with a `UNIQUE` constraint. V1 display names use an explicit ASCII charset: `[a-z0-9 _-]` (case-insensitive), 2–15 characters.

Two separate functions live in `src/lib/shared/lib/`:

- `canonicalizeDisplayName()` — canonical form for the `display_name_normalized` uniqueness column (ASCII charset, lowercase, trim, collapse whitespace).
- `moderationKeyForDisplayName()` — aggressive detection representation for profanity/obfuscation checks (leet/confusable mapping, separator removal), evaluated against a baseline English profanity list plus a project-specific versioned banned list (`src/lib/shared/config/banned-words.json`).

Uniqueness and moderation intentionally use different keys: what defines identity (canonical form) and what catches obfuscation (moderation key) are separate concerns. Application validation runs first; the database UNIQUE constraint is the final guard.

### Onboarding state

Better Auth's user table is extended with `onboarding_completed_at` (nullable timestamp). `emailVerified` is not hard-coded: Better Auth maps the social provider's verification signal into the local field, and the per-provider `requireEmailVerification: true` option for Google gates session creation on the local verification state. Google `name` may prefill `user.name`, but onboarding re-validates it against the display-name rules and forces a new choice when invalid; `display_name_normalized` is computed at onboarding save. A user is considered onboarded when:

```text
onboarding_completed_at IS NOT NULL
  AND avatarEmoji IS NOT NULL
  AND name passes validation
```

Protected routes (e.g., `/play`) check onboarding completion. Unauthenticated users see the landing page; authenticated but not onboarded users see onboarding.

### Admin bootstrap

There is one initial admin account. Bootstrap mechanism:

1. Configure `ADMIN_EMAIL` environment variable with the project owner's verified Google email. Enable per-provider `requireEmailVerification` for Google so `emailVerified` gates the bootstrap.
2. On first login, Better Auth creates the user. The application checks if `user.email === ADMIN_EMAIL`.
3. If match: atomically set `user.role = 'admin'` in a transaction.
4. Subsequent logins: if `user.email === ADMIN_EMAIL` and `user.role !== 'admin'`, re-promote (defensive).
5. If `ADMIN_EMAIL` changes: do NOT demote existing admins. New admin must be manually promoted.
6. The bootstrap check runs on every login for the configured email, but only promotes — never demotes.
7. Identity model: with Google as the only provider, implicit account linking applies only to same-email verified identities, and linking never mutates the local `email`/`emailVerified`. If `ADMIN_EMAIL` is misconfigured or no admin exists, recovery is a **manual database/operator bootstrap** (SQL/migration procedure, operator-verified) — a no-admin state cannot be fixed through the app Admin UI.

### Future/social tables

Friendships, groups, achievements, activity, etc. should be added only when features require them.

---

# Word-data model and public repository

There are intentionally **two different word concepts**:

### Valid guesses

A larger set of words accepted as player guesses. It is acceptable to ship this list to the browser in V1 for instant local validation.

However, the server must validate against its authoritative copy too. Client validation is a UX optimization, never a security boundary.

The public valid-guess list may live in the repository and be bundled for the client.

### Approved answers

A stricter set of words allowed to become the daily answer. This list may contain future answers and therefore must not be exposed in the public repository.

Store the approved answer dictionary server-side, preferably in Neon in `answer_dictionary`.

**Invariant:** every approved answer must exist in the canonical valid-guess dictionary. The seed/import process must verify this and fail if any answer is not found in the valid-guess set. This prevents scheduling an answer that players cannot type.

If maintaining a master import file locally, keep it private/gitignored and seed/import it into the database. Do not ship the future answer pool to the frontend.

### Admin answer validation

When an admin schedules a word:

```text
normalize word
  ↓
check approved answer dictionary
  ↓
check duplicate scheduled/used answer
  ↓
validate basic word constraints
  ↓
validate hint_letter (exactly one ASCII letter, occurs in the answer; persist at scheduling time)
  ↓
allow/reject scheduling
```

The admin calendar must flag invalid or duplicate answers.

---

# Authentication and authorization

## Authentication

Use **Better Auth** as the authentication library. It provides Google OIDC, session management, secure cookies, and SvelteKit/Hono integrations. The application delegates identity/session management to Better Auth and handles authorization/business rules itself.

Better Auth manages its own `user` and `session` tables via the Drizzle adapter. Do not create separate custom auth tables.

### Better Auth user schema

Better Auth's `user` table is extended with application-specific fields:

```text
user (Better Auth managed)
────────────────────────────
id                    # Better Auth primary key
name                  # display name (from Google or onboarding)
email
emailVerified
image                 # Google profile image
createdAt
updatedAt

# Application extensions (configured via Better Auth `user.additionalFields` +
# matching Drizzle schema columns, kept in sync through migrations):
avatarEmoji               # curated Unicode emoji, validated server-side
role                      # "player" | "admin", server-controlled (input: false)
display_name_normalized   # UNIQUE — canonical display-name form (see Display-name rules)
onboarding_completed_at   # nullable timestamp; set when onboarding completes
```

Better Auth's `account` table handles Google provider linkage. Do not store `provider_subject_id` as a custom field.

Better Auth's `session` table manages session lifecycle. Do not create a custom sessions table.

### Session/cookie strategy

Better Auth manages sessions and cookies. Production session cookie requirements:

```text
HttpOnly = true
Secure = true
SameSite = Lax
Path = /
```

Better Auth handles session creation, lookup, expiration, and revocation. The application does not implement custom session logic. The browser must not receive a long-lived session token through JavaScript-accessible application state; never expose the session secret/token in the client bundle. The Google OIDC callback and session creation happen server-side via Better Auth; the `/api/*` client uses same-origin cookies and the shared Hono RPC client is configured to send credentials.

Do not hard-code a session cookie domain unless deployment requires it. Prefer a host-only cookie for the single-origin application.

Do not store Google access/refresh tokens. The application only needs user identity from Google OIDC, not API access to Google services.

### Better Auth mounts at `/api/auth/*`

Better Auth's Hono integration mounts at `/api/auth/*` inside the Hono application:

```text
src/routes/api/[...path]/+server.ts
        │
        ▼
  Hono app
  ├── /api/auth/*    → Better Auth handler
  ├── /api/game/*    → application routes
  ├── /api/admin/*   → application routes
  └── ...
```

Do not create a separate SvelteKit `/api/auth` implementation competing with the Hono-mounted Better Auth.

### Auth ownership: Better Auth vs application

**Better Auth owns:**
- Google OIDC flow
- user identity
- sessions and session cookies
- login/logout/session lifecycle

**The application owns:**
- display-name rules and validation
- emoji avatar validation (against curated set)
- player/admin roles (via `role` field with `input: false`)
- game ownership and authorization
- admin authorization
- all Wordle business logic

Do not use Better Auth's Admin plugin. A simple `role` field with Hono authorization middleware is sufficient.

## Authentication ownership: SvelteKit hooks vs Hono

SvelteKit `hooks.server.ts` runs before route handling, including requests that will eventually reach the Hono `/api/*` catch-all. Better Auth provides a SvelteKit integration that resolves the session from the cookie and populates `event.locals`.

This must be treated as a deliberate boundary, not an accidental second auth system.

### SvelteKit hooks

Better Auth's SvelteKit integration handles:
- session resolution from the cookie
- populating `event.locals.user` and `event.locals.session`
- page-level auth redirects

### Hono

Hono remains the **authoritative API authentication/authorization boundary**. It must independently establish the authenticated user for API requests and perform API ownership/role checks. Better Auth is mounted at `/api/auth/*` for auth-specific endpoints; application routes at `/api/game/*`, `/api/admin/*`, etc. perform their own authorization.

The two layers must not implement separate, divergent authentication logic. A request reaching Hono must never be considered authorized merely because a SvelteKit hook previously observed a valid session.

This prevents both under-checking and confusing double implementations.

Use roles from the beginning. Better Auth's `user` table is extended with a `role` field (`input: false`, server-controlled). Initial roles should at least support:

```text
player
admin
```

The admin account associated with the project's configured Google identity should be provisioned with `admin` role via server-side database update, not through Better Auth's Admin plugin. Authorization checks must use the role/identity model rather than scattering email comparisons throughout routes.

This leaves room for future moderator/admin expansion.

---

# Security model

## Trust boundary

> **The browser is untrusted. The server is authoritative.**

Attackers may alter JavaScript, requests, IDs, payloads, timing, client state, or bypass the UI entirely.

Never trust client-provided:

- score
- win/loss result
- completion time
- started time
- user ID for ownership
- puzzle answer
- authorization/role

Server-side authorization and validation must be enforced on every protected operation.

## Game authority

When a player submits a guess:

```text
Client
  ├── local UI/input validation
  ├── local display/animation
  └── POST actual guess
          ↓
Hono
  ├── authenticate user
  ├── authorize game ownership
  ├── verify game is active
  ├── verify puzzle has not expired
  ├── validate guess against server dictionary
  ├── calculate green/yellow/gray feedback
  └── persist authoritative result
          ↓
Client receives feedback
```

The current answer must never be exposed to client JavaScript.

## CSRF boundary

SameSite=Lax (session/cookie strategy above) blocks cross-site POST cookies. Defense-in-depth adds a **custom** Hono middleware in `src/server/middleware/` verifying `Origin`/`Sec-Fetch-Site` on **all unsafe application cookie-authenticated mutations regardless of content-type** (`/api/game/*`, `/api/me/*`, `/api/admin/*`).

Do **not** rely on Hono's built-in `csrf()` for this: it engages only for form content-types (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) and never fires for JSON requests, so it cannot protect the `hc` JSON client. `/api/auth/*` is excluded from both: OAuth callbacks are cross-site by nature and Better Auth owns its CSRF there. `Sec-Fetch-Site` is auxiliary evidence — reject only when **both** the origin check and the sec-fetch-site check fail; a missing header fails that check. No state-changing endpoint may be GET-reachable (verify Better Auth's sign-out route).

### Error envelope contract

Every API error returns a stable envelope: `{ error: { code, message, requestId, issues? } }` with a centralized status→code map (no ad-hoc error bodies). One `requestId` is generated per request, echoed in the response and logs for correlation. Centralized `onError`/`notFound` handlers enforce the shape; business routes return typed errors that map to codes. Log request bodies only for status ≥ 500 (client errors are not log noise).

Request hardening in the same middleware layer (NG19/NG20): `hono/timeout` (30 s → JSON 408) and a 64 KB payload cap (→ JSON 413), both before validation and both using the error envelope.

### Secure headers baseline

The middleware layer (`src/server/middleware/`) sets a baseline header set: `X-Content-Type-Options: nosniff`, a framing policy (`frame-ancestors 'none'`, or `X-Frame-Options: DENY` until CSP lands), `Referrer-Policy: strict-origin-when-cross-origin`, and HSTS in production. A `Content-Security-Policy` is introduced at Phase 5 (NG17: nonce/hash-compatible with the pre-paint theme script); until then the framing and response-header baseline covers the same vectors.

## Timer authority

The server generates `started_at` when the game begins and `completed_at` when the game is completed.

```text
completion_time_ms = completed_at - started_at
```

The client timer is **display only**. Reloading/leaving the page does not reset it; the display is reconstructed from server-authoritative timestamps.

Do not accept client-provided `started_at`, `completed_at`, or completion time as authoritative.

## Daily expiration

Games may be continued after leaving the page. There is no manual forfeit action.

The game automatically becomes `FORFEITED` when the next daily puzzle reset occurs. The canonical reset timezone is **Asia/Manila**.

Theoretical maximum duration for a game started immediately after reset is just under 24 hours.

---

# Security verification/testing

Security is part of development rather than a final scanner score.

## OWASP ASVS

Use **OWASP Application Security Verification Standard (ASVS)** as the security requirements/verification framework. Select the relevant controls for this application and record implementation/testing status.

## Playwright

Use Playwright for functional and security regression tests, especially:

- unauthenticated access to protected pages/API
- logout/session invalidation
- user A cannot access user B's history/game/profile data
- user A cannot modify user B's resources
- fake scores/wins are rejected
- guesses beyond six are rejected
- completed/expired games cannot be modified
- duplicate completion is rejected
- another player's game cannot be submitted
- malformed/oversized/wrong-type inputs are rejected
- rapid repeated requests are handled appropriately

## OWASP ZAP

Use OWASP ZAP against local/preview environments for dynamic security testing, starting with a baseline/passive scan. Review findings; do not treat a clean scanner report as proof of security. Avoid aggressive active scans against production unless deliberately testing an isolated environment.

## Dependency/supply-chain security

Use GitHub Dependabot or equivalent dependency vulnerability/update automation. Do not add multiple overlapping scanners unless there is a concrete reason.

## Manual adversarial testing

Friends should deliberately test:

- API bypasses
- modified IDs
- forged scores
- ownership/authorization failures
- replayed requests
- malformed input
- rapid requests
- profile/role manipulation
- puzzle/game manipulation

Security requirements should focus especially on authorization and game integrity because these are the highest-value attack surfaces for this application.

## Rate limiting

Define endpoint classes with distinct rate-limiting policies:

| Endpoint class | Identity dimension | Suggested limit | Enforcement |
|---|---|---|---|
| Game mutations (`/api/game/*`) | per session | 30 req/min | Application middleware (Workers Rate Limiting API binding) |
| Auth endpoints (`/api/auth/*`) | per IP | 10 req/min | Application middleware (Workers Rate Limiting API binding) |
| Profile changes (`/api/me/*`) | per session | 10 req/min | Application middleware (Workers Rate Limiting API binding) |
| Admin endpoints (`/api/admin/*`) | per session + role check | 20 req/min | Application middleware (Workers Rate Limiting API binding) |
| Read endpoints (`GET /api/*`) | per IP | 100 req/min | Cloudflare edge |

For Cloudflare Workers, use the **Cloudflare Workers Rate Limiting API** for application-level rate limiting. This provides distributed, key-based counters backed by Cloudflare infrastructure. Configure rate limits per endpoint class using the Rate Limiting binding in `wrangler.toml`. Note: the Rate Limiting API is intentionally eventually consistent and locality-based — treat it as abuse protection, not exact accounting. Cloudflare edge rules handle IP-based limiting for public read endpoints. Rate limiting is implemented alongside each feature in its respective phase, not deferred to Phase 5.

Implementation notes: key per session `user_id` when authenticated, else per `CF-Connecting-IP`; respond with `x-ratelimit-*` headers; skip `OPTIONS`; when the Rate Limiting binding is absent (local development), pass through instead of failing.

---

# Cloudflare/SvelteKit/Hono platform boundary

The preferred production platform is **Cloudflare Workers**. For SvelteKit, use the current **`@sveltejs/adapter-cloudflare`** adapter. **Do not install or follow the deprecated `@sveltejs/adapter-cloudflare-workers` package/docs**, even though legacy documentation may still exist online. Verify the current adapter API/types when implementing because platform property names can evolve with SvelteKit versions.

Cloudflare Workers require the `nodejs_compat` compatibility flag because Better Auth uses `AsyncLocalStorage`. Include this in `wrangler.toml`:

```json
{
  "compatibility_flags": ["nodejs_compat"]
}
```

The SvelteKit-to-Hono catch-all route is the **single platform bridge**. Conceptually:

```text
SvelteKit +server.ts
    │
    ├── Request
    ├── event.platform.env
    └── event.platform.ctx
             │
             ▼
       Hono app.fetch(...)
             │
             ├── c.env
             └── c.executionCtx
```

Property names (e.g. `platform.ctx` vs `platform.context`) depend on the SvelteKit and adapter versions installed; verify the current types during implementation.

Only this integration layer should translate SvelteKit/Cloudflare platform bindings into Hono's environment. Hono domain/application code must not depend directly on SvelteKit `RequestEvent` objects.

The intended request flow is:

```text
HTTP request
   ↓
SvelteKit `hooks.server.ts`
   ↓
SvelteKit `/api/[...path]/+server.ts`
   ↓
`app.fetch(request, env, executionContext)` / equivalent current Hono entry point
   ↓
Hono `c.env` + request context
   ↓
server/domain services
```

If the current SvelteKit/Cloudflare adapter exposes platform bindings under a changed property name in a future version, update only this adapter/bridge boundary and its types; do not leak those platform details throughout the domain code.

Keep Cloudflare bindings, Wrangler configuration, and deployment-specific environment handling at this boundary so the core Hono/game/domain logic remains portable to other runtimes.

# Performance

The application should optimize for **instant perceived gameplay** rather than making every visible interaction wait for a server response.

Client can immediately:

- accept keyboard input
- render a submitted row
- show tile animations
- maintain keyboard display state

The server remains authoritative for feedback and persistence.

The likely performance priorities are:

1. compute/database geographic placement
2. serverless/connection setup and cold-start behavior
3. query efficiency
4. appropriate indexes
5. unnecessary network round trips
6. ORM overhead

Do not prematurely optimize. Measure actual latency from expected users in the Philippines to the deployed application and Neon Singapore.

## Cloudflare Workers

Preferred deployment target: **Cloudflare Workers** with the current SvelteKit Cloudflare adapter/tooling.

Cloudflare is intentionally chosen partly because this is a learning project: Workers, bindings, placement, and edge/serverless execution are useful transferable knowledge.

Use current placement capabilities (such as Smart Placement/current placement controls) where beneficial. Do not assume that edge execution is automatically faster for a database-backed request; database location and Worker placement must be considered together.

## Vercel fallback

Vercel is a valid alternative, especially for deployment simplicity. If used, deliberately place application compute in **Singapore (`sin1`)** so it is near the Neon Singapore database rather than relying on a default region.

Do not split the frontend and Hono API into separate deployments unless a concrete requirement appears.

---

# Core API shape

Illustrative, not immutable:

```text
GET  /api/game/today          # pre-game metadata only (no hint, no answer feedback)
POST /api/game/start           # atomically starts game, returns hint + game state
POST /api/game/:id/guess       # submit guess (requires active game, puzzle not expired)
GET  /api/game/history

GET  /api/leaderboard/today
GET  /api/leaderboard/yesterday
GET  /api/leaderboard/week
GET  /api/leaderboard/month

GET  /api/stats
GET  /api/me
PATCH /api/me/profile
POST /api/auth/logout

GET/POST/PATCH /api/admin/puzzles/*
```

Exact endpoint names may change, but all state-changing/protected operations must be implemented server-side and authorized.

Leaderboard response contract (see Ranking model): `?limit=10` is a **dense-rank cutoff** (`rank <= 10` — ties may include more than 10 entries); `count` is the total number of qualified players; the response includes the viewer's own rank as `currentUser: { rank, entry }` so the result screen can show "Current position" for any rank (not just the top 10).

---

# Ranking model

Store raw facts on games. Do not create a separate ranking-result table in V1.

## Daily scoring function

```text
dailyScore(player, puzzle):
    COMPLETED → completion_time_ms
    FAILED    → non_completion_penalty_ms
    FORFEITED → non_completion_penalty_ms
    MISSED    → non_completion_penalty_ms (derived: no game row)
```

## Guess count for leaderboard

```text
leaderboard_guess_count =
    COMPLETED ? games.guess_count : 6
```

Never use raw `guess_count` for leaderboard aggregation on non-completed games.

## Multi-day aggregation

```text
playerPeriodAverage =
    SUM(dailyScore for eligible days) / number_of_eligible_days
```

Eligible days:
- finalized puzzle-days only
- exclude puzzle-days with zero COMPLETED games (NULL penalty)
- current active day contributes only COMPLETED games until finalization

Week boundaries: the canonical week starts on **Monday (ISO-8601)** in the Asia/Manila calendar. The start day is a product constant (`WEEK_START = MONDAY`); changing it is a product decision, not a code change.

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

Definition: `earliest_qualifying_completion_at` = the minimum `completed_at` among the player's COMPLETED games on eligible finalized days in the period — the same day set used for the score average.

This is intentional for a speedrun app: when two players have identical average time and guesses, the player who completed their qualifying games earlier ranks higher. This rewards consistent early solving across the period.

Rank vs display order are separate concepts: the rank key is `DENSE_RANK() OVER (ORDER BY avg_time, avg_guesses, earliest_qualifying_completion_at)`; the display order is `ORDER BY rank, user_id`. `user_id` is a deterministic display-order key only and must never be part of the rank window — it must not change shared ties.

Rank style: **dense** — ties share the same rank and the next distinct result receives the immediately following rank (e.g., 1, 1, 2, 3).

Do not combine seconds and guesses into an arbitrary single number for V1.

## Participation threshold

```text
QUALIFIED if completed_days >= threshold
```

- Threshold is an absolute number of days (configurable constant)
- Different thresholds for week vs month
- Evaluated using finalized days only
- Current day not counted until finalized

## Raw game facts

Never overwrite raw game data. Leaderboard penalties are derived from finalized daily-puzzle values. Historical facts remain available for future ranking algorithm changes.

---

# Development phases

## Phase 0 — Foundation

Set up the project skeleton, infrastructure, and authentication core:

- SvelteKit + Bun + Cloudflare adapter
- Hono bridge (`src/routes/api/[...path]/+server.ts`)
- Drizzle ORM + Neon (WebSocket-capable driver for transactions)
- `wrangler.toml` with `nodejs_compat`
- TypeScript configuration
- `src/app.d.ts` with `App.Locals`
- Basic dev server and build pipeline
- CI pipeline scaffold (lint, `bun check`, unit + integration tests against a non-production database — see NG23)
- Environment/config management
- Better Auth core: Google OIDC, session cookie, user table
- `hooks.server.ts` with Better Auth session resolution
- Hono authentication helper (independent from SvelteKit hooks)

## Phase 1 — Authenticated game vertical slice

Build the complete Wordle experience with authentication already in place:

- daily puzzle UI (board, keyboard, timer, hint)
- six guesses with green/yellow/gray feedback
- in-app keyboard on all devices, physical keyboard on desktop
- local valid-guess checking (client-side UX optimization)
- server authoritative validation/feedback via Hono
- server-authoritative timer (started_at, completed_at)
- continue after leaving (session-based game resumption)
- automatic expiration at daily reset
- one attempt per user/day (UNIQUE constraint)
- game concurrency invariants (UNIQUE on guess_number)
- ownership authorization (user can only access own games)
- responsive/mobile UI
- animations (tile flips, shakes, celebrations)
- Play/start screen with pre-game hiding

## Phase 2 — Onboarding, profile, roles

Polish the authenticated experience:

- onboarding flow (display name + avatar selection)
- onboarding completion state
- player/admin role provisioning
- admin bootstrap mechanism
- profile editing (display name, avatar, theme)
- protected page redirects
- role-based page visibility (admin tab)

## Phase 3 — Leaderboard / history / settlement

Add history/statistics queries, ranking aggregation, and daily settlement over persisted game results:

- game history and statistics
- daily/yesterday/week/month leaderboards
- ranking aggregation algorithm
- daily settlement mechanism (cron trigger + idempotent finalize)
- non-completion penalty calculation
- participation thresholds
- result screen with current position

## Phase 4 — Admin

Add puzzle scheduling and management:

- calendar view for future puzzles
- answer validation against approved dictionary
- duplicate detection
- puzzle locking (first player start)
- admin-only access

## Phase 5 — Security verification and hardening

Verify and harden the security posture:

- OWASP ASVS review
- Playwright security regression tests
- OWASP ZAP baseline/passive scans
- dependency scanning (Dependabot)
- rate limiting
- security headers and Content-Security-Policy hardening (NG17/NG22 — CSP must remain nonce/hash-compatible with the pre-paint theme script)
- friend-led adversarial testing

## Phase 6 — Deployment

Deploy to production and verify:

- Deploy to Cloudflare Workers + Neon Singapore
- Measure real latency from Philippines users
- Optimize only when evidence supports it
- Production verification of settlement cron

---

# Test architecture

Tests are a first-class architectural concern. A CI pipeline (NG23, `.github/workflows/ci.yml`) runs these gates on pull requests against a non-production database. Three levels:

## Unit tests (domain logic)

Pure functions, no database:

- `evaluateGuess()` — Wordle duplicate-letter evaluator (exhaustive tests)
- `normalizeWord()` — input normalization
- `calculateLeaderboardScore()` — scoring algorithm
- `getPuzzleState()` — puzzle lifecycle logic
- `dailyScore()` — per-player daily scoring
- `leaderboard_guess_count` — raw vs penalized

## Integration tests (database + transactions)

Validate transactions and constraints:

- start game (idempotent, UNIQUE constraint)
- submit guess (concurrency, sequential numbering)
- complete/fail/forfeit game (terminal state transitions)
- finalize puzzle (idempotent settlement)
- admin scheduling (locking, duplicate detection)
- display-name uniqueness (UNIQUE constraint)
- injectable seams (db client, auth session resolver, RPC `fetchImpl`, timeout values) so integration tests run against Neon with real transaction semantics and lock ordering; content-based seams over mocks

## E2E / security tests (Playwright)

Browser-based functional and security tests:

- auth flow (Google OIDC → session → cookie)
- onboarding completion
- game flow (start → guess → complete/forfeit)
- reload/resume (continue after leaving)
- expiration (automatic forfeit at reset)
- ownership (user A cannot access user B)
- API bypass rejection
- fake scores/times rejected
- expired games immutable
- duplicate completion rejected
- admin-only access
- malformed/oversized inputs

```text
tests/
├── unit/           # pure domain logic
├── integration/    # database + transaction tests
├── e2e/            # Playwright browser tests
└── security/       # adversarial / ZAP tests
```

# State management boundary

TanStack Query manages durable server state. Local Svelte state manages ephemeral interaction state.

```text
TanStack Query:
  user/session
  game snapshot (from server)
  game history
  leaderboard
  statistics
  mutations (start, guess, etc.)

Local Svelte state:
  current typed guess (before submission)
  keyboard state before server response
  animation state
  pending guess (one in flight per game)
```

Only one guess mutation may be in flight per game. Client blocks UI during pending submission to prevent race conditions.

# Valid-guess dictionary

One canonical source file produces both server and client artifacts:

```text
canonical word list (source of truth) — src/server/data/valid-guesses.source.txt (git-tracked)
        ↓
scripts/build-word-list.ts
        ↓
server artifact (authoritative validation)
        ↓
client artifact — src/lib/shared/data/valid-guesses.json (bundled for local UX)
```

The build script generates both artifacts and enforces an automated equality/version check; the check also verifies the answers ⊂ valid guesses invariant. Server is always authoritative; client validation is a UX optimization.

Provenance (NG16): record for each word list (valid guesses, answer pool, banned words) the upstream source, exact version/commit, license, import date, and the normalization/five-letter filtering rules applied, so artifacts remain reproducible.

# Answer pool deployment

The approved answer dictionary is private and never bundled into the public repository or client build:

```text
private source file (gitignored, e.g. data-private/answer-pool.txt)
        ↓
seed/import script (scripts/seed/)
        ↓
Neon answer_dictionary table
```

Production builds never include the answer pool. Admin scheduling validates against the database copy.

# Guiding principles

1. The browser is untrusted; the server is authoritative.
2. Keep gameplay visually responsive while validating/persisting server-side.
3. SvelteKit owns pages/routing; Hono owns `/api/*` mutations and API behavior.
4. Better Auth handles identity/session; the application handles authorization/business rules. Hono remains the authoritative API auth/authz boundary.
5. Do not use SvelteKit form actions as a second business-mutation API; route application/domain mutations through Hono.
6. Zod and Drizzle-Zod solve different validation problems and should be used together.
7. Use TanStack's Svelte integrations where they provide real value. TanStack Query for durable server state; local Svelte state for ephemeral interaction state.
8. Apply FSD v2.1 to `src/lib` conservatively; keep `src/routes` as SvelteKit routing and do not force FSD onto the Hono backend. Start with `shared/` and `app/` only.
9. Keep future answers server-side; a public repository may contain the valid-guess dictionary.
10. Store raw game facts so ranking rules can evolve without rewriting history.
11. Keep roles and authorization explicit from the start.
12. Keep the SvelteKit/Cloudflare → Hono platform bridge isolated so domain code remains portable.
13. Treat security verification as an ongoing process using requirements, tests, scanning, dependency checks, and manual attack exercises.
14. Avoid unnecessary dependencies and features until they have a concrete role.
15. Measure performance before optimizing.
16. Database constraints (UNIQUE, transactions) are the primary enforcement mechanism for game integrity, not application code alone.
17. Settlement (daily finalization) must be idempotent, atomic, and retryable.
18. Frontend may import types from `src/server` but never runtime code.
19. Architecture documents describe intended design; the implemented schema and tests are authoritative once established.
