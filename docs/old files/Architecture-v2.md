# Leaderboard Wordle — Architecture & Technology Plan

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

Suggested eventual shape (not a requirement for V1):

```text
src/
├── routes/                      # SvelteKit routing/pages/API bridge
└── lib/                         # FSD application code
    ├── app/
    ├── features/
    ├── entities/
    └── shared/
```

Examples of likely frontend slices as the application grows:

```text
features/
├── start-game/
├── submit-guess/
├── edit-profile/
└── schedule-puzzle/

entities/
├── user/
├── game/
├── puzzle/
└── leaderboard/
```

These are examples, not a mandate to create all of them immediately. Page-specific code may remain in the relevant SvelteKit route/page until real reuse justifies extraction.

FSD import-direction rules apply within `src/lib`: higher layers may import lower layers; same-layer slice cross-imports should be avoided. Keep each slice's public API explicit. Do not create speculative entities/features simply to satisfy a folder pattern.

**Do not apply FSD directory rules to the Hono backend.** The backend is organized by server/domain responsibility instead.

## Styling/UI

Use:

- **Tailwind CSS** — layout, spacing, responsive design, colors, typography, themes.
- **shadcn-svelte** — accessible reusable UI components.
- **Lucide** — icons, used selectively rather than decoratively.
- **Anime.js** — richer/coordinated animations when CSS transitions are insufficient.
- **Sonner** — toast notifications; it is a separate library integrated with shadcn-svelte, not a built-in part of shadcn itself.

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

Hono should remain platform-neutral where practical.

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

## Drizzle ORM

Use **Drizzle ORM** for:

- table/schema definitions
- type-safe queries
- database access
- migrations via Drizzle Kit

Do not reject Drizzle based on generic ORM-latency claims. For this application, network/database placement, connection handling, query design, and indexes matter much more than the small abstraction overhead. Optimize from measurements.

## Initial database model

### `users`

Potential fields:

```text
id
provider_subject_id
username/display_name
avatar_emoji
timezone or canonical-timezone handling if needed
role
created_at
updated_at
```

Google identity should be linked to a stable provider subject/identity, not to a display email string alone.

### `answer_dictionary`

Server-only approved pool of words that are allowed to become daily answers.

```text
id
word
```

This must **not** be stored in the public Git repository if it contains future answers.

### `daily_puzzles`

```text
id
puzzle_date
answer_id
hint_letter
status
expires_at
completed_count
average_completion_time_ms
non_completion_penalty_ms
finalized_at
created_at
locked_at
```

Lifecycle:
```text
SCHEDULED -> ACTIVE -> FINALIZED
```

At finalization, remaining ACTIVE games become FORFEITED, the average is calculated from COMPLETED games only, and the non-completion penalty is frozen. If zero games were completed, the average and penalty remain NULL and that puzzle is excluded from multi-day calculations. A scheduled/used answer must remain historically consistent.

### `games`

```text
id
user_id
puzzle_id
status
started_at
completed_at
completion_time_ms
guess_count
created_at
updated_at
```

Statuses should distinguish:

```text
COMPLETED
FAILED
FORFEITED
MISSED
```

`completion_time_ms` is authoritative only for completed games. FAILED, FORFEITED, and MISSED games retain NULL completion_time_ms. Leaderboard penalties are derived from the finalized daily-puzzle penalty and never overwrite raw game facts.

### `guesses`

```text
id
game_id
guess_number
word
feedback/result if useful for historical reconstruction
created_at
```

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
allow/reject scheduling
```

The admin calendar must flag invalid or duplicate answers.

---

# Authentication and authorization

## Google authentication

Use **Google OIDC/sign-in** as the initial authentication method.

The landing page should present one primary action such as **Continue with Google**, rather than separate login/signup providers.

After Google authentication:

```text
Existing account → log in → app
New Google identity → onboarding (name + avatar) → account created → automatically logged in
```

No application-managed password system is required for V1.

Google authentication reduces credential-management responsibilities but does not remove application security responsibilities.

## Authentication ownership: SvelteKit hooks vs Hono

SvelteKit `hooks.server.ts` runs before route handling, including requests that will eventually reach the Hono `/api/*` catch-all. This must be treated as a deliberate boundary, not an accidental second auth system.

Use **one shared authentication/session implementation** with two consumers:

### SvelteKit hooks

SvelteKit hooks may:

- resolve the current session/user;
- populate `event.locals`;
- perform page-level auth redirects;
- expose authenticated-user context to SvelteKit page rendering.

### Hono

Hono remains the **authoritative API authentication/authorization boundary**. It must independently establish the authenticated user for API requests and perform API ownership/role checks.

The two layers must not implement separate, divergent authentication logic. They may both call the same shared session/auth service. A request reaching Hono must never be considered authorized merely because a SvelteKit hook previously observed a valid session.

This prevents both under-checking and confusing double implementations.

## Roles

Use roles from the beginning. Initial roles should at least support:

```text
player
admin
```

The admin account associated with the project's configured Google identity should be provisioned with `admin` role. Authorization checks must use the role/identity model rather than scattering email comparisons throughout routes.

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

---

# Cloudflare/SvelteKit/Hono platform boundary

The preferred production platform is **Cloudflare Workers**. For SvelteKit, use the current **`@sveltejs/adapter-cloudflare`** adapter. Do not use the deprecated `@sveltejs/adapter-cloudflare-workers` package.

The SvelteKit-to-Hono catch-all route is the **single platform bridge**. Conceptually:

```text
SvelteKit +server.ts
    │
    ├── Request
    ├── event.platform.env
    └── event.platform.context
             │
             ▼
       Hono app.fetch(...)
             │
             ├── c.env
             └── c.executionCtx
```

Only this integration layer should translate SvelteKit/Cloudflare platform bindings into Hono's environment. Hono domain/application code must not depend directly on SvelteKit `RequestEvent` objects.

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
POST /api/game/start
POST /api/game/:id/guess
GET  /api/game/today
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

---

# Ranking model

Store raw facts on games. Do not create a separate ranking-result table in V1.

For completed games:

```text
actual completion_time_ms
actual guess_count
```

For FAILED, FORFEITED, and MISSED games, keep raw status/timestamps/guess_count and use the finalized `daily_puzzles.non_completion_penalty_ms` only when aggregating multi-day leaderboards. Never overwrite raw game data.

For each finalized puzzle, calculate `average_completion_time_ms` using COMPLETED games only. If there are zero completed games, that puzzle is omitted from multi-day leaderboard calculations.

Primary ranking rule:

```text
1. average completion/penalty time ascending
2. average guess count ascending as tiebreaker
```

Do not combine seconds and guesses into an arbitrary single number.

The ranking algorithm can be expanded later because raw historical facts remain available.

---

# Development phases

## Phase 1 — Game

Build the core Wordle experience, including:

- daily puzzle UI
- six guesses
- in-app keyboard on all devices
- physical keyboard input on desktop
- green/yellow/gray feedback
- local valid-guess checking
- server authoritative validation/feedback
- Play/start screen
- server-authoritative timer
- continue after leaving
- automatic expiration at daily reset
- responsive/mobile UI
- animations

## Phase 2 — SvelteKit + Hono

Add API integration, Hono RPC, server game/domain logic, and Zod validation.

## Phase 3 — Database

Add Neon, Drizzle, Drizzle Kit, schema, migrations, answer dictionary, daily puzzles, games, guesses, and relevant indexes.

## Phase 4 — Authentication

Add Google OIDC, onboarding, sessions, roles, authorization, and admin role provisioning.

## Phase 5 — History/statistics/leaderboards

Add persistent results, profile statistics, daily/yesterday/week/month leaderboards, and ranking aggregation.

## Phase 6 — Admin calendar

Add future puzzle scheduling, duplicate detection, answer-list validation, puzzle locking, and admin-only access.

## Phase 7 — Security hardening

Add ASVS review, Playwright security regression tests, ZAP scans, dependency scanning, rate limiting/hardening, and friend-led adversarial testing.

## Phase 8 — Deployment

Deploy to Cloudflare Workers + Neon Singapore. Measure real behavior and optimize only when evidence supports it.

---

# Guiding principles

1. The browser is untrusted; the server is authoritative.
2. Keep gameplay visually responsive while validating/persisting server-side.
3. SvelteKit owns pages/routing; Hono owns `/api/*` mutations and API behavior.
4. Use one shared authentication/session implementation; SvelteKit hooks may resolve it for pages, while Hono remains the authoritative API auth/authz boundary.
5. Do not use SvelteKit form actions as a second business-mutation API; route application/domain mutations through Hono.
6. Zod and Drizzle-Zod solve different validation problems and should be used together.
7. Use TanStack's Svelte integrations where they provide real value.
8. Apply FSD v2.1 to `src/lib` conservatively; keep `src/routes` as SvelteKit routing and do not force FSD onto the Hono backend.
9. Keep future answers server-side; a public repository may contain the valid-guess dictionary.
10. Store raw game facts so ranking rules can evolve without rewriting history.
11. Keep roles and authorization explicit from the start.
12. Keep the SvelteKit/Cloudflare → Hono platform bridge isolated so domain code remains portable.
13. Treat security verification as an ongoing process using requirements, tests, scanning, dependency checks, and manual attack exercises.
14. Avoid unnecessary dependencies and features until they have a concrete role.
15. Measure performance before optimizing.
