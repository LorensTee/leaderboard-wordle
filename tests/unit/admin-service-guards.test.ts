// Phase-4 S2 — admin service guard-mapping helpers (plan §10.1) — DB-free.
// Pins the D10 23505 (UNIQUE violation) → 409 mapping and the
// guard-priority order used by the mutation transactions.
import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES } from '../../src/server/lib/errors';
import { mapUniqueViolation } from '../../src/server/admin/validation';

function pgError(code: string, constraint?: string): Error {
	const e = new Error(`duplicate key (${constraint ?? 'none'})`);
	Object.assign(e, { code, constraint, detail: 'Key already exists.' });
	return e;
}

describe('mapUniqueViolation — SQLSTATE 23505 → D10 409 codes', () => {
	it('puzzle_date unique race → 409 DATE_TAKEN', () => {
		const err = (() => {
			try {
				mapUniqueViolation(pgError('23505', 'daily_puzzles_puzzle_date_uidx'), { date: '2026-09-01' });
			} catch (e) {
				return e as AppError;
			}
		})();
		expect(err.code).toBe(ERROR_CODES.DATE_TAKEN);
		expect(err.status).toBe(409);
		expect(err.message).toContain('2026-09-01');
	});

	it('answer_id unique race → 409 ANSWER_ALREADY_SCHEDULED', () => {
		const err = (() => {
			try {
				mapUniqueViolation(pgError('23505', 'daily_puzzles_answer_id_uidx'), { word: 'about' });
			} catch (e) {
				return e as AppError;
			}
		})();
		expect(err.code).toBe(ERROR_CODES.ANSWER_ALREADY_SCHEDULED);
		expect(err.status).toBe(409);
		expect(err.message).toContain('about');
	});

	it('non-23505 errors pass through (AppError rethrown as-is; others → 500 INTERNAL)', () => {
		expect(() =>
			mapUniqueViolation(new AppError(ERROR_CODES.NOT_FOUND, 'boom', 404), {})
		).toThrowError(/boom/);
		const err = (() => {
			try {
				mapUniqueViolation(new Error('connection reset'), {});
			} catch (e) {
				return e as AppError;
			}
		})();
		expect(err.code).toBe(ERROR_CODES.INTERNAL);
		expect(err.status).toBe(500);
	});
});

describe('D10 error codes are registered on ERROR_CODES', () => {
	it('all Phase-4 codes exist', () => {
		for (const code of [
			'ANSWER_NOT_APPROVED',
			'INVALID_HINT',
			'ANSWER_ALREADY_SCHEDULED',
			'DATE_TAKEN',
			'PUZZLE_IMMUTABLE',
			'NOT_SCHEDULED',
			'NOT_FUTURE',
			'INVALID_DATE_WINDOW'
		] as const) {
			expect(ERROR_CODES[code]).toBe(code);
		}
	});
});