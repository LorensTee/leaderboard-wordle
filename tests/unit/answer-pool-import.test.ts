// Phase-4 S1 — answer-pool import parser rules (NC3/NG13/NG16) — DB-free.
// Mirrors tests/unit/build-word-list.test.ts: `parseAnswerPool` is pure; the
// subset invariant (`answers ⊂ valid guesses`) is pinned against the real
// GENERATED VALID_GUESS_SET (the same source the server uses at runtime).
// The private seed file (scripts/seed/*.txt) is gitignored, so the
// file-based invariant assertions are CONDITIONAL on it being present
// (same approach as U5): absent file → vacuous pass, with an explicit note.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnswerPool } from '../../scripts/seed/import-answer-pool';
import { VALID_GUESS_SET } from '../../src/server/data/valid-guesses.generated';

describe('answer-pool parser rules (S1)', () => {
	it('parses lowercase 5-letter words, ignoring comments and blank lines', () => {
		expect(parseAnswerPool('# header\n\nabout\nafter\n# trailing\n', VALID_GUESS_SET)).toEqual([
			'about',
			'after'
		]);
		expect(parseAnswerPool('about\nafter\nbelow\n', VALID_GUESS_SET)).toEqual([
			'about',
			'after',
			'below'
		]);
	});

	it('rejects words not in the server valid-guess set (answers ⊂ valid guesses)', () => {
		const valid = new Set(['about', 'after']);
		expect(() => parseAnswerPool('about\nzzzzz\n', valid)).toThrow(/not in the valid-guess set/);
		expect(() => parseAnswerPool('about\nZZZZZ\n', valid)).toThrow(/ZZZZZ/);
	});

	it('rejects invalid shapes (wrong length, uppercase, non-letters)', () => {
		expect(() => parseAnswerPool('about\nhello!\n', VALID_GUESS_SET)).toThrow(/hello!/);
		expect(() => parseAnswerPool('about\nHELLO\n', VALID_GUESS_SET)).toThrow(/HELLO/);
		expect(() => parseAnswerPool('about\nhell\n', VALID_GUESS_SET)).toThrow(/hell/);
	});

	it('rejects duplicates in source', () => {
		expect(() => parseAnswerPool('about\nabout\n', VALID_GUESS_SET)).toThrow(/duplicate word: "about"/);
	});

	it('sorts the output deterministically (same input → same output)', () => {
		const a = parseAnswerPool('river\nabout\n', VALID_GUESS_SET);
		const b = parseAnswerPool('river\nabout\n', VALID_GUESS_SET);
		expect(a).toEqual(['about', 'river']);
		expect(a).toEqual(b);
	});
});

describe('answers ⊂ valid guesses (S1 conditional pin)', () => {
	it('every word in a present private seed file is in VALID_GUESS_SET', () => {
		const seedDir = join(process.cwd(), 'scripts/seed');
		const files = ['answer-pool.source.txt', 'private-pool.txt', 'answers.txt'];
		const present = files.filter((f) => existsSync(join(seedDir, f)));
		// The seed files are gitignored (private pool); this pin is meaningful
		// wherever they exist and vacuous elsewhere — verify:bundle is the
		// complete-build answer gate.
		if (present.length === 0) {
			console.warn('answer-pool seed files absent — subset invariant pin skipped (vacuous)');
			return;
		}
		for (const file of present) {
			const parsed = parseAnswerPool(readFileSync(join(seedDir, file), 'utf8'), VALID_GUESS_SET);
			expect(parsed.every((w) => VALID_GUESS_SET.has(w))).toBe(true);
		}
	});
});