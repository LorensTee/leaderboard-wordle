// Phase-4 admin domain — puzzle scheduling & management service (plan §4.4,
// D6/D7/D8/D9, NG2/NG8/NG15/M5). Every mutation:
//   - runs in its OWN transaction;
//   - locks the puzzle row FIRST (`SELECT … FOR UPDATE` — NG9 lock order),
//     so admin mutations serialize against startGame's lazy activation,
//     submitGuess, cron activateToday, and finalizePuzzle;
//   - re-checks immutability UNDER the lock (READ COMMITTED re-read — the
//     first player start / activation wins; the admin mutation fails closed);
//   - NEVER flips lifecycle status (SCHEDULED→ACTIVE is exclusively
//     activateToday/startGame; ACTIVE→FINALIZED exclusively finalizePuzzle);
//   - computes "today" in SQL (`transaction_timestamp() AT TIME ZONE
//     'Asia/Manila'` — same authority as NG9; never clock_timestamp()).
// All day boundaries/expiry reuse src/server/puzzle/manila.ts — never
// duplicated here.
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { answerDictionary, dailyPuzzles } from '../db/schema';
import { AppError, ERROR_CODES } from '../lib/errors';
import { expiresAtExpr, todayManilaDateExpr } from '../puzzle/manila';
import {
	assertAnswerWordShape,
	assertFutureDate,
	editGuardViolation,
	mapUniqueViolation,
	normalizeAnswerWord,
	replaceTodayGuardViolation,
	validateDateWindow,
	validateHintLetter,
	ANSWER_WORD_RE
} from './validation';

// ─── Wire shapes (plan §8 — admin-only surface) ────────────────────────────

export type AdminPuzzle = {
	id: string;
	/** ISO 'YYYY-MM-DD'. */
	date: string;
	status: 'SCHEDULED' | 'ACTIVE' | 'FINALIZED';
	hintLetter: string;
	/** ISO instant; null = never started (unlocked). */
	lockedAt: string | null;
	/** ISO instant — (date + 1) AT TIME ZONE 'Asia/Manila'. */
	expiresAt: string;
	/** The answer text — ADMIN-ONLY surface; never sent to non-admins. */
	word: string;
};

export type ValidateWordResult = {
	/** True when the word is in the approved answer dictionary. */
	approved: boolean;
	/** True when already scheduled/used; null when the word is not approved. */
	previouslyUsed: boolean | null;
	/** ISO date of the existing schedule, when previouslyUsed. */
	usedOn: string | null;
};

export type ScheduleInput = { puzzleDate: string; word: string; hintLetter: string };

/** POST /api/admin/puzzles/:id/replace-today body (plan §8.1 — no date field). */
export type ReplaceTodayInput = { word: string; hintLetter: string };

export type UpdatePatch = { puzzleDate?: string; word?: string; hintLetter?: string };

export type UpdatePuzzleResult = { puzzle: AdminPuzzle; gaps: string[] };

export type DeletePuzzleResult = { deleted: true; gaps: string[] };

export type AdminPuzzleService = {
	/** GET /api/admin/puzzles — windowed list (D4 defaults, SQL-computed). */
	listPuzzles(from?: string, to?: string): Promise<AdminPuzzle[]>;
	/** POST /api/admin/puzzles/validate — D5 (never mutates). */
	validateWord(word: string): Promise<ValidateWordResult>;
	/** POST /api/admin/puzzles — schedule a FUTURE puzzle. */
	schedulePuzzle(input: ScheduleInput): Promise<AdminPuzzle>;
	/** PATCH /api/admin/puzzles/:id — edit/move a FUTURE SCHEDULED puzzle (D6/D9). */
	updatePuzzle(id: string, patch: UpdatePatch): Promise<UpdatePuzzleResult>;
	/** DELETE /api/admin/puzzles/:id — FUTURE SCHEDULED only (D6). */
	deletePuzzle(id: string): Promise<DeletePuzzleResult>;
	/** POST /api/admin/puzzles/:id/replace-today — atomic same-day replacement (D8/NG15). */
	replaceTodayPuzzle(id: string, input: ReplaceTodayInput): Promise<AdminPuzzle>;
};

/** D7 — operational logger seam (structured alert markers; same shape as settlement). */
export type Logger = (message: string) => void;
const defaultLog: Logger = (message) => console.error(message);

type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createAdminPuzzleService(
	db: Db,
	deps: { logger?: Logger } = {}
): AdminPuzzleService {
	const log: Logger = deps.logger ?? defaultLog;

	return {
		listPuzzles,
		validateWord,
		schedulePuzzle,
		updatePuzzle,
		deletePuzzle,
		replaceTodayPuzzle
	};

	async function sqlToday(tx: DbTransaction): Promise<string> {
		const result = (await tx.execute(
			sql`SELECT (${todayManilaDateExpr})::text AS today`
		)) as unknown as { rows: { today: string }[] };
		return result.rows[0].today;
	}

	/** SQL-computed window defaults (D4): today−30 … today+90 (Manila). */
	async function sqlWindowDefaults(): Promise<{ from: string; to: string }> {
		const result = (await db.execute(
			sql`SELECT
				((transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date - 30)::text AS f,
				((transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date + 90)::text AS t`
		)) as unknown as { rows: { f: string; t: string }[] };
		return { from: result.rows[0].f, to: result.rows[0].t };
	}

	async function findAnswerId(tx: DbTransaction, word: string): Promise<string | null> {
		const [row] = await tx
			.select({ id: answerDictionary.id })
			.from(answerDictionary)
			.where(eq(answerDictionary.normalizedWord, word))
			.limit(1);
		return row?.id ?? null;
	}

	/** The approved word text for an answer id (dictionary read — never locked). */
	async function findAnswerWord(tx: DbTransaction, answerId: string): Promise<string> {
		const [row] = await tx
			.select({ word: answerDictionary.word })
			.from(answerDictionary)
			.where(eq(answerDictionary.id, answerId))
			.limit(1);
		if (!row) {
			throw new AppError(ERROR_CODES.INTERNAL, 'Puzzle answer is missing from the dictionary', 500);
		}
		return row.word;
	}

	/** True when any puzzle row references this answer id (duplicate-answer pre-check). */
	async function answerAlreadyScheduled(tx: DbTransaction, answerId: string): Promise<boolean> {
		const [row] = await tx
			.select({ id: dailyPuzzles.id })
			.from(dailyPuzzles)
			.where(eq(dailyPuzzles.answerId, answerId))
			.limit(1);
		return row !== undefined;
	}

	async function dateAlreadyTaken(tx: DbTransaction, puzzleDate: string): Promise<boolean> {
		const [row] = await tx
			.select({ id: dailyPuzzles.id })
			.from(dailyPuzzles)
			.where(eq(dailyPuzzles.puzzleDate, puzzleDate))
			.limit(1);
		return row !== undefined;
	}

	/**
	 * D7 — gap detection over the mutated window `(afterDate, upToDate]`:
	 * every date in the window with NO puzzle row. `before` is the same
	 * window scanned pre-mutation; only dates that BECAME empty are
	 * reported/logged (a move/delete "creates" exactly the vacated date;
	 * pre-existing empty dates are the settlement's operational concern).
	 */
	async function createdGaps(
		tx: DbTransaction,
		before: Set<string>,
		afterDate: string,
		upToDate: string
	): Promise<string[]> {
		const result = (await tx.execute(
			sql`SELECT d::date::text AS date
				FROM generate_series(${afterDate}::date + 1, ${upToDate}::date, interval '1 day') d
				LEFT JOIN daily_puzzles p ON p.puzzle_date = d::date
				WHERE p.id IS NULL
				ORDER BY d`
		)) as unknown as { rows: { date: string }[] };
		return result.rows.map((r) => r.date).filter((d) => !before.has(d));
	}

	async function missingDatesBefore(
		tx: DbTransaction,
		afterDate: string,
		upToDate: string
	): Promise<Set<string>> {
		const result = (await tx.execute(
			sql`SELECT d::date::text AS date
				FROM generate_series(${afterDate}::date + 1, ${upToDate}::date, interval '1 day') d
				LEFT JOIN daily_puzzles p ON p.puzzle_date = d::date
				WHERE p.id IS NULL`
		)) as unknown as { rows: { date: string }[] };
		return new Set(result.rows.map((r) => r.date));
	}

	function toAdminPuzzle(
		row: typeof dailyPuzzles.$inferSelect,
		word: string
	): AdminPuzzle {
		return {
			id: row.id,
			date: row.puzzleDate,
			status: row.status,
			hintLetter: row.hintLetter,
			lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
			expiresAt: row.expiresAt.toISOString(),
			word
		};
	}

	async function readPuzzleWithWord(tx: DbTransaction, id: string): Promise<AdminPuzzle> {
		const [row] = await tx
			.select()
			.from(dailyPuzzles)
			.where(eq(dailyPuzzles.id, id))
			.limit(1);
		if (!row) {
			throw new AppError(ERROR_CODES.NOT_FOUND, 'Puzzle not found', 404);
		}
		return toAdminPuzzle(row, await findAnswerWord(tx, row.answerId));
	}

	/** Shared word normalization + approved-membership check (400 ANSWER_NOT_APPROVED). */
	async function resolveApprovedAnswer(
		tx: DbTransaction,
		rawWord: string
	): Promise<{ word: string; answerId: string }> {
		const word = normalizeAnswerWord(rawWord);
		assertAnswerWordShape(word);
		const answerId = await findAnswerId(tx, word);
		if (!answerId) {
			throw new AppError(
				ERROR_CODES.ANSWER_NOT_APPROVED,
				`"${word}" is not in the approved answer list`,
				400
			);
		}
		return { word, answerId };
	}

	async function listPuzzles(from?: string, to?: string): Promise<AdminPuzzle[]> {
		const defaults = await sqlWindowDefaults();
		const { from: fromDate, to: toDate } = validateDateWindow(from ?? defaults.from, to ?? defaults.to);
		const rows = await db
			.select({ puzzle: dailyPuzzles, word: answerDictionary.word })
			.from(dailyPuzzles)
			.innerJoin(answerDictionary, eq(dailyPuzzles.answerId, answerDictionary.id))
			.where(and(gte(dailyPuzzles.puzzleDate, fromDate), lte(dailyPuzzles.puzzleDate, toDate)))
			.orderBy(asc(dailyPuzzles.puzzleDate));
		return rows.map((r) => toAdminPuzzle(r.puzzle, r.word));
	}

	async function validateWord(rawWord: string): Promise<ValidateWordResult> {
		// Read-only — never mutates (I-A10).
		const word = normalizeAnswerWord(rawWord);
		if (!ANSWER_WORD_RE.test(word)) {
			return { approved: false, previouslyUsed: null, usedOn: null };
		}
		const [row] = await db
			.select({ id: answerDictionary.id, usedOn: dailyPuzzles.puzzleDate })
			.from(answerDictionary)
			.leftJoin(dailyPuzzles, eq(dailyPuzzles.answerId, answerDictionary.id))
			.where(eq(answerDictionary.normalizedWord, word))
			.limit(1);
		if (!row) return { approved: false, previouslyUsed: null, usedOn: null };
		return {
			approved: true,
			previouslyUsed: row.usedOn !== null,
			usedOn: row.usedOn ?? null
		};
	}

	async function schedulePuzzle(input: ScheduleInput): Promise<AdminPuzzle> {
		// Hint validation depends only on the (normalized) answer text — pure.
		const word = normalizeAnswerWord(input.word);
		assertAnswerWordShape(word);
		const hint = validateHintLetter(input.hintLetter, word);

		return db.transaction(async (tx) => {
			const today = await sqlToday(tx);
			// Future dates only — DB clock authority (D6/NOT_FUTURE).
			if (input.puzzleDate <= today) {
				throw new AppError(
					ERROR_CODES.NOT_FUTURE,
					'Puzzles can only be scheduled for future dates',
					403
				);
			}
			const { answerId } = await resolveApprovedAnswer(tx, word);
			// Pre-checks are UX guards; UNIQUE(puzzle_date)/UNIQUE(answer_id)
			// remain the final concurrency guard (23505 → 409 below).
			if (await dateAlreadyTaken(tx, input.puzzleDate)) {
				throw new AppError(
					ERROR_CODES.DATE_TAKEN,
					`A puzzle is already scheduled for ${input.puzzleDate}`,
					409
				);
			}
			if (await answerAlreadyScheduled(tx, answerId)) {
				throw new AppError(
					ERROR_CODES.ANSWER_ALREADY_SCHEDULED,
					`"${word}" is already scheduled or used`,
					409
				);
			}
			try {
				const [created] = await tx
					.insert(dailyPuzzles)
					.values({
						puzzleDate: input.puzzleDate,
						answerId,
						hintLetter: hint,
						status: 'SCHEDULED',
						expiresAt: expiresAtExpr(input.puzzleDate)
					})
					.returning();
				if (!created) {
					throw new AppError(ERROR_CODES.INTERNAL, 'Failed to create the puzzle', 500);
				}
				return toAdminPuzzle(created, word);
			} catch (err) {
				// Direct UNIQUE race (concurrent schedule of the same date/answer).
				mapUniqueViolation(err, { date: input.puzzleDate, word });
			}
		});
	}

	async function updatePuzzle(id: string, patch: UpdatePatch): Promise<UpdatePuzzleResult> {
		return db.transaction(async (tx) => {
			const today = await sqlToday(tx);
			// 1. Lock the puzzle row FIRST (NG9 serialization point).
			const [row] = await tx
				.select()
				.from(dailyPuzzles)
				.where(eq(dailyPuzzles.id, id))
				.for('update');
			if (!row) {
				throw new AppError(ERROR_CODES.NOT_FOUND, 'Puzzle not found', 404);
			}
			// 2. Immutability re-check under the lock (D6).
			const violation = editGuardViolation({
				lockedAt: row.lockedAt,
				status: row.status,
				puzzleDate: row.puzzleDate,
				today
			});
			if (violation) throw new AppError(violation.code, violation.message, 403);

			let newAnswerId = row.answerId;
			let newWord = await findAnswerWord(tx, row.answerId);
			if (patch.word !== undefined) {
				const resolved = await resolveApprovedAnswer(tx, patch.word);
				newWord = resolved.word;
				newAnswerId = resolved.answerId;
				if (newAnswerId !== row.answerId && (await answerAlreadyScheduled(tx, newAnswerId))) {
					throw new AppError(
						ERROR_CODES.ANSWER_ALREADY_SCHEDULED,
						`"${newWord}" is already scheduled or used`,
						409
					);
				}
			}
			// The persisted hint must always occur in the (final) answer (NG2).
			const finalHint =
				patch.hintLetter !== undefined
					? validateHintLetter(patch.hintLetter, newWord)
					: validateHintLetter(row.hintLetter, newWord);

			let newDate = row.puzzleDate;
			if (patch.puzzleDate !== undefined) {
				// D9 — destination must be future; UNIQUE re-checked.
				assertFutureDate(patch.puzzleDate, today);
				if (patch.puzzleDate !== row.puzzleDate) {
					if (await dateAlreadyTaken(tx, patch.puzzleDate)) {
						throw new AppError(
							ERROR_CODES.DATE_TAKEN,
							`A puzzle is already scheduled for ${patch.puzzleDate}`,
							409
						);
					}
					newDate = patch.puzzleDate;
				}
			}

			// 3. D7 window scan BEFORE the mutation (only date moves can create gaps).
			const affectedEnd = newDate > row.puzzleDate ? newDate : row.puzzleDate;
			const before = await missingDatesBefore(tx, today, affectedEnd);

			try {
				await tx
					.update(dailyPuzzles)
					.set({
						...(newAnswerId !== row.answerId ? { answerId: newAnswerId } : {}),
						...(finalHint !== row.hintLetter ? { hintLetter: finalHint } : {}),
						...(newDate !== row.puzzleDate
							? { puzzleDate: newDate, expiresAt: expiresAtExpr(newDate) }
							: {})
					})
					.where(eq(dailyPuzzles.id, id));
			} catch (err) {
				mapUniqueViolation(err, { date: newDate, word: newWord });
			}

			// 4. D7 — report gaps CREATED by this move (the vacated date).
			const gaps = await createdGaps(tx, before, today, affectedEnd);
			if (gaps.length > 0) log(`[admin] puzzle gap created dates=${gaps.join(',')}`);

			return { puzzle: await readPuzzleWithWord(tx, id), gaps };
		});
	}

	async function deletePuzzle(id: string): Promise<DeletePuzzleResult> {
		return db.transaction(async (tx) => {
			const today = await sqlToday(tx);
			const [row] = await tx
				.select()
				.from(dailyPuzzles)
				.where(eq(dailyPuzzles.id, id))
				.for('update');
			if (!row) {
				throw new AppError(ERROR_CODES.NOT_FOUND, 'Puzzle not found', 404);
			}
			const violation = editGuardViolation({
				lockedAt: row.lockedAt,
				status: row.status,
				puzzleDate: row.puzzleDate,
				today
			});
			if (violation) throw new AppError(violation.code, violation.message, 403);

			// D7 window scan BEFORE the delete (only the deleted date is created).
			const before = await missingDatesBefore(tx, today, row.puzzleDate);

			await tx.delete(dailyPuzzles).where(eq(dailyPuzzles.id, id));

			const gaps = await createdGaps(tx, before, today, row.puzzleDate);
			if (gaps.length > 0) log(`[admin] puzzle gap created dates=${gaps.join(',')}`);
			return { deleted: true, gaps };
		});
	}

	async function replaceTodayPuzzle(id: string, input: ReplaceTodayInput): Promise<AdminPuzzle> {
		return db.transaction(async (tx) => {
			const today = await sqlToday(tx);
			// 1. Lock the puzzle row FIRST (D8 single recovery transaction).
			const [row] = await tx
				.select()
				.from(dailyPuzzles)
				.where(eq(dailyPuzzles.id, id))
				.for('update');
			if (!row) {
				throw new AppError(ERROR_CODES.NOT_FOUND, 'Puzzle not found', 404);
			}
			// 2. Guards UNDER the lock (D8): today + SCHEDULED + unlocked.
			const violation = replaceTodayGuardViolation({
				lockedAt: row.lockedAt,
				status: row.status,
				puzzleDate: row.puzzleDate,
				today
			});
			if (violation) throw new AppError(violation.code, violation.message, 403);

			// 3. Validate the replacement answer/hint exactly as POST (D3).
			const { answerId, word } = await resolveApprovedAnswer(tx, input.word);
			if (answerId !== row.answerId && (await answerAlreadyScheduled(tx, answerId))) {
				throw new AppError(
					ERROR_CODES.ANSWER_ALREADY_SCHEDULED,
					`"${word}" is already scheduled or used`,
					409
				);
			}
			const hint = validateHintLetter(input.hintLetter, word);

			// 4. UPDATE in place — never delete+reschedule (no transient gap).
			try {
				await tx
					.update(dailyPuzzles)
					.set({
						answerId,
						hintLetter: hint,
						expiresAt: expiresAtExpr(row.puzzleDate)
					})
					.where(eq(dailyPuzzles.id, id));
			} catch (err) {
				mapUniqueViolation(err, { date: row.puzzleDate, word });
			}

			return readPuzzleWithWord(tx, id);
		});
	}
}