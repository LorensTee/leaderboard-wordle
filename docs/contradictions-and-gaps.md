# Leaderboard Wordle — Contradictions and Gaps

Cross-referencing Architecture-v3 against the proposed repository tree, dependency list, indexed documentation, and gpt v6–v9 reviews, plus independent audit and Luna v10–v16 cross-checks (2026-08-23) that add the open items NC1–NC3, NG1–NG25, M1–M5 below, including findings from the bounded SvelteFlare reference audit (`pinebasedev/svelteflare@9a0a2dd`).

## Resolved contradictions (fixed in Architecture-v3 + Specifications-v1)

| # | Issue | Resolution |
|---|---|---|
| ~~C1~~ | Phase ordering | Resolved: rewritten as vertical slices (Phase 0-6). |
| ~~C2~~ | FSD premature layers | Resolved: tree simplified to `app/` + `shared/` only. Future structure labeled as extracted, not initial. |
| ~~C3~~ | Security in wrong phase | Resolved: Phase 5 reworded as "verification/hardening gate." |
| ~~C4~~ | Phase 1 depends on authentication | Resolved: Better Auth moved to Phase 0. |
| ~~C5~~ | "Locked" vs current-day leaderboard | Resolved: spec updated "until the puzzle locks" → "until the puzzle finalizes." |
| ~~C6~~ | Neon HTTP vs interactive transactions | Resolved: switched to WebSocket-capable driver. |
| ~~C7~~ | `SCHEDULED → ACTIVE` no transition | Resolved: added `activatePuzzle()`. Midnight order fixed: finalize first, then activate. |

## Resolved gaps (fixed in Architecture-v3 + Specifications-v1)

| # | Issue | Resolution |
|---|---|---|
| ~~G1~~ | locked_at clarification | Resolved: explicit mutability state note. |
| ~~G2~~ | Daily settlement execution | Resolved: Cron Trigger + idempotent operations. |
| ~~G3~~ | MISSED persistence | Resolved: derived (absence of game row). |
| ~~G4~~ | Game concurrency | Resolved: UNIQUE constraints + transactions. |
| ~~G5~~ | Game start idempotency | Resolved: UNIQUE constraint + returns existing. |
| ~~G6~~ | Answer lock race | Resolved: `WHERE locked_at IS NULL` guard. |
| ~~G7~~ | Leaderboard aggregation | Resolved: `dailyScore()`, `leaderboard_guess_count`, threshold. |
| ~~G8~~ | Onboarding state | Resolved: `onboarding_completed_at` + invariant. |
| ~~G9~~ | Display-name uniqueness | Resolved: `display_name_normalized` + UNIQUE. |
| ~~G10~~ | Test architecture | Resolved: `tests/unit/`, `integration/`, `e2e/`, `security/`. |
| ~~G11~~ | Hono RPC type boundary | Resolved: type-only imports, runtime forbidden. |
| ~~G12~~ | Leaderboard guess count | Resolved: `COMPLETED ? guess_count : 6`. |
| ~~G13~~ | Participation threshold | Resolved: absolute days, finalized only. |
| ~~G14~~ | Tree missing hooks.server.ts | Resolved: added to tree. |
| ~~G15~~ | Valid-guess dictionary source | Resolved: canonical source → server + client. |
| ~~G16~~ | Answer pool deployment | Resolved: private source → seed → Neon. |
| ~~G17~~ | Finalization transaction | Resolved: atomic, idempotent, independently retryable. |
| ~~G18~~ | Clock/late-request | Resolved: PostgreSQL database time for all timestamps. |
| ~~G19~~ | Client request-ordering | Resolved: one guess in flight per game. |
| ~~G20~~ | Admin bootstrap | Resolved: `ADMIN_EMAIL` + atomic promote, never demotes. |
| ~~G21~~ | Missing-puzzle behavior | Resolved: hard invariant, fail closed + alert. |
| ~~G22~~ | Duplicate answer not DB-enforced | Resolved: `UNIQUE(answer_id)` constraint. |
| ~~G23~~ | Leaderboard rank not deterministic | Resolved: third tiebreaker + dense rank. |
| ~~G24~~ | Timestamp authority split | Resolved: PostgreSQL database time unified. |
| ~~G25~~ | Rate limiting | Resolved: Cloudflare Workers Rate Limiting API specified. |

## Resolved from gpt v8 review

| # | Issue | Resolution |
|---|---|---|
| ~~N1~~ | Rate limiting "in-request counters" | Resolved: replaced with Cloudflare Workers Rate Limiting API. |
| ~~N2~~ | Rate limit mechanism underspecified | Resolved: Cloudflare Rate Limiting binding in wrangler.toml. |
| ~~N3~~ | Midnight operation failure isolation | Resolved: finalize before activate; each independently retryable. |
| ~~N4~~ | Admin bootstrap in Phase 2 and Phase 4 | Resolved: removed from Phase 4, kept in Phase 2. |
| ~~N5~~ | Phase 3 "persistent results" misleading | Resolved: reworded to "history/statistics over persisted game results." |
| ~~N6~~ | Tiebreaker needs intentional note | Resolved: explicit speedrun-app rationale added. |
| ~~N7~~ | Dense rank terminology error | Resolved: "next rank skips" → "next distinct result receives immediately following rank." |
| ~~N8~~ | Spec still has LOCKED lifecycle | Resolved: replaced with `SCHEDULED→ACTIVE→FINALIZED` + mutability via `locked_at`. |
| ~~N9~~ | "Active horizon" undefined | Resolved: concept eliminated; invariant reworded non-tautologically (see N15). |

## Design questions

| # | Issue | Resolution | Status |
|---|---|---|---|
| ~~D1~~ | completed_count denormalization | Removed from V1 schema. Derive via COUNT. | Resolved |
| ~~D2~~ | TanStack Query vs local state | TanStack Query for durable server state. Local Svelte for ephemeral. | Resolved |

## Resolved from gpt v9 review

| # | Issue | Resolution |
|---|---|---|
| ~~N10~~ | Guess submission vs finalization transaction race | Resolved: puzzle row is serialization point; guess/game transactions lock puzzle first. |
| ~~N11~~ | Game start and locked_at need one transaction | Resolved: game start = answer locking in same transaction (lock puzzle → set locked_at → create/retrieve game). |
| ~~N12~~ | answer_dictionary.word not uniquely constrained | Resolved: added UNIQUE(word) + UNIQUE(normalized_word) constraints. |
| ~~N13~~ | No enforced approved answers ⊂ valid guesses | Resolved: seed/import process must verify every answer exists in valid-guess set. |
| ~~N14~~ | Pre-game API does not guarantee hint secrecy | Resolved: GET /api/game/today returns no hint pre-start; POST /api/game/start returns hint + game state. |
| ~~N15~~ | "Active horizon" definition is tautological | Resolved: "A puzzle must exist before a date becomes the next active date." |
| ~~N16~~ | Cron recovery after missed executions underspecified | Resolved: cron is reconciliation job — finalize expired, activate today, alert if missing. |
| ~~U1~~ | proposed-dependencies.md stale about Neon | Resolved: updated to "WebSocket-capable driver for interactive transactions." |

## Open items — audit + Luna v10 cross-check (2026-08-23)

Independent audit of this file against Architecture-v3, Specifications-v1, the proposed tree/dependencies, and Luna v1–v9, cross-checked by Luna v10. All previously listed items stay resolved. The items below are open and tracked; **none is critical-blocking**. "Fix" gives the proposed solution to fold into the docs/implementation when that phase starts. Per Luna v10: the NG6 and NG10 fixes were **replaced**, other fixes were tightened, NG9's boundary rule was sharpened (see row), and NG12–NG18 were added. Luna v11 confirmed the NG9 deadline contract and mandated the two lock-order concurrency tests (see NG9 row). Luna v12 confirmed the remaining items; the NG8/NG15 recovery rule was rewritten as an atomic same-day replacement per its review (see rows). On 2026-08-23 (Luna v13) the accepted decisions were propagated into `Architecture-v3.md`, `Specifications-v1.md`, `proposed-repo-tree.md`, and `proposed-dependencies.md`; the NC1 wording and the rate-limit enforcement-column residual listed below are now fixed in the source documents. Luna v14–v16 (bounded SvelteFlare audit, 2026-08-23): NG4's mechanism was sharpened (custom JSON Origin/Sec-Fetch-Site middleware — Hono's built-in `csrf()` is gated to form content-types and cannot protect a JSON client), `src/server/middleware/` gained an explicit home, and NG19–NG21 plus an investigation backlog were added from the audit. Final re-audit (2026-08-23, close of the review chain): all `Location` citations were converted from line numbers to **section references** (line numbers drift on every edit), the M3 eligibility anchor was aligned with the NG9 deadline contract (`transaction_timestamp()`), and NG22–NG25 were added (secure-headers baseline, CI pipeline, `completion_time_ms` stored-vs-derived, duplicated session/cookie sections).

### Doc-alignment contradictions (NC)

| # | Issue | Severity | Location | Fix | Resolve in |
|---|---|---|---|---|---|
| **NC1** | `MISSED` still described as a stored row | Medium | Specifications-v1 §10–§11 vs Architecture-v3 §games (MISSED derived) | Spec §10–§11: `MISSED` is a derived state (absence of a game row for a finalized puzzle), not a stored status; keep `guess_count = 0` only as the aggregation placeholder for leaderboard math. | Docs — now |
| **NC2** | `display_name_normalized` / `onboarding_completed_at` absent from Better Auth schema blocks | Medium | Architecture-v3 §user (Better Auth managed) — both schema blocks | Add both columns to the canonical `user` schema block in both places as application extensions via Better Auth `user.additionalFields`, AND define the same columns in the Drizzle schema passed to the adapter — both kept in sync through migrations (config alone does not create columns). | Phase 0 (schema) |
| **NC3** | Word-list / profanity data versioning unrecorded | Medium | Architecture-v3 §Word-data model; proposed-dependencies §packages-not-named | Record concrete file paths + version discipline for the canonical valid-guess list, the approved-answer pool, and the banned-word list (concrete paths in NG6/NG7). | Phase 0 (decision) |

### Open gaps (NG)

| # | Issue | Severity | Location | Fix | Resolve in |
|---|---|---|---|---|---|
| **NG1** | `Asia/Manila` midnight cron has no UTC expression | High | Architecture-v3 §Settlement / §daily_puzzles | Cloudflare Cron is UTC-only: `triggers.crons = ["0 16 * * *"]` (Manila = UTC+8, no DST). Define `puzzle_date AS DATE` and `expires_at TIMESTAMPTZ = (puzzle_date + 1) AT TIME ZONE 'Asia/Manila'`, computed at schedule/activation; settlement compares `expires_at <= now()` in the DB. | Phase 0 (wrangler + schema) |
| **NG2** | Hint letter not validated | High | Architecture-v3 §daily_puzzles (hint_letter) / §Admin answer validation | At schedule time verify `hint_letter` is exactly one ASCII letter AND occurs in the answer (a DB CHECK cannot enforce cross-row membership); DB CHECK only for shape: `char_length(hint_letter) = 1 AND hint_letter ~ '^[A-Z]$'`; generate and persist the hint **at scheduling time**, not at activation. | Phase 0 (CHECK) + Phase 4 (schedule validation) |
| **NG3** | `puzzle_date`/`expires_at` types and leaderboard indexes undefined | High | Architecture-v3 §daily_puzzles / §Settlement | `puzzle_date DATE NOT NULL UNIQUE`; `expires_at TIMESTAMPTZ NOT NULL` (per NG1). Indexes are candidates, not final: derive from actual queries (today's puzzle, expired non-finalized, games by puzzle/user, completed games per puzzle); UNIQUE constraints already create indexes — confirm `daily_puzzles(status, puzzle_date)` and `games(puzzle_id, status)` against query plans. | Phase 0 (first migration) |
| **NG4** | CSRF policy for Hono cookie mutations | Medium | Architecture-v3 §CSRF boundary / §Session/cookie strategy | SameSite=Lax already blocks cross-site POST cookies. Add a **custom** Hono middleware (in `src/server/middleware/`) verifying `Origin`/`Sec-Fetch-Site` on **all unsafe application cookie-authenticated mutations regardless of content-type** (`/api/game/*`, `/api/me/*`, `/api/admin/*`). Do NOT rely on Hono's built-in `csrf()`: it gates only form content-types (urlencoded/multipart/text-plain) and never fires for JSON requests, so it cannot protect the `hc` JSON client. Exclude `/api/auth/*` (OAuth callbacks are cross-site by nature; Better Auth owns its CSRF there). `Sec-Fetch-Site` is auxiliary — reject only when BOTH origin and sec-fetch-site checks fail. Audit that no state-changing endpoint is GET-reachable (incl. Better Auth sign-out). | Phase 0 (middleware baseline) |
| **NG5** | Theme (light/dark) persistence undefined | Medium | Specifications-v1 §2 / Architecture-v3 §Styling/UI | Persist in `localStorage` (`theme` key); apply before first paint via `src/lib/app/theme` provider (inline head script) to avoid FOUC; default from `prefers-color-scheme`; no SSR/DB dependency. | Phase 2 |
| **NG6** | Display-name normalization vs moderation pipeline vague | Medium | Specifications-v1 §1, §15 / Architecture-v3 §Display-name rules | Two distinct functions in `src/lib/shared/lib/`: `canonicalizeDisplayName()` for the `display_name_normalized` UNIQUE column (ASCII charset, lowercase, trim, collapse whitespace) and `moderationKeyForDisplayName()` for profanity/obfuscation detection (aggressive: leet/confusable mapping, separator removal). Pin the V1 display-name charset to ASCII explicitly (`[a-z0-9 _-]`, case-insensitive) instead of vague "letters"; baseline + custom banned list in a versioned JSON file under `src/lib/shared/config/`. | Phase 2 |
| **NG7** | Valid-guess dictionary has no tree location | Medium | Architecture-v3 §Valid-guess dictionary / proposed-repo-tree §Directory structure | Add the paths to BOTH the architecture references and `docs/proposed-repo-tree.md` (else the tree's own "no invented files" rule is violated): `src/server/data/valid-guesses.source.txt` (git, canonical), generated `src/lib/shared/data/valid-guesses.json` (client bundle), `scripts/build-word-list.ts` (one canonical source → server + client artifacts with an automated equality/version build check per Architecture-v3 §Valid-guess dictionary); private gitignored answer file + `scripts/seed/` import (provenance per NG16). | Phase 0–1 (build pipeline) |
| **NG8** | Admin delete/edit of SCHEDULED puzzles undefined | Medium | Architecture-v3 §Admin scheduling window / Specifications-v1 §16 | DELETE allowed only when `locked_at IS NULL AND status = 'SCHEDULED' AND puzzle_date > current Asia/Manila date` (future dates), else 403 — today's SCHEDULED puzzle cannot be plain-deleted; content changes for today go through the atomic same-day replacement only (NG15). Ordinary scheduling/editing applies to future dates; past dates rejected. Moving a scheduled puzzle recomputes `expires_at` and re-checks `UNIQUE(puzzle_date)`; resulting date gaps trigger the missing-puzzle alert. | Phase 4 |
| **NG9** | Expiry-check snapshot vs commit (TOCTOU) | Low–Medium | Architecture-v3 §Expiry deadline contract / §Concurrency | Deadline contract (confirmed by Luna v11): a mutation is eligible only when its transaction begins before `expires_at` — `transaction_timestamp()` is the authoritative **transaction-start eligibility anchor** (not a proxy for HTTP arrival; `statement_timestamp()` is server-receipt time). After eligibility, the puzzle-row lock is the serialization point against `finalizePuzzle`: whichever acquires it first decides the outcome. Do NOT use `clock_timestamp()` as the authority: it shares the same check-then-commit gap and would make acceptance depend on lock-wait timing. Mandatory midnight-crossing integration tests, both lock orders: (A) guess locks first → commits COMPLETED, finalize converts only remaining ACTIVE games; (B) finalize locks first → guess acquires the lock post-finalization, its post-lock `status = ACTIVE` check fails (observes `FINALIZED`), guess rejected. Invariant: a request whose transaction-start eligibility time is after `expires_at` can never pass the expiry check. | Phase 0–1 (transaction semantics) |
| **NG10** | Google name / `emailVerified` behavior undefined | Low | Architecture-v3 §Onboarding state / §Auth (Better Auth) | Do not hard-code `emailVerified = true`: Better Auth maps the provider's verification signal into `emailVerified` (per docs, "for social logins, email verification status is read from the SSO"); enable per-provider `requireEmailVerification: true` for Google (defaults `false`; the gate checks the local user's verification state and redirects with `email_not_verified` when unverified). Google `name` may prefill `user.name`, but onboarding re-validates against display-name rules (2–15 chars, ASCII charset) and forces a new choice if invalid; `display_name_normalized` computed at onboarding save. | Phase 0–2 |
| **NG11** | Top-10 vs full leaderboard response undefined | Low | Specifications-v1 §12 / Architecture-v3 §Core API shape | Leaderboard endpoints take `?limit=10`; define `limit` as a dense-rank cutoff (`rank <= 10` — may return more than 10 rows) and `count` as the total number of qualified players (`entries` = rows through the cutoff; for the viewer's own rank see NG13). | Phase 3 |
| **NG12** | "Earliest qualifying completion" tiebreaker undefined | Medium | Architecture-v3 §Ranking model (final tiebreaker) | Define `earliest_qualifying_completion_at` = min(`completed_at`) over the player's COMPLETED games on eligible finalized days in the period — the same day set used for the score average — or explicitly choose a different rule. | Phase 3 |
| **NG13** | Current user's rank unavailable when outside top-N | Medium | Specifications-v1 §12–§13 / Architecture-v3 §Core API shape | Include the viewer's own rank in leaderboard responses: `{ entries, count, currentUser: { rank, entry } }` (or a separate rank endpoint) so the result screen can show "Current position" at any rank. | Phase 3 |
| **NG14** | Rank key vs display-order key must stay separate | Low | Architecture-v3 §Ranking model (rank vs display order) | Same fix as M2: `user_id` only in the final display `ORDER BY`, never inside the `DENSE_RANK()` window — listed separately so the separation is explicitly test-covered. | Phase 3 |
| **NG15** | Admin mutation rules at the Asia/Manila day boundary | Medium | Architecture-v3 §Admin scheduling window / Specifications-v1 §16 | Explicit state rule, not a side effect of DELETE guards: once a puzzle's effective date begins, its answer/hint is immutable. Lifecycle: future date → normal scheduling/editing; today + `SCHEDULED` + never started (cron missed) → **atomic same-day replacement** only; today + `ACTIVE` → immutable; `FINALIZED` → immutable. The replacement is a single recovery transaction (not delete+reschedule): lock the row, verify `puzzle_date` = current Asia/Manila date, `status = 'SCHEDULED'`, `locked_at IS NULL`, then UPDATE `answer_id`/`hint_letter` in place (re-checks `UNIQUE(answer_id)`, regenerates/persists the hint per NG2, recomputes `expires_at`) — no transient gap, no spurious missing-puzzle alert. | Phase 4 |
| **NG16** | Word-list provenance/reproducibility | Medium | Architecture-v3 §Valid-guess dictionary / tree §Data files | Record for each list (valid guesses, answer pool, banned words): upstream source, exact version/commit, license, import date, normalization and five-letter filtering rules; automated build check that server/client artifacts agree and answers ⊂ valid guesses. | Phase 0–1 |
| **NG17** | Pre-paint theme script vs CSP | Low | Specifications-v1 §2 / Architecture-v3 §Styling/UI (theme) | NG5's inline head script must remain CSP-compatible (nonce or script hash) when the security-hardening phase adds a Content-Security-Policy. | Phase 2/5 |
| **NG18** | Admin-bootstrap identity assumptions | Low | Architecture-v3 §Admin bootstrap | Document as a security decision: admin promotion keys on the verified email (enable per-provider `requireEmailVerification` for Google so `emailVerified` gates the bootstrap). With Google as the only provider in V1, implicit account linking applies only to same-email verified identities, and linking never mutates the local `email`/`emailVerified` (Better Auth `accountLinking`). Misconfigured `ADMIN_EMAIL` → no admin → recovery is a **manual database/operator bootstrap** (SQL/migration procedure, verified by the operator) — a no-admin state cannot be fixed through the app Admin UI. | Phase 0/2 |
| **NG19** | Request timeout undefined | Low | Architecture-v3 §Middleware; SvelteFlare `apps/api/src/middleware/timeout.ts` [observed] | Wrap the composed Hono app with `hono/timeout` (30 s) returning a JSON 408 using the NG21 error envelope; zero-coupling addition to `src/server/middleware/`. | Phase 0 |
| **NG20** | Payload-size enforcement undefined | Low | Architecture-v3 §Middleware; Specifications-v1 §21 | Enforce a 64 KB request-body cap → JSON 413 with the NG21 error envelope, applied before validation. | Phase 0 |
| **NG21** | Error envelope + requestId undefined | Low | Architecture-v3 §Error envelope contract; SvelteFlare `apps/api/src/helpers/http.ts` [observed] | Central error contract: every API error returns `{ error: { code, message, requestId, issues? } }` with a stable status→code map; centralized `onError`/`notFound`; one `requestId` per request echoed in responses and logs for correlation; log bodies only for status ≥ 500. | Phase 0 |
| **NG22** | Secure-headers baseline undefined | Low | Architecture-v3 §Security model (middleware lists "secure headers" without defining them); NG17 | Define the baseline header set centrally in `src/server/middleware/`: `X-Content-Type-Options: nosniff`, framing policy (`frame-ancestors 'none'`, or `X-Frame-Options: DENY` until CSP lands), `Referrer-Policy: strict-origin-when-cross-origin`, HSTS in production; CSP with nonce/hash per NG17 hardened at Phase 5. | Phase 0 scaffold + Phase 5 harden |
| **NG23** | CI pipeline undefined | Low | Architecture-v3 §Test architecture / §Development phases; tree has no CI path | Add `.github/workflows/ci.yml`: `bun install` → `bun check`/lint → unit + integration tests (Neon branch DB or local Postgres — never production) → build; Playwright e2e/security job on PR or nightly. Add the path to the tree. | Phase 0–1 |
| **NG24** | `completion_time_ms` stored vs derived ambiguous | Low | Architecture-v3 §games (column comment) vs Specifications-v1 §10 ("stores") | Decide and document: compute once in the completion transaction and **store** it (frozen; matches Spec §10 and the raw-facts principle), or compute on read. Recommended: stored column set at completion; update the schema comment. | Phase 0 (schema) |
| **NG25** | Session/cookie strategy duplicated in Architecture-v3 | Low | Architecture-v3 §Session/cookie strategy (two sections) | Merge into one section (keep the unique host-only-cookie, no-JS-visible-token, and no-token-storage details); single source prevents drift. | Docs — now |

### Additional gaps (M) — independent audit findings

| # | Issue | Severity | Location | Fix | Resolve in |
|---|---|---|---|---|---|
| **M1** | Week-start day undefined (Monday vs Sunday) | Medium | Specifications-v1 §12 (This week) | Define the canonical week start as a product constant (recommend **Monday**, ISO-8601, in the Asia/Manila calendar) and use it for "This week" boundaries. | Decision now, Phase 3 |
| **M2** | No final deterministic tiebreak | Low | Architecture-v3 §Ranking model | Keep two ordering concepts separate: rank key `DENSE_RANK() OVER (ORDER BY avg_time, avg_guesses, earliest_completion)`; display order `ORDER BY rank, user_id`. Never include `user_id` in the rank window — it must not change shared ties (see NG14). | Phase 3 |
| **M3** | Lazy finalization exists, lazy activation does not | Medium | Architecture-v3 §Settlement (lazy paths) | In `POST /api/game/start`, lazily activate today's SCHEDULED puzzle in the same transaction if the cron missed it, only when all guards hold — after acquiring the puzzle-row lock (`SELECT ... FOR UPDATE`) so cron activation and lazy activation serialize on the same row: `puzzle_date` = current Asia/Manila date, `status = 'SCHEDULED'`, `expires_at > transaction_timestamp()` (NG9 anchor), and no other ACTIVE puzzle for today's date. Fail-closed + alert only when the row is absent (missing-puzzle invariant). | Phase 0–1 |
| **M4** | Avatar-emoji file path contradicts tree/FSD | Low–Medium | Specifications-v1 §15 vs proposed-repo-tree §shared/config | Adopt `src/lib/shared/config/avatar-emojis.ts` (per tree); update the Spec example path; do not introduce a non-FSD `src/lib/data/` layer. | Phase 0 (scaffolding) |
| **M5** | Scheduling window and date-move semantics undefined | Low–Medium | Specifications-v1 §16 / Architecture-v3 §Admin scheduling window | Same boundary semantics as NG8/NG15: past-date rejection, day-boundary immutability, atomic same-day replacement (recovery), date-move `expires_at` recomputation, DELETE guard (future dates only), gap alert. | Phase 4 |

## Investigation backlog (SvelteFlare audit 2026-08-23)

Not open items — recorded so decisions are deliberate, not accidental:

- Better Auth `cookieCache` option (SvelteFlare `apps/api/src/auth.ts`) — 5-minute session staleness vs revocation semantics; assess against ASVS at Phase 0/5. A Google-only setup may not need it.
- `wrangler types`-generated binding types vs `@cloudflare/workers-types` — decide at Phase 0 (bindings shape affects `c.env` typing through the Hono bridge).

## Proposed tree compliance

| Rule | Tree compliance | Status |
|---|---|---|
| FSD applies to `src/lib` only | ✅ | ✅ |
| Hono backend in `src/server/` | ✅ | ✅ |
| Bridge is integration-only | ✅ | ✅ |
| No FSD in `src/routes` | ✅ | ✅ |
| `src/lib/shared/auth/` removed | ✅ | ✅ |
| `src/server/auth/` is sole auth location | ✅ | ✅ |
| `src/app.d.ts` added | ✅ | ✅ |
| `src/hooks.server.ts` in tree | ✅ | ✅ |
| Test directories in tree | ✅ | ✅ |
| FSD layers minimal | ✅ | ✅ |

## Summary

- **7 contradictions** — all resolved
- **25 gaps** — all resolved
- **9 issues from gpt v8** — all resolved
- **8 issues from gpt v9** — all resolved (N10–N16 + U1)
- **2 design questions** — all resolved
- **0 critical blocking items**
- **33 open items tracked** — 3 doc-alignments (NC1–NC3), 25 gaps (NG1–NG25), 5 audit findings (M1–M5) — none blocking; resolve in the owning phase listed above. NG19–NG23 came from the SvelteFlare audit and the final re-audit; NG24–NG25 are docs/schema-clarity items. Decide before Phase 0 scaffolding ends: NG1, NG3, NG4, NC2, M4, NG19–NG23 (schema/cron/middleware/CI shape).
- **Wording residuals: resolved by the 2026-08-23 propagation (Luna v13)** — NC1's Spec §10–§11 `MISSED` wording and the Architecture-v3 rate-limit "Enforcement" column are now fixed in the source documents. Remaining caveat: "Proposed tree compliance" is vs the *proposed* tree until code exists.
- **10/10 proposed tree compliance rules** — all ✅ (vs the proposed tree; re-verify against the implemented tree)

Architecture is ready for implementation planning; the open items above are tracked decisions with proposed fixes, not blockers.

## Phase 0 resolutions (2026-08-23 — implemented, code-first)

Phase 0 is complete: foundation + auth core + test/CI infrastructure; the three external gates are closed (live non-prod Neon migration + WebSocket transaction proofs, real Google OAuth flow, GitHub Actions run green). Status of the tracked items:

| Item | Phase-0 status |
|---|---|
| NG1 (Manila cron/UTC) | ✅ In code: `wrangler.toml` `[triggers] crons = ["0 16 * * *"]`; `puzzle_date` DATE + `expires_at` TIMESTAMPTZ in migration `0000_init` |
| NG2 (hint validation) | ✅ Shape CHECK `hint_letter_shape` in migration (integration-tested); membership-in-answer validation belongs to `src/server/puzzle` at scheduling time (Phase 4, per architecture) |
| NG3 (types/indexes) | ✅ Implemented in `src/server/db/schema.ts` + migration incl. the documented candidate indexes |
| NG4 (CSRF) | ✅ Custom Origin/Sec-Fetch-Site middleware (`src/server/middleware/csrf.ts`), `/api/auth/*` excluded; fail-closed (headerless + `Sec-Fetch-Site: none` rejected) |
| NG9 (TOCTOU/lock order) | ✅ Puzzle-row lock-first contract + both midnight lock-order integration tests (`tests/integration/midnight-lock-order.test.ts`) — green on Neon |
| NG19 (request timeout) | ✅ Hono timeout 30 s → JSON 408 envelope |
| NG20 (body limit) | ✅ 64 KB → JSON 413 envelope |
| NG21 (envelope/requestId) | ✅ `{ error: { code, message, requestId, issues? } }` + centralized onError/notFound; requestId middleware first |
| NG22 (secure headers) | ✅ nosniff / X-Frame-Options DENY / Referrer-Policy + HSTS over TLS |
| NG23 (CI) | ✅ `.github/workflows/ci.yml` — unit-and-build, integration (gated on non-prod `DATABASE_URL` secret), e2e; run green |
| NG24 (completion_time_ms) | ✅ Stored-once nullable column in `games` |
| NC2 (additionalFields sync) | ✅ `avatarEmoji`/`role`/`display_name_normalized`/`onboarding_completed_at` present identically in Better Auth config, generated schema, and migration |
| NC3 (word-list tooling/provenance) | ✅ `scripts/build-word-list.ts` (source → public artifact) + `scripts/verify-bundle-secrecy.ts` (client+server bundle scan); `scripts/seed/README.md` provenance rules; answer pool gitignored |
| M3 (lazy activation) | ✅ Contract test green (`tests/integration/lazy-activation.test.ts`) |
| M4 (avatar emojis path) | ⏳ Directory scaffolded (`src/lib/shared/config/`); the `avatar-emojis.ts` file lands with Phase 2 onboarding |

Post-Phase-0 recheck note (2026-08-23): Better Auth schema CLI regeneration is unpinned (`auth@latest`) and drifted (fingerprints only: `defaultNow()` markers + `@__PURE__` annotations). Guard added: `bun run auth:check`; commit the canonical file, and on a networked machine run `bun add -d auth@1.7.1` to pin.
