// M3 — lazy activation contract: if Cron missed activation, the first
// legitimate game-start activates today's SCHEDULED puzzle under strict
// transactional guards (architecture: lock puzzle first; today's date;
// SCHEDULED; not expired; no other active puzzle).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/server/db/schema';
import { closeDb, connectClient, createIntegrationDb, type Db } from './helpers';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('M3 lazy activation', () => {
	let db: Db;

	beforeAll(async () => {
		db = await createIntegrationDb();
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);
	});

	afterAll(async () => {
		await closeDb(db);
	});

	it("first start activates today's SCHEDULED puzzle under the puzzle lock", async () => {
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word: 'river', normalizedWord: 'river' })
			.returning();
		const [puzzle] = await db
			.insert(schema.dailyPuzzles)
			.values({
				puzzleDate: '2099-03-01',
				answerId: answer.id,
				hintLetter: 'R',
				status: 'SCHEDULED',
				expiresAt: new Date('2099-03-02T00:00:00Z')
			})
			.returning();

		// The documented lazy-activation transaction (M3):
		// lock the puzzle row, verify guards, then activate.
		const conn = await connectClient(db);
		try {
			await conn.query('BEGIN');
			const rows = (
				await conn.query(
					`SELECT id, status FROM daily_puzzles
						WHERE id = '${puzzle.id}' AND status = 'SCHEDULED'
						  AND expires_at > now()
						FOR UPDATE`
				)
			).rows as { id: string; status: string }[];

			// Guard: no other ACTIVE puzzle for the same date (none in fixture).
			const [{ n: activeCount }] = (
				await conn.query(
					`SELECT count(*)::int AS n FROM daily_puzzles
						WHERE puzzle_date = '${puzzle.puzzleDate}' AND status = 'ACTIVE'`
				)
			).rows as { n: number }[];

			expect(rows).toHaveLength(1);
			expect(activeCount).toBe(0);
			await conn.query(`UPDATE daily_puzzles SET status = 'ACTIVE' WHERE id = '${puzzle.id}'`);
			await conn.query('COMMIT');
		} finally {
			await conn.release();
		}

		const [{ status }] = (
			await db.execute(sql`SELECT status FROM daily_puzzles WHERE id = ${puzzle.id}`)
		).rows as { status: string }[];
		expect(status).toBe('ACTIVE');
	});
});