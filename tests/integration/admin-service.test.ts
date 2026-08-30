// Phase-4 S2 — admin puzzle service integration matrix (plan §10.2, I-A1…I-A10)
// against live Neon. Fixture discipline (Phase 3): "today"/future/past dates
// are computed from the DB clock in SQL — never fabricated; serialized
// (fileParallelism: false); lock races made deterministic with
// waitForLockWaiters + a sentinel lock holder (NG9 order-pinning).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/server/db/schema';
import { AppError, ERROR_CODES } from '../../src/server/lib/errors';
import { createGameService } from '../../src/server/game/service';
import { activateToday } from '../../src/server/puzzle/settlement';
import { createAdminPuzzleService } from '../../src/server/admin/service';
import {
	closeDb,
	connectClient,
	createIntegrationDb,
	waitForLockWaiters,
	type Db
} from './helpers';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('admin puzzle service (I-A1…I-A10)', () => {
	let db: Db;
	let admin: ReturnType<typeof createAdminPuzzleService>;
	let gapsLog: string[];

	beforeAll(async () => {
		db = await createIntegrationDb();
	});

	beforeEach(async () => {
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);
		gapsLog = [];
		admin = createAdminPuzzleService(db, { logger: (m) => gapsLog.push(m) });
	});

	afterAll(async () => {
		await closeDb(db);
	});

	/** Today's Asia/Manila date as ISO string (SQL authority). */
	async function todayManila(): Promise<string> {
		const [{ d }] = (
			await db.execute(sql`SELECT ((transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date)::text AS d`)
		).rows as { d: string }[];
		return d;
	}

	/** Date arithmetic on ISO strings (whole days — no timezone pitfalls). */
	function addDays(date: string, days: number): string {
		const d = new Date(`${date}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() + days);
		return d.toISOString().slice(0, 10);
	}

	async function seedAnswer(word: string): Promise<string> {
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word, normalizedWord: word })
			.returning();
		return answer.id;
	}

	async function seedPuzzle(
		puzzleDate: string,
		word: string,
		overrides: Partial<typeof schema.dailyPuzzles.$inferInsert> = {}
	): Promise<{ id: string; answerId: string }> {
		const answerId = await seedAnswer(word);
		const [puzzle] = await db
			.insert(schema.dailyPuzzles)
			.values({
				puzzleDate,
				answerId,
				hintLetter: word[0].toUpperCase(),
				status: 'SCHEDULED',
				expiresAt: new Date('2099-12-31T00:00:00Z'),
				...overrides
			})
			.returning();
		return { id: puzzle.id, answerId };
	}

	async function seedUser(id: string): Promise<string> {
		const [user] = await db
			.insert(schema.user)
			.values({ id, name: 'admin-i', email: `${id}@test.dev`, emailVerified: true })
			.returning();
		return user.id;
	}


	// ─── I-A1: schedule future puzzle ────────────────────────────────────────

	it('I-A1 schedule future puzzle → SCHEDULED row with (date+1) Manila expires_at', async () => {
		const today = await todayManila();
		const future = addDays(today, 3);
		await seedAnswer('river');
		const puzzle = await admin.schedulePuzzle({ puzzleDate: future, word: 'river', hintLetter: 'R' });
		expect(puzzle.status).toBe('SCHEDULED');
		expect(puzzle.date).toBe(future);
		expect(puzzle.word).toBe('river');
		expect(puzzle.hintLetter).toBe('R');
		expect(puzzle.lockedAt).toBeNull();

		const [{ expires_at }] = (
			await db.execute(sql`SELECT expires_at FROM daily_puzzles WHERE id = ${puzzle.id}`)
		).rows as { expires_at: Date }[];
		// (future + 1) AT TIME ZONE 'Asia/Manila' — SQL recomputation authority.
		const [{ expected }] = (
			await db.execute(
				sql`SELECT ((${future}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila') AS expected`
			)
		).rows as { expected: Date }[];
		expect(new Date(expires_at).getTime()).toBe(new Date(expected).getTime());
	});

	// ─── I-A2: scheduling rejections ─────────────────────────────────────────

	it('I-A2 rejects past/today dates (403 NOT_FUTURE)', async () => {
		const today = await todayManila();
		await expect(
			admin.schedulePuzzle({ puzzleDate: today, word: 'river', hintLetter: 'R' })
		).rejects.toMatchObject({ code: ERROR_CODES.NOT_FUTURE, status: 403 });
		await expect(
			admin.schedulePuzzle({ puzzleDate: addDays(today, -1), word: 'river', hintLetter: 'R' })
		).rejects.toMatchObject({ code: ERROR_CODES.NOT_FUTURE, status: 403 });
	});

	it('I-A2 rejects a word not in the approved dictionary (400 ANSWER_NOT_APPROVED)', async () => {
		await seedAnswer('river');
		await expect(
			admin.schedulePuzzle({ puzzleDate: addDays(await todayManila(), 2), word: 'zzzzz', hintLetter: 'Z' })
		).rejects.toMatchObject({ code: ERROR_CODES.ANSWER_NOT_APPROVED, status: 400 });
	});

	it('I-A2 rejects an invalid hint (400 INVALID_HINT) — wrong shape and non-member letter', async () => {
		const future = addDays(await todayManila(), 2);
		await expect(
			admin.schedulePuzzle({ puzzleDate: future, word: 'river', hintLetter: '!!' })
		).rejects.toMatchObject({ code: ERROR_CODES.INVALID_HINT, status: 400 });
		await expect(
			admin.schedulePuzzle({ puzzleDate: future, word: 'river', hintLetter: 'Z' })
		).rejects.toMatchObject({ code: ERROR_CODES.INVALID_HINT, status: 400 });
	});

	it('I-A2 rejects duplicate date (409 DATE_TAKEN) and duplicate answer (409 ANSWER_ALREADY_SCHEDULED)', async () => {
		const future = addDays(await todayManila(), 2);
		await seedAnswer('river');
		await admin.schedulePuzzle({ puzzleDate: future, word: 'river', hintLetter: 'R' });
		// Same date, different approved answer.
		await seedAnswer('about');
		await expect(
			admin.schedulePuzzle({ puzzleDate: future, word: 'about', hintLetter: 'A' })
		).rejects.toMatchObject({ code: ERROR_CODES.DATE_TAKEN, status: 409 });
		// Same answer, different future date.
		await expect(
			admin.schedulePuzzle({ puzzleDate: addDays(future, 1), word: 'river', hintLetter: 'R' })
		).rejects.toMatchObject({ code: ERROR_CODES.ANSWER_ALREADY_SCHEDULED, status: 409 });
	});

	it('I-A2 schedule failures leave no partial rows (I-A10)', async () => {
		const future = addDays(await todayManila(), 2);
		await expect(
			admin.schedulePuzzle({ puzzleDate: future, word: 'zzzzz', hintLetter: 'Z' })
		).rejects.toMatchObject({ code: ERROR_CODES.ANSWER_NOT_APPROVED });
		const [{ n }] = (
			await db.execute(sql`SELECT count(*)::int AS n FROM daily_puzzles`)
		).rows as { n: number }[];
		expect(n).toBe(0);
	});

	// ─── I-A3: edit word/hint ────────────────────────────────────────────────

	it('I-A3 edits word + hint on a future SCHEDULED puzzle; hint revalidated against the new word', async () => {
		const future = addDays(await todayManila(), 2);
		const { id } = await seedPuzzle(future, 'river');
		await seedAnswer('about');
		const { puzzle, gaps } = await admin.updatePuzzle(id, {
			word: 'about',
			hintLetter: 'b'
		});
		expect(puzzle.word).toBe('about');
		expect(puzzle.hintLetter).toBe('B');
		expect(puzzle.date).toBe(future);
		// No date move → no gaps.
		expect(gaps).toEqual([]);
	});

	it('I-A3 edits only the hint (word unchanged); hint must occur in the existing answer', async () => {
		const future = addDays(await todayManila(), 2);
		const { id } = await seedPuzzle(future, 'river');
		const { puzzle } = await admin.updatePuzzle(id, { hintLetter: 'v' });
		expect(puzzle.hintLetter).toBe('V');
		await expect(admin.updatePuzzle(id, { hintLetter: 'X' })).rejects.toMatchObject({
			code: ERROR_CODES.INVALID_HINT,
			status: 400
		});
	});

	it('I-A3 word change to one that omits the persisted hint → 400 INVALID_HINT (invariant preserved)', async () => {
		const future = addDays(await todayManila(), 2);
		const { id } = await seedPuzzle(future, 'river'); // hint R
		await seedAnswer('about'); // no R
		await expect(admin.updatePuzzle(id, { word: 'about' })).rejects.toMatchObject({
			code: ERROR_CODES.INVALID_HINT,
			status: 400
		});
	});

	it('I-A3 locked puzzle → 403 PUZZLE_IMMUTABLE (a started puzzle is immutable)', async () => {
		const future = addDays(await todayManila(), 2);
		const { id } = await seedPuzzle(future, 'river', { lockedAt: new Date() });
		await expect(admin.updatePuzzle(id, { hintLetter: 'V' })).rejects.toMatchObject({
			code: ERROR_CODES.PUZZLE_IMMUTABLE,
			status: 403
		});
	});

	// ─── I-A4: date moves ────────────────────────────────────────────────────

	it('I-A4 date move recomputes expires_at and reports gaps (D7/D9)', async () => {
		const today = await todayManila();
		const from = addDays(today, 10);
		const to = addDays(today, 20);
		const { id } = await seedPuzzle(from, 'river');
		const { puzzle, gaps } = await admin.updatePuzzle(id, { puzzleDate: to });
		expect(puzzle.date).toBe(to);

		const [{ expires_at }] = (
			await db.execute(sql`SELECT expires_at FROM daily_puzzles WHERE id = ${id}`)
		).rows as { expires_at: Date }[];
		const [{ expected }] = (
			await db.execute(sql`SELECT ((${to}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila') AS expected`)
		).rows as { expected: Date }[];
		expect(new Date(expires_at).getTime()).toBe(new Date(expected).getTime());

		// D7 — the vacated date is a gap; the marker is logged.
		expect(gaps).toContain(from);
		expect(gapsLog.some((m) => m.includes('[admin] puzzle gap created dates=') && m.includes(from))).toBe(
			true
		);
	});

	it('I-A4 move onto an occupied date → 409 DATE_TAKEN', async () => {
		const today = await todayManila();
		await seedPuzzle(addDays(today, 2), 'river');
		const { id } = await seedPuzzle(addDays(today, 3), 'about');
		await expect(admin.updatePuzzle(id, { puzzleDate: addDays(today, 2) })).rejects.toMatchObject({
			code: ERROR_CODES.DATE_TAKEN,
			status: 409
		});
	});

	it('I-A4 move to past/today → 403 NOT_FUTURE', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(addDays(today, 2), 'river');
		await expect(admin.updatePuzzle(id, { puzzleDate: today })).rejects.toMatchObject({
			code: ERROR_CODES.NOT_FUTURE,
			status: 403
		});
		await expect(admin.updatePuzzle(id, { puzzleDate: addDays(today, -1) })).rejects.toMatchObject({
			code: ERROR_CODES.NOT_FUTURE,
			status: 403
		});
	});

	// ─── I-A5: delete ────────────────────────────────────────────────────────

	it('I-A5 deletes a future SCHEDULED puzzle and reports the vacated date', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(addDays(today, 2), 'river');
		const { deleted, gaps } = await admin.deletePuzzle(id);
		expect(deleted).toBe(true);
		expect(gaps).toEqual([addDays(today, 2)]);
		expect(gapsLog.some((m) => m.includes('[admin] puzzle gap created dates='))).toBe(true);
		const [{ n }] = (
			await db.execute(sql`SELECT count(*)::int AS n FROM daily_puzzles`)
		).rows as { n: number }[];
		expect(n).toBe(0);
	});

	it.each([
		['ACTIVE', 'ACTIVE' as const],
		['FINALIZED', 'FINALIZED' as const]
	])('I-A5 delete of a %s puzzle → 403 PUZZLE_IMMUTABLE', async (_label, status) => {
		const { id } = await seedPuzzle(addDays(await todayManila(), 2), 'river', { status });
		await expect(admin.deletePuzzle(id)).rejects.toMatchObject({
			code: ERROR_CODES.PUZZLE_IMMUTABLE,
			status: 403
		});
	});

	it('I-A5 delete of a locked puzzle → 403 PUZZLE_IMMUTABLE', async () => {
		const { id } = await seedPuzzle(addDays(await todayManila(), 2), 'river', { lockedAt: new Date() });
		await expect(admin.deletePuzzle(id)).rejects.toMatchObject({
			code: ERROR_CODES.PUZZLE_IMMUTABLE,
			status: 403
		});
	});

	it('I-A5 delete of today\'s SCHEDULED puzzle → 403 (replacement is the only path)', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(today, 'river');
		await expect(admin.deletePuzzle(id)).rejects.toMatchObject({
			code: ERROR_CODES.NOT_FUTURE,
			status: 403
		});
	});

	it('I-A5 delete of a past puzzle → 403', async () => {
		const { id } = await seedPuzzle(addDays(await todayManila(), -3), 'river', { status: 'FINALIZED' });
		await expect(admin.deletePuzzle(id)).rejects.toMatchObject({ status: 403 });
	});

	// ─── I-A6: same-day replacement ──────────────────────────────────────────

	it('I-A6 replaces today\'s SCHEDULED puzzle: word + hint updated, expires_at = today+1 Manila', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(today, 'river');
		await seedAnswer('about');
		const puzzle = await admin.replaceTodayPuzzle(id, { word: 'about', hintLetter: 'b' });
		expect(puzzle.word).toBe('about');
		expect(puzzle.hintLetter).toBe('B');
		expect(puzzle.status).toBe('SCHEDULED');
		// Still ONE row — in-place update, never delete+reschedule.
		const [{ n }] = (
			await db.execute(
				sql`SELECT count(*)::int AS n FROM daily_puzzles WHERE puzzle_date = ${today}`
			)
		).rows as { n: number }[];
		expect(n).toBe(1);
		const [{ expires_at }] = (
			await db.execute(sql`SELECT expires_at FROM daily_puzzles WHERE id = ${id}`)
		).rows as { expires_at: Date }[];
		const [{ expected }] = (
			await db.execute(sql`SELECT ((${today}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila') AS expected`)
		).rows as { expected: Date }[];
		expect(new Date(expires_at).getTime()).toBe(new Date(expected).getTime());
		// No gap marker for a replacement (no transient gap).
		expect(gapsLog.some((m) => m.includes('[admin] puzzle gap'))).toBe(false);
	});

	it('I-A6 replace after a player started (locked) → 403 PUZZLE_IMMUTABLE', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(today, 'river');
		await seedUser('u-replace-locked');
		const gameService = createGameService(db);
		await gameService.startGame('u-replace-locked'); // lazy activation + lock
		await seedAnswer('about');
		await expect(
			admin.replaceTodayPuzzle(id, { word: 'about', hintLetter: 'A' })
		).rejects.toMatchObject({ code: ERROR_CODES.PUZZLE_IMMUTABLE, status: 403 });
	});

	it('I-A6 replace after activateToday (ACTIVE) → 403 PUZZLE_IMMUTABLE', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(today, 'river');
		const activation = await activateToday(db);
		expect(activation.activatedToday).toBe(true);
		await seedAnswer('about');
		await expect(
			admin.replaceTodayPuzzle(id, { word: 'about', hintLetter: 'A' })
		).rejects.toMatchObject({ code: ERROR_CODES.PUZZLE_IMMUTABLE, status: 403 });
	});

	it('I-A6 replace after finalize → 403 PUZZLE_IMMUTABLE', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(today, 'river', { status: 'FINALIZED' });
		await seedAnswer('about');
		await expect(
			admin.replaceTodayPuzzle(id, { word: 'about', hintLetter: 'A' })
		).rejects.toMatchObject({ code: ERROR_CODES.PUZZLE_IMMUTABLE, status: 403 });
	});

	it('I-A6 replace of a NON-today puzzle → 403 INVALID_STATE (replacement is today-only)', async () => {
		const { id } = await seedPuzzle(addDays(await todayManila(), 2), 'river');
		await seedAnswer('about');
		await expect(
			admin.replaceTodayPuzzle(id, { word: 'about', hintLetter: 'A' })
		).rejects.toMatchObject({ code: ERROR_CODES.INVALID_STATE, status: 403 });
	});

	// ─── I-A7: lock-order races (NG9 discipline, deterministic) ──────────────

	it('I-A7 race: startGame wins the lock first → replace fails closed (PUZZLE_IMMUTABLE), game intact', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(today, 'river');
		await seedUser('u-race-start');
		await seedAnswer('about');
		const gameService = createGameService(db);

		// Sentinel holds the puzzle-row lock; queue startGame FIRST, then
		// replace. Lock grant order = request order → startGame wins.
		const sentinel = await connectClient(db);
		try {
			await sentinel.query('BEGIN');
			await sentinel.query(`SELECT id FROM daily_puzzles WHERE id = '${id}' FOR UPDATE`);

			const startPromise = gameService.startGame('u-race-start');
			await waitForLockWaiters(db, 1);
			const replacePromise = admin.replaceTodayPuzzle(id, {
				word: 'about',
				hintLetter: 'A'
			});
			await waitForLockWaiters(db, 2);
			await sentinel.query('COMMIT');

			const startResult = await startPromise;
			expect(startResult.puzzle.id).toBe(id);
			await expect(replacePromise).rejects.toMatchObject({
				code: ERROR_CODES.PUZZLE_IMMUTABLE,
				status: 403
			});
		} finally {
			await sentinel.release();
		}
		// Row stayed ACTIVE with the ORIGINAL answer; exactly one game.
		const [{ status, answer_id, locked_at }] = (
			await db.execute(sql`SELECT status, answer_id, locked_at FROM daily_puzzles WHERE id = ${id}`)
		).rows as { status: string; answer_id: string; locked_at: unknown }[];
		expect(status).toBe('ACTIVE');
		expect(locked_at).not.toBeNull();
		const [{ g }] = (
			await db.execute(sql`SELECT count(*)::int AS g FROM games WHERE puzzle_id = ${id}`)
		).rows as { g: number }[];
		expect(g).toBe(1);
		const [{ word }] = (
			await db.execute(sql`SELECT word FROM answer_dictionary WHERE id = ${answer_id}`)
		).rows as { word: string }[];
		expect(word).toBe('river');
	});

	it('I-A7 race: replace wins the lock first → startGame activates the REPLACED puzzle (no corruption)', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(today, 'river');
		await seedUser('u-race-replace');
		await seedAnswer('about');
		const gameService = createGameService(db);

		const sentinel = await connectClient(db);
		try {
			await sentinel.query('BEGIN');
			await sentinel.query(`SELECT id FROM daily_puzzles WHERE id = '${id}' FOR UPDATE`);

			// replace queued FIRST, then startGame.
			const replacePromise = admin.replaceTodayPuzzle(id, {
				word: 'about',
				hintLetter: 'A'
			});
			await waitForLockWaiters(db, 1);
			const startPromise = gameService.startGame('u-race-replace');
			await waitForLockWaiters(db, 2);
			await sentinel.query('COMMIT');

			const replaced = await replacePromise;
			expect(replaced.word).toBe('about');
			// startGame then activates the replaced row and creates the game.
			const game = await startPromise;
			expect(game.puzzle.id).toBe(id);
			expect(game.status).toBe('ACTIVE');
		} finally {
			await sentinel.release();
		}
		// Final state: ACTIVE + locked; the game's answer is the NEW word.
		const [{ word }] = (
			await db.execute(sql`
				SELECT w.word FROM daily_puzzles p
				JOIN answer_dictionary w ON w.id = p.answer_id
				WHERE p.id = ${id}
			`)
		).rows as { word: string }[];
		expect(word).toBe('about');
	});

	it('I-A7 race: delete vs activateToday on today\'s row — delete always fails closed, activation wins', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(today, 'river');
		const sentinel = await connectClient(db);
		try {
			await sentinel.query('BEGIN');
			await sentinel.query(`SELECT id FROM daily_puzzles WHERE id = '${id}' FOR UPDATE`);

			// activateToday queued first, delete second.
			const activatePromise = activateToday(db);
			await waitForLockWaiters(db, 1);
			const deletePromise = admin.deletePuzzle(id);
			await waitForLockWaiters(db, 2);
			await sentinel.query('COMMIT');

			const activation = await activatePromise;
			expect(activation.activatedToday).toBe(true);
			await expect(deletePromise).rejects.toMatchObject({ status: 403 });
		} finally {
			await sentinel.release();
		}
		const [{ status }] = (
			await db.execute(sql`SELECT status FROM daily_puzzles WHERE id = ${id}`)
		).rows as { status: string }[];
		expect(status).toBe('ACTIVE');
	});

	it('I-A7 race: two concurrent schedules of the same date — exactly one wins, the loser gets 409 DATE_TAKEN', async () => {
		const future = addDays(await todayManila(), 4);
		await seedAnswer('river');
		await seedAnswer('about');
		const results = await Promise.allSettled([
			admin.schedulePuzzle({ puzzleDate: future, word: 'river', hintLetter: 'R' }),
			admin.schedulePuzzle({ puzzleDate: future, word: 'about', hintLetter: 'A' })
		]);
		const fulfilled = results.filter((r) => r.status === 'fulfilled');
		const rejected = results.filter((r) => r.status === 'rejected');
		expect(fulfilled.length).toBe(1);
		expect(rejected.length).toBe(1);
		const err = (rejected[0] as PromiseRejectedResult).reason as AppError;
		expect(err).toBeInstanceOf(AppError);
		// Either the pre-check or the UNIQUE constraint fired — both map to 409.
		expect(err.code).toBe(ERROR_CODES.DATE_TAKEN);
		expect(err.status).toBe(409);
		const [{ n }] = (
			await db.execute(sql`SELECT count(*)::int AS n FROM daily_puzzles WHERE puzzle_date = ${future}`)
		).rows as { n: number }[];
		expect(n).toBe(1);
	});

	it('I-A7 race: two concurrent schedules of the same answer — exactly one wins, the loser gets 409 ANSWER_ALREADY_SCHEDULED', async () => {
		const today = await todayManila();
		await seedAnswer('river');
		const results = await Promise.allSettled([
			admin.schedulePuzzle({ puzzleDate: addDays(today, 5), word: 'river', hintLetter: 'R' }),
			admin.schedulePuzzle({ puzzleDate: addDays(today, 6), word: 'river', hintLetter: 'R' })
		]);
		const fulfilled = results.filter((r) => r.status === 'fulfilled');
		const rejected = results.filter((r) => r.status === 'rejected');
		expect(fulfilled.length).toBe(1);
		expect(rejected.length).toBe(1);
		const err = (rejected[0] as PromiseRejectedResult).reason as AppError;
		expect(err.code).toBe(ERROR_CODES.ANSWER_ALREADY_SCHEDULED);
		expect(err.status).toBe(409);
		const [{ n }] = (
			await db.execute(sql`SELECT count(*)::int AS n FROM daily_puzzles WHERE answer_id IS NOT NULL`)
		).rows as { n: number }[];
		expect(n).toBe(1);
	});

	// ─── I-A8: gap reporting ─────────────────────────────────────────────────

	it('I-A8 gap marker format contains the structured prefix + dates; settlement marker unchanged', async () => {
		const today = await todayManila();
		const { id } = await seedPuzzle(addDays(today, 2), 'river');
		await admin.deletePuzzle(id);
		expect(gapsLog).toHaveLength(1);
		expect(gapsLog[0]).toMatch(/^\[admin\] puzzle gap created dates=\d{4}-\d{2}-\d{2}$/);
		// The settlement marker itself is untouched (operational detector).
		const { missingPuzzleMarker } = await import('../../src/server/puzzle/settlement');
		expect(missingPuzzleMarker(today)).toBe(`[settlement] missing puzzle for date=${today}`);
	});

	// ─── I-A9: list window ───────────────────────────────────────────────────

	it('I-A9 list window filters + orders by puzzle_date; defaults cover the D4 window', async () => {
		const today = await todayManila();
		// Two puzzles: one far-past (outside defaults), two inside.
		await seedPuzzle(addDays(today, -300), 'river');
		await seedPuzzle(addDays(today, 1), 'about');
		await seedPuzzle(addDays(today, 31), 'light'); // > today+30 but < today+90
		const all = await admin.listPuzzles();
		const dates = all.map((p) => p.date);
		expect(dates).toEqual([...dates].sort());
		expect(dates).toContain(addDays(today, 1));
		expect(dates).toContain(addDays(today, 31));
		expect(dates).not.toContain(addDays(today, -300));

		// Explicit window.
		const explicit = await admin.listPuzzles(addDays(today, -301), addDays(today, -299));
		expect(explicit.map((p) => p.date)).toEqual([addDays(today, -300)]);
		expect(explicit[0].word).toBe('river');
	});

	it('I-A9 invalid windows are rejected (400 INVALID_DATE_WINDOW / BAD_REQUEST)', async () => {
		const today = await todayManila();
		await expect(admin.listPuzzles('not-a-date', today)).rejects.toMatchObject({
			code: ERROR_CODES.INVALID_DATE_WINDOW,
			status: 400
		});
		await expect(admin.listPuzzles(addDays(today, 5), addDays(today, 2))).rejects.toMatchObject({
			code: ERROR_CODES.INVALID_DATE_WINDOW,
			status: 400
		});
		await expect(admin.listPuzzles(addDays(today, -200), addDays(today, 200))).rejects.toMatchObject({
			code: ERROR_CODES.INVALID_DATE_WINDOW,
			status: 400
		});
	});

	// ─── I-A10: validate is read-only ────────────────────────────────────────

	it('I-A10 validateWord never mutates and reports D5 states', async () => {
		const today = await todayManila();
		await seedPuzzle(today, 'river', { status: 'FINALIZED' });
		await seedAnswer('about');
		const before = (await db.execute(sql`SELECT count(*)::int AS n FROM daily_puzzles`)).rows[0] as {
			n: number;
		};

		expect(await admin.validateWord('river')).toEqual({
			approved: true,
			previouslyUsed: true,
			usedOn: today
		});
		expect(await admin.validateWord('about')).toEqual({
			approved: true,
			previouslyUsed: false,
			usedOn: null
		});
		expect(await admin.validateWord('zzzzz')).toEqual({
			approved: false,
			previouslyUsed: null,
			usedOn: null
		});
		expect(await admin.validateWord('not-a-word')).toEqual({
			approved: false,
			previouslyUsed: null,
			usedOn: null
		});

		const after = (await db.execute(sql`SELECT count(*)::int AS n FROM daily_puzzles`)).rows[0] as {
			n: number;
		};
		expect(after.n).toBe(before.n);
	});
});