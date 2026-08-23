// Database-foundation integration suite — PostgreSQL semantics through the
// app query surface (see helpers.ts for the driver seam: neon-serverless by
// default, node-postgres with LOCAL_PG=1). Skipped when DATABASE_URL is
// absent (CI unit job); the B7 external gate runs it against Neon.
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/server/db/schema';
import { closeDb, connectClient, createIntegrationDb, type Db } from './helpers';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

/** drizzle wraps DB errors ('Failed query: …'); the driver message is in cause. */
async function dbError(p: Promise<unknown>): Promise<string> {
	try {
		await p;
	} catch (e) {
		const err = e as { cause?: { message?: string }; message?: string };
		return err.cause?.message ?? err.message ?? String(e);
	}
	return 'NO ERROR THROWN';
}

suite('database foundation (real driver path)', () => {
	let db: Db;

	beforeAll(async () => {
		db = await createIntegrationDb();
		// Idempotent fixture reset (local/non-prod DB only).
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);
	});

	afterAll(async () => {
		await closeDb(db);
	});

	it('migration created all 8 tables', async () => {
		const { rows } = await db.execute(
			sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
		);
		const tables = (rows as { tablename: string }[]).map((r) => r.tablename);
		expect(tables).toEqual(
			expect.arrayContaining([
				'user',
				'session',
				'account',
				'verification',
				'answer_dictionary',
				'daily_puzzles',
				'games',
				'guesses'
			])
		);
	});

	it('NG2: hint_letter CHECK rejects a non-single-uppercase-letter value', async () => {
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word: 'hello', normalizedWord: 'hello' })
			.returning();
		// violates char_length = 1 AND ~ '^[A-Z]$'
		const message = await dbError(
			db
				.insert(schema.dailyPuzzles)
				.values({
					puzzleDate: '2099-01-01',
					answerId: answer.id,
					hintLetter: 'ab',
					expiresAt: new Date('2099-01-02T00:00:00Z')
				})
				.returning()
		);
		expect(message).toMatch(/hint_letter_shape/);
		await db.delete(schema.answerDictionary).where(eq(schema.answerDictionary.id, answer.id));
	});

	it('NG3: UNIQUE(user_id, puzzle_id) — one game per user per puzzle', async () => {
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word: 'grain', normalizedWord: 'grain' })
			.returning();
		const [puzzle] = await db
			.insert(schema.dailyPuzzles)
			.values({
				puzzleDate: '2099-01-02',
				answerId: answer.id,
				hintLetter: 'G',
				expiresAt: new Date('2099-01-03T00:00:00Z')
			})
			.returning();
		const [user] = await db
			.insert(schema.user)
			.values({ id: 'u-ng3-1', name: 'NG3', email: 'ng3@test.dev', emailVerified: true })
			.returning();

		await db.insert(schema.games).values({ userId: user.id, puzzleId: puzzle.id });
		const message = await dbError(
			db.insert(schema.games).values({ userId: user.id, puzzleId: puzzle.id })
		);
		expect(message).toMatch(/duplicate key/);
	});

	it('SELECT ... FOR UPDATE serializes concurrent transactions (real driver)', async () => {
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word: 'stone', normalizedWord: 'stone' })
			.returning();
		const [puzzle] = await db
			.insert(schema.dailyPuzzles)
			.values({
				puzzleDate: '2099-01-03',
				answerId: answer.id,
				hintLetter: 'S',
				expiresAt: new Date('2099-01-04T00:00:00Z')
			})
			.returning();

		// One dedicated connection per transaction (lock semantics require it).
		const connA = await connectClient(db);
		const connB = await connectClient(db);
		try {
			// Transaction A takes the puzzle-row lock and holds it.
			await connA.query('BEGIN');
			await connA.query(`SELECT id FROM daily_puzzles WHERE id = '${puzzle.id}' FOR UPDATE`);
			await connA.query(`UPDATE daily_puzzles SET status = 'ACTIVE' WHERE id = '${puzzle.id}'`);

			// Transaction B waits for the same row lock.
			const bQuery = connB.query(
				`SELECT id, status FROM daily_puzzles WHERE id = '${puzzle.id}' FOR UPDATE`
			);

			// B must not settle while A holds the lock.
			let settled = false;
			await Promise.race([
				bQuery.then(() => {
					settled = true;
				}),
				new Promise((r) => setTimeout(r, 400))
			]);
			expect(settled).toBe(false);

			// A commits → B acquires the lock and sees A's committed change
			// (READ COMMITTED re-evaluation after lock wait — NG9 anchor).
			await connA.query('COMMIT');
			const [row] = (await bQuery).rows as { status: string }[];
			expect(row.status).toBe('ACTIVE');
			await connB.query('COMMIT');
		} finally {
			await connA.release();
			await connB.release();
		}
	});
});