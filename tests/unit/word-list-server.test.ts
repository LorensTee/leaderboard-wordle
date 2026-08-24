// NG7/NG16 — server/client artifact parity: one canonical source must produce
// byte-equal word sets in BOTH committed artifacts (the server dictionary the
// game services validate against, and the public client JSON). Runs the
// generator in memory (no filesystem writes) so CI catches drift even if
// `bun run word-list` was skipped.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWordList, renderServerArtifact } from '../../scripts/build-word-list';
import { VALID_GUESSES, VALID_GUESS_SET } from '../../src/server/data/valid-guesses.generated';

const SOURCE = resolve('src/server/data/valid-guesses.source.txt');
const JSON_ARTIFACT = resolve('src/lib/shared/data/valid-guesses.json');

describe('valid-guesses server/client parity (NG7/NG16)', () => {
	it('the committed client JSON artifact matches the canonical source exactly', () => {
		const fromSource = parseWordList(readFileSync(SOURCE, 'utf8'));
		const fromJson: string[] = JSON.parse(readFileSync(JSON_ARTIFACT, 'utf8'));
		expect(fromJson).toEqual(fromSource);
	});

	it('the committed server dictionary matches the canonical source exactly', () => {
		const fromSource = parseWordList(readFileSync(SOURCE, 'utf8'));
		expect([...VALID_GUESSES]).toEqual(fromSource);
	});

	it('the generated server module renders deterministically and matches the client JSON', () => {
		const fromSource = parseWordList(readFileSync(SOURCE, 'utf8'));
		const rendered = renderServerArtifact(fromSource);
		// Two renders of the same input are byte-identical (deterministic CI).
		expect(renderServerArtifact(fromSource)).toBe(rendered);
		// The rendered module embeds exactly the client JSON's word list.
		const fromJson: string[] = JSON.parse(readFileSync(JSON_ARTIFACT, 'utf8'));
		for (const word of fromJson) expect(rendered).toContain(`"${word}"`);
	});

	it('the server dictionary exposes a ReadonlySet for O(1) validation', () => {
		expect(VALID_GUESS_SET.size).toBe(VALID_GUESSES.length);
		expect(VALID_GUESS_SET.has('light')).toBe(true);
		for (const word of VALID_GUESSES) expect(word).toMatch(/^[a-z]{5}$/);
	});
});