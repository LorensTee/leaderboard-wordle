// NC3/NG7 — word-list artifact structure + client/private separation guarantees.
// `bun run word-list` must run before this test (CI order guarantees it).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ARTIFACT = resolve('src/lib/shared/data/valid-guesses.json');
const SRC = resolve('src');

function collectFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = resolve(dir, e.name);
		return e.isDirectory() ? collectFiles(p) : [p];
	});
}

describe('valid-guesses artifact (NC3/NG7)', () => {
	it('is a sorted, unique list of lowercase 5-letter words', () => {
		const words: string[] = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
		expect(words.length).toBeGreaterThan(0);
		expect(words).toEqual([...new Set(words)]);
		expect([...words].sort()).toEqual(words);
		for (const w of words) expect(w).toMatch(/^[a-z]{5}$/);
	});

	it('lives under src/lib (client-reachable public artifact)', () => {
		expect(ARTIFACT).toContain(`${resolve('src/lib/shared/data')}`);
		expect(statSync(ARTIFACT).isFile()).toBe(true);
	});

	it('src/ never references the private seed pipeline', () => {
		const refs = collectFiles(SRC)
			.filter((f) => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.svelte'))
			.flatMap((f) => {
				const content = readFileSync(f, 'utf8');
				return content.includes('scripts/seed') || content.includes('answer-pool') ? [f] : [];
			});
		expect(refs).toEqual([]);
	});
});