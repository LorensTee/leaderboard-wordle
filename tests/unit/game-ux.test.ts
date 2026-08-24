// Client UX helper unit tests: display-only timing format and keyboard-state
// derivation from server-confirmed feedback (pure; no answers involved).
import { describe, expect, it } from 'vitest';
import { elapsedSince, formatDuration } from '../../src/lib/shared/lib/format-duration';
import { computeKeyStates, isValidGuessWord, VALID_GUESS_SET } from '../../src/lib/shared/lib/wordle-ux';

describe('formatDuration (display-only timer)', () => {
	it('formats minutes and seconds', () => {
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(59_000)).toBe('0:59');
		expect(formatDuration(60_000)).toBe('1:00');
		expect(formatDuration(5 * 60_000 + 7_000)).toBe('5:07');
	});

	it('formats hours as h:mm:ss', () => {
		expect(formatDuration(3_660_000)).toBe('1:01:00');
		expect(formatDuration(25 * 3_600_000)).toBe('25:00:00');
	});

	it('is defensive about bad input (display-only)', () => {
		expect(formatDuration(-5)).toBe('0:00');
		expect(formatDuration(Number.NaN)).toBe('0:00');
		expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0:00');
	});

	it('computes elapsed time from a server ISO timestamp', () => {
		const now = Date.parse('2026-08-24T10:00:00Z');
		expect(elapsedSince('2026-08-24T09:59:00Z', now)).toBe(60_000);
		expect(elapsedSince('2026-08-24T10:30:00Z', now)).toBe(0); // future → clamped
		expect(elapsedSince('not-a-date', now)).toBe(0);
	});
});

describe('wordle-ux (client-side, answer-free)', () => {
	it('board dimensions mirror the server game rules (type-boundary parity)', async () => {
		const [{ GUESS_LENGTH, MAX_GUESSES }, { BOARD_COLS, BOARD_ROWS }] = await Promise.all([
			import('../../src/server/game/evaluate'),
			import('../../src/lib/shared/lib/wordle-ux')
		]);
		expect(BOARD_COLS).toBe(GUESS_LENGTH);
		expect(BOARD_ROWS).toBe(MAX_GUESSES);
	});
	it('derives keyboard states with green > yellow > gray priority', () => {
		const states = computeKeyStates([
			{
				feedback: [
					{ letter: 'l', status: 'green' },
					{ letter: 'i', status: 'yellow' },
					{ letter: 'g', status: 'gray' }
				]
			},
			{
				feedback: [
					{ letter: 'l', status: 'yellow' }, // must NOT downgrade the green
					{ letter: 'o', status: 'green' },
					{ letter: 'i', status: 'gray' } // must NOT downgrade the yellow
				]
			}
		]);
		expect(states.get('l')).toBe('green');
		expect(states.get('i')).toBe('yellow');
		expect(states.get('g')).toBe('gray');
		expect(states.get('o')).toBe('green');
		expect(states.has('x')).toBe(false); // unused letters stay absent
	});

	it('exposes the public valid-guess list for local UX checking only', () => {
		expect(VALID_GUESS_SET.has('light')).toBe(true);
		expect(VALID_GUESS_SET.has('zzzzz')).toBe(false);
		expect(isValidGuessWord('light')).toBe(true);
		expect(isValidGuessWord('zzzzz')).toBe(false);
	});
});