// Phase-3 result-block copy mapping (U6, plan §9.2/D13) — pure: COMPLETED →
// position block (Current position: #N + "may change" note), FAILED/FORFEITED
// → penalty line, no position; null rank → block hidden (fetch failure /
// uncompleted). Meaning is fixed; wording is design-free (P6).
import { describe, expect, it } from 'vitest';
import { penaltyLineCopy, positionBlockCopy } from '../../src/lib/features/leaderboard/position-copy';

describe('result-block copy mapping (U6)', () => {
	it('rank present → "Current position: #N" + may-change note (today)', () => {
		expect(positionBlockCopy(5)).toEqual({
			heading: 'Current position: #5',
			note: 'Position may change as others finish today'
		});
		expect(positionBlockCopy(1)).toEqual({
			heading: 'Current position: #1',
			note: 'Position may change as others finish today'
		});
	});

	it('non-today note wording when a period is passed', () => {
		expect(positionBlockCopy(2, 'week')?.note).toBe('Position may change as the period progresses');
	});

	it('null rank → null (block hides silently)', () => {
		expect(positionBlockCopy(null)).toBeNull();
		expect(positionBlockCopy(0)).toBeNull();
	});

	it('FAILED/FORFEITED → penalty line copy, never a position', () => {
		expect(penaltyLineCopy()).toBe('The daily penalty counts toward weekly and monthly standings');
		expect(positionBlockCopy(null)).toBeNull();
	});
});