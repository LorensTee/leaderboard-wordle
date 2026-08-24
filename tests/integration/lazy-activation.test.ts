// M3 — lazy activation contract, re-pointed at the REAL startGame service
// (Phase-0 B6 mandate). The documented transaction is entirely inside the
// service: lock today's SCHEDULED puzzle row FIRST, verify the guards
// (today's Manila date, SCHEDULED, expires_at > transaction_timestamp(),
// no other ACTIVE puzzle for the date), activate, then create/return the
// user's game in the SAME transaction. Guard failures fail closed.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/server/db/schema';
import { ERROR_CODES } from '../../src/server/lib/errors';
import { createGameService } from '../../src/server/game/service';
import { closeDb, createIntegrationDb, type Db } from './helpers';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('M3 lazy activation (real startGame service)', () => {
	let db: Db;
	let gameService: ReturnType<typeof createGameService>;

	beforeAll(async () => {
		db = await createIntegrationDb();
		gameService = createGameService(db);
	});

	beforeEach(async () => {
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);
	});

	afterAll(async () => {
		await closeDb(db);
	});

	async function todayManilaDate(): Promise<string> {
		const [{ d }] = (
			await db.execute(sql`SELECT ((now() AT TIME ZONE 'Asia/Manila')::date)::text AS d`)
		).rows as { d: string }[];
		return d;
	}

	async function insertUser(id: string) {
		const [user] = await db
			.insert(schema.user)
			.values({ id, name: 'M3', email: `${id}@test.dev`, emailVerified: true })
			.returning();
		return user;
	}

	async function insertScheduledPuzzle(puzzleDate: string, word = 'river', expiresAt?: Date) {
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word, normalizedWord: word })
			.returning();
		const [puzzle] = await db
			.insert(schema.dailyPuzzles)
			.values({
				puzzleDate,
				answerId: answer.id,
				hintLetter: word[0].toUpperCase(),
				status: 'SCHEDULED',
				expiresAt: expiresAt ?? new Date('2099-03-02T00:00:00Z')
			})
			.returning();
		return puzzle;
	}

	it('first legitimate start activates today\'s SCHEDULED puzzle and creates the game in one transaction', async () => {
		const today = await todayManilaDate();
		const puzzle = await insertScheduledPuzzle(today);
		const user = await insertUser('u-lazy-active');

		const game = await gameService.startGame(user.id);

		expect(game.puzzle.id).toBe(puzzle.id);
		expect(game.puzzle.date).toBe(today);
		expect(game.status).toBe('ACTIVE');

		const [{ status, locked_at }] = (
			await db.execute(sql`SELECT status, locked_at FROM daily_puzzles WHERE id = ${puzzle.id}`)
		).rows as { status: string; locked_at: unknown }[];
		expect(status).toBe('ACTIVE');
		// First start also locks the answer (immutability).
		expect(locked_at).not.toBeNull();
	});

	it('start is idempotent on an already-activated puzzle (same game, same started_at)', async () => {
		const today = await todayManilaDate();
		await insertScheduledPuzzle(today, 'light');
		const user = await insertUser('u-lazy-again');

		const first = await gameService.startGame(user.id);
		const second = await gameService.startGame(user.id);

		expect(second.id).toBe(first.id);
		expect(second.startedAt).toBe(first.startedAt);
	});

	it('fail closed when no puzzle exists for today (missing-puzzle invariant)', async () => {
		const user = await insertUser('u-lazy-missing');
		await expect(gameService.startGame(user.id)).rejects.toMatchObject({
			code: ERROR_CODES.PUZZLE_UNAVAILABLE,
			status: 404
		});
	});

	it('never lazily activates an expired SCHEDULED puzzle (expiry guard)', async () => {
		const today = await todayManilaDate();
		await insertScheduledPuzzle(today, 'quick', new Date('2020-01-01T00:00:00Z'));
		const user = await insertUser('u-lazy-expired');

		await expect(gameService.startGame(user.id)).rejects.toMatchObject({
			code: ERROR_CODES.GAME_EXPIRED,
			status: 409
		});

		// The puzzle was NOT activated and no game was created.
		const [{ status }] = (
			await db.execute(sql`SELECT status FROM daily_puzzles WHERE puzzle_date = ${today}`)
		).rows as { status: string }[];
		expect(status).toBe('SCHEDULED');
		const [{ n }] = (
			await db.execute(sql`SELECT count(*)::int AS n FROM games g JOIN daily_puzzles p ON p.id = g.puzzle_id WHERE p.puzzle_date = ${today}`)
		).rows as { n: number }[];
		expect(n).toBe(0);
	});

	it('a puzzle for a different date is never the start target (fail closed)', async () => {
		await insertScheduledPuzzle('2099-05-05', 'ocean');
		const user = await insertUser('u-lazy-other');
		await expect(gameService.startGame(user.id)).rejects.toMatchObject({
			code: ERROR_CODES.PUZZLE_UNAVAILABLE,
			status: 404
		});
		// Nothing activated.
		const [{ status }] = (
			await db.execute(sql`SELECT status FROM daily_puzzles WHERE puzzle_date = '2099-05-05'`)
		).rows as { status: string }[];
		expect(status).toBe('SCHEDULED');
	});
});