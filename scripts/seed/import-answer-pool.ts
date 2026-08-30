// Phase-4 S1 — answer-pool import tooling (NC3/G16/NG13/NG16, Architecture
// §Answer pool deployment).
//
// Contract (scripts/seed/README.md): the PRIVATE approved-answer pool lives
// in scripts/seed/answer-pool.source.txt (gitignored — never committed).
// This script imports it into the Neon `answer_dictionary` so scheduling
// validation has an approved list.
//
// Rules enforced at import time (fails the import on violations):
//   - one lowercase a-z 5-letter word per line; blank lines and `#` comments
//     ignored (same rules as scripts/build-word-list.ts)
//   - no duplicates in source
//   - `answers ⊂ valid guesses` — every answer must exist in the server's
//     VALID_GUESS_SET, so a scheduled answer can never be a word users
//     cannot submit (NG13)
//   - upsert into answer_dictionary { word, normalizedWord } with
//     ON CONFLICT DO NOTHING + a report (inserted / already present);
//     idempotent — re-running never duplicates
//
// The pool is server/DB-only: never import into src/lib; bundle secrecy is
// enforced by `bun run verify:bundle` + the U5-style unit pins.
//
// The core parser is exported so the rules are unit-testable
// (tests/unit/answer-pool-import.test.ts); running this file directly
// (`bun run seed:answers`) imports the current source file into the DB.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb, closeDb } from '../../src/server/db/client';
import { answerDictionary } from '../../src/server/db/schema';
import { VALID_GUESS_SET } from '../../src/server/data/valid-guesses.generated';

export const ANSWER_POOL_SOURCE = resolve('scripts/seed/answer-pool.source.txt');

/**
 * Parse + validate the private answer-pool source text. Throws on any
 * violation (invalid shape, duplicate, or a word missing from the server
 * valid-guess set). Returns the sorted unique word list otherwise.
 * Deterministic: same source → same output.
 */
export function parseAnswerPool(sourceText: string, validGuesses: ReadonlySet<string>): string[] {
	const lines = sourceText
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && !l.startsWith('#'));

	const violations: string[] = [];
	const seen = new Set<string>();
	for (const line of lines) {
		if (!/^[a-z]{5}$/.test(line)) {
			violations.push(`not a lowercase 5-letter word: "${line}"`);
			continue;
		}
		if (seen.has(line)) violations.push(`duplicate word: "${line}"`);
		if (!validGuesses.has(line)) {
			violations.push(`"${line}" is not in the valid-guess set (answers ⊂ valid guesses)`);
		}
		seen.add(line);
	}
	if (violations.length > 0) {
		throw new Error(`answer-pool source invalid (${violations.length}): ${violations.join('; ')}`);
	}
	return [...seen].sort();
}

export type ImportReport = {
	inserted: number;
	alreadyPresent: number;
};

/**
 * Upsert the parsed words into `answer_dictionary` ({ word, normalizedWord }).
 * ON CONFLICT DO NOTHING (keyed on the UNIQUE word index) makes the import
 * idempotent: re-running never duplicates, and the report separates newly
 * inserted rows from already-present ones.
 */
export async function importAnswerPool(
	db: ReturnType<typeof createDb>,
	words: string[]
): Promise<ImportReport> {
	let inserted = 0;
	let alreadyPresent = 0;
	// One parameterized multi-row INSERT per batch (Phase-3 batching
	// precedent — avoids per-row Neon round trips for large pools).
	for (let i = 0; i < words.length; i += 500) {
		const batch = words.slice(i, i + 500);
		const rows = batch.map((word) => ({ word, normalizedWord: word }));
		const created = await db
			.insert(answerDictionary)
			.values(rows)
			.onConflictDoNothing({ target: answerDictionary.word })
			.returning({ id: answerDictionary.id });
		inserted += created.length;
		alreadyPresent += batch.length - created.length;
	}
	return { inserted, alreadyPresent };
}

// CLI entry (`bun run seed:answers`); import.meta.main is true only when
// this file is executed directly, so tests can import the functions safely.
if (import.meta.main) {
	const sourcePath = ANSWER_POOL_SOURCE;
	if (!existsSync(sourcePath)) {
		console.error(
			`No answer-pool source file at ${sourcePath} — create it with the private pool ` +
				'(gitignored; provenance rules in scripts/seed/README.md) and try again.'
		);
		process.exit(1);
	}
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error('DATABASE_URL is empty — set it to the target (non-production) database.');
		process.exit(2);
	}

	let words: string[];
	try {
		words = parseAnswerPool(readFileSync(sourcePath, 'utf8'), VALID_GUESS_SET);
	} catch (e) {
		console.error(`answer-pool source invalid: ${(e as Error).message}`);
		process.exit(1);
	}
	if (words.length === 0) {
		console.error('answer-pool source contains no words — nothing to import.');
		process.exit(1);
	}

	const db = createDb(url);
	try {
		const report = await importAnswerPool(db, words);
		console.log(
			`answer-pool import complete: ${report.inserted} inserted, ${report.alreadyPresent} already present ` +
				`(${words.length} total, all verified ∈ valid-guess set)`
		);
	} catch (e) {
		console.error(`answer-pool import failed: ${(e as Error).stack ?? (e as Error).message}`);
		process.exit(1);
	} finally {
		await closeDb(db);
	}
}