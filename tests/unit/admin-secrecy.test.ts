// Phase-4 S5 — admin-plane answer secrecy pin (extends the U5 approach,
// plan §10.1). When the private seed files exist (scripts/seed/*.txt —
// gitignored, dev/CI-with-seeds only), the admin plane must not STATICALLY
// EMBED the answer pool:
//   - the admin feature sources (server handlers/service/validation);
//   - the client API surface (src/lib/shared/api/admin.ts) — the page must
//     fetch word data at runtime, never statically bundle it;
//   - the client page sources (src/routes/admin/*) — same rule.
// Absent seed files → vacuous pass (verify:bundle is the complete-build
// gate).
//
// Pre-phase-6 scan design (2026-09-05, production data finalization): the
// pin was written when the seed was a 2-word fixture; with the REAL 2,315-word
// pool (all members of the PUBLIC valid-guess list), per-word quoted-literal
// scanning false-positives on ordinary prose (measured real max: 2 distinct
// quoted pool words per admin file, e.g. `"today"` in a comment). Embedded
// pool data would produce hundreds/thousands of distinct hits. The pin now
// fails when a file contains ≥25 DISTINCT quoted pool words (≥12× the
// measured prose ceiling; see docs/contradictions-and-gaps.md record).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SEED_DIR = resolve('scripts/seed');

/** Distinct pool words appearing as quoted string literals (`"word"`) in a file. */
function quotedPoolHits(content: string, pool: Set<string>): Set<string> {
	const hits = new Set<string>();
	const re = /"([a-z]{5})"/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(content)) !== null) {
		if (pool.has(m[1])) hits.add(m[1]);
	}
	return hits;
}

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
const pool = new Set(words);

/** Embedded data would hit hundreds/thousands of words; prose measures ≤2. */
const EMBED_THRESHOLD = 25;

describe('admin-plane answer secrecy (S5, U5-style conditional pin)', () => {
	it('presence/absence of the pool is detected (the pin is only meaningful with seeds)', () => {
		// The pin itself must be honest: an absent pool makes the word scan
		// vacuous — the test log states which mode ran.
		console.warn(
			words.length > 0
				? `admin-secrecy pin active: scanning ${words.length} private pool word(s) for static embeds`
				: 'admin-secrecy pin vacuous: no private seed files present (verify:bundle is the complete-build gate)'
		);
	});

	it('admin server sources contain no embedded pool data', () => {
		if (words.length === 0) return;
		for (const file of walk(resolve('src/server/admin'))) {
			const hits = quotedPoolHits(readFileSync(file, 'utf8'), pool);
			expect(hits.size, `admin source ${file} embeds pool data (${hits.size} distinct pool words)`).toBeLessThan(
				EMBED_THRESHOLD
			);
		}
	});

	it('client admin surface contains no embedded pool words (word fetched at runtime only)', () => {
		if (words.length === 0) return;
		for (const file of [
			resolve('src/lib/shared/api/admin.ts'),
			...walk(resolve('src/routes/admin'))
		]) {
			const hits = quotedPoolHits(readFileSync(file, 'utf8'), pool);
			expect(hits.size, `${file} embeds pool data (${hits.size} distinct pool words)`).toBeLessThan(EMBED_THRESHOLD);
		}
	});

	it('non-admin client surfaces still carry no embedded pool words', () => {
		if (words.length === 0) return;
		for (const file of walk(resolve('src/lib/shared/api'))) {
			if (file.endsWith('admin.ts')) continue;
			const hits = quotedPoolHits(readFileSync(file, 'utf8'), pool);
			expect(hits.size, `${file} embeds pool data (${hits.size} distinct pool words)`).toBeLessThan(EMBED_THRESHOLD);
		}
	});
});