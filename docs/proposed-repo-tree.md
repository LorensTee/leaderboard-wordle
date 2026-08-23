# Leaderboard Wordle — Proposed Repository Tree

Derived from Architecture-v3 and the open-item decisions in `docs/contradictions-and-gaps.md` (NG6/NG7/NG16). Only directories and files the architecture explicitly references are included. No invented application code.

## Directory structure

```text
leaderboard-wordle/
│
├── src/
│   ├── hooks.server.ts                     # ← Better Auth session resolution
│   ├── app.d.ts                            # ← SvelteKit type augmentations (App.Locals)
│   │
│   ├── routes/                             # ← SvelteKit routing/composition
│   │   ├── +page.svelte                   #   landing / auth
│   │   ├── +layout.svelte                 #   app shell, nav, theme
│   │   ├── +layout.server.ts              #   session resolution via hooks
│   │   │
│   │   ├── play/
│   │   │   └── +page.svelte              #   daily puzzle / game
│   │   │
│   │   ├── leaderboard/
│   │   │   └── +page.svelte              #   today/yesterday/week/month
│   │   │
│   │   ├── profile/
│   │   │   └── +page.svelte              #   settings, display name, avatar
│   │   │
│   │   ├── admin/
│   │   │   └── +page.svelte              #   puzzle calendar, scheduling
│   │   │
│   │   └── api/
│   │       └── [...path]/
│   │           └── +server.ts            #   ← Hono bridge (integration only)
│   │
│   ├── lib/                                # ← FSD application code (minimal initially)
│   │   ├── app/                            #   app-wide setup (providers, theme)
│   │   └── shared/                         #   UI components, utils, API client, config
│   │       ├── ui/                         #   shadcn-svelte components
│   │       ├── lib/                        #   format-duration, utils, helpers (canonicalizeDisplayName, moderationKeyForDisplayName)
│   │       ├── api/                        #   Hono RPC typed client (hc<AppType>)
│   │       ├── data/                       #   generated client artifact: valid-guesses.json
│   │       └── config/                     #   constants, env schema, avatar emojis, banned-words.json
│   │
│   └── server/                             # ← Hono/backend/domain code
│       ├── auth/                            #   Better Auth config, Google provider, Drizzle adapter
│       ├── middleware/                      #   cross-cutting: CSRF (JSON origin/Sec-Fetch-Site), authz, rate-limit, timeout, body-limit, requestId/envelope, secure headers, error handling
│       ├── lib/                             #   shared server helpers: error envelope, origin validation, logging
│       ├── game/                            #   start, guess, finish, timer logic
│       ├── puzzle/                          #   daily puzzle lifecycle, answers, settlement
│       ├── leaderboard/                     #   ranking, aggregation
│       ├── profile/                         #   display name, avatar, settings
│       ├── admin/                           #   puzzle scheduling, validation
│       ├── db/                              #   Drizzle schema, migrations, client
│       ├── data/                            #   canonical valid-guess source: valid-guesses.source.txt
│       └── routes.ts                        #   fully composed Hono app + type export
│
├── tests/                                   # ← Test architecture
│   ├── unit/                                #   pure domain logic (evaluateGuess, etc.)
│   ├── integration/                         #   database + transaction tests
│   ├── e2e/                                 #   Playwright browser tests
│   └── security/                            #   adversarial / ZAP tests
│
├── static/                                  # ← SvelteKit static assets
│   └── favicon.png
│
├── svelte.config.js                         # ← optional SvelteKit config (kit options) — sv 0.17 does NOT generate one; adapter lives in vite.config.ts (see note below)
├── vite.config.ts                           # ← Vite config; Cloudflare adapter configured here: sveltekit({ adapter: adapter() }) — sv 0.17 convention (verified 2026-08-23)
├── tsconfig.json                            # ← TypeScript config
├── wrangler.toml                            # ← Cloudflare Workers config (nodejs_compat)
├── drizzle.config.ts                        # ← Drizzle Kit config
├── package.json                             # ← Dependencies
├── scripts/                                 # ← data build & seed tooling
│   ├── build-word-list.ts                   #   canonical source → server + client artifacts (build check)
│   └── seed/                                #   answer-pool import (private/gitignored input)
├── .env.example                             # ← Environment variable template
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml                           #   lint, typecheck, unit+integration, e2e (NG23)
└── README.md
```

> **Scaffold convention note (2026-08-23):** the `sv` CLI 0.17.0 (supersedes `create-svelte`) scaffolds the adapter into `vite.config.ts` via `sveltekit({ adapter: adapter() })` and no longer generates `svelte.config.js`. The `svelte.config.js` row above is retained as the optional SvelteKit config for `kit.*` options (files, aliases); create it only when such options are needed (Phase 0 B1). Matching changes were recorded in `Architecture-v3.md` → "Preflight verification (2026-08-23)".

## Directory ownership rules

| Directory | Owner | Rule |
|---|---|---|
| `src/hooks.server.ts` | Better Auth | Session resolution via Better Auth SvelteKit integration |
| `src/routes/` | SvelteKit | Framework-owned routing/composition. No FSD layers here. |
| `src/lib/` | FSD | Application code. Import via `$lib/...`. Start minimal (app/ + shared/). |
| `src/server/` | Hono | Backend/domain code. No SvelteKit or FSD dependencies. |
| `src/server/middleware/` | Hono | Cross-cutting request concerns only: CSRF (Origin/Sec-Fetch-Site for JSON mutations), authorization, rate limiting, timeout, body limits, requestId/error envelope, secure headers, error handling. No business logic. |
| `src/server/lib/` | Hono | Shared server helpers (error envelope, origin validation, logging). No business logic. |
| `src/routes/api/[...path]/+server.ts` | Bridge | Integration only. No game logic, DB queries, or auth rules. |
| `tests/` | All | Three levels: unit, integration, e2e/security. |
| `static/` | SvelteKit | Static assets served at root. |

## Type boundary rule

Frontend may import **types** from `src/server` (e.g. `import type { AppType }`), but must never import server runtime code. The type export path goes through `src/lib/shared/api/`.

## Files the architecture does NOT specify location for

| File | Typical location | Notes |
|---|---|---|
| `wrangler.toml` | Project root | Must include `nodejs_compat` compatibility flag |
| `drizzle.config.ts` | Project root | References `src/server/db/` schema |
| `.env.example` | Project root | Template for `DATABASE_URL`, Google OIDC credentials, `ADMIN_EMAIL` |

## Data files (NG6/NG7/NG16)

| File | Provenance |
|---|---|
| `src/server/data/valid-guesses.source.txt` | Git-tracked canonical source; upstream source/version/license recorded in the header comment |
| `src/lib/shared/data/valid-guesses.json` | Generated by `scripts/build-word-list.ts` — never hand-edited; equality/version build check |
| `src/lib/shared/config/banned-words.json` | Versioned app data: baseline English list + project overrides, with source/version notes |
| Private answer pool (`data-private/answer-pool.txt`) | Gitignored; imported via `scripts/seed/` into `answer_dictionary` |
