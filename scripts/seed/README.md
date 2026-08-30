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
| Upstream source | _(record the source of the answer list, e.g. an official wordle answer list or word frequency list)_ |
| Version / commit | _(record the exact version/commit the import was derived from)_ |
| License | _(record the upstream license)_ |
| Import date | _(record the date `bun run seed:answers` was last run against the target DB)_ |
| Filtering rules | lowercase 5-letter only; duplicates removed; every word verified against `src/server/data/valid-guesses.source.txt` (the committed public list) at import time |

> This file's rules are the contract the import tooling implements — see
> `scripts/seed/import-answer-pool.ts` (Phase 4, S1) and
> `tests/unit/answer-pool-import.test.ts`.