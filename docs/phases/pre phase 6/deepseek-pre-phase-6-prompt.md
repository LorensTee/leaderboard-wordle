# DeepSeek Agentic Prompt — Pre-Phase 6 Production Data Finalization

You are now performing **PRE-PHASE 6** work for `leaderboard-wordle`.

Do not start Phase-6 deployment yet.

Your job is to turn the already-finalized product inputs into verified, reproducible repository data and a clean starting state for real Phase-6 (Deployment) planning.

## Read first

Read:

- `Architecture-v3.md`
- `Specifications-v1.md`
- `docs/contradictions-and-gaps.md`
- `docs/phases/phase 3/phase-3-final-state-handoff.md`
- `docs/phases/phase 3/phase-3-implementation-handoff-final.md`
- `docs/phases/phase 4/phase-4-implementation-handoff-final.md`
- `docs/phases/phase 5/phase-5-implementation-handoff-final.md`
- `docs/phases/phase 5/phase-5-plan.md`
- `src/server/data/valid-guesses.source.txt`
- `scripts/build-word-list.ts`
- `src/server/data/avatar-emojis.ts`
- `scripts/build-avatar-list.ts`
- existing private answer seed/import code

Also read:

`pre-phase-6-production-data-lock.md`

and

`production-inputs-manifest.json`

if those files are present.

The production-data lock is authoritative for this task.

## Product decisions — DO NOT CHANGE

Admin emails:

- `tee.johnlor@gmail.com`
- `leaderboardwordle@gmail.com`

Leaderboard qualification:

- Weekly = **3** completed eligible days
- Monthly = **8** completed eligible days

Do not silently change these values.

## Task A — Import the real Wordle valid-guess dictionary

Replace the repository's current SAMPLE valid-guess data with the original/pre-NYT Wordle snapshot.

Source:

`https://github.com/deedy/wordle-solver/blob/main/data/official_wordle_all.txt`

Expected count:

**12,972**

Use the exact upstream revision/commit you actually import from and record that revision in the provenance documentation.

Do not claim the list is MIT-licensed merely because the surrounding repository is MIT-licensed. Record source provenance accurately.

Run the existing build/validation pipeline and prove:

- exactly 12,972 words;
- lowercase a-z only;
- exactly 5 letters;
- unique;
- deterministic ordering;
- generated server/client artifacts are identical according to the existing project's parity rules.

## Task B — Import the real answer pool

Use:

`https://github.com/deedy/wordle-solver/blob/main/data/official_wordle_common.txt`

Expected count:

**2,315**

Keep this in the private answer pipeline.

It must NOT enter the public client guess dictionary.

Mechanically prove:

`2315 / 2315 answers are present in the 12972 guess set`

and prove there are no malformed/duplicate answer entries.

Record source revision/provenance.

## Task C — Replace the avatar allow-list

Current state is only 24 curated entries. Replace that product set.

Target policy:

**All standard Unicode RGI emoji corresponding to Discord's standard/default emoji, excluding Discord custom/server emoji.**

Authoritative Unicode source:

`https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt`

Use Unicode Emoji 17.0 / Unicode 17.0.0.

Selection rules:

- include fully-qualified RGI emoji;
- exclude standalone non-RGI components;
- exclude Discord custom/server emoji;
- store Unicode sequences, not images;
- do not copy Discord artwork;
- preserve deterministic ordering;
- record Unicode version/provenance;
- keep the server allow-list authoritative;
- regenerate the client twin with the existing avatar-list script.

Discord reference:

`https://docs.discord.com/developers/reference`

Discord defines standard emoji as Unicode characters and custom emoji separately.

Do not invent a manually curated subset.

## Task D — Preserve all existing architecture

Do not redesign:

- authentication;
- authorization;
- database schema;
- game logic;
- leaderboard logic;
- puzzle scheduling;
- Phase-5 CSP/rate-limiting/security controls;
- CI invariants.

This work is data finalization and production-readiness preparation.

## Task E — Produce the pre-Phase-6 handoff

Create:

`docs/phases/pre-phase-6/production-data-finalization.md`

It must include:

- exact sources and upstream revisions;
- exact counts;
- validation results;
- `answers ⊂ guesses` proof;
- emoji selection rules and Unicode version;
- admin emails;
- leaderboard thresholds;
- files changed;
- commands run;
- test/verification receipts;
- unresolved issues, if any.

Then create:

`docs/phases/pre-phase-6/handoff.md`

A fresh chat must be able to continue the pre-phase-6 work from this handoff without this conversation's history.

## Critical honesty rules

Do not say "complete" merely because a source URL exists.

Actually inspect the imported files and run the project's validators/tests.

Do not fabricate an upstream commit SHA.

Do not fabricate word counts.

Do not fabricate emoji counts.

Do not publish the private answer pool through a public artifact.

Do not weaken an existing security or schema gate to make this work easier.

## Final response to me

Report:

1. exact valid-guess count;
2. exact answer count;
3. exact answer-subset result;
4. exact emoji count;
5. exact source revisions;
6. files changed;
7. tests/commands run;
8. any remaining blocker;
9. whether the repository is now ready for pre-phase-6 planning.

Do not begin Phase-6 deployment or production provisioning in this task.
