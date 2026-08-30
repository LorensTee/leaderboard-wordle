// Phase-4 admin domain — PURE validation helpers (DB-free, unit-testable).
// The service layer (service.ts) owns transactions/locks; these functions
// own shape/membership/state-guard rules (plan §4.4, D3/D6/D8/D9).
import { AppError, ERROR_CODES } from '../lib/errors';

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ANSWER_WORD_RE = /^[a-z]{5}$/;
export const HINT_LETTER_RE = /^[A-Z]$/;

/** True for a real calendar date in ISO YYYY-MM-DD form (no JS-Date timezone drift). */
export function isValidIsoDate(value: string): boolean {
	if (!ISO_DATE_RE.test(value)) return false;
	// Round-trip through a fixed UTC instant rejects 2026-02-30 etc.
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Normalize a scheduling word: trim + lowercase. The result must match
 * `^[a-z]{5}$` (validated by the caller via `assertNormalizedAnswerWord` or
 * the zod layer). Pure — never touches the DB.
 */
export function normalizeAnswerWord(input: string): string {
	return input.trim().toLowerCase();
}

/** Throws 400 BAD_REQUEST when the normalized word is not a lowercase 5-letter word. */
export function assertAnswerWordShape(word: string): void {
	if (!ANSWER_WORD_RE.test(word)) {
		throw new AppError(ERROR_CODES.BAD_REQUEST, `"${word}" is not a valid 5-letter word`, 400);
	}
}

/**
 * D3 — normalize + validate a hint letter: exactly one ASCII letter
 * (uppercase-normalized) AND it must occur in the answer word (NG2
 * membership — a DB CHECK cannot enforce cross-row membership).
 * Returns the normalized uppercase letter. Throws 400 INVALID_HINT.
 */
export function validateHintLetter(hint: string, answerWord: string): string {
	const normalized = hint.trim().toUpperCase();
	if (!HINT_LETTER_RE.test(normalized)) {
		throw new AppError(ERROR_CODES.INVALID_HINT, 'Hint must be a single letter (A–Z)', 400);
	}
	if (!answerWord.includes(normalized.toLowerCase())) {
		throw new AppError(
			ERROR_CODES.INVALID_HINT,
			`Hint letter "${normalized}" does not occur in the answer`,
			400
		);
	}
	return normalized;
}

export type CalendarWindow = { from: string; to: string };

/**
 * D4 — date-window guard for `GET /api/admin/puzzles?from&to`:
 * both dates must be real ISO dates, `from ≤ to`, and the window must be
 * ≤ 120 days. Throws 400 INVALID_DATE_WINDOW / BAD_REQUEST.
 */
export function validateDateWindow(from: string, to: string): CalendarWindow {
	if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
		throw new AppError(
			ERROR_CODES.INVALID_DATE_WINDOW,
			'from/to must be valid YYYY-MM-DD dates',
			400
		);
	}
	if (from > to) {
		throw new AppError(
			ERROR_CODES.INVALID_DATE_WINDOW,
			'from must not be after to',
			400
		);
	}
	const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
	if (days > 120) {
		throw new AppError(
			ERROR_CODES.INVALID_DATE_WINDOW,
			'Date window must be at most 120 days',
			400
		);
	}
	return { from, to };
}

// ─── D6/D8 state-guard predicates (pure — unit-testable matrix) ────────────

export type MutabilityState = {
	/** null = never locked; any value = immutable (first player start won). */
	lockedAt: Date | null;
	status: 'SCHEDULED' | 'ACTIVE' | 'FINALIZED';
	puzzleDate: string;
	/** Today's Asia/Manila date (SQL-computed by the service). */
	today: string;
};

export type GuardViolation = { code: string; message: string };

/**
 * D6 — DELETE/PATCH guard: allowed ONLY when `locked_at IS NULL AND
 * status = 'SCHEDULED' AND puzzle_date > today`. Returns the violation in
 * priority order: PUZZLE_IMMUTABLE (locked/ACTIVE/FINALIZED), NOT_SCHEDULED,
 * NOT_FUTURE. null ⇒ the mutation may proceed.
 */
export function editGuardViolation(state: MutabilityState): GuardViolation | null {
	if (state.lockedAt !== null || state.status === 'ACTIVE' || state.status === 'FINALIZED') {
		return {
			code: ERROR_CODES.PUZZLE_IMMUTABLE,
			message: 'This puzzle is immutable (locked, live, or finalized)'
		};
	}
	if (state.status !== 'SCHEDULED') {
		return {
			code: ERROR_CODES.NOT_SCHEDULED,
			message: 'Only scheduled puzzles can be edited or deleted'
		};
	}
	if (state.puzzleDate <= state.today) {
		return {
			code: ERROR_CODES.NOT_FUTURE,
			message: 'Only future puzzles can be edited or deleted'
		};
	}
	return null;
}

/**
 * D8 — same-day replacement guard: allowed ONLY when `puzzle_date` = today
 * (Manila), `status = 'SCHEDULED'`, `locked_at IS NULL`. PUZZLE_IMMUTABLE
 * for locked/ACTIVE/FINALIZED; INVALID_STATE for not-today / not-SCHEDULED.
 */
export function replaceTodayGuardViolation(state: MutabilityState): GuardViolation | null {
	if (state.lockedAt !== null || state.status === 'ACTIVE' || state.status === 'FINALIZED') {
		return {
			code: ERROR_CODES.PUZZLE_IMMUTABLE,
			message: 'This puzzle is immutable (locked, live, or finalized)'
		};
	}
	if (state.status !== 'SCHEDULED') {
		return {
			code: ERROR_CODES.INVALID_STATE,
			message: 'Only a SCHEDULED puzzle can be replaced'
		};
	}
	if (state.puzzleDate !== state.today) {
		return {
			code: ERROR_CODES.INVALID_STATE,
			message: 'Same-day replacement applies to today\'s puzzle only'
		};
	}
	return null;
}

/**
 * D9 — destination-date guard for date moves: must be a real ISO date and
 * strictly after today (Manila). Throws 400 BAD_REQUEST / 403 NOT_FUTURE.
 * The service separately re-checks `UNIQUE(puzzle_date)` (409 DATE_TAKEN).
 */
export function assertFutureDate(puzzleDate: string, today: string): void {
	if (!isValidIsoDate(puzzleDate)) {
		throw new AppError(ERROR_CODES.BAD_REQUEST, 'puzzleDate must be a valid YYYY-MM-DD date', 400);
	}
	if (puzzleDate <= today) {
		throw new AppError(ERROR_CODES.NOT_FUTURE, 'The destination date must be in the future', 403);
	}
}

/**
 * Map a SQLSTATE 23505 (UNIQUE violation) from the ANSWER/date unique
 * indexes to the D10 409 codes; anything else rethrows as-is. This is the
 * final concurrency guard after the pre-checks under the row lock.
 *
 * Driver note: @neondatabase/serverless wraps the PostgreSQL error as
 * `{ query, params, cause: PGError }` — unwrap `.cause` (and tolerate a
 * raw PGError shape for other drivers/unit tests).
 */
export function mapUniqueViolation(
	err: unknown,
	context: { date?: string; word?: string }
): never {
	const raw = err as { cause?: { code?: string; constraint?: string; detail?: string } };
	const e = raw.cause ?? (err as { code?: string; constraint?: string; detail?: string });
	if (e.code === '23505') {
		const constraint = e.constraint ?? '';
		const detail = e.detail ?? '';
		if (constraint.includes('puzzle_date') || detail.includes('puzzle_date')) {
			throw new AppError(
				ERROR_CODES.DATE_TAKEN,
				`A puzzle is already scheduled for ${context.date ?? 'that date'}`,
				409
			);
		}
		if (constraint.includes('answer_id') || detail.includes('answer_id')) {
			throw new AppError(
				ERROR_CODES.ANSWER_ALREADY_SCHEDULED,
				`"${context.word ?? 'this answer'}" is already scheduled or used`,
				409
			);
		}
	}
	if (err instanceof AppError) throw err;
	throw new AppError(ERROR_CODES.INTERNAL, 'An unexpected error occurred', 500);
}