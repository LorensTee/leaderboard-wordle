# Phase 5 — Friend Adversarial Testing Checklist (Spec §21)

A ~2-hour manual session protocol. The "friend" deliberately attempts the
attacks below against the **non-production preview** (`bun run preview`,
`http://127.0.0.1:4173`); a second person records outcomes. Each row's
**Expected behavior** column is the app contract — a row FAILS when the
actual behavior differs. The API rows are additionally machine-pinned by
`tests/e2e/security.spec.ts` + the unit suites (columns "pinned by").

Session setup: `bun run build && bun run preview -- --port 4173 --host 127.0.0.1`
with non-production `DATABASE_URL`/`BETTER_AUTH_SECRET`/`ALLOW_DB_WIPE=1`.

| # | Attack | How to attempt | Expected behavior | Pinned by |
|---|---|---|---|---|
| 1 | Unauthenticated API access | `GET /api/game/current`, `/api/me`, `/api/admin/puzzles`, `/api/leaderboard/today` with no cookie | 401 `UNAUTHORIZED` envelope (JSON, requestId) | security.spec "API bypass" |
| 2 | Protected page access logged-out | Visit `/play`, `/profile`, `/leaderboard`, `/admin` with no session | 307 redirect to `/` (landing) | security.spec "protected pages" |
| 3 | Cross-user data access | User A reads/modifies user B's game (guess on B's gameId) / B's profile | 403 `FORBIDDEN` on B's game; `/api/me` always answers for the cookie's own user | security.spec "cross-user isolation" |
| 4 | ID manipulation | Guess on `POST /api/game/<non-uuid>/guess` and on another user's uuid | non-uuid → 404 `GAME_NOT_FOUND` without DB round-trip; foreign uuid → 403 `FORBIDDEN` | unit (UUID_RE) + security.spec |
| 5 | Fake completion times / scores | `POST /api/game/:id/guess` body with `startedAt`/`completedAt`/`completionTimeMs`/`status` fields | 400 `BAD_REQUEST` (strict zod — client timing fields REJECTED) | unit `game-routes.test.ts` (strict body) |
| 6 | Extra guesses | Guess after the 6th guess / after completion | `GUESS_LIMIT_EXCEEDED` / `INVALID_STATE` envelope; no state change | integration + unit |
| 7 | Completed/expired game mutation | Guess on a COMPLETED or EXPIRED game | rejected (`INVALID_STATE`/`GAME_EXPIRED`), game row unchanged | integration I-A suite |
| 8 | Duplicate completion | Re-submit the winning guess / re-complete | idempotent rejection (`INVALID_STATE`); single completion row | integration + e2e game-flow |
| 9 | Malformed / oversized / wrong-type input | Malformed JSON body; >64 KB body; wrong field types | 400 `BAD_REQUEST` (sanitized) / 413 `PAYLOAD_TOO_LARGE` (pre-guard); no 500s | security.spec "malformed/oversized" |
| 10 | Logout invalidation | Sign out, then call `/api/me` with the old cookie | 401 after sign-out (session row removed) | security.spec "sign-out" + e2e scenario 12 |
| 11 | Cross-site request (CSRF) | POST/PATCH from an attacker origin with a victim's session cookie | 403 `CSRF` envelope; same-origin control succeeds | security.spec "cross-site mutation" |
| 12 | Rapid requests (rate limiting) | Flood `POST /api/auth/sign-in`, mutations | Prod: 429 `RATE_LIMITED` envelope from the Workers binding (per-class namespaces); local preview: pass-through (documented — limiter unavailable locally) | unit `rate-limit.test.ts` + binding config |
| 13 | Authorization bypass (role) | Non-admin calling `/api/admin/*`; admin page | 403 `FORBIDDEN`; `/admin` redirects; Admin tab absent | security.spec "non-admin" + admin E-A1 |
| 14 | Profile/role manipulation | PATCH `/api/me/profile` with `role` field; extra fields | 400 (strict body — `role` not an accepted field; unknown fields rejected) | unit profile-routes (strict) |
| 15 | Secret/value probing | Send lookalike session cookies, bad signatures | Session never resolves (signature check); no DB round-trip without a session cookie | unit hono-auth + hooks fast-path |
| 16 | XSS attempt | Username/displayName with `<script>`/HTML payloads | Stored name rendered escaped (Svelte auto-escaping — no `{@html}` in `src/`); no script execution | S0 grep (zero raw-HTML sinks) + name-render e2e |
| 17 | Open redirect | `callbackURL`/`state` tampering in sign-in URLs | Better Auth validates callback URLs (trusted origins limited); app never uses user-controlled redirect targets | auth config + Better Auth |

## Recording

Run every row twice (light + dark theme — visual rows double as CSP sanity
checks); note deviations in the Phase-5 handoff. Rows 1–15 are covered by
automated pins listed above; rows 16–17 are the manual focus areas.

**Session rule:** the non-production database is reset by the fixture
(TRUNCATE) — never run adversarial attempts against a production or shared
database.