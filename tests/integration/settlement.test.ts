// Phase-3 settlement integration coverage (plan §11.2: I1–I5, I15, I16) —
// real Neon semantics: finalization with FORFEITED conversion + frozen
// averages, idempotent re-entry, zero-completion NULLs, cron activation
// (incl. fail-closed missing puzzle), the FOR UPDATE SKIP LOCKED sweep,
// the midnight/boundary sweep, and raw-facts retention. Existing NG9 A/B
// lock-order suite (midnight-lock-order.test.ts) stays untouched.
//
// Fixtures derive dates from the DB clock (transaction_timestamp() AT TIME
// ZONE 'Asia/Manila') — never from the test machine's clock (plan §10.3).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../src/server/db/schema';
import { createGameService } from '../../src/server/game/service';
import { createPuzzleService } from '../../src/server/puzzle/finalize';
import { activateToday, finalizeExpired, missingPuzzleMarker, runSettlement } from '../../src/server/puzzle/settlement';
import { closeDb, createIntegrationDb, type Db } from './helpers';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('settlement (real Neon: finalize/activate/sweep)', () => {
	let db: Db;
	let puzzleService: ReturnType<typeof createPuzzleService>;
	let wordCounter = 0;

	beforeAll(async () => {
		db = await createIntegrationDb();
		puzzleService = createPuzzleService(db);
	});

	beforeEach(async () => {
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);
	});

	afterAll(async () => {
		await closeDb(db);
	});

	/** Manila-today from the DB clock (the same anchor the domain uses). */
	async function todayManila(): Promise<string> {
		const [{ d }] = (
			await db.execute(sql`SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date::text AS d`)
		).rows as { d: string }[];
		return d;
	}

	/** Manila date offset in days from today (DB-clock derived). */
	async function manilaDateOffset(offsetDays: number): Promise<string> {
		const [row] = (
			await db.execute(
				sql`SELECT ((transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date + ${offsetDays}::int)::text AS d`
			)
		).rows as { d: string }[];
		return row.d;
	}

	async function insertUser(id: string, name = 'P1') {
		const [user] = await db
			.insert(schema.user)
			.values({ id, name, email: `${id}@test.dev`, emailVerified: true })
			.returning();
		return user;
	}

	async function insertPuzzle(
		date: string,
		opts: {
			status?: 'SCHEDULED' | 'ACTIVE' | 'FINALIZED';
			expiresAt?: ReturnType<typeof sql> | Date;
			averageCompletionTimeMs?: number | null;
			nonCompletionPenaltyMs?: number | null;
		} = {}
	) {
		const word = `f${String(++wordCounter).padStart(4, '0')}`;
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word, normalizedWord: word })
			.returning();
		const [puzzle] = await db
			.insert(schema.dailyPuzzles)
			.values({
				puzzleDate: date,
				answerId: answer.id,
				hintLetter: word[0].toUpperCase(),
				status: opts.status ?? 'ACTIVE',
				...(opts.expiresAt ? { expiresAt: opts.expiresAt } : { expiresAt: new Date('2099-12-31T00:00:00Z') }),
				...(opts.averageCompletionTimeMs !== undefined ? { averageCompletionTimeMs: opts.averageCompletionTimeMs } : {}),
				...(opts.nonCompletionPenaltyMs !== undefined ? { nonCompletionPenaltyMs: opts.nonCompletionPenaltyMs } : {}),
				...(opts.status === 'FINALIZED' ? { finalizedAt: sql`transaction_timestamp()` } : {})
			})
			.returning();
		return puzzle;
	}

	async function insertGame(
		userId: string,
		puzzleId: string,
		opts: {
			status?: 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'FORFEITED';
			completionTimeMs?: number | null;
			guessCount?: number;
			completedAt?: ReturnType<typeof sql> | Date | null;
			startedAt?: ReturnType<typeof sql> | Date;
		} = {}
	) {
		const [game] = await db
			.insert(schema.games)
			.values({
				userId,
				puzzleId,
				status: opts.status ?? 'ACTIVE',
				...(opts.completionTimeMs !== undefined ? { completionTimeMs: opts.completionTimeMs } : {}),
				...(opts.guessCount !== undefined ? { guessCount: opts.guessCount } : {}),
				...(opts.completedAt !== undefined ? { completedAt: opts.completedAt } : {}),
				...(opts.startedAt ? { startedAt: opts.startedAt } : {})
			})
			.returning();
		return game;
	}

	// ─── I1: finalization semantics ────────────────────────────────────────────

	it('I1: ACTIVE+expired → FORFEITED conversions; frozen averages from COMPLETED only; penalty = avg + 20 min; transaction_timestamp() stamp', async () => {
		const today = await todayManila();
		const puzzle = await insertPuzzle(today, { status: 'ACTIVE' });
		const [u1, u2, u3] = await Promise.all([insertUser('u1'), insertUser('u2'), insertUser('u3')]);
		// One COMPLETED (real elapsed), one ACTIVE (→ FORFEITED), one FAILED (stays).
		await insertGame(u1.id, puzzle.id, {
			status: 'COMPLETED',
			completionTimeMs: 30_000,
			guessCount: 4,
			completedAt: sql`transaction_timestamp() - interval '5 minutes'`
		});
		await insertGame(u2.id, puzzle.id, { status: 'ACTIVE', guessCount: 2 });
		await insertGame(u3.id, puzzle.id, { status: 'FAILED', guessCount: 6 });

		const res = await puzzleService.finalizePuzzle(puzzle.id);

		expect(res.status).toBe('FINALIZED');
		expect(res.alreadyFinalized).toBe(false);
		expect(res.forfeitedCount).toBe(1);
		expect(res.completedCount).toBe(1);
		expect(res.averageCompletionTimeMs).toBe(30_000);
		expect(res.nonCompletionPenaltyMs).toBe(30_000 + 20 * 60 * 1000);

		const [{ n }] = (
			await db.execute(sql`SELECT count(*)::int AS n FROM games WHERE status = 'FORFEITED'`)
		).rows as { n: number }[];
		expect(n).toBe(1); // exactly the ACTIVE game, not the FAILED one

		const [{ finalized_at }] = (
			await db.execute(sql`SELECT finalized_at FROM daily_puzzles WHERE id = ${puzzle.id}`)
		).rows as { finalized_at: string | Date }[];
		// Raw db.execute returns timestamps as strings on the Neon path —
		// assert a parseable, non-null instant (drizzle reads return Dates).
		expect(new Date(String(finalized_at)).getTime()).toBeGreaterThan(0);
		// Frozen values persisted.
		const [row] = await db.select().from(schema.dailyPuzzles).where(sql`id = ${puzzle.id}`);
		expect(row.averageCompletionTimeMs).toBe(30_000);
		expect(row.nonCompletionPenaltyMs).toBe(30_000 + 20 * 60 * 1000);
	});

	// ─── I2: idempotent finalization ───────────────────────────────────────────

	it('I2: second finalize → alreadyFinalized, zero writes, same frozen values', async () => {
		const today = await todayManila();
		const puzzle = await insertPuzzle(today);
		await insertUser('u1');
		await insertGame('u1', puzzle.id, {
			status: 'COMPLETED',
			completionTimeMs: 45_000,
			guessCount: 5,
			completedAt: sql`transaction_timestamp() - interval '3 minutes'`
		});

		const first = await puzzleService.finalizePuzzle(puzzle.id);
		const second = await puzzleService.finalizePuzzle(puzzle.id);

		expect(second.alreadyFinalized).toBe(true);
		expect(second.averageCompletionTimeMs).toBe(first.averageCompletionTimeMs);
		expect(second.nonCompletionPenaltyMs).toBe(first.nonCompletionPenaltyMs);
		expect(second.forfeitedCount).toBe(first.forfeitedCount);
		expect(second.completedCount).toBe(first.completedCount);
		expect(second.finalizedAt).toEqual(first.finalizedAt);

		// Zero writes on re-entry: still one COMPLETED + one FORFEITED-less state.
		const [{ n }] = (
			await db.execute(sql`SELECT count(*)::int AS n FROM games WHERE status = 'FORFEITED'`)
		).rows as { n: number }[];
		expect(n).toBe(0);
	});

	// ─── I3: zero-completion day ───────────────────────────────────────────────

	it('I3: zero-completion day → averages NULL; finalize still finalizes', async () => {
		const today = await todayManila();
		const puzzle = await insertPuzzle(today);
		await insertUser('u1');
		await insertGame('u1', puzzle.id, { status: 'ACTIVE' });

		const res = await puzzleService.finalizePuzzle(puzzle.id);

		expect(res.averageCompletionTimeMs).toBeNull();
		expect(res.nonCompletionPenaltyMs).toBeNull();
		expect(res.forfeitedCount).toBe(1);
		const [row] = await db.select().from(schema.dailyPuzzles).where(sql`id = ${puzzle.id}`);
		expect(row.status).toBe('FINALIZED');
		expect(row.averageCompletionTimeMs).toBeNull();
		expect(row.nonCompletionPenaltyMs).toBeNull();
	});

	// ─── I4: activation semantics ──────────────────────────────────────────────

	it('I4a: activateToday SCHEDULED → ACTIVE (cron path)', async () => {
		const today = await todayManila();
		await insertPuzzle(today, { status: 'SCHEDULED' });

		const res = await activateToday(db);
		expect(res).toEqual({ activatedToday: true, alreadyActive: false, missingToday: false });

		const [row] = await db.select().from(schema.dailyPuzzles).where(sql`puzzle_date = ${today}`);
		expect(row?.status).toBe('ACTIVE');
	});

	it('I4b: activateToday no-op when already ACTIVE', async () => {
		const today = await todayManila();
		await insertPuzzle(today, { status: 'ACTIVE' });

		const res = await activateToday(db);
		expect(res).toEqual({ activatedToday: false, alreadyActive: true, missingToday: false });
		const [row] = await db.select().from(schema.dailyPuzzles).where(sql`puzzle_date = ${today}`);
		expect(row?.status).toBe('ACTIVE');
	});

	it('I4c: activateToday missing row → missingToday + structured marker, no fabricated puzzle', async () => {
		const log = vi.fn();
		const today = await todayManila();

		const res = await activateToday(db, log);

		expect(res).toEqual({ activatedToday: false, alreadyActive: false, missingToday: true });
		expect(log).toHaveBeenCalledTimes(1);
		expect(String(log.mock.calls[0][0])).toBe(missingPuzzleMarker(today));

		const [{ n }] = (
			await db.execute(sql`SELECT count(*)::int AS n FROM daily_puzzles`)
		).rows as { n: number }[];
		expect(n).toBe(0); // nothing fabricated
	});

	// ─── I5: sweep semantics ───────────────────────────────────────────────────

	it('I5a: sweep finalizes multiple expired ACTIVE puzzles in one run; expired-but-SCHEDULED and already-FINALIZED untouched', async () => {
		// One puzzle per Asia/Manila date (UNIQUE) — use distinct dates.
		const p1Date = await manilaDateOffset(0); // today — expired-ACTIVE with a completion
		const p2Date = await manilaDateOffset(-1); // yesterday — expired-ACTIVE with a live game
		const scheduledDate = await manilaDateOffset(-2); // expired but SCHEDULED — untouched
		const finalizedDate = await manilaDateOffset(-3); // already FINALIZED — skipped
		const p1 = await insertPuzzle(p1Date, { expiresAt: sql`transaction_timestamp() - interval '1 minute'` });
		const p2 = await insertPuzzle(p2Date, { expiresAt: sql`transaction_timestamp() - interval '2 minutes'` });
		await insertPuzzle(scheduledDate, {
			status: 'SCHEDULED',
			expiresAt: sql`transaction_timestamp() - interval '3 minutes'`
		});
		await insertPuzzle(finalizedDate, {
			status: 'FINALIZED',
			averageCompletionTimeMs: 10_000,
			nonCompletionPenaltyMs: 1_210_000
		});
		await insertUser('u1');
		await insertGame('u1', p1.id, { status: 'COMPLETED', completionTimeMs: 20_000, guessCount: 3 });
		await insertGame('u1', p2.id, { status: 'ACTIVE' });

		const results = await finalizeExpired(db);

		expect(results.map((r) => r.puzzleId).sort()).toEqual([p1.id, p2.id].sort());
		expect(results.find((r) => r.puzzleId === p1.id)).toMatchObject({ alreadyFinalized: false, completedCount: 1, forfeitedCount: 0 });
		expect(results.find((r) => r.puzzleId === p2.id)).toMatchObject({ alreadyFinalized: false, completedCount: 0, forfeitedCount: 1 });

		const statuses = (
			await db.execute(sql`SELECT puzzle_date, status FROM daily_puzzles ORDER BY puzzle_date, status`)
		).rows as { puzzle_date: string; status: string }[];
		expect(statuses.filter((s) => s.status === 'ACTIVE')).toHaveLength(0);
		expect(statuses.filter((s) => s.status === 'FINALIZED')).toHaveLength(3);
		expect([...results.map((r) => r.puzzleDate)].sort()).toEqual([p1Date, p2Date].sort());
	});

	it('I5b: sweep leaves future-expiry ACTIVE (today) untouched — a concurrent startGame stays safe', async () => {
		const today = await todayManila();
		await insertPuzzle(today, { status: 'ACTIVE' }); // future expiry (default 2099)
		await insertUser('u1');

		const results = await finalizeExpired(db);
		expect(results).toEqual([]);

		const [row] = await db.select().from(schema.dailyPuzzles).where(sql`puzzle_date = ${today}`);
		expect(row?.status).toBe('ACTIVE');
	});

	it('I5c: concurrent sweep + guess serialize on the puzzle row (SKIP LOCKED sweep + idempotent finalizePuzzle — NG9 discipline preserved)', async () => {
		const today = await todayManila();
		const puzzle = await insertPuzzle(today, { expiresAt: sql`transaction_timestamp() - interval '1 minute'` });
		await insertUser('u1');
		const game = await insertGame('u1', puzzle.id, { status: 'ACTIVE' });

		// Two concurrent sweeps + a concurrent guess: the sweep's SKIP LOCKED
		// selection and finalizePuzzle's puzzle-row serialization guarantee
		// exactly ONE real finalization; the guess can never succeed against
		// an expired/FINALIZED puzzle (it serializes behind the same lock).
		const [a, b, guessOutcome] = await Promise.all([
			finalizeExpired(db),
			finalizeExpired(db),
			createGameService(db).submitGuess('u1', game.id, 'light').catch((e: unknown) => e)
		]);

		const finalizations = [...a, ...b];
		expect(finalizations.length).toBeGreaterThanOrEqual(1);
		expect(new Set(finalizations.map((r) => r.puzzleId))).toEqual(new Set([puzzle.id]));
		expect(finalizations.filter((r) => !r.alreadyFinalized)).toHaveLength(1);

		const [row] = await db.select().from(schema.dailyPuzzles).where(sql`id = ${puzzle.id}`);
		expect(row?.status).toBe('FINALIZED');

		// The guess observed the expired/FINALIZED puzzle under the lock and
		// was rejected — an AppError (GAME_EXPIRED), never a completion.
		expect(guessOutcome).toBeInstanceOf(Error);
	});

	// ─── I15: midnight boundary (one run) ──────────────────────────────────────

	it('I15: puzzle whose expires_at crosses now (SQL-constructed) is swept at the boundary; today (future expiry) is not', async () => {
		const today = await todayManila();
		const yesterday = ((
			await db.execute(sql`SELECT (${today}::date - 1)::text AS d`)
		).rows as { d: string }[])[0].d;
		// Boundary case: expires exactly at transaction start minus epsilon —
		// `expires_at <= transaction_timestamp()` must fire (constructed via
		// SQL so the DB clock decides, never the test machine).
		const boundary = await insertPuzzle(yesterday, {
			expiresAt: sql`transaction_timestamp() - interval '1 millisecond'`
		});
		await insertPuzzle(today, { status: 'ACTIVE' }); // future expiry — untouched
		await insertUser('u1');
		await insertGame('u1', boundary.id, { status: 'COMPLETED', completionTimeMs: 60_000, guessCount: 6 });

		const results = await finalizeExpired(db);

		expect(results.map((r) => r.puzzleId)).toEqual([boundary.id]);
		const [row] = await db.select().from(schema.dailyPuzzles).where(sql`id = ${boundary.id}`);
		expect(row?.status).toBe('FINALIZED');
		const [todayRow] = await db.select().from(schema.dailyPuzzles).where(sql`puzzle_date = ${today}`);
		expect(todayRow?.status).toBe('ACTIVE');
	});

	// ─── I16: raw-facts retention ──────────────────────────────────────────────

	it('I16: FORFEITED conversion never touches raw facts (guess_count/timestamps/times)', async () => {
		const today = await todayManila();
		const puzzle = await insertPuzzle(today);
		await insertUser('u1');
		const game = await insertGame('u1', puzzle.id, {
			status: 'ACTIVE',
			guessCount: 2,
			startedAt: sql`transaction_timestamp() - interval '10 minutes'`
		});
		const before = (await db.select().from(schema.games).where(sql`id = ${game.id}`))[0];

		await puzzleService.finalizePuzzle(puzzle.id);

		const after = (await db.select().from(schema.games).where(sql`id = ${game.id}`))[0];
		expect(after.status).toBe('FORFEITED');
		expect(after.guessCount).toBe(before.guessCount); // raw guess count untouched
		expect(after.startedAt).toEqual(before.startedAt);
		expect(after.completedAt).toBeNull();
		expect(after.completionTimeMs).toBeNull();
		expect(after.createdAt).toEqual(before.createdAt);
	});

	// ─── runSettlement orchestration (real DB path) ───────────────────────────

	it('runSettlement: sweep then activation in one cron shot; missing today reported', async () => {
		const today = await todayManila();
		// Expired ACTIVE from yesterday (missed cron) + today SCHEDULED.
		const yesterday = ((
			await db.execute(sql`SELECT (${today}::date - 1)::text AS d`)
		).rows as { d: string }[])[0].d;
		await insertPuzzle(yesterday, { expiresAt: sql`transaction_timestamp() - interval '1 hour'` });
		const todayPuzzle = await insertPuzzle(today, { status: 'SCHEDULED' });
		await insertUser('u1');
		await insertGame('u1', todayPuzzle.id, { status: 'FAILED', guessCount: 6 });

		const report = await runSettlement(db);

		expect(report.finalized).toHaveLength(1);
		expect(report.activatedToday).toBe(true);
		expect(report.missingToday).toBe(false);

		const [{ yesterdayStatus }] = (
			await db.execute(sql`SELECT (SELECT status FROM daily_puzzles WHERE puzzle_date = ${yesterday}) AS "yesterdayStatus"`)
		).rows as { yesterdayStatus: string }[];
		expect(yesterdayStatus).toBe('FINALIZED');

		// The FAILED game stayed FAILED (raw facts) with the today puzzle ACTIVE.
		const [todayRow] = await db.select().from(schema.dailyPuzzles).where(sql`puzzle_date = ${today}`);
		expect(todayRow?.status).toBe('ACTIVE');
		const [{ failed }] = (
			await db.execute(sql`SELECT count(*)::int AS failed FROM games WHERE status = 'FAILED'`)
		).rows as { failed: number }[];
		expect(failed).toBe(1);
	});
});