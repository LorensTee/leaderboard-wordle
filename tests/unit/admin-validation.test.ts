// Phase-4 S2 — admin pure-validation rules (plan §10.1) — DB-free:
// word normalization/shape, D3 hint validation (shape + membership),
// ISO date/window guards (D4), and the D6/D8 state-guard matrix.
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/server/lib/errors';
import {
	assertAnswerWordShape,
	assertFutureDate,
	editGuardViolation,
	isValidIsoDate,
	normalizeAnswerWord,
	replaceTodayGuardViolation,
	validateDateWindow,
	validateHintLetter
} from '../../src/server/admin/validation';

describe('word normalization (S2)', () => {
	it('trims + lowercases', () => {
		expect(normalizeAnswerWord('  ABOUT ')).toBe('about');
		expect(normalizeAnswerWord('About')).toBe('about');
		expect(normalizeAnswerWord('  below\t')).toBe('below');
	});

	it('assertAnswerWordShape accepts exactly lowercase 5-letter words', () => {
		expect(() => assertAnswerWordShape('about')).not.toThrow();
		expect(() => assertAnswerWordShape('about ')).toThrow(AppError); // untrimmed input shape
		expect(() => assertAnswerWordShape('hello!')).toThrow(AppError);
		expect(() => assertAnswerWordShape('hell')).toThrow(AppError);
		expect(() => assertAnswerWordShape('HELLO')).toThrow(AppError);
	});
});

describe('hint validation — D3 (shape + membership in the answer)', () => {
	it('normalizes to uppercase and accepts a letter occurring in the answer', () => {
		expect(validateHintLetter('a', 'about')).toBe('A');
		expect(validateHintLetter(' t ', 'mount')).toBe('T');
		expect(validateHintLetter('O', 'ocean')).toBe('O');
	});

	it('rejects multi-char / non-letter hints (400 INVALID_HINT)', () => {
		expect(() => validateHintLetter('ab', 'about')).toThrowError(/single letter/);
		expect(() => validateHintLetter('1', 'about')).toThrowError(/single letter/);
		expect(() => validateHintLetter('', 'about')).toThrowError(/single letter/);
		const caught = (() => {
			try {
				return validateHintLetter('?', 'about');
			} catch (e) {
				return e;
			}
		})() as AppError;
		expect(caught.code).toBe('INVALID_HINT');
	});

	it('rejects a letter NOT occurring in the answer (NG2 membership)', () => {
		expect(() => validateHintLetter('Z', 'about')).toThrowError(/does not occur in the answer/);
		const caught = (() => {
			try {
				return validateHintLetter('Z', 'about');
			} catch (e) {
				return e;
			}
		})() as AppError;
		expect(caught.code).toBe('INVALID_HINT');
	});
});

describe('date helpers (S2/D4)', () => {
	it('isValidIsoDate accepts real calendar dates and rejects impossible ones', () => {
		expect(isValidIsoDate('2026-08-30')).toBe(true);
		expect(isValidIsoDate('2026-02-28')).toBe(true);
		expect(isValidIsoDate('2026-02-30')).toBe(false);
		expect(isValidIsoDate('2026-13-01')).toBe(false);
		expect(isValidIsoDate('2026-8-01')).toBe(false);
		expect(isValidIsoDate('not-a-date')).toBe(false);
		expect(isValidIsoDate('')).toBe(false);
	});

	it('validateDateWindow enforces real dates, from ≤ to, and ≤ 120 days', () => {
		expect(validateDateWindow('2026-08-01', '2026-08-30')).toEqual({ from: '2026-08-01', to: '2026-08-30' });
		// exactly 120 days is allowed (from 2026-08-01 to 2026-11-29)
		expect(validateDateWindow('2026-08-01', '2026-11-29')).toEqual({
			from: '2026-08-01',
			to: '2026-11-29'
		});
		// 121 days rejected
		expect(() => validateDateWindow('2026-08-01', '2026-11-30')).toThrow(AppError);
		expect(() => validateDateWindow('2026-08-30', '2026-08-01')).toThrowError(/must not be after/);
		expect(() => validateDateWindow('bad', '2026-08-01')).toThrowError(/valid YYYY-MM-DD/);
		const caught = (() => {
			try {
				return validateDateWindow('bad', '2026-08-01');
			} catch (e) {
				return e;
			}
		})() as AppError;
		expect(caught.status).toBe(400);
	});

	it('assertFutureDate requires a real future date (403 NOT_FUTURE / 400 BAD_REQUEST)', () => {
		expect(() => assertFutureDate('2026-09-01', '2026-08-30')).not.toThrow();
		expect(() => assertFutureDate('2026-08-30', '2026-08-30')).toThrowError(/future/);
		expect(() => assertFutureDate('2026-08-29', '2026-08-30')).toThrowError(/future/);
		expect(() => assertFutureDate('not-a-date', '2026-08-30')).toThrowError(/YYYY-MM-DD/);
	});
});

describe('D6 edit/delete guard matrix (editGuardViolation)', () => {
	const base = { lockedAt: null, status: 'SCHEDULED' as const, puzzleDate: '2026-09-01', today: '2026-08-30' };

	it('future + SCHEDULED + unlocked → allowed (null)', () => {
		expect(editGuardViolation(base)).toBeNull();
	});

	it('locked → PUZZLE_IMMUTABLE', () => {
		const v = editGuardViolation({ ...base, lockedAt: new Date() });
		expect(v?.code).toBe('PUZZLE_IMMUTABLE');
	});

	it.each(['ACTIVE' as const, 'FINALIZED' as const])('status %s → PUZZLE_IMMUTABLE', (status) => {
		expect(editGuardViolation({ ...base, status })?.code).toBe('PUZZLE_IMMUTABLE');
	});

	it('today/past dates → NOT_FUTURE', () => {
		expect(editGuardViolation({ ...base, puzzleDate: '2026-08-30' })?.code).toBe('NOT_FUTURE');
		expect(editGuardViolation({ ...base, puzzleDate: '2026-08-01' })?.code).toBe('NOT_FUTURE');
	});
});

describe('D8 replace-today guard matrix (replaceTodayGuardViolation)', () => {
	const today = (() => {
		// Fixed anchor for the matrix — 'today' is per-test data here.
		return '2026-08-30';
	})();
	const base = { lockedAt: null, status: 'SCHEDULED' as const, puzzleDate: today, today };

	it('today + SCHEDULED + unlocked → allowed (null)', () => {
		expect(replaceTodayGuardViolation(base)).toBeNull();
	});

	it('locked / ACTIVE / FINALIZED → PUZZLE_IMMUTABLE', () => {
		expect(replaceTodayGuardViolation({ ...base, lockedAt: new Date() })?.code).toBe('PUZZLE_IMMUTABLE');
		expect(replaceTodayGuardViolation({ ...base, status: 'ACTIVE' })?.code).toBe('PUZZLE_IMMUTABLE');
		expect(replaceTodayGuardViolation({ ...base, status: 'FINALIZED' })?.code).toBe('PUZZLE_IMMUTABLE');
	});

	it('not today → INVALID_STATE', () => {
		expect(replaceTodayGuardViolation({ ...base, puzzleDate: '2026-08-31' })?.code).toBe('INVALID_STATE');
	});
});