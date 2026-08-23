// NC3/NG7 — valid-guesses pipeline: canonical source → public client artifact.
//   source:        src/server/data/valid-guesses.source.txt  (committed, public)
//   artifact:      src/lib/shared/data/valid-guesses.json    (generated, committed)
// Rules enforced at build time (fails the build on violations):
//   - one word per line (blank lines and `#` comments ignored)
//   - lowercase a-z only, exactly 5 letters
//   - no duplicates (case-insensitive), output sorted
// The answer pool is a SEPARATE private pipeline (scripts/seed/, gitignored)
// and must never enter this artifact (NC3/NG16 provenance recorded there).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = resolve('src/server/data/valid-guesses.source.txt');
const OUT = resolve('src/lib/shared/data/valid-guesses.json');

const lines = readFileSync(SOURCE, 'utf8')
	.split('\n')
	.map((l) => l.trim())
	.filter((l) => l.length > 0 && !l.startsWith('#'));

const words = new Set<string>();
const violations: string[] = [];
for (const line of lines) {
	if (!/^[a-z]{5}$/.test(line)) {
		violations.push(`not a lowercase 5-letter word: "${line}"`);
		continue;
	}
	words.add(line);
}
if (violations.length > 0) {
	throw new Error(`valid-guesses source invalid (${violations.length}): ${violations.join('; ')}`);
}

const sorted = [...words].sort();
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
console.log(`built ${sorted.length} words → ${OUT}`);