# JDocMunch Index History

This file records documentation sources relevant to this project. It is intentionally separate from `jdocmunch.md` so the reusable project policy stays small.

## Project documentation sources

| Topic | Indexed handle | Source | Project version | Notes |
|---|---|---|---|---|
| SvelteKit | `sveltejs/kit` | https://github.com/sveltejs/kit | TBD | Routing, SSR, /api/* catch-all, Cloudflare adapter |
| Svelte | `sveltejs/svelte` | https://github.com/sveltejs/svelte | TBD | Runtime, runes, reactivity |
| Hono + Hono RPC | `honojs/hono` | https://github.com/honojs/hono | TBD | API framework, auth, middleware, RPC types |
| Zod | `colinhacks/zod` | https://github.com/colinhacks/zod | TBD | All API/boundary validation |
| Drizzle ORM / Kit / Zod | `drizzle-team/drizzle-orm` | https://github.com/drizzle-team/drizzle-orm | TBD | Schema, queries, migrations, drizzle-zod |
| Bun | `oven-sh/bun` | https://github.com/oven-sh/bun | TBD | Runtime + package manager |
| TanStack Query (Svelte) | `tanstack/query` | https://github.com/TanStack/query | TBD | @tanstack/svelte-query server state |
| TanStack Form (Svelte) | `tanstack/form` | https://github.com/TanStack/form | TBD | @tanstack/svelte-form |
| Tailwind CSS | `tailwindlabs/tailwindcss` | https://github.com/tailwindlabs/tailwindcss | TBD | Layout, responsive, themes |
| Tailwind CSS docs | `tailwindlabs/tailwindcss.com` | https://github.com/tailwindlabs/tailwindcss.com | TBD | Official documentation site |
| shadcn-svelte | `huntabyte/shadcn-svelte` | https://github.com/huntabyte/shadcn-svelte | TBD | Accessible UI components (Svelte port) |
| Lucide | `lucide-icons/lucide` | https://github.com/lucide-icons/lucide | TBD | Icons |
| Anime.js | `juliangarnier/anime` | https://github.com/juliangarnier/anime | TBD | Tile flips, shakes, celebrations |
| Sonner | `wobsoriano/svelte-sonner` | https://github.com/wobsoriano/svelte-sonner | TBD | Toast notifications — Svelte port |
| Neon | `neondatabase/neon` | https://github.com/neondatabase/neon | TBD | PostgreSQL hosting, ap-southeast-1 |
| Cloudflare Workers | `cloudflare/workers-sdk` | https://github.com/cloudflare/workers-sdk | TBD | Deployment target, SvelteKit adapter |
| Playwright | `microsoft/playwright` | https://github.com/microsoft/playwright | TBD | Functional + security regression tests |
| OWASP ASVS | `OWASP/ASVS` | https://github.com/OWASP/ASVS | TBD | Security requirements baseline (v4.0 + v5.0) |
| OWASP ZAP | `zaproxy/zaproxy` | https://github.com/zaproxy/zaproxy | TBD | Dynamic security scanning |
| FSD v2.1 (Agent Skill) | `feature-sliced/skills` | https://github.com/feature-sliced/skills | TBD | Frontend architecture methodology, adapted for SvelteKit |
| Steiger (FSD Linter) | `feature-sliced/steiger` | https://github.com/feature-sliced/steiger | TBD | Automated FSD structural linting |
| Better Auth | `better-auth/better-auth` | https://github.com/better-auth/better-auth | TBD | Authentication: Google OIDC, sessions, SvelteKit + Hono integration |
| SvelteFlare (reference audit) | `local/svelteflare` | https://github.com/pinebasedev/svelteflare | sha `9a0a2dd` (snapshot) | External reference boilerplate — docs/config only (`.ts` sources not indexed); read source code from the staged clone at `/tmp/svelteflare-audit` |
| Vite | `vitejs/vite` | https://github.com/vitejs/vite | TBD (2.70.x-era; kit peer ^5–^8) | Vite configuration, dev server, HMR, build pipeline, plugins, environment/configuration behavior, and SvelteKit integration (added 2026-08-23) |

Note: `shadcn-ui/ui` (React version) was removed from this list — it is React-only and not used by this Svelte project. `huntabyte/shadcn-svelte` is the sole shadcn handle.

## Refresh log

### Initial indexing (2026-08-22)

All calls used `incremental=true`, `use_ai_summaries=false`. No 403 errors.

| Date | Handle | Before | After | Method | Notes |
|---|---|---:|---:|---|---|
| 2026-08-22 | `sveltejs/kit` | 0 | 7,746 | incremental | Batch A — new index |
| 2026-08-22 | `sveltejs/svelte` | 0 | 4,784 | incremental | Batch A — new index |
| 2026-08-22 | `honojs/hono` | 0 | 1,357 | incremental | Batch A — new index |
| 2026-08-22 | `drizzle-team/drizzle-orm` | 0 | 2,462 | incremental | Batch A — new index |
| 2026-08-22 | `oven-sh/bun` | 0 | 5,486 | incremental | Batch A — new index |
| 2026-08-22 | `huntabyte/shadcn-svelte` | 0 | 8,506 | incremental | Batch B — new index |
| 2026-08-22 | `juliangarnier/anime` | 0 | 1,798 | incremental | Batch B — new index |
| 2026-08-22 | `emilkowalski/sonner` | 0 | 2,981 | incremental | Batch B — React version (replaced by wobsoriano/svelte-sonner) |
| 2026-08-22 | `neondatabase/neon` | 0 | 11,221 | incremental | Batch C — new index |
| 2026-08-22 | `cloudflare/workers-sdk` | 0 | 2,862 | incremental | Batch C — new index |
| 2026-08-22 | `OWASP/ASVS` | 0 | 12,491 | incremental | Batch C — new index |
| 2026-08-22 | `zaproxy/zaproxy` | 0 | 1,399 | incremental | Batch C — new index |
| 2026-08-22 | `microsoft/playwright` | 0 | 16,273 | incremental | Replaced local/playwright mirror |
| 2026-08-22 | `feature-sliced/skills` | 0 | 195 | incremental | FSD v2.1 agent skill (replaced feature-sliced/feature-sliced-design handle) |
| 2026-08-22 | `feature-sliced/steiger` | 0 | 663 | incremental | FSD linter — new index |
| 2026-08-22 | `better-auth/better-auth` | 0 | 8,506 | incremental | Auth: Google OIDC, sessions, SvelteKit + Hono |
| 2026-08-22 | `wobsoriano/svelte-sonner` | 0 | 192 | incremental | Toast notifications — Svelte port (replaced emilkowalski/sonner) |

### Pre-existing repos (originally indexed 2026-08-14, refreshed 2026-08-22)

| Date | Handle | Before | After | Method | Notes |
|---|---|---:|---:|---|---|
| 2026-08-14 | `colinhacks/zod` | — | 1,695 | full | Initial corpus |
| 2026-08-14 | `tanstack/form` | — | 7,437 | full | Initial corpus |
| 2026-08-14 | `tanstack/query` | — | 2,698 | full | Initial corpus |
| 2026-08-14 | `tailwindlabs/tailwindcss.com` | — | 2,935 | full | Initial corpus |
| 2026-08-14 | `tailwindlabs/tailwindcss` | — | 1,876 | full | Initial corpus |
| 2026-08-14 | `lucide-icons/lucide` | — | 5,603 | full | Initial corpus |
| 2026-08-14 | `local/playwright` | — | 11,681 | full | Local mirror (replaced 2026-08-22) |

### Refresh (2026-08-22)

All calls used `incremental=true`, `use_ai_summaries=false`. No 403 errors.

| Date | Handle | Before | After | Method | Notes |
|---|---|---:|---:|---|---|
| 2026-08-22 | `colinhacks/zod` | 1,695 | 1,698 | incremental | +17 new, -5 deleted |
| 2026-08-22 | `tanstack/form` | 7,437 | 7,442 | incremental | 491 files |
| 2026-08-22 | `tanstack/query` | 2,698 | 2,498 | incremental | Docs reorganized |
| 2026-08-22 | `tailwindlabs/tailwindcss.com` | 2,935 | 2,935 | incremental | HEAD unchanged, no changes |
| 2026-08-22 | `tailwindlabs/tailwindcss` | 1,876 | 1,876 | incremental | +21 new files, net zero sections |
| 2026-08-22 | `shadcn-ui/ui` | 12,414 | 12,440 | incremental | +19 new, -5 deleted (kept in corpus but removed from project sources) |
| 2026-08-22 | `lucide-icons/lucide` | 5,603 | 5,324 | incremental | +47 new, -13 deleted |

Note: `local/playwright` was replaced by `microsoft/playwright` (GitHub-based) for consistency. The local mirror directory was removed (55MB freed).

### Reference audit index (2026-08-23)

| Date | Handle | Before | After | Method | Notes |
|---|---|---:|---:|---|---|
| 2026-08-23 | `local/svelteflare` | 0 | 257 | index_local — 8 files, paths scoped per Luna v16 (`apps/api/src`, `apps/web/src`, `apps/api/migrations`, `wrangler.jsonc`, package.jsons, README, AGENTS) | External reference for the bounded SvelteFlare audit (Luna v14–v16). Sha-certified at `9a0a2dd`, `source_dirty=false`. `.ts` sources are excluded by index format — read them from `/tmp/svelteflare-audit` directly. |

### Vite index (2026-08-23)

| Date | Handle | Before | After | Method | Notes |
|---|---|---:|---:|---|---|
| 2026-08-23 | `vitejs/vite` | 0 | 6,925 | incremental | New index — Vite is part of the SvelteKit build/dev toolchain (dev server, HMR, build pipeline, plugins, env/config behavior, SvelteKit integration). 474 files, sha-certified at `4f9d2f4dadc83191200de7d2154c957a711e8c3d`, `source_dirty=false`. |

No other re-indexing performed: `lucide-icons/lucide` already covers the Lucide Svelte package (no separate Svelte index), and all other project handles were confirmed present via `doc_list_repos` (47 repos).

## Local mirrors

No local mirrors currently exist.

`local/svelteflare` indexes the staged external clone at `/tmp/svelteflare-audit` — a staging folder, not a managed mirror; delete the folder only together with the index.

The Playwright local mirror (`~/.cache/jdocmunch-mirrors/playwright`) was removed on 2026-08-22 and replaced by `microsoft/playwright` indexed from GitHub. This freed 55MB of storage.

## Incidents and repairs

No incidents during indexing. All 22 incremental index calls (15 new + 7 refresh) succeeded without HTTP 403 rate-limit errors.

## Version and freshness notes

- **2026-08-23 update:** `bun.lock` now exists (`bun install`, 21 commits through Phase 0). Installed core versions (authoritative: `bun.lock`): `@sveltejs/kit` 2.70.3, `svelte` 5.56.10, `vite` 8.2.2, `@sveltejs/vite-plugin-svelte` 7.3.0, `@sveltejs/adapter-cloudflare` 7.2.9, `hono` 4.13.3, `better-auth` 1.7.1, `drizzle-orm` 0.45.2 / `drizzle-kit` 0.31.10, `zod` 4.4.3, `@neondatabase/serverless` 1.1.0, `wrangler` 4.125.0, `@cloudflare/workers-types` 5.20260823.1, `tailwindcss` 4.3.3 (not yet installed — scheduled with Phase 1 UI work). The `Project version` column can now be filled per package from the lockfile; targeted freshness re-checks are pending per-package use.
- `tanstack/query` section count dropped from 2,698 to 2,498 after refresh — docs reorganized upstream, not a data loss.
- `lucide-icons/lucide` section count dropped from 5,603 to 5,324 after refresh — 13 docs deleted upstream, 47 new docs added.
- `huntabyte/shadcn-svelte` docs include changelog entries through 2026-04, suggesting the index is current as of that period.
- `OWASP/ASVS` includes both v4.0 and v5.0 docs. The project should use v4.0 controls initially; v5.0 is available for future reference.
- `shadcn-ui/ui` remains indexed in the global corpus but is not referenced by this project — `huntabyte/shadcn-svelte` is the sole shadcn handle.
- `emilkowalski/sonner` (React) was replaced by `wobsoriano/svelte-sonner` (Svelte port). The React-only Sonner was deleted from the project corpus.
- `microsoft/playwright` indexed from GitHub (16,273 sections, 463 files) replaces the former `local/playwright` mirror (11,681 sections, 190 docs). GitHub version is more comprehensive.
- `feature-sliced/feature-sliced-design` handle replaced by `feature-sliced/skills` (same source repo, same SHA). The old handle was a naming artifact; `feature-sliced/skills` is the canonical GitHub repo name.
- `feature-sliced/steiger` (FSD linter) indexed for automated structural linting of frontend code placement.
- `local/svelteflare` is a snapshot at sha `9a0a2dd` (upstream last pushed 2026-07-21); before any future audit, re-check upstream and re-index if it moved.

## Source of truth

This file is historical/operational. It is **not** a guarantee that an index remains current.

Before using indexed documentation, query the live JDocMunch server and verify the relevant handle, section, and freshness for the current task.
