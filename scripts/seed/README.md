# Answer-pool seed inputs (PRIVATE — never commit)

This directory holds the **private approved-answer pool** input files:

- `answer-pool.source.txt` → imported into Neon `answer_dictionary` by
  `bun run seed:answers` (`scripts/seed/import-answer-pool.ts`). **Never
  committed**: `.gitignore` covers `scripts/seed/*.txt`.

## Usage

```bash
# 1. Place the private pool in this directory (gitignored):
#    scripts/seed/answer-pool.source.txt — one lowercase 5-letter word per
#    line; blank lines and `#` comments ignored.
# 2. Import into the target (non-production) database:
DATABASE_URL=... bun run seed:answers
```

Exit codes: `0` imported (report printed: inserted / already present);
`1` source missing/invalid or import failed (nothing was written);
`2` `DATABASE_URL` missing.

The script **fails the import** on any of:

- a word that is not a lowercase 5-letter word;
- a duplicate word in the source;
- a word **not in the server valid-guess set** — `approved answers ⊂ valid
  guesses` is enforced at seed time (NG13, Architecture §707), so a
  scheduled answer can never be a word users cannot submit.

Imports are **idempotent** (`ON CONFLICT DO NOTHING` — re-running never
duplicates; the report separates newly inserted from already-present rows).

## Provenance

Rules (NC3/NG16): record the following for every import. The pool must
never be imported from `src/lib` and must never appear in the client bundle
(`bun run verify:bundle` checks).

| Field | Value |
|---|---|
| Upstream source | `deedy/wordle-solver` → `data/official_wordle_common.txt` — the original/pre-NYT Wordle 2,315-word answer pool (same snapshot as the valid-guess list; extracted from the original Wordle site source `main.c1506a22.js`) |
| Version / commit | `924deba09cfe0bbe285e80cddbd7a7bc6cc1f1b4` (2022-01-20, `main` at import time; bytes re-downloaded at this commit and SHA-256 verified: `ecc0269bce8250738f277c63103ed81a0d9904549a6d6da2c7cd6d32cca401f0`) — full record in `docs/phases/pre-phase-6/production-data-finalization.md` |
| License | `deedy/wordle-solver` is MIT; the word list itself derives from the original Wordle website source (Josh Wardle). Recorded as upstream provenance; not a claim that the word data is MIT-licensed. |
| Import date | 2026-09-05 (`bun run seed:answers` must be re-run against each target DB; the source file above was placed on this date) |
| Filtering rules | lowercase 5-letter only; duplicates removed; every word verified against `src/server/data/valid-guesses.source.txt` (the committed public list) at import time — subset proof: 2,315/2,315 (see the finalization doc) |

> This file's rules are the contract the import tooling implements — see
> `scripts/seed/import-answer-pool.ts` (Phase 4, S1) and
> `tests/unit/answer-pool-import.test.ts`.