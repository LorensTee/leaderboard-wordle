# Leaderboard Wordle — Dependency List

**This is architecture intent, not authoritative dependency state.** Extracted from Architecture-v3 as intended packages. Actual versions and exact dependency tree will be determined by `bun install` → `bun.lock` → TanStack Intent → JDocMunch/version verification.

## Preflight verification record (2026-08-23)

All packages below were verified against live npm registry manifests (`registry.npmjs.org/<pkg>/latest`) and current official docs. The lockfile remains authoritative after `bun install`.

| Package | Verified (registry latest) | Official source | Svelte compatibility / notes |
|---|---|---|---|
| `@lucide/svelte` | 1.33.0 | lucide.dev (repo `lucide-icons/lucide`) | ✅ official Svelte package; peer `svelte ^5`; `lucide-svelte@1.0.1` is registry-deprecated |
| `svelte-sonner` | 1.2.1 | github.com/wobsoriano/svelte-sonner | ✅ Svelte port by wobsoriano; peer `svelte ^5` |
| `shadcn-svelte` | 1.5.0 | shadcn-svelte.com / huntabyte/shadcn-svelte | ✅ CLI targets **Tailwind v4** (CSS-first); peer `svelte ^5` |
| `@tanstack/svelte-query` | 6.1.40 | tanstack.com/query | ✅ first-class Svelte adapter; peer `svelte ^5.25` |
| `@tanstack/svelte-form` | 1.33.5 | tanstack.com/form | ✅ first-class Svelte adapter; peer `svelte ^5` |
| `@sveltejs/adapter-cloudflare` | 7.2.9 | svelte.dev/docs/kit/adapter-cloudflare | ✅ peers `wrangler ^4` + `@sveltejs/kit ^2`; `adapter-cloudflare-workers` deprecated |
| `animejs` | 4.5.0 | animejs.com | ✅ framework-agnostic (peer `three` optional) |
| `vite` | 8.2.2 | vite.dev (repo `vitejs/vite`) | ✅ peer of `@sveltejs/kit` (2.70.3 accepts vite ^5–^8) + `@sveltejs/vite-plugin-svelte` 7.3.0 (peer `vite ^8`, `svelte ^5.46.4`) |
| `better-auth` | 1.7.1 | better-auth.com | ✅ `./svelte-kit` + `./adapters/drizzle` exports; bundles `@better-auth/drizzle-adapter` 1.7.1; peers `drizzle-orm ^0.45.2`, `drizzle-kit >=0.31.4`, `@sveltejs/kit ^2`, `svelte ^4\|\|^5`; Cloudflare Workers via `nodejs_compat` |
| `@neondatabase/serverless` | 1.1.0 | neon.tech/docs/serverless | ✅ single package; WebSocket `Pool`/`Client` for interactive transactions; HTTP `neon()` is one-shot only — keep WebSocket strategy |
| `drizzle-orm` | 0.45.2 | orm.drizzle.team | ✅ **0.45 renamed the driver modules**: WebSocket serverless driver = `drizzle-orm/neon-serverless` (with `@neondatabase/serverless` `Pool`); `drizzle-orm/neon` is now the Neon-Auth/RLS module (`neon-auth`, `rls`); HTTP one-shot = `drizzle-orm/neon-http`. Peer `@neondatabase/serverless >=0.10.0` |
| `drizzle-kit` | 0.31.10 | orm.drizzle.team | ✅ peer range satisfied by better-auth |
| `hono` | 4.13.3 | hono.dev | ✅ v4; `./client` (RPC), `./timeout`, `./body-limit`, `./request-id`, `./secure-headers`, `./csrf`, `./cloudflare-workers` all present |
| `zod` | 4.4.3 | zod.dev | ⚠️ **Zod 4 is current**; better-auth 1.7.1 depends on `zod ^4.3.6`; `drizzle-zod` 0.8.3 supports `zod ^3.25 \|\| ^4` |
| `tailwindcss` | 4.3.3 | tailwindcss.com | ✅ **v4, CSS-first** (`@import "tailwindcss"`); do not mix v3 config conventions |

Verified corrections (v18 §8 minimum set): `@lucide/svelte` ✅, `svelte-sonner` ✅, `shadcn-svelte` ✅, `@tanstack/svelte-query` ✅, `@tanstack/svelte-form` ✅, `@sveltejs/adapter-cloudflare` ✅, `animejs` ✅. Vite added to the dependency/documentation inventory. No React-only packages.

## dependencies (runtime)

| npm package | Architecture reference | Notes |
|---|---|---|
| `svelte` | SvelteKit runtime | Peer dep of `@sveltejs/kit` |
| `@sveltejs/kit` | SvelteKit framework | Core framework |
| `hono` | Hono API framework | Includes `hono/client` (RPC) — not a separate package |
| `better-auth` | Better Auth | Authentication: Google OIDC, sessions, SvelteKit/Hono integration |
| `@better-auth/drizzle-adapter` | Better Auth Drizzle adapter | Connects Better Auth to Drizzle/Neon |
| `@tanstack/svelte-query` | TanStack Query for Svelte | Server state management |
| `@tanstack/svelte-form` | TanStack Form for Svelte | Structured form state |
| `@neondatabase/serverless` | Neon serverless driver | WebSocket-capable driver for interactive transactions (SELECT ... FOR UPDATE) |
| `drizzle-orm` | Drizzle ORM | Schema, queries, migrations runtime |
| `drizzle-zod` | Drizzle-Zod | Zod schema derivation from Drizzle tables |
| `zod` | Zod | Runtime validation |
| `tailwindcss` | Tailwind CSS | CSS framework |
| `tailwind-merge` | (implicit with shadcn) | Tailwind class deduplication |
| `clsx` | (implicit with shadcn) | Conditional classnames |
| `class-variance-authority` | (implicit with shadcn) | Component variant management |
| `@lucide/svelte` | Lucide | ✅ Official Svelte package — `lucide-svelte` is deprecated on npm (verified 2026-08-23); use existing `lucide-icons/lucide` JDocMunch index |
| `animejs` | Anime.js | ⚠️ npm name is `animejs`, not `anime.js` |
| `svelte-sonner` | Sonner (Svelte) | Toast notifications — Svelte port by wobsoriano |

## devDependencies

| npm package | Architecture reference | Notes |
|---|---|---|
| `@sveltejs/adapter-cloudflare` | Cloudflare adapter | ⚠️ Do not use deprecated `@sveltejs/adapter-cloudflare-workers` |
| `@sveltejs/vite-plugin-svelte` | Vite integration | Usually auto-installed by SvelteKit |
| `vite` | Vite | Part of the SvelteKit build/dev toolchain; peer of `@sveltejs/kit` (2.70.3: vite ^5–^8). Indexed in JDocMunch as `vitejs/vite` (2026-08-23) |
| `drizzle-kit` | Drizzle Kit | Schema migrations CLI |
| `shadcn-svelte` | shadcn-svelte | CLI tool that copies components into project |
| `typescript` | TypeScript | Type checking |
| `@cloudflare/workers-types` | Cloudflare Workers | TypeScript types for Workers runtime |
| `wrangler` | Cloudflare Workers | Dev server and deployment CLI |
| `@playwright/test` | Playwright | E2E and security regression tests |
| `vitest` | Vitest | Unit and integration test runner |

## Packages NOT explicitly named in Architecture-v3 (data/config decisions)

| Need | Options | Notes |
|---|---|---|
| Profanity filter | none — custom versioned list (NC3/NG6) | Resolved: `src/lib/shared/config/banned-words.json` (baseline English list + project overrides); no npm package needed |
| Valid-guess dictionary | none — data files + build script (NC3/NG7) | Resolved: `src/server/data/valid-guesses.source.txt` → `src/lib/shared/data/valid-guesses.json` via `scripts/build-word-list.ts`; no npm package needed |

Both are data/config decisions, not package dependencies. Provenance (upstream source, version/commit, license, import date, filtering rules) is recorded per NG16.

## Resolved decisions (no longer undecided)

| Decision | Resolution | Source |
|---|---|---|
| Auth library | Better Auth | Architecture-v3 + gpt v4/v5 |
| Session management | Better Auth managed (no custom table) | Architecture-v3 |
| `src/lib/shared/auth/` | Removed — does not exist | gpt v4 |
| `src/app.d.ts` | Added — App.Locals augmentation | gpt v4 |
| `nodejs_compat` flag | Required for Cloudflare Workers | Better Auth docs |

## Cloudflare Workers requirement

```json
{
  "compatibility_flags": ["nodejs_compat"]
}
```

Required in `wrangler.toml` because Better Auth uses `AsyncLocalStorage`.

### Cloudflare/TypeScript tooling (preflight decision 2026-08-23)

- **Runtime/binding types:** install `@cloudflare/workers-types` (v5 — the peer of `wrangler` 4.125.0) for Worker runtime types, and prefer **Wrangler-generated binding types** (`wrangler types` → `worker-configuration.d.ts`) for the `Env` interface referenced from `src/app.d.ts` (`App.Platform`). This follows the current `svelte.dev` adapter-cloudflare guidance (install `@cloudflare/workers-types`, declare `App.Platform`) plus the wrangler v4 peer range.
- **Adapter config:** `@sveltejs/adapter-cloudflare` in `svelte.config.js`; Wrangler config file kept in the project root; `compatibility_flags: ["nodejs_compat"]` (the SvelteKit docs also mention the narrower `nodejs_als` flag — keep `nodejs_compat` per Architecture-v3 and re-verify against the installed Better Auth version during Phase 0).
- Re-verify the generated binding types against the installed `wrangler` version at Phase 0 (this replaces the open contradiction-file decision at NG/open item ~line 138).

## npm name warnings

| Architecture name | Actual npm name | Risk |
|---|---|---|
| `lucide-svelte` | `@lucide/svelte` | Deprecated package → must use `@lucide/svelte` (verified on registry 2026-08-23) |
| `anime.js` / `anime` | `animejs` | Wrong name → install fails |
| `shadcn-svelte` | `shadcn-svelte` (CLI) | It's a devDep CLI, not a runtime dep |
| `adapter-cloudflare-workers` | `@sveltejs/adapter-cloudflare` | Deprecated — must use the correct one |
