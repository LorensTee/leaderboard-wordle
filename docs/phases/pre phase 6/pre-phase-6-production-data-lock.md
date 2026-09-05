# Pre-Phase 6 — Production Data Lock

Status: **READY FOR PRE-PHASE-6 AGENTIC WORK**

This document freezes the product-owner decisions that must not be guessed or changed by the implementation agent.

## 1. Final product decisions

### Admin accounts

Production admin email allow-list:

- `tee.johnlor@gmail.com`
- `leaderboardwordle@gmail.com`

These are configuration values, not secrets. Do not hard-code passwords or OAuth credentials into source control.

### Leaderboard qualification

- Weekly qualification: **3 completed eligible days**
- Monthly qualification: **8 completed eligible days**

Keep the already-implemented semantics: only completed games on finalized eligible days count; FAILED, FORFEITED, and MISSED do not count; today's game does not count.

Do not change these values unless the product owner explicitly changes them.

## 2. Wordle valid-guess dictionary

Use the **original/pre-NYT Wordle snapshot containing 12,972 valid five-letter guesses**.

Primary reference:

`deedy/wordle-solver/data/official_wordle_all.txt`

Source:
https://github.com/deedy/wordle-solver/blob/main/data/official_wordle_all.txt

That repository documents the file as the 12,972 official valid five-letter words taken from the original Wordle site source `main.c1506a22.js`.

### Required import rules

The resulting canonical source file must:

- contain exactly **12,972** words;
- contain only lowercase `a-z`;
- contain exactly 5 letters per word;
- contain no duplicates;
- be deterministically sorted;
- pass the repository's existing `bun run word-list` pipeline;
- remain byte-equal between the server and client public artifacts after generation.

The agent must pin the exact upstream revision/commit used for import and record it in the provenance documentation. Do not cite only `main` as the final reproducibility reference.

## 3. Wordle answer pool

Use the matching **original/pre-NYT 2,315-word answer pool**.

Primary reference:

`deedy/wordle-solver/data/official_wordle_common.txt`

Source:
https://github.com/deedy/wordle-solver/blob/main/data/official_wordle_common.txt

This is the private answer pool, not a public client artifact.

The pre-phase-6 work must prove:

`2315 answers ⊂ 12972 valid guesses`

with no missing members and no malformed entries.

The answer list must stay in the repository's existing private answer/seed pipeline. Never place it into the public `valid-guesses` artifact or client bundle.

## 4. Profile-avatar emoji policy

Replace the existing 24-item curated avatar list with the project's new production policy:

> **All standard Unicode RGI emoji corresponding to Discord's standard/default emoji, excluding Discord custom/server emoji.**

### Unicode baseline

Use **Unicode Emoji 17.0 / Unicode 17.0.0**.

Authoritative data:

https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt

Selection rule:

1. Include fully-qualified RGI emoji sequences.
2. Exclude standalone components that are not themselves RGI emoji.
3. Exclude Discord custom/server emoji and animated custom emoji.
4. Store the Unicode sequence, not Discord artwork.
5. Do not add Discord-owned graphical assets.
6. Keep server-side validation authoritative.
7. Generate the client twin from the server allow-list using the existing `bun run avatar-list` pipeline.
8. Preserve deterministic ordering and record the Unicode data version.

### Why this represents Discord's default emoji

Discord's API documentation defines **standard emoji as Unicode characters** and distinguishes them from custom emoji, which use Discord-specific syntax/IDs.

Discord also documents that standard emoji are rendered using Twemoji on Desktop and Android, while iOS uses Apple's native emoji set.

Therefore the application should identify an avatar by its Unicode sequence. The visual rendering may differ by platform, just as it does in Discord.

Reference:
https://docs.discord.com/developers/reference

Twemoji reference:
https://github.com/jdecked/twemoji

## 5. Important distinction

Do **not** interpret "Discord emoji" as "Discord custom emoji."

The desired set is:

`Unicode RGI emoji ∩ Discord standard/default emoji`

not:

`Discord server custom emoji`

and not:

`all arbitrary Unicode symbols`.

Because Discord standard emoji are Unicode characters, the database should contain values such as:

`😀`
`🦊`
`👍`
`❤️`

rather than Discord custom forms such as `<:name:id>`.

## 6. Existing repository integration points

The current repository already has:

- `src/server/data/valid-guesses.source.txt` — canonical public guess source; it currently contains sample data and must be replaced.
- `scripts/build-word-list.ts` — deterministic validation/build pipeline.
- `src/server/data/avatar-emojis.ts` — authoritative server avatar allow-list; currently 24 curated entries.
- `scripts/build-avatar-list.ts` — generates the client twin.
- private answer seed/import machinery — answer words must remain private.
- Phase-5 verification already proves word/answer artifact parity and bundle secrecy.

Do not redesign these mechanisms.

## 7. Pre-Phase-6 definition of done

Pre-Phase-6 is complete only when:

- the 12,972-word valid-guess source is imported and verified;
- the 2,315-word answer pool is imported and verified;
- `answers ⊂ guesses` is mechanically proven;
- word-list provenance/version/license notes are recorded;
- the avatar allow-list is replaced according to the Unicode/Discord policy;
- Unicode version/provenance is recorded;
- server/client avatar artifacts are generated and parity-tested;
- the two admin emails are recorded in the real Phase-6 (Deployment) configuration plan;
- weekly threshold is finalized at 3;
- monthly threshold is finalized at 8;
- no Phase-1–5 invariant or security gate is weakened;
- the pre-phase-6 plan (and the real Phase-6 (Deployment) plan) can reference these values without any remaining product-data placeholders.

