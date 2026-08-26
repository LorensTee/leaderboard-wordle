# Phase-2 Implementation Handoff — FINAL (post-implementation state)

> **Status: CURRENT.** This document describes the repository AFTER Phase-2
> implementation, as independently reviewed (Luna v25/v26) and re-verified on
> 2026-08-26 with a green GitHub Actions run.
> The planning-time `docs/phases/phase 2/phase-2-implementation-handoff.md` is **historical**
> (pre-implementation baseline) — do not treat it as current state.

## 1. Final repository identity

| Item | Value |
|---|---|
| Repository | `https://github.com/LorensTee/leaderboard-wordle` |
| Branch | `main` |
| HEAD | `38c158a` (`docs: mark Phase-1 handoff documents historical`) |
| Phase | **Phase 2 implemented and verified. Next step: dedicated multimodal visual-review pass (make-ui-not-ai) across the entire UI (Phase 1 + Phase 2).** |
| GitHub Actions | Run **#16** on `38c158a`: `unit-and-build` ✅ `integration` ✅ `e2e` ✅ (public API-verified; the mandatory Neon integration gate passed) |
| Working tree | Clean except the user's `.idea/` IDE file |

## 2. Phase-2 commits (all on `main`, ahead of Phase-1 baseline `2fc1be1`)

`5e0a755` phase2(domain) · `fec2221` phase2(api) · `f651861` phase2(ui) ·
`ff0c4a7` phase2(deps) · `72d48c0` phase2(test) · `4dfdd1b` phase2(docs) ·
`38c158a` docs (historical marks). All seven were pushed by the repository
owner and verified by the single CI run #16 (one workflow run per push).

## 3. Final dependencies (bun.lock — exact resolved)

Added by Phase 2: `@tanstack/svelte-form@1.33.5` (+`@tanstack/form-core@1.33.5`,
+`@tanstack/svelte-store@^0.12.0`), `@fontsource-variable/inter@5.3.0`,
`clsx@2.1.1`, `tailwind-merge@3.6.0`, `tailwind-variants@3.3.1`,
`tw-animate-css@1.4.0`. Unchanged Phase-1 stack: SvelteKit 2.70.3, Svelte
5.56.10, Vite 8.2.2, Hono 4.13.3, better-auth 1.7.1, drizzle-orm 0.45.2 +
Neon WebSocket, Tailwind v4.3.3, @tanstack/svelte-query 6.1.42, wrangler
4.125.0, shadcn-svelte 1.5.0 (now initialized).

## 4. Final source-tree changes (Phase 2)

- `src/server/profile/` — `display-name.ts` (authoritative domain), `service.ts`
  (profile service), `handlers.ts` (GET /api/me, PATCH /api/me/profile).
- `src/server/data/avatar-emojis.ts` — canonical 24-entry avatar allow-list.
- `src/lib/shared/lib/display-name.ts` — client twin (UX-only validation).
- `src/lib/shared/config/banned-words.json` (97 entries, provenance inside) +
  `avatar-emojis.generated.ts` (generated; `bun run avatar-list`).
- `src/lib/app/theme.ts` (D5 store/helpers), `src/lib/app/guards.ts` (SSR
  onboarding/role guards), `src/lib/shared/api/me.ts` (typed `['me']` client).
- `src/lib/shared/ui/header.svelte` (role-aware shell), `avatar-picker.svelte`.
- `src/lib/components/ui/{button,input,badge}` + `components.json` + `src/lib/utils.ts` (shadcn).
- `src/routes/{onboarding,profile,leaderboard,admin}/` (+ guards); `play/+page.server.ts` updated.
- `src/app.html` (pre-paint theme script), `src/app.css` (`@custom-variant dark` + shadcn tokens on `[data-theme=dark]`).
- `src/server/middleware/auth.ts` (NG18 bootstrap), `src/server/routes.ts` (profile routes, chained), `src/server/lib/errors.ts` (new codes), `src/server/auth/auth.ts` (`trustedOrigins`).
- `scripts/build-avatar-list.ts`; `tests/unit/{display-name,avatar-list,theme,profile-service,profile-routes}.test.ts`; `tests/integration/profile.test.ts`; `tests/e2e/{onboarding,profile}.spec.ts` + fixture updates; `.github/workflows/ci.yml` (avatar drift gate).

## 5. Final API contract (Hono RPC types are the wire source of truth)

- `GET /api/me` (auth) → `200 { user: { id, name, avatarEmoji, role, onboardingCompleted } }`.
- `PATCH /api/me/profile` (auth; CSRF applies) — strict Zod `{ displayName?, avatarEmoji? }`, ≥1 field, BOTH required while onboarding incomplete; codes: `INVALID_NAME` 400, `NAME_MODERATED` 400 (generic message), `NAME_TAKEN` 409 (reserved + duplicates, UNIQUE 23505 catch), `INVALID_AVATAR` 400, `INCOMPLETE_ONBOARDING` 400, `BAD_REQUEST` 400 (strict/unknown fields).
- Ownership implicit (authenticated user); `onboarding_completed_at = now()` DB time on first completion only; single UPDATE = atomic onboarding.

## 6. Final DB/schema state

**No schema change, no migration.** `avatar_emoji`, `role`,
`display_name_normalized` (nullable UNIQUE), `onboarding_completed_at`
(nullable) all existed since Phase 0. Proven: `git diff --exit-code --
src/server/db/schema.ts src/server/db/migrations` → empty. `auth:check`
parity green; `auth-schema.generated.ts` never hand-edited.

## 7. Auth/security state

- Better Auth remains the only identity/session system; Hono `authContext`
  resolves independently; `event.locals` is never an API authorization source.
- `requireAuth` guards `/api/me/*`; CSRF fail-closed (Origin/Sec-Fetch-Site)
  with `/api/auth/*` exempt; NG21 envelope for every new code.
- NG18 bootstrap in `authContext`: promote-only, WHERE-guarded, never demotes;
  email comparison now case-insensitive + whitespace-tolerant (v25 finding,
  fixed and integration-tested); `ADMIN_EMAIL` unset ⇒ no promotion.
- Name ownership: `user.name` + `display_name_normalized` written ONLY by
  PATCH; Google re-auth / fresh session resolution never rewrites them
  (integration regression).
- `trustedOrigins` for `http://localhost:5173` + `http://127.0.0.1:4173`
  (Phase-1 latent sign-out 403 fix).
- Answer secrecy: `verify:bundle` 0 private words/106 files; no server runtime
  imports in the client bundle.

## 8. TanStack state management

- Query `['me']` (`GET /api/me`) + mutation (`PATCH /api/me/profile`) with
  cache update from the server response; **no optimistic mutation**.
- Header renders SSR-first, then from the `['me']` cache (name/avatar/role
  updates reflect immediately; Admin-tab page-level lag documented).
- Theme, form input, picker selection, transient UI = local Svelte state.
- Forms use `@tanstack/svelte-form` 1.33.5; two documented usage notes:
  the form's own `isSubmitting` is the submit-state owner (svelte-query v6
  `isPending` can stay true after a resolved `mutateAsync`), and
  `preventDefault()` wraps `form.handleSubmit()` (native submission otherwise
  fires when client validation blocks `onSubmit`).

## 9. shadcn-svelte

Initialized (components.json, **vega** preset — Lucide/Inter, neutral base;
interactive CLI driven through a PTY, no non-interactive preset exists).
Components in use: Button, Input, Badge (onboarding/profile/shell). Board,
keyboard, and tiles remain custom (documented non-goal). Dark tokens
re-pointed from `.dark` to `:root[data-theme='dark']`.

## 10. Theme

Binary light/dark; `localStorage['theme']`; system default; single pre-paint
inline script in `src/app.html` (NG17-hashable) sets `data-theme`; Tailwind
v4 `@custom-variant dark` on the attribute; `color-scheme` follows; toggle in
header + profile radiogroup; E2E scenario 11 pins persistence across reload.

## 11. Onboarding / profile / shell

- Guards: `/play`, `/profile`, `/leaderboard`, `/admin` SSR-redirect
  incomplete users to `/onboarding` (E2E loops all four); `/onboarding`
  redirects complete users to `/play`; `/admin` role-guards after onboarding.
- Onboarding: display name (live 2–15 count + UX validation) + 48px
  keyboard-native avatar grid; atomic single PATCH; server issues mirrored
  inline; success → toast + `/play`.
- Profile: name/avatar editing (changed fields only), theme radiogroup,
  logout; skeleton while `['me']` loads; header chip updates from cache.
- Placeholders for `/leaderboard` (Phase 3) and `/admin` (Phase 4) with real
  route guards; no invented dashboard UI.

## 12. Test counts/results (final)

| Suite | Count | Result |
|---|---|---|
| Unit | 121 (17 files) | pass |
| Integration (live Neon) | 35 (5 files) | pass — incl. 11 profile/onboarding/bootstrap/re-auth |
| E2E | 15 (4 files) | pass — 12 Phase-2 scenarios + Phase-1 gameplay + smoke |

Local re-run on the final tree (2026-08-26): `lint` ✅, `check` 0/0 ✅,
`test:unit` 121 ✅, `build` ✅, `types:check` ✅ (hermetic clean-checkout
condition), `verify:bundle` ✅, `auth:check` ✅, `word-list` ✅,
`avatar-list` ✅, `test:integration` 35/35 ✅, `test:e2e` 15/15 ✅,
`wrangler deploy --dry-run` ✅.

## 13. CI status

**Run #16, head `38c158a`, all three jobs green** — verified via the public
GitHub API (`unit-and-build`, `integration`, `e2e`). The integration job is
the mandatory non-prod Neon gate and passed. The exact E2E spec count inside
CI could not be retrieved anonymously (log download requires auth); locally
the same suite is 15/15 with the CI-consistent env vars.

## 14. Visual verification status (honest)

- **Functionally verified:** code, interactions, and all automated suites.
- **Automated visual checks verified:** 20 screenshots captured (5 surfaces ×
  desktop 1440×900 / mobile 390×844 × light / dark) under
  `.cache/ui-shots/` (gitignored). Per-shot DOM audits all green: zero
  horizontal overflow, WCAG 2.5.8 target sizes (avatar grid 48px), accessible
  names, visible focus indicators, computed-style contrast ≥ 4.5 (body /
  input / submit, both themes), and pre-paint `data-theme` correctness.
- **NOT visually verified:** the screenshots were never opened/inspected by a
  vision-capable reviewer (the implementation model has no image input).
  Do NOT claim Phase 2 is "visually polished". The **dedicated multimodal
  review is the next step** (make-ui-not-ai across landing → game →
  onboarding → profile → shell, light/dark, desktop/mobile).

## 15. Known issues

- Header sign-out required the `trustedOrigins` fix (fixed; Phase-1 latent).
- `types:check` fails by design when `.env`/`.dev.vars` are present (wrangler
  injects secret names) — hermetic condition is the gate.
- The preview server (`vite preview`) must be restarted after each rebuild
  (hashed assets change).

## 16. Non-blocking follow-ups

- Dedicated multimodal visual-review pass (the planned next step).
- Live Google OAuth consent round-trip (manual; fixtures cover everything
  else) and an in-browser sign-out check on a real Google session.
- `ADMIN_EMAIL` not configured in local `.dev.vars` — bootstrap is
  integration-tested (incl. mixed-case), not exercised through a live
  authenticated request locally.
- Shadcn components live under `src/lib/components/` (documented FSD
  accommodation).
- `docs/phases/phase 2/phase-2-implementation-handoff.md` marked historical; this file is
  the current handoff.

## 17. Deferred (unchanged from the plan)

Leaderboard (Phase 3), admin scheduling (Phase 4), CSP/rate-limiting/ZAP
(Phase 5), deployment (Phase 6), real dictionary import (NG16).

## 18. Exact verification commands used for this handoff

`bun install --frozen-lockfile` ✅ · `npm run lint` ✅ · `npm run check`
0/0 ✅ · `npm run test:unit` 121 ✅ · `npm run build` ✅ · `npm run
types:check` ✅ (hermetic) · `npm run verify:bundle` ✅ · `npm run auth:check`
✅ · `npm run word-list` ✅ (byte-identical regeneration) · `npm run
avatar-list` ✅ (byte-identical) · `npm run test:integration` 35/35 ✅ ·
`npm run test:e2e` 15/15 ✅ · `bunx wrangler deploy --dry-run` ✅ · `git diff
--exit-code -- src/server/db/schema.ts src/server/db/migrations` ✅ (empty).
CI: GitHub Actions **run #16** (head `38c158a`) green (API-verified).