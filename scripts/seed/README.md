# Answer-pool seed inputs (PRIVATE — never commit)

This directory holds the **private approved-answer pool** input files:

- `answer-pool.source.txt` → imported into Neon `answer_dictionary` by the
  seed tooling (Phase 3/4 admin scheduling work). **Never committed**:
  `.gitignore` covers `scripts/seed/*.txt`.

Rules (NC3/NG16): record provenance for every import — upstream source,
version/commit, license, import date, and filtering rules — in the import
script and this file. Enforce `approved answers ⊂ valid guesses` at seed
time so a scheduled answer can never be a word users cannot submit
(Architecture §707). The pool must never be imported from `src/lib` and
must never appear in the client bundle (`bun run verify:bundle` checks).