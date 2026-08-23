# Leaderboard Wordle

Wordle with a leaderboard — SvelteKit + Hono + Drizzle/Neon on Cloudflare Workers.

Full architecture: `Architecture-v3.md` · decisions & gaps: `docs/contradictions-and-gaps.md` · dependency intent: `docs/proposed-dependencies.md` (authoritative state = `bun.lock`).

## Stack (Phase-0 verified)

- SvelteKit 2.70 / Svelte 5 (runes) / Vite 8 / TypeScript 6 — scaffolded with `sv`
- Hono 4 API behind the SvelteKit catch-all bridge (`src/routes/api/[...path]/+server.ts`)
- Better Auth 1.7 (Google OIDC) — `src/server/auth/auth.ts`
- Drizzle ORM 0.45 + Neon (`drizzle-orm/neon-serverless`, WebSocket driver)
- Cloudflare Workers (`@sveltejs/adapter-cloudflare`, `wrangler.toml`, `nodejs_compat`)
- Bun as runtime + package manager

## Prerequisites

- bun ≥ 1.4
- `.env` (see `.env.example`) and `.dev.vars` (local dev bindings, gitignored)

## Developing

```sh
bun install
bun run dev        # http://localhost:5173 (requires .env + .dev.vars)
```

## Checks

```sh
bun run check            # svelte-check
bun run test:unit        # unit tests (DB-free)
bun run test:integration # Neon integration tests (requires DATABASE_URL, non-prod)
bun run build            # Cloudflare Workers build
bun run verify:bundle    # answer-pool secrecy proof (run after build)
bun run types:check      # wrangler.toml ↔ worker-configuration.d.ts (no .env/.dev.vars)
bun run auth:check       # Better Auth schema regeneration parity guard
bun run db:generate      # drizzle-kit migration generation
```

## CI

`.github/workflows/ci.yml` — `unit-and-build`, `integration` (gated on the non-prod `DATABASE_URL` secret), `e2e` (Playwright).

**Phase 1 handoff prompt: `docs/phase-1-handoff-prompt.md`**