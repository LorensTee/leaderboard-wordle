// NC3/NG7 — valid-guesses pipeline: canonical source → public client artifact.
//   source:        src/server/data/valid-guesses.source.txt  (committed, public)
//   artifact:      src/lib/shared/data/valid-guesses.json    (generated, committed)
// Rules enforced at build time (fails the build on violations):
//   - one word per line (blank lines and `#` comments ignored)
//   - lowercase a-z only, exactly 5 letters
//   - no duplicates, output sorted
// The answer pool is a SEPARATE private pipeline (scripts/seed/, gitignored)
// and must never enter this artifact (NC3/NG16 provenance recorded there).
//
// The core logic is exported so the rules are unit-testable
// (tests/unit/build-word-list.test.ts); running this file directly
// (`bun run word-list`) rebuilds the artifact from the canonical source.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = resolve('src/server/data/valid-guesses.source.txt');
const OUT = resolve('src/lib/shared/data/valid-guesses.json');

/**
 * Parse + validate the source text. Throws on any violation (invalid word
 * shape or duplicate), returns the sorted unique word list otherwise.
 * Deterministic: same source → same output, always.
 */
export function parseWordList(sourceText: string): string[] {
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
		seen.add(line);
	}
	if (violations.length > 0) {
		throw new Error(`valid-guesses source invalid (${violations.length}): ${violations.join('; ')}`);
	}
	return [...seen].sort();
}

/** Build the public artifact from the canonical committed source. */
export function buildWordList(sourcePath: string, outPath: string): string[] {
	const sorted = parseWordList(readFileSync(sourcePath, 'utf8'));
	writeFileSync(outPath, JSON.stringify(sorted, null, 1) + '\n');
	return sorted;
}

// CLI entry (`bun run word-list`); import.meta.main is true only when this
// file is executed directly, so tests can import the functions harmlessly.
if (import.meta.main) {
	const words = buildWordList(SOURCE, OUT);
	console.log(`built ${words.length} words → ${OUT}`);
}