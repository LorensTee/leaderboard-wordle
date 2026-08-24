// Phase-1 game domain — server-authoritative start/resume/guess services
// (Architecture §Concurrency and transaction semantics, NG9/M3, §Timer
// authority). The browser is untrusted: every mutation re-validates puzzle
// state, expiry, dictionary, guess number, ownership and terminal state
// under the established puzzle-first lock ordering, and the answer never
// leaves this module's boundaries.
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { VALID_GUESS_SET } from '../data/valid-guesses.generated';
import { answerDictionary, dailyPuzzles, gameStatus, games, guesses } from '../db/schema';
import { AppError, ERROR_CODES } from '../lib/errors';
import { todayManilaDateExpr } from '../puzzle/manila';
import { evaluateGuess, MAX_GUESSES, type GuessFeedback } from './evaluate';

// ─── Safe (answer-free) state shapes ────────────────────────────────────────

export type SafeGuess = {
	guessNumber: number;
	word: string;
	feedback: GuessFeedback;
};

export type SafeGameState = {
	id: string;
	status: (typeof gameStatus)['enumValues'][number];
	startedAt: string;
	completedAt: string | null;
	completionTimeMs: number | null;
	guessCount: number;
	puzzle: {
		id: string;
		date: string;
		/** Exposed ONLY once a game exists (N14: no hint pre-start). */
		hintLetter: string;
	};
	guesses: SafeGuess[];
};

export type CurrentGameResult =
	| { game: SafeGameState }
	| { game: null; puzzle: { date: string } | null };

export type GuessOutcome = {
	game: SafeGameState;
	guess: SafeGuess;
	solved: boolean;
	terminal: boolean;
};

// ─── Row types ──────────────────────────────────────────────────────────────

export type GameRow = typeof games.$inferSelect;
export type PuzzleRow = typeof dailyPuzzles.$inferSelect;
export type GuessRow = typeof guesses.$inferSelect;

/**
 * The ONLY serialization of game state that may cross the HTTP boundary.
 * Deliberately answer-free: no `answerId`, no answer text, no dictionary.
 * Unit-tested (answer-secrecy regression).
 */
export function serializeGameState(
	game: GameRow,
	puzzle: PuzzleRow,
	guessRows: GuessRow[]
): SafeGameState {
	return {
		id: game.id,
		status: game.status,
		startedAt: game.startedAt.toISOString(),
		completedAt: game.completedAt ? game.completedAt.toISOString() : null,
		completionTimeMs: game.completionTimeMs,
		guessCount: game.guessCount,
		puzzle: {
			id: puzzle.id,
			date: puzzle.puzzleDate,
			hintLetter: puzzle.hintLetter
		},
		guesses: guessRows.map((row) => ({
			guessNumber: row.guessNumber,
			word: row.word,
			feedback: row.feedback as GuessFeedback
		}))
	};
}

// ─── Service ────────────────────────────────────────────────────────────────

export type GameService = {
	/** Start today's game or return the existing one (idempotent). */
	startGame(userId: string): Promise<SafeGameState>;
	/** Resumable read of the current game — never the answer, never mutates. */
	getCurrentGame(userId: string): Promise<CurrentGameResult>;
	/** Submit exactly one guess; server-authoritative evaluation/persistence. */
	submitGuess(userId: string, gameId: string, word: string): Promise<GuessOutcome>;
};

type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createGameService(db: Db): GameService {
	return {
		startGame,
		getCurrentGame,
		submitGuess
	};

	async function startGame(userId: string): Promise<SafeGameState> {
		return db.transaction(async (tx) => {
			// 1. Lock today's puzzle row FIRST — serialization point for the
			//    day boundary (concurrent starts/finalize/lazy activation).
			const [puzzle] = await tx
				.select()
				.from(dailyPuzzles)
				.where(eq(dailyPuzzles.puzzleDate, todayManilaDateExpr))
				.for('update');
			if (!puzzle) {
				// Missing-puzzle invariant: fail closed, never fabricate a puzzle.
				throw new AppError(
					ERROR_CODES.PUZZLE_UNAVAILABLE,
					'No puzzle is available for today',
					404
				);
			}

			// 2. Eligibility anchor (NG9): transaction start must precede expiry.
			const txStart = await transactionStart(tx);
			if (puzzle.expiresAt.getTime() <= txStart.getTime()) {
				throw new AppError(ERROR_CODES.GAME_EXPIRED, 'This puzzle has expired', 409);
			}

			if (puzzle.status === 'SCHEDULED') {
				// M3 lazy activation — inside the SAME transaction, under the lock.
				// Guards: today's date (the WHERE above), SCHEDULED (this branch),
				// not expired (checked above), and no other ACTIVE puzzle for today.
				const [otherActive] = await tx
					.select({ id: dailyPuzzles.id })
					.from(dailyPuzzles)
					.where(
						and(
							eq(dailyPuzzles.puzzleDate, puzzle.puzzleDate),
							eq(dailyPuzzles.status, 'ACTIVE'),
							ne(dailyPuzzles.id, puzzle.id)
						)
					)
					.limit(1);
				if (otherActive) {
					throw new AppError(
						ERROR_CODES.INVALID_STATE,
						'Conflicting puzzle state: more than one ACTIVE puzzle for today',
						500
					);
				}
				await tx
					.update(dailyPuzzles)
					.set({ status: 'ACTIVE' })
					.where(eq(dailyPuzzles.id, puzzle.id));
				puzzle.status = 'ACTIVE';
			} else if (puzzle.status !== 'ACTIVE') {
				// FINALIZED (or any other state): today cannot be played.
				throw new AppError(
					ERROR_CODES.PUZZLE_UNAVAILABLE,
					'Today\'s puzzle is no longer available',
					409
				);
			}

			// 3. Answer/hint immutability: locked_at set once, first start wins.
			await tx
				.update(dailyPuzzles)
				.set({ lockedAt: sql`transaction_timestamp()` })
				.where(and(eq(dailyPuzzles.id, puzzle.id), isNull(dailyPuzzles.lockedAt)));

			// 4. One attempt per user/puzzle: UNIQUE(user_id, puzzle_id) is the
			//    final concurrency guard — insert-ignore, then read the winner.
			const existing = await tx
				.select()
				.from(games)
				.where(and(eq(games.userId, userId), eq(games.puzzleId, puzzle.id)))
				.limit(1);
			let game = existing[0];
			if (!game) {
				const created = await tx
					.insert(games)
					.values({ userId, puzzleId: puzzle.id })
					.onConflictDoNothing()
					.returning();
				game = created[0];
				if (!game) {
					const [winner] = await tx
						.select()
						.from(games)
						.where(and(eq(games.userId, userId), eq(games.puzzleId, puzzle.id)))
						.limit(1);
					game = winner;
				}
			}
			if (!game) {
				throw new AppError(ERROR_CODES.INTERNAL, 'Failed to create the game', 500);
			}

			return serializeGameState(game, puzzle, []);
		});
	}

	async function getCurrentGame(userId: string): Promise<CurrentGameResult> {
		// Read path — no transaction, no locks, no state changes (a GET must
		// never mutate; lazy activation happens only in startGame / M3).
		const [puzzle] = await db
			.select()
			.from(dailyPuzzles)
			.where(eq(dailyPuzzles.puzzleDate, todayManilaDateExpr))
			.limit(1);
		if (!puzzle) return { game: null, puzzle: null };

		const [game] = await db
			.select()
			.from(games)
			.where(and(eq(games.userId, userId), eq(games.puzzleId, puzzle.id)))
			.limit(1);
		if (!game) return { game: null, puzzle: { date: puzzle.puzzleDate } };

		const guessRows = await db
			.select()
			.from(guesses)
			.where(eq(guesses.gameId, game.id))
			.orderBy(asc(guesses.guessNumber));
		return { game: serializeGameState(game, puzzle, guessRows) };
	}

	async function submitGuess(userId: string, gameId: string, word: string): Promise<GuessOutcome> {
		return db.transaction(async (tx) => {
			const txStart = await transactionStart(tx);

			// 1. Learn the puzzle id without locking (FK: it never changes).
			const [probe] = await tx
				.select({ puzzleId: games.puzzleId })
				.from(games)
				.where(eq(games.id, gameId))
				.limit(1);
			if (!probe) {
				throw new AppError(ERROR_CODES.GAME_NOT_FOUND, 'Game not found', 404);
			}

			// 2. Lock the puzzle row FIRST (NG9 lock order), then re-check state.
			const [puzzle] = await tx
				.select()
				.from(dailyPuzzles)
				.where(eq(dailyPuzzles.id, probe.puzzleId))
				.for('update');
			if (!puzzle) {
				throw new AppError(ERROR_CODES.GAME_NOT_FOUND, 'Game not found', 404);
			}
			// Post-lock re-read (READ COMMITTED): a finalize that won the lock
			// race is observed here (NG9 order B).
			if (puzzle.status !== 'ACTIVE' || puzzle.expiresAt.getTime() <= txStart.getTime()) {
				throw new AppError(ERROR_CODES.GAME_EXPIRED, 'This puzzle has expired', 409);
			}

			// 3. Lock the game row, re-validate ownership + status under lock.
			const [game] = await tx
				.select()
				.from(games)
				.where(eq(games.id, gameId))
				.for('update');
			if (!game) {
				throw new AppError(ERROR_CODES.GAME_NOT_FOUND, 'Game not found', 404);
			}
			if (game.userId !== userId) {
				throw new AppError(ERROR_CODES.FORBIDDEN, 'You do not own this game', 403);
			}
			if (game.status !== 'ACTIVE') {
				throw new AppError(ERROR_CODES.GAME_NOT_ACTIVE, 'This game is no longer active', 409);
			}

			// 4. Sequential guess number (1–6); UNIQUE(game_id, guess_number)
			//    remains the DB-level final guard.
			const guessNumber = game.guessCount + 1;
			if (guessNumber > MAX_GUESSES) {
				throw new AppError(
					ERROR_CODES.GUESS_LIMIT_EXCEEDED,
					`Only ${MAX_GUESSES} guesses are allowed per puzzle`,
					409
				);
			}

			// 5. Server-authoritative dictionary validation (client checking is
			//    only a UX optimization).
			if (!VALID_GUESS_SET.has(word)) {
				throw new AppError(ERROR_CODES.INVALID_WORD, `"${word}" is not a valid word`, 400);
			}

			// 6. Evaluate against the answer — which never leaves this module.
			const [answerRow] = await tx
				.select({ word: answerDictionary.word })
				.from(answerDictionary)
				.where(eq(answerDictionary.id, puzzle.answerId))
				.limit(1);
			if (!answerRow) {
				throw new AppError(ERROR_CODES.INTERNAL, 'Puzzle answer is missing', 500);
			}
			const feedback = evaluateGuess(answerRow.word, word);
			const solved = feedback.every((tile) => tile.status === 'green');
			const terminal = solved || guessNumber >= MAX_GUESSES;
			const nextStatus = solved
				? 'COMPLETED'
				: terminal
					? 'FAILED'
					: 'ACTIVE';

			// 7. Persist the guess (DB UNIQUE is the final concurrent guard).
			const inserted = await tx
				.insert(guesses)
				.values({ gameId: game.id, guessNumber, word, feedback })
				.onConflictDoNothing()
				.returning({ id: guesses.id });
			if (inserted.length === 0) {
				throw new AppError(
					ERROR_CODES.INVALID_STATE,
					'Guess number already exists for this game',
					409
				);
			}

			// 8. Update guess_count + terminal transition. Timing is computed
			//    server-side in the DB (timer authority): completed_at and
			//    completion_time_ms are set exactly once (only on the ACTIVE →
			//    COMPLETED transition; terminal games can never be re-submitted).
			await tx
				.update(games)
				.set(
					solved
						? {
								guessCount: guessNumber,
								status: 'COMPLETED',
								completedAt: sql`transaction_timestamp()`,
								completionTimeMs: sql`round(EXTRACT(EPOCH FROM (transaction_timestamp() - started_at)) * 1000)::int`,
								updatedAt: sql`now()`
							}
						: {
								guessCount: guessNumber,
								status: nextStatus,
								updatedAt: sql`now()`
							}
				)
				.where(eq(games.id, game.id));

			// 9. Return the authoritative post-mutation state (answer-free).
			const [updatedGame] = await tx
				.select()
				.from(games)
				.where(eq(games.id, game.id))
				.limit(1);
			const guessRows = await tx
				.select()
				.from(guesses)
				.where(eq(guesses.gameId, game.id))
				.orderBy(asc(guesses.guessNumber));

			return {
				game: serializeGameState(updatedGame, puzzle, guessRows),
				guess: { guessNumber, word, feedback },
				solved,
				terminal
			};
		});
	}
}

/** The transaction-start eligibility anchor (NG9) — DB time, never the Worker clock. */
async function transactionStart(tx: DbTransaction): Promise<Date> {
	// drizzle exposes raw rows via QueryResult.rows; the sql<T> generic is not
	// carried by the transaction execute overload, so cast through unknown.
	const result = (await tx.execute(sql`SELECT transaction_timestamp() AS ts`)) as unknown as {
		rows: { ts: Date }[];
	};
	return new Date(result.rows[0].ts);
}