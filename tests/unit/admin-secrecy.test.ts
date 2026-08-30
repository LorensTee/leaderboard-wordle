// Phase-4 S5 — admin-plane answer secrecy pin (extends the U5 approach,
// plan §10.1). When the private seed files exist (scripts/seed/*.txt —
// gitignored, dev/CI-with-seeds only), NO pool word may appear in:
//   - the admin feature sources (server handlers/service/validation);
//   - the client API surface (src/lib/shared/api/admin.ts) — the page must
//     fetch word data at runtime, never statically bundle it;
//   - the client page sources (src/routes/admin/*) — same rule.
// Absent seed files → vacuous pass (verify:bundle is the complete-build
// gate). Bare word scanning is only meaningful for private pool words
// (public valid-guesses words are client-side by design).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SEED_DIR = resolve('scripts/seed');

function poolWords(): string[] {
	const words: string[] = [];
	if (!existsSync(SEED_DIR)) return words;
	for (const file of readdirSync(SEED_DIR)) {
		if (!file.endsWith('.txt')) continue;
		for (const line of readFileSync(join(SEED_DIR, file), 'utf8').split('\n')) {
			const w = line.trim().toLowerCase();
			if (/^[a-z]{5}$/.test(w)) words.push(w);
		}
	}
	return words;
}

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = join(dir, e.name);
		return e.isDirectory() ? walk(p) : [p];
	});
}

const words = poolWords();

describe('admin-plane answer secrecy (S5, U5-style conditional pin)', () => {
	it('presence/absence of the pool is detected (the pin is only meaningful with seeds)', () => {
		// The pin itself must be honest: an absent pool makes the word scan
		// vacuous — the test log states which mode ran.
		console.warn(
			words.length > 0
				? `admin-secrecy pin active: scanning ${words.length} private pool word(s)`
				: 'admin-secrecy pin vacuous: no private seed files present (verify:bundle is the complete-build gate)'
		);
	});

	it('admin server sources contain no pool words', () => {
		if (words.length === 0) return;
		for (const file of walk(resolve('src/server/admin'))) {
			const content = readFileSync(file, 'utf8');
			for (const w of words) {
				// Quoted-literal match — the leak vector in source is a static
				// string literal; bare words would false-positive on prose
				// (U5 convention).
				expect(content, `admin source ${file} contains pool word "${w}"`).not.toContain(`"${w}"`);
			}
		}
	});

	it('client admin surface contains no pool words (word fetched at runtime only)', () => {
		if (words.length === 0) return;
		for (const file of [
			resolve('src/lib/shared/api/admin.ts'),
			...walk(resolve('src/routes/admin'))
		]) {
			const content = readFileSync(file, 'utf8');
			for (const w of words) {
				expect(content, `${file} contains pool word "${w}"`).not.toContain(`"${w}"`);
			}
		}
	});

	it('non-admin client surfaces still carry no pool words', () => {
		if (words.length === 0) return;
		for (const file of walk(resolve('src/lib/shared/api'))) {
			if (file.endsWith('admin.ts')) continue;
			const content = readFileSync(file, 'utf8');
			for (const w of words) {
				expect(content, `${file} contains pool word "${w}"`).not.toContain(`"${w}"`);
			}
		}
	});
});