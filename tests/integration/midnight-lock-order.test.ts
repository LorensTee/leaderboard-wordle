// NG9 — the two mandatory midnight lock orders, re-pointed at the REAL
// application services (Phase-0 B6 mandate): submitGuess (src/server/game)
// and finalizePuzzle (src/server/puzzle). The transaction-level contract they
// assert (puzzle-row lock = serialization point; READ COMMITTED visibility
// after lock wait) is preserved exactly.
//
// Determinism: a sentinel connection holds the puzzle-row FOR UPDATE lock;
// the two service transactions queue behind it in a known order (PostgreSQL
// grants row locks in request order). The sentinel then commits, releasing
// the queue in the requested order:
//   A — guess queued first → wins the lock → completes; finalize then sees
//       the COMPLETED game and converts only remaining ACTIVE games.
//   B — finalize queued first → commits FINALIZED; the guess then acquires
//       the lock, re-reads (READ COMMITTED), observes FINALIZED, is rejected
//       and writes nothing.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/server/db/schema';
import { AppError, ERROR_CODES } from '../../src/server/lib/errors';
import { createGameService } from '../../src/server/game/service';
import { createPuzzleService } from '../../src/server/puzzle/finalize';
import { closeDb, connectClient, createIntegrationDb, type Db } from './helpers';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('NG9 midnight lock orders (real services: submitGuess + finalizePuzzle)', () => {
	let db: Db;
	let gameService: ReturnType<typeof createGameService>;
	let puzzleService: ReturnType<typeof createPuzzleService>;

	beforeAll(async () => {
		db = await createIntegrationDb();
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);
		gameService = createGameService(db);
		puzzleService = createPuzzleService(db);
	});

	afterAll(async () => {
		await closeDb(db);
	});

	/** Puzzle ACTIVE (far-future expiry), one ACTIVE game, ready for a guess. */
	async function fixture(puzzleDate: string, answerWord: string) {
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word: answerWord, normalizedWord: answerWord })
			.returning();
		const [puzzle] = await db
			.insert(schema.dailyPuzzles)
			.values({
				puzzleDate,
				answerId: answer.id,
				hintLetter: answerWord[0].toUpperCase(),
				status: 'ACTIVE',
				expiresAt: new Date('2099-12-31T00:00:00Z')
			})
			.returning();
		const [user] = await db
			.insert(schema.user)
			.values({
				id: `u-${puzzleDate}`,
				name: 'NG9',
				email: `${puzzleDate}@test.dev`,
				emailVerified: true
			})
			.returning();
		const [game] = await db
			.insert(schema.games)
			.values({ userId: user.id, puzzleId: puzzle.id })
			.returning();
		return { puzzle, game, userId: user.id };
	}

	it("A: guess obtains the puzzle lock first → its completion is valid, finalize converts only remaining ACTIVE games", async () => {
		const { puzzle, game, userId } = await fixture('2099-02-01', 'light');

		const sentinel = await connectClient(db);
		try {
			await sentinel.query('BEGIN');
			await sentinel.query(`SELECT id FROM daily_puzzles WHERE id = '${puzzle.id}' FOR UPDATE`);

			// Guess queues first…
			const guessPromise = gameService.submitGuess(userId, game.id, 'light');
			await new Promise((r) => setTimeout(r, 250));
			// …then finalize queues behind it.
			const finalizePromise = puzzleService.finalizePuzzle(puzzle.id);
			await new Promise((r) => setTimeout(r, 250));

			await sentinel.query('COMMIT'); // release the queue: guess first
			const outcome = await guessPromise;
			const finalize = await finalizePromise;

			// The guess won the lock while the puzzle was still ACTIVE.
			expect(outcome.solved).toBe(true);
			expect(outcome.game.status).toBe('COMPLETED');
			expect(outcome.game.guessCount).toBe(1);
			expect(typeof outcome.game.completionTimeMs).toBe('number');
			expect(outcome.game.completionTimeMs!).toBeGreaterThan(0);

			// Finalize then observed the committed COMPLETED game: it is NOT
			// forfeited, and the frozen averages use its completion time.
			expect(finalize.alreadyFinalized).toBe(false);
			expect(finalize.forfeitedCount).toBe(0);
			expect(finalize.completedCount).toBe(1);
			expect(finalize.averageCompletionTimeMs).toBe(outcome.game.completionTimeMs);
			expect(finalize.status).toBe('FINALIZED');

			const [{ status }] = (
				await db.execute(sql`SELECT status FROM daily_puzzles WHERE id = ${puzzle.id}`)
			).rows as { status: string }[];
			expect(status).toBe('FINALIZED');
		} finally {
			await sentinel.release();
		}
	});

	it("B: finalize obtains the puzzle lock first → the guess observes FINALIZED and writes nothing", async () => {
		const { puzzle, game, userId } = await fixture('2099-02-02', 'stone');

		const sentinel = await connectClient(db);
		let finalizeResult: Awaited<ReturnType<typeof puzzleService.finalizePuzzle>>;
		let guessError: unknown;
		try {
			await sentinel.query('BEGIN');
			await sentinel.query(`SELECT id FROM daily_puzzles WHERE id = '${puzzle.id}' FOR UPDATE`);

			// Finalize queues first…
			const finalizePromise = puzzleService.finalizePuzzle(puzzle.id);
			await new Promise((r) => setTimeout(r, 250));
			// …then the guess queues behind it.
			const guessPromise = gameService.submitGuess(userId, game.id, 'stone').catch((e) => {
				guessError = e;
				return null;
			});
			await new Promise((r) => setTimeout(r, 250));

			await sentinel.query('COMMIT');
			finalizeResult = await finalizePromise;
			await guessPromise;
		} finally {
			await sentinel.release();
		}

		// Finalize won: puzzle committed FINALIZED.
		expect(finalizeResult.alreadyFinalized).toBe(false);
		expect(finalizeResult.status).toBe('FINALIZED');

		// The guess acquired the lock AFTER finalization, re-read the puzzle
		// (READ COMMITTED), observed FINALIZED and was rejected — no writes.
		expect(guessError).toBeInstanceOf(AppError);
		expect((guessError as AppError).code).toBe(ERROR_CODES.GAME_EXPIRED);

		const [{ guess_count: count }] = (
			await db.execute(sql`SELECT guess_count FROM games WHERE id = ${game.id}`)
		).rows as { guess_count: number }[];
		expect(count).toBe(0);
		const [{ n: guessRows }] = (
			await db.execute(sql`SELECT count(*)::int AS n FROM guesses WHERE game_id = ${game.id}`)
		).rows as { n: number }[];
		expect(guessRows).toBe(0);
	});
});