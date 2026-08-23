// NG9 — the two mandatory midnight lock orders, executable against any
// PostgreSQL through the app query surface (helpers.ts driver seam). Phase 1
// re-points these at finalizePuzzle/submitGuess; the transaction-level
// contract they assert (puzzle-row lock = serialization point; READ
// COMMITTED visibility after lock wait) is what the services must preserve.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/server/db/schema';
import { closeDb, connectClient, createIntegrationDb, type Db } from './helpers';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('NG9 midnight lock orders', () => {
	let db: Db; // fixture + finalize side

	beforeAll(async () => {
		db = await createIntegrationDb();
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);
	});

	afterAll(async () => {
		await closeDb(db);
	});

	async function fixture(puzzleDate: string, word: string) {
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word, normalizedWord: word })
			.returning();
		const [puzzle] = await db
			.insert(schema.dailyPuzzles)
			.values({
				puzzleDate,
				answerId: answer.id,
				hintLetter: 'L',
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
		return { puzzle, game };
	}

	it("A: guess obtains the puzzle lock first → its completion is valid", async () => {
		const { puzzle, game } = await fixture('2099-02-01', 'light');

		// Guess transaction: puzzle lock first, then writes the guess row.
		const guessConn = await connectClient(db);
		const guessTx = (async () => {
			await guessConn.query('BEGIN');
			await guessConn.query(
				`SELECT id FROM daily_puzzles WHERE id = '${puzzle.id}' FOR UPDATE`
			);
			// hold the lock briefly so finalize queues behind us
			await new Promise((r) => setTimeout(r, 200));
			await guessConn.query(
				`INSERT INTO guesses (game_id, guess_number, word, feedback, created_at)
					VALUES ('${game.id}', 1, 'light', '[{"letter":"l","status":"green"}]', now())`
			);
			await guessConn.query(
				`UPDATE games SET guess_count = 1, status = 'COMPLETED' WHERE id = '${game.id}'`
			);
			await guessConn.query('COMMIT');
		})();

		// Finalize transaction queues behind the guess's lock.
		const finalizeConn = await connectClient(db);
		await new Promise((r) => setTimeout(r, 50));
		await finalizeConn.query('BEGIN');
		const finalize = finalizeConn.query(
			`SELECT id, status FROM daily_puzzles WHERE id = '${puzzle.id}' FOR UPDATE`
		);
		const [row] = (await finalize).rows as { id: string; status: string }[];
		await guessTx;

		// Serialization held: finalize saw ACTIVE, and the guess committed
		// (its completion is valid — the contract requires guesses be
		// accepted while the puzzle is still active).
		expect(row.status).toBe('ACTIVE');
		const [{ guess_count: count }] = (
			await db.execute(sql`SELECT guess_count FROM games WHERE id = ${game.id}`)
		).rows as { guess_count: number }[];
		expect(count).toBe(1);
		await finalizeConn.query('COMMIT');
		await finalizeConn.release();
		await guessConn.release();
	});

	it("B: finalize obtains the puzzle lock first → guess rejected after finalization", async () => {
		const { puzzle, game } = await fixture('2099-02-02', 'march');

		// Finalize transaction: puzzle lock first, finalizes, commits.
		const finalizeConn = await connectClient(db);
		const finalizeTx = (async () => {
			await finalizeConn.query('BEGIN');
			await finalizeConn.query(
				`SELECT id FROM daily_puzzles WHERE id = '${puzzle.id}' FOR UPDATE`
			);
			await new Promise((r) => setTimeout(r, 200));
			await finalizeConn.query(
				`UPDATE daily_puzzles SET status = 'FINALIZED' WHERE id = '${puzzle.id}'`
			);
			await finalizeConn.query('COMMIT');
		})();

		// Guess transaction queues behind finalize; after the lock wait it must
		// observe FINALIZED (READ COMMITTED) and therefore REJECT the guess.
		const guessConn = await connectClient(db);
		await new Promise((r) => setTimeout(r, 50));
		await guessConn.query('BEGIN');
		const lockResult = await guessConn.query(
			`SELECT id, status FROM daily_puzzles WHERE id = '${puzzle.id}' FOR UPDATE`
		);
		const [row] = lockResult.rows as { id: string; status: string }[];
		await finalizeTx;

		expect(row.status).toBe('FINALIZED');
		// Contract: a guess against a FINALIZED puzzle writes nothing.
		await guessConn.query('ROLLBACK');
		const [{ guess_count: count }] = (
			await db.execute(sql`SELECT guess_count FROM games WHERE id = ${game.id}`)
		).rows as { guess_count: number }[];
		expect(count).toBe(0);
		await guessConn.release();
		await finalizeConn.release();
	});
});