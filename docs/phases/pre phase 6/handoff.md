# Pre-Phase 6 → Phase 6 Handoff

A fresh Phase-6 chat can continue from this file **without** the pre-phase-6 conversation history. Everything needed to start Phase-6 PLANNING is below or one link away.

## What just happened (pre-phase-6, 2026-09-05)

Production data finalization: the three product datasets were imported from their real upstream sources, verified, and committed; two handoff docs were written. **No Phase-6 deployment or production provisioning was started.**

Detailed record: [`docs/phases/pre-phase-6/production-data-finalization.md`](./production-data-finalization.md)
Product lock (authoritative): [`docs/phases/pre-phase-6/pre-phase-6-production-data-lock.md`](./pre-phase-6-production-data-lock.md)
Inputs manifest: [`docs/phases/pre-phase-6/production-inputs-manifest.json`](./production-inputs-manifest.json)

## Finalized values (Phase-6 must reference these — no placeholders remain)

| Item | Value |
|---|---|
| Valid guesses | **12,972** — `src/server/data/valid-guesses.source.txt` ← `deedy/wordle-solver` `official_wordle_all.txt` @ commit `33a13bfe28b8f860f4d33a7c4c822892b0f8afef` (SHA-256 `af8494…6ee21`) |
| Answer pool (PRIVATE) | **2,315** — `scripts/seed/answer-pool.source.txt` (gitignored, never committed) ← `official_wordle_common.txt` @ commit `924deba09cfe0bbe285e80cddbd7a7bc6cc1f1b4` (SHA-256 `ecc026…01f0`); **2315/2315 ⊂ guesses, proven** |
| Avatars | **3,944** fully-qualified RGI emoji — Unicode Emoji 17.0 / 17.0.0 `emoji-test.txt` (2025-08-04) → `src/server/data/avatar-emojis.ts` + generated client twin; supersedes the old 24-item set |
| Admin emails | `tee.johnlor@gmail.com`, `leaderboardwordle@gmail.com` (deployment config via `ADMIN_EMAIL`, not code) |
| Weekly threshold | 3 completed eligible days (`WEEKLY_QUALIFICATION_COMPLETED_DAYS`, already in code) |
| Monthly threshold | 8 completed eligible days (`MONTHLY_QUALIFICATION_COMPLETED_DAYS`, already in code) |

## Verification receipts (all green)

- `bun run word-list` → built 12,972; regeneration byte-identical
- `bun run avatar-list` → built 3,944; regeneration byte-identical
- `bun run lint`, `bun run check` (0 errors/warnings)
- `bun run test:unit` → 33 files / 233 tests passed
- `bun run build` + `bun run verify:bundle` → secrecy OK (0 non-public pool words in build output)
- `tests/unit/answer-pool-import.test.ts` 6/6 → subset pin active against the real seed file

Not run locally (CI-gated, need non-production `DATABASE_URL`): integration + e2e suites.

## Files changed in pre-phase-6

- Data: `src/server/data/valid-guesses.source.txt`, `src/server/data/valid-guesses.generated.ts`, `src/lib/shared/data/valid-guesses.json`, `src/server/data/avatar-emojis.ts`, `src/lib/shared/config/avatar-emojis.generated.ts`
- Tests (dataset-driven pins only): `tests/unit/avatar-list.test.ts`, `tests/unit/profile-service.test.ts`, `tests/unit/admin-secrecy.test.ts`, `tests/integration/profile.test.ts`
- Scripts/docs: `scripts/build-avatar-list.ts` (header comment), `scripts/seed/README.md` (provenance), `docs/contradictions-and-gaps.md` (avatar-set supersession + admin-secrecy scan-design records)
- New docs: `docs/phases/pre-phase-6/production-data-finalization.md`, `docs/phases/pre-phase-6/handoff.md` (this file)

## Open items for Phase-6 (not blockers to PLANNING)

1. **Seed the answer pool into each target DB** before any deployment that schedules real answers:
   `DATABASE_URL=<non-production first> bun run seed:answers` (idempotent; validates `answers ⊂ valid guesses` again at seed time).
2. **Deployment config**: set `ADMIN_EMAIL` for BOTH admin addresses.
3. **UX consideration (not a data task)**: the avatar picker now has 3,944 choices — search/filter or grouped layout is a Phase-6 product/UX decision.
4. Integration/e2e suites will run against the non-production DB in CI with the updated avatar-policy cases.

## What Phase-6 PLANNING should NOT redo

- Do not re-derive or re-download the word lists/emoji data (provenance is pinned above).
- Do not change the admin emails or the 3/8 thresholds (product lock).
- Do not weaken the secrecy gates (verify:bundle, admin-secrecy embed pin, subset pin).
- Do not place the answer pool in any public artifact or client bundle.