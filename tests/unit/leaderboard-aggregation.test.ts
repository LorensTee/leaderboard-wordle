// Phase-3 leaderboard display helpers (U3, plan §11.1) — pure formatting:
// average-time rounding is server-side SQL (asserted by integration), the
// average-guesses 2dp display is client-side (P4: display-only).
import { describe, expect, it } from 'vitest';
import { AVERAGE_GUESSES_DECIMALS, formatAverageGuesses } from '../../src/lib/shared/lib/leaderboard-format';

describe('leaderboard display formatting (U3)', () => {
	it('average guesses render at exactly 2 decimals (display-only, P4)', () => {
		expect(AVERAGE_GUESSES_DECIMALS).toBe(2);
		expect(formatAverageGuesses(3)).toBe('3.00');
		expect(formatAverageGuesses(3.5)).toBe('3.50');
		expect(formatAverageGuesses(3.333333)).toBe('3.33');
		expect(formatAverageGuesses(3.345)).toBe('3.35'); // round-half-up on the display value only
		expect(formatAverageGuesses(0)).toBe('0.00');
	});

	it('is defensive against NaN/Infinity (display-only)', () => {
		expect(formatAverageGuesses(Number.NaN)).toBe('0.00');
		expect(formatAverageGuesses(Number.POSITIVE_INFINITY)).toBe('0.00');
	});
});