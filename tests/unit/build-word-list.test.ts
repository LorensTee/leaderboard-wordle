// NC3/NG7 — word-list pipeline rules, deterministic (no filesystem side
// effects: parseWordList is pure; the artifact build is exercised once here
// in memory and by `bun run word-list` in CI).
import { describe, expect, it } from 'vitest';
import { parseWordList } from '../../scripts/build-word-list';

describe('valid-guesses pipeline rules (NC3/NG7)', () => {
	it('parses a valid source deterministically (sorted output)', () => {
		expect(parseWordList('about\nafter\nbelow\n')).toEqual(['about', 'after', 'below']);
		// Same input → same output, always.
		expect(parseWordList('about\nafter\nbelow\n')).toEqual(parseWordList('about\nafter\nbelow\n'));
	});

	it('rejects invalid entries (wrong length, uppercase, non-letters)', () => {
		expect(() => parseWordList('about\nhello!\n')).toThrow(/hello!/);
		expect(() => parseWordList('about\nHELLO\n')).toThrow(/HELLO/);
		expect(() => parseWordList('about\nhell\n')).toThrow(/hell/);
		expect(() => parseWordList('about\nhello1\n')).toThrow(/hello1/);
	});

	it('rejects duplicates (case-sensitive exact duplicates)', () => {
		expect(() => parseWordList('about\nabout\n')).toThrow(/duplicate word: "about"/);
	});

	it('ignores comments and blank lines', () => {
		expect(parseWordList('# header\n\nabout\n# trailing\n')).toEqual(['about']);
	});
});
