// Phase-3 leaderboard integration coverage (plan §11.2: I6–I14) — real Neon
// semantics through the REAL service: today/yesterday boards (completed-only,
// dense ranks, ties, viewer rank beyond the cutoff), week/month aggregation
// (frozen penalties for FAILED/FORFEITED/MISSED-by-absence, today
// completed-only, rounding, qualification, ranking determinism, tiebreaker
// day set incl. today participation, lazy finalization).
//
// Calendar adaptation (fixture necessity — NOT a semantics change): the day
// frames are anchored to the DB clock (transaction_timestamp() AT TIME ZONE
// 'Asia/Manila'); a test cannot fabricate "today". The weekly frame holds at
// most `dowIndex` past days (Mon=0..Sun=6) and the monthly frame at most
// `dayOfMonth - 1`. Qualification needs `completedDays >= threshold`
// (PROVISIONAL 3/week, 8/month), so full aggregation math is observable only
// when the frame hosts enough finalized days (a fixture may also mark TODAY
// FINALIZED — "after finalization the day is just another finalized day" —
// which is a legitimate domain state and adds one more finalized day).
// Tests therefore compute frame capability in SQL and assert the deepest
// semantics the calendar allows, ALWAYS asserting the scored-level facts
// (completedDays, the empty-board rule) — never a silent skip.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/server/db/schema';
import {
	MONTHLY_QUALIFICATION_COMPLETED_DAYS,
	WEEKLY_QUALIFICATION_COMPLETED_DAYS,
	type LeaderboardPeriod
} from '../../src/server/leaderboard/constants';
import { createLeaderboardService, type LeaderboardResponse } from '../../src/server/leaderboard/service';
import { NON_COMPLETION_PENALTY_MS } from '../../src/server/puzzle/manila';
import { createPuzzleService } from '../../src/server/puzzle/finalize';
import { closeDb, createIntegrationDb, type Db } from './helpers';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

type FrameStats = {
	today: string;
	/** ISO dow − 1: Monday = 0 … Sunday = 6. */
	dowIndex: number;
	dayOfMonth: number;
	weekStart: string;
	monthStart: string;
};

type MultiDayEntry = Extract<LeaderboardResponse['entries'][number], { averageTimeMs: number }>;

suite('leaderboard (real Neon: boards, aggregation, qualification)', () => {
	let db: Db;
	let service: ReturnType<typeof createLeaderboardService>;
	let puzzleService: ReturnType<typeof createPuzzleService>;
	let wordCounter = 0;

	beforeAll(async () => {
		db = await createIntegrationDb();
		service = createLeaderboardService(db);
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

	// ─── fixtures (DB-clock dates only, plan §10.3) ───────────────────────────

	async function frameStats(): Promise<FrameStats> {
		const [row] = (
			await db.execute(sql`
				SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date::text AS today,
				       EXTRACT(ISODOW FROM transaction_timestamp() AT TIME ZONE 'Asia/Manila')::int - 1 AS dow_index,
				       EXTRACT(DAY FROM transaction_timestamp() AT TIME ZONE 'Asia/Manila')::int AS day_of_month,
				       date_trunc('week', (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date)::date::text AS week_start,
				       date_trunc('month', (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date)::date::text AS month_start
			`)
		).rows as { today: string; dow_index: number; day_of_month: number; week_start: string; month_start: string }[];
		return {
			today: row.today,
			dowIndex: row.dow_index,
			dayOfMonth: row.day_of_month,
			weekStart: row.week_start,
			monthStart: row.month_start
		};
	}

	async function manilaDateOffset(offsetDays: number): Promise<string> {
		const [row] = (
			await db.execute(
				sql`SELECT ((transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date + ${offsetDays}::int)::text AS d`
			)
		).rows as { d: string }[];
		return row.d;
	}

	/**
	 * `count` consecutive Manila dates ending `offsetDays` ago, OLDEST first —
	 * derived in ONE round trip (the month fixtures seed up to 30 days; a
	 * per-day round trip at CI latency took I9 past the 30s test budget).
	 */
	async function manilaDatesBack(offsetDays: number, count: number): Promise<string[]> {
		if (count <= 0) return [];
		const rows = (
			await db.execute(sql`
				SELECT ((transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date - s)::text AS d
				FROM generate_series(${offsetDays + count - 1}::int, ${offsetDays}::int, -1) AS s
			`)
		).rows as { d: string }[];
		return rows.map((r) => r.d);
	}

	async function puzzleIdForDate(date: string): Promise<string> {
		const [row] = (
			await db.execute(sql`SELECT id::text AS id FROM daily_puzzles WHERE puzzle_date = ${date}`)
		).rows as { id: string }[];
		if (!row) throw new Error(`puzzle for ${date} not seeded`);
		return row.id;
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
		const word = `g${String(++wordCounter).padStart(4, '0')}`;
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
				...(opts.expiresAt
					? { expiresAt: opts.expiresAt }
					: { expiresAt: new Date('2099-12-31T00:00:00Z') }),
				...(opts.averageCompletionTimeMs !== undefined
					? { averageCompletionTimeMs: opts.averageCompletionTimeMs }
					: {}),
				...(opts.nonCompletionPenaltyMs !== undefined
					? { nonCompletionPenaltyMs: opts.nonCompletionPenaltyMs }
					: {}),
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
		} = {}
	) {
		return db
			.insert(schema.games)
			.values({
				userId,
				puzzleId,
				status: opts.status ?? 'ACTIVE',
				...(opts.completionTimeMs !== undefined ? { completionTimeMs: opts.completionTimeMs } : {}),
				...(opts.guessCount !== undefined ? { guessCount: opts.guessCount } : {}),
				...(opts.completedAt !== undefined ? { completedAt: opts.completedAt } : {})
			})
			.returning();
	}

	async function gamesCount(): Promise<number> {
		const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM games`)).rows as {
			n: number;
		}[];
		return n;
	}

	/** Board read via the REAL service (includes lazy finalization). */
	async function board(period: LeaderboardPeriod, viewerId: string): Promise<LeaderboardResponse> {
		return service.getBoard(period, viewerId, 10);
	}

	/**
	 * Seed `count` finalized in-frame days ending at yesterday, each with the
	 * given frozen average (+ penalty). `count` must fit the period frame.
	 * BATCHED: one answer insert + one puzzle insert (multi-row VALUES) —
	 * the month fixtures seed up to dayOfMonth-1 days, and per-day round trips
	 * at CI latency blew the test timeout (I9 CI failure #3).
	 * Returns the puzzle ids in chronological order (oldest first; the last
	 * element is yesterday).
	 */
	async function seedFinalizedDays(
		period: 'week' | 'month',
		count: number,
		averageCompletionTimeMs: number
	): Promise<string[]> {
		if (count <= 0) return [];
		const dates = await manilaDatesBack(1, count);
		const words = dates.map(() => `g${String(++wordCounter).padStart(4, '0')}`);
		// Batched multi-row INSERTs (parameterized) — one round trip each.
		const answers = (await db.execute(sql`
			INSERT INTO answer_dictionary (word, normalized_word)
			VALUES ${sql.join(words.map((w) => sql`(${w}, ${w})`), sql`, `)}
			RETURNING id::text AS id
		`)) as unknown as { rows: { id: string }[] };
		const puzzles = (await db.execute(sql`
			INSERT INTO daily_puzzles
			  (puzzle_date, answer_id, hint_letter, status, expires_at,
			   average_completion_time_ms, non_completion_penalty_ms, finalized_at)
			VALUES ${sql.join(
				dates.map(
					(date, i) => sql`(${date}, ${answers.rows[i].id}, ${words[i][0].toUpperCase()},
					  'FINALIZED', ${new Date('2099-12-31T00:00:00Z')}, ${averageCompletionTimeMs},
					  ${averageCompletionTimeMs + NON_COMPLETION_PENALTY_MS}, transaction_timestamp())`
				),
				sql`, `
			)}
			RETURNING id::text AS id
		`)) as unknown as { rows: { id: string }[] };
		return puzzles.rows.map((p) => p.id);
	}

	/** Multi-row game insert (one round trip) — same shapes as insertGame. */
	async function insertGamesBatched(
		rows: {
			userId: string;
			puzzleId: string;
			status?: 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'FORFEITED';
			completionTimeMs?: number | null;
			guessCount?: number;
			completedAt?: ReturnType<typeof sql> | Date | null;
		}[]
	): Promise<void> {
		if (rows.length === 0) return;
		await db.execute(sql`
			INSERT INTO games (user_id, puzzle_id, status, completion_time_ms, guess_count, completed_at)
			VALUES ${sql.join(
				rows.map(
					(r) => sql`(${r.userId}, ${r.puzzleId}, ${r.status ?? 'ACTIVE'},
					  ${r.completionTimeMs ?? null}, ${r.guessCount ?? 0}, ${r.completedAt ?? null})`
				),
				sql`, `
			)}
		`);
	}

	/** In-frame past days for a period (DB-clock derived). */
	const pastDays = (stats: FrameStats, period: 'week' | 'month') =>
		period === 'week' ? stats.dowIndex : stats.dayOfMonth - 1;

	// ─── I6: today board ──────────────────────────────────────────────────────

	it('I6: today board — completed-only, dense ranks + ties, viewer rank > 10 still returned via currentUser', async () => {
		const today = await manilaDateOffset(0);
		const puzzle = await insertPuzzle(today, { status: 'ACTIVE' });
		// 13 completed players (12 rows through the dense cutoff incl. ties),
		// plus a FAILED and an ACTIVE player who must NEVER appear.
		const rows: [string, number, number][] = [
			['a', 25_000, 4],
			['b', 30_000, 3],
			['c', 30_000, 3], // full tie with b → dense rank 2
			['d', 40_000, 5],
			['e', 45_000, 5],
			['f', 50_000, 5],
			['g', 55_000, 5],
			['h', 60_000, 5],
			['i', 65_000, 5],
			['j', 70_000, 5],
			['k', 70_000, 5], // dense tie with j → rank 9
			['l', 80_000, 6], // rank 10 — ties included at the cutoff
			['m', 90_000, 6] // rank 11 — viewer, outside the cutoff
		];
		const allIds = [...rows.map((r) => r[0]), 'failed', 'active'];
		for (const id of allIds) await insertUser(id);
		// ONE shared completion instant (evaluated once) so the tie pairs
		// (b/c, j/k) are FULL key ties — time, guesses AND completed_at.
		const [{ ts }] = (
			await db.execute(sql`SELECT transaction_timestamp() - interval '1 hour' AS ts`)
		).rows as { ts: string | Date }[];
		const completedAt = new Date(String(ts));
		for (const [userId, time, guesses] of rows) {
			await insertGame(userId, puzzle.id, {
				status: 'COMPLETED',
				completionTimeMs: time,
				guessCount: guesses,
				completedAt
			});
		}
		await insertGame('failed', puzzle.id, { status: 'FAILED', guessCount: 6 });
		await insertGame('active', puzzle.id, { status: 'ACTIVE' });

		const res = await board('today', 'm');

		// Dense ranks: 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10 → 12 rows through the
		// cutoff (tie at rank 10 included); the 13th (rank 11) is excluded.
		expect(res.count).toBe(13);
		expect(res.entries.map((e) => e.rank)).toEqual([1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10]);
		expect(res.entries.map((e) => e.userId)).toEqual([
			'a',
			'b',
			'c',
			'd',
			'e',
			'f',
			'g',
			'h',
			'i',
			'j',
			'k',
			'l'
		]);
		for (const entry of res.entries) {
			if ('completionTimeMs' in entry) {
				const [, time, guesses] = rows.find((r) => r[0] === entry.userId)!;
				expect(entry.completionTimeMs).toBe(time);
				expect(entry.guessCount).toBe(guesses);
				expect(entry.completedAt).toBeTruthy();
			} else {
				throw new Error('today entries must be single-day entries');
			}
		}

		// Viewer at rank 11 — beyond the cutoff but ALWAYS returned (NG13).
		expect(res.currentUser.rank).toBe(11);
		expect(res.currentUser.qualified).toBe(true);
		expect(res.currentUser.completedDays).toBe(1);
		expect(res.currentUser.entry?.rank).toBe(11);

		// FAILED/ACTIVE players are absent (Spec §11: completed-only).
		expect(res.entries.some((e) => e.userId === 'failed' || e.userId === 'active')).toBe(false);
	});

	// ─── I7: yesterday board ──────────────────────────────────────────────────

	it('I7: yesterday board is completed-only and unaffected by finalization', async () => {
		const yesterday = await manilaDateOffset(-1);
		const yPuzzle = await insertPuzzle(yesterday, { status: 'ACTIVE' });
		const today = await manilaDateOffset(0);
		const tPuzzle = await insertPuzzle(today, { status: 'ACTIVE' });
		for (const id of ['a', 'b', 'c']) await insertUser(id);
		await insertGame('a', yPuzzle.id, {
			status: 'COMPLETED',
			completionTimeMs: 33_000,
			guessCount: 4,
			completedAt: sql`transaction_timestamp() - interval '26 hours'`
		});
		await insertGame('b', yPuzzle.id, {
			status: 'COMPLETED',
			completionTimeMs: 22_000,
			guessCount: 3,
			completedAt: sql`transaction_timestamp() - interval '27 hours'`
		});
		await insertGame('c', yPuzzle.id, { status: 'FAILED', guessCount: 6 });
		await insertGame('a', tPuzzle.id, {
			status: 'COMPLETED',
			completionTimeMs: 99_000,
			guessCount: 6,
			completedAt: sql`transaction_timestamp() - interval '1 hour'`
		});

		const before = await board('yesterday', 'a');
		expect(before.entries.map((e) => e.userId)).toEqual(['b', 'a']);
		expect(before.count).toBe(2);
		expect(before.currentUser.rank).toBe(2);
		expect(before.entries.some((e) => e.userId === 'c')).toBe(false);

		// Finalize yesterday (real service) — the board must not change:
		// completed-only semantics hold with or without finalization.
		await puzzleService.finalizePuzzle(yPuzzle.id);
		const after = await board('yesterday', 'a');
		expect(after.entries.map((e) => e.userId)).toEqual(['b', 'a']);
		expect(after.count).toBe(2);
	});

	// ─── I8: week aggregation ─────────────────────────────────────────────────

	it('I8: week — frozen penalties (FAILED/FORFEITED/MISSED-by-absence), today completed-only, rounding, averages', async () => {
		const stats = await frameStats();
		const past = pastDays(stats, 'week');
		// A qualifies when completedDays >= 3: all past days completed (past=3)
		// or (past-1) completed + 1 MISSED (past>=4 — the penalty-in-average
		// case). On Mon–Wed the frame cannot host a qualified player.
		const frozenAvg = 24_000;
		const missDay = past >= 4;
		const aCompleted = missDay ? past - 1 : past;
		const qualifiedReachable = aCompleted >= 3;

		const puzzleIds = await seedFinalizedDays('week', past, frozenAvg); // oldest first
		const todayPuzzle = await insertPuzzle(stats.today, { status: 'ACTIVE' });
		for (const id of ['A', 'B', 'D']) await insertUser(id);

		// A: completes days [missDay ? 1 : 0 .. past-1] at 24000/4; when
		// missDay, the oldest day has NO game row (MISSED by absence).
		await insertGamesBatched(
			puzzleIds.slice(missDay ? 1 : 0).map((pid) => ({
				userId: 'A',
				puzzleId: pid,
				status: 'COMPLETED',
				completionTimeMs: frozenAvg,
				guessCount: 4,
				completedAt: sql`transaction_timestamp() - interval '10 hours'`
			}))
		);
		// B: one completed day (yesterday), one FAILED, one FORFEITED (when
		// days allow) + a FAILED game TODAY (ignored — no slot until finalization).
		await insertGame('B', puzzleIds[past - 1], {
			status: 'COMPLETED',
			completionTimeMs: 30_000,
			guessCount: 4,
			completedAt: sql`transaction_timestamp() - interval '9 hours'`
		});
		if (past >= 2) await insertGame('B', puzzleIds[past - 2], { status: 'FAILED', guessCount: 6 });
		if (past >= 3) await insertGame('B', puzzleIds[past - 3], { status: 'FORFEITED', guessCount: 3 });
		await insertGame('B', todayPuzzle.id, { status: 'FAILED', guessCount: 6 });
		// A completes today (completed-only slot until finalization).
		await insertGame('A', todayPuzzle.id, {
			status: 'COMPLETED',
			completionTimeMs: 36_000,
			guessCount: 6,
			completedAt: sql`transaction_timestamp() - interval '1 hour'`
		});
		// D never plays: MISSED derived on every finalized day.

		const gamesBefore = await gamesCount();
		const resA = await board('week', 'A');
		const resB = await board('week', 'B');
		const resD = await board('week', 'D');

		// I10: MISSED is derived by LEFT-JOIN absence — reads never create rows.
		expect(await gamesCount()).toBe(gamesBefore);

		if (qualifiedReachable) {
			// Slots: completed finalized days + the MISSED day (penalty) + today.
			const aDays = aCompleted + (missDay ? 1 : 0) + 1;
			const aPenaltyPart = missDay ? frozenAvg + NON_COMPLETION_PENALTY_MS : 0;
			const aTotal = aCompleted * frozenAvg + aPenaltyPart + 36_000;
			const aGuesses = (4 * aCompleted + (missDay ? 6 : 0) + 6) / aDays;

			expect(resA.count).toBe(1);
			expect(resA.entries).toHaveLength(1);
			const md = resA.entries[0] as MultiDayEntry;
			expect(md.userId).toBe('A');
			expect(md.rank).toBe(1);
			expect(md.averageTimeMs).toBe(Math.round(aTotal / aDays));
			expect(md.averageGuesses).toBeCloseTo(aGuesses, 10);
			expect(md.completedDays).toBe(aCompleted);
			expect(md.earliestQualifyingCompletedAt).not.toBeNull();
			expect(md.displayName).toBe('P1');
			expect(md.avatarEmoji).toBeTruthy();
			expect(resA.currentUser.rank).toBe(1);
			expect(resA.currentUser.qualified).toBe(true);

			// B: only yesterday's completion counts — today-FAILED ignored, no
			// qualification. D: all-MISSED → zero completed days.
			expect(resB.currentUser.qualified).toBe(false);
			expect(resB.currentUser.completedDays).toBe(1);
			expect(resD.currentUser.qualified).toBe(false);
			expect(resD.currentUser.completedDays).toBe(0);
		} else {
			// Frame cannot host a qualified player: documented empty-board rule
			// + scored-level facts (never a silent skip).
			expect(resA.count).toBe(0);
			expect(resA.entries).toEqual([]);
			expect(resA.currentUser.qualified).toBe(false);
			expect(resA.currentUser.completedDays).toBe(aCompleted);
			expect(resB.currentUser.completedDays).toBe(1);
			expect(resD.currentUser.completedDays).toBe(0);
		}

		// Today's FAILED-for-B is ignored in every case (finalized-day count only).
		expect(resB.currentUser.completedDays).toBe(1);
	});

	// ─── I9: month aggregation + month-start boundary ─────────────────────────

	it('I9: month — aggregation over date_trunc(month); days before month-start never contribute', async () => {
		const stats = await frameStats();
		const past = pastDays(stats, 'month');
		const qualifiedReachable = past >= MONTHLY_QUALIFICATION_COMPLETED_DAYS;
		const frozenAvg = 24_000;

		const puzzleIds = await seedFinalizedDays('month', past, frozenAvg);
		// A puzzle dated BEFORE month-start (last month) — must not contribute.
		const beforeMonth = await manilaDateOffset(-past - 1);
		const outPuzzle = await insertPuzzle(beforeMonth, {
			status: 'FINALIZED',
			averageCompletionTimeMs: 5_000,
			nonCompletionPenaltyMs: 5_000 + NON_COMPLETION_PENALTY_MS
		});
		const todayPuzzle = await insertPuzzle(stats.today, { status: 'ACTIVE' });
		for (const id of ['A', 'B']) await insertUser(id);

		// A: completes every in-frame past day (24000/4) + today (36000/6).
		await insertGamesBatched(
			puzzleIds.map((pid) => ({
				userId: 'A',
				puzzleId: pid,
				status: 'COMPLETED',
				completionTimeMs: frozenAvg,
				guessCount: 4,
				completedAt: sql`transaction_timestamp() - interval '10 hours'`
			}))
		);
		await insertGame('A', todayPuzzle.id, {
			status: 'COMPLETED',
			completionTimeMs: 36_000,
			guessCount: 6,
			completedAt: sql`transaction_timestamp() - interval '1 hour'`
		});
		// B: completion only on the out-of-frame (last-month) day.
		await insertGame('B', outPuzzle.id, {
			status: 'COMPLETED',
			completionTimeMs: 5_000,
			guessCount: 1,
			completedAt: sql`transaction_timestamp() - interval '40 days'`
		});

		const resA = await board('month', 'A');
		const resB = await board('month', 'B');

		// Month-start boundary: the pre-month completion contributes NOTHING —
		// not even to completedDays (scored-level fact, any calendar day).
		expect(resB.currentUser.completedDays).toBe(0);
		expect(resB.currentUser.qualified).toBe(false);

		if (qualifiedReachable) {
			const aDays = past + 1;
			const aTotal = past * frozenAvg + 36_000;
			expect(resA.count).toBe(1);
			const md = resA.entries[0] as MultiDayEntry;
			expect(md.userId).toBe('A');
			expect(md.rank).toBe(1);
			expect(md.averageTimeMs).toBe(Math.round(aTotal / aDays));
			expect(md.averageGuesses).toBeCloseTo((4 * past + 6) / aDays, 10);
			expect(md.completedDays).toBe(past);
		} else {
			// Threshold > available days → documented empty-board rule.
			expect(resA.count).toBe(0);
			expect(resA.entries).toEqual([]);
			expect(resA.currentUser.qualified).toBe(false);
			expect(resA.currentUser.completedDays).toBe(past);
		}
	});

	// ─── I11: qualification thresholds ────────────────────────────────────────

	it('I11: qualification — at/above threshold rankable, below absent, empty when unreachable', async () => {
		const stats = await frameStats();
		// Max finalized days in frame = past days + today (finalized-today
		// trick — a legitimate domain state: after finalization the day is
		// just another finalized day).
		const weekReachable = pastDays(stats, 'week') + 1 >= WEEKLY_QUALIFICATION_COMPLETED_DAYS;
		const monthReachable = pastDays(stats, 'month') + 1 >= MONTHLY_QUALIFICATION_COMPLETED_DAYS;
		const period: 'week' | 'month' = weekReachable ? 'week' : 'month';
		const threshold =
			period === 'week' ? WEEKLY_QUALIFICATION_COMPLETED_DAYS : MONTHLY_QUALIFICATION_COMPLETED_DAYS;
		const past = pastDays(stats, period);
		const totalDays = past + 1;
		const reachable = weekReachable || monthReachable;

		const puzzleIds = await seedFinalizedDays(period, past, 24_000);
		await insertPuzzle(stats.today, {
			status: 'FINALIZED',
			averageCompletionTimeMs: 24_000,
			nonCompletionPenaltyMs: 24_000 + NON_COMPLETION_PENALTY_MS
		});
		const todayPuzzleId = await puzzleIdForDate(stats.today);
		for (const id of ['Q', 'U']) await insertUser(id);

		// Q completes ALL days (past + today); U completes exactly
		// threshold - 1 of the most recent days → below threshold.
		await insertGamesBatched(
			puzzleIds.map((pid) => ({
				userId: 'Q',
				puzzleId: pid,
				status: 'COMPLETED',
				completionTimeMs: 30_000,
				guessCount: 4,
				completedAt: sql`transaction_timestamp() - interval '11 hours'`
			}))
		);
		if (threshold - 1 > 0) {
			// U uses the OLDEST threshold-1 days (index order preserved).
			await insertGamesBatched(
				puzzleIds.slice(0, threshold - 1).map((pid) => ({
					userId: 'U',
					puzzleId: pid,
					status: 'COMPLETED',
					completionTimeMs: 30_000,
					guessCount: 4,
					completedAt: sql`transaction_timestamp() - interval '11 hours'`
				}))
			);
		}
		await insertGame('Q', todayPuzzleId, {
			status: 'COMPLETED',
			completionTimeMs: 30_000,
			guessCount: 4,
			completedAt: sql`transaction_timestamp() - interval '2 hours'`
		});

		const resQ = await board(period, 'Q');
		const resU = await board(period, 'U');

		if (reachable && totalDays >= threshold) {
			expect(resQ.count).toBe(1);
			expect(resQ.entries.map((e) => e.userId)).toEqual(['Q']);
			expect((resQ.entries[0] as MultiDayEntry).rank).toBe(1);
			// Q completed EVERY in-frame day (past + finalized today).
			expect((resQ.entries[0] as MultiDayEntry).completedDays).toBe(totalDays);
			expect(resQ.currentUser.qualified).toBe(true);
			expect(resQ.currentUser.completedDays).toBe(totalDays);

			// Below threshold: absent from entries/count; facts in currentUser.
			expect(resU.entries.some((e) => e.userId === 'U')).toBe(false);
			expect(resU.currentUser.rank).toBeNull();
			expect(resU.currentUser.qualified).toBe(false);
			expect(resU.currentUser.completedDays).toBe(threshold - 1);
		} else {
			// Documented empty-board rule (threshold > available days).
			expect(resQ.count).toBe(0);
			expect(resQ.entries).toEqual([]);
			expect(resQ.currentUser.qualified).toBe(false);
			expect(resQ.currentUser.completedDays).toBe(totalDays);
		}
	});

	// ─── I12: ranking determinism ─────────────────────────────────────────────

	it('I12: determinism — equal averages tiebreak on earliest completion; full ties share a dense rank, stable by user_id', async () => {
		const stats = await frameStats();
		const weekReachable = pastDays(stats, 'week') + 1 >= WEEKLY_QUALIFICATION_COMPLETED_DAYS;
		const monthReachable = pastDays(stats, 'month') + 1 >= MONTHLY_QUALIFICATION_COMPLETED_DAYS;
		if (!(weekReachable || monthReachable)) {
			// Documented empty-board rule on frame-poor days.
			await insertUser('Q');
			const res = await board('week', 'Q');
			expect(res.count).toBe(0);
			expect(res.currentUser.qualified).toBe(false);
			return;
		}
		const period: 'week' | 'month' = weekReachable ? 'week' : 'month';
		const past = pastDays(stats, period);

		const puzzleIds = await seedFinalizedDays(period, past, 30_000);
		await insertPuzzle(stats.today, {
			status: 'FINALIZED',
			averageCompletionTimeMs: 30_000,
			nonCompletionPenaltyMs: 30_000 + NON_COMPLETION_PENALTY_MS
		});
		const todayPuzzleId = await puzzleIdForDate(stats.today);

		// Six qualified players, IDENTICAL averages (30000/4 every day):
		// the tiebreak is the earliest qualifying completion, then user_id.
		const players: { id: string; earliestHour: number }[] = [
			{ id: 'p1', earliestHour: 10 },
			{ id: 'p5', earliestHour: 11 },
			{ id: 'p6', earliestHour: 11 }, // full tie with p5 → dense 2,2
			{ id: 'p2', earliestHour: 12 },
			{ id: 'p3', earliestHour: 13 },
			{ id: 'p4', earliestHour: 14 }
		];
		for (const p of players) await insertUser(p.id);
		for (const p of players) {
			await insertGamesBatched(
				puzzleIds.map((pid) => ({
					userId: p.id,
					puzzleId: pid,
					status: 'COMPLETED',
					completionTimeMs: 30_000,
					guessCount: 4,
					completedAt: sql`transaction_timestamp() - interval '20 hours'`
				}))
			);
			await insertGame(p.id, todayPuzzleId, {
				status: 'COMPLETED',
				completionTimeMs: 30_000,
				guessCount: 4,
				completedAt: sql`transaction_timestamp() - interval '1 hour'`
			});
		}
		// Distinct earliest timestamps on the OLDEST in-frame day only.
		const oldestDate = await manilaDateOffset(-past);
		for (const p of players) {
			await db.execute(
				sql`UPDATE games g SET completed_at = (${oldestDate}::date + make_interval(hours => ${p.earliestHour})) AT TIME ZONE 'Asia/Manila'
				    WHERE g.user_id = ${p.id} AND g.puzzle_id = (SELECT id FROM daily_puzzles WHERE puzzle_date = ${oldestDate})`
			);
		}

		const res = await board(period, 'p1');
		const entries = res.entries as MultiDayEntry[];
		expect(entries.map((e) => e.userId)).toEqual(['p1', 'p5', 'p6', 'p2', 'p3', 'p4']);
		expect(entries.map((e) => e.rank)).toEqual([1, 2, 2, 3, 4, 5]);
		for (const e of entries) {
			expect(e.averageTimeMs).toBe(30_000);
			expect(e.averageGuesses).toBeCloseTo(4, 10);
			expect(e.completedDays).toBe(past + 1);
		}
	});

	// ─── I13: tiebreaker day set ──────────────────────────────────────────────

	it('I13: today completion participates in the tiebreaker for players whose average includes today', async () => {
		const stats = await frameStats();
		const weekReachable = pastDays(stats, 'week') >= 3; // 3 past days, no trick
		const monthReachable = pastDays(stats, 'month') >= 8;
		if (!(weekReachable || monthReachable)) {
			await insertUser('A');
			const res = await board('week', 'A');
			expect(res.count).toBe(0);
			expect(res.currentUser.qualified).toBe(false);
			return;
		}
		const period: 'week' | 'month' = weekReachable ? 'week' : 'month';
		const past = pastDays(stats, period);

		// A: completes every in-frame past day with values [10000, 11000, …]
		//   → average 11000 (week) / 13500 (month); every completion @10:00Z.
		// B: completes every past day with the SAME values PLUS today (value
		//   chosen so B's average equals A's). B's PAST completions are
		//   @12:00Z — but B's TODAY-dated completion is @09:00Z, so the
		//   earliest qualifying completion of B's day set (which includes
		//   today — D5) is the today-dated game. Without today in the set,
		//   B's earliest would be 12:00Z → A would rank first.
		// completedDays is untouched by today (active day never counts).
		const A_TS = new Date('2026-01-05T10:00:00.000Z');
		const B_PAST_TS = new Date('2026-01-05T12:00:00.000Z');
		const B_TODAY_TS = new Date('2026-01-05T09:00:00.000Z');
		const pastValues = Array.from({ length: past }, (_, i) => 10_000 + i * 1000);
		const pastTotal = pastValues.reduce((s, v) => s + v, 0);
		const aDays = past;
		const bDays = past + 1;
		const todayValue = (pastTotal / aDays) * bDays - pastTotal;

		const puzzleIds = await seedFinalizedDays(period, past, 11_000);
		await insertPuzzle(stats.today, { status: 'ACTIVE' });
		const todayPuzzleId = await puzzleIdForDate(stats.today);
		for (const id of ['A', 'B']) await insertUser(id);
		await insertGamesBatched(
			puzzleIds.map((pid, i) => ({
				userId: 'A',
				puzzleId: pid,
				status: 'COMPLETED',
				completionTimeMs: pastValues[past - 1 - i],
				guessCount: 4,
				completedAt: A_TS
			}))
		);
		await insertGamesBatched(
			puzzleIds.map((pid, i) => ({
				userId: 'B',
				puzzleId: pid,
				status: 'COMPLETED',
				completionTimeMs: pastValues[past - 1 - i],
				guessCount: 4,
				completedAt: B_PAST_TS
			}))
		);
		await insertGame('B', todayPuzzleId, {
			status: 'COMPLETED',
			completionTimeMs: todayValue,
			guessCount: 4,
			completedAt: B_TODAY_TS
		});

		const res = await board(period, 'A');
		const entries = res.entries as MultiDayEntry[];
		// WITHOUT today in the tiebreaker, B's earliest (12:00) would rank
		// AFTER A's (10:00). B's today 06:00 completion flips the order —
		// today participates because B's average includes today (D5).
		expect(entries.map((e) => e.userId)).toEqual(['B', 'A']);
		expect(entries[0].rank).toBe(1);
		expect(entries[1].rank).toBe(2);
		expect(entries[0].averageTimeMs).toBe(Math.round((pastTotal + todayValue) / bDays));
		expect(entries[0].averageGuesses).toBeCloseTo(4, 10);
	});

	// ─── I14: lazy finalization ───────────────────────────────────────────────

	it('I14: week/month read finalizes expired ACTIVE days BEFORE aggregating (missed-cron recovery); today board never finalizes', async () => {
		const stats = await frameStats();
		const yesterday = await manilaDateOffset(-1);
		const yesterdayInFrame = pastDays(stats, 'month') >= 1 || pastDays(stats, 'week') >= 1;
		const period: 'week' | 'month' = pastDays(stats, 'week') >= 1 ? 'week' : 'month';

		// Missed-cron state: an ACTIVE puzzle whose expiry has passed, with real
		// games still on the raw row. In-frame when dated yesterday (common);
		// on the rare frame-poor day (1st of month AND Monday) the expired
		// puzzle IS today's row — the trick fallback.
		const expiredPuzzle = await insertPuzzle(yesterdayInFrame ? yesterday : stats.today, {
			status: 'ACTIVE',
			expiresAt: sql`transaction_timestamp() - interval '1 minute'`
		});
		const todayPuzzle = yesterdayInFrame
			? await insertPuzzle(stats.today, { status: 'ACTIVE' })
			: null;
		await insertUser('V');
		await insertGame('V', expiredPuzzle.id, {
			status: 'COMPLETED',
			completionTimeMs: 42_000,
			guessCount: 5,
			completedAt: sql`transaction_timestamp() - interval '2 hours'`
		});

		// Today's board read never triggers finalization.
		await board('today', 'V');
		const [stillActive] = await db
			.select()
			.from(schema.dailyPuzzles)
			.where(sql`id = ${expiredPuzzle.id}`);
		expect(stillActive.status).toBe('ACTIVE');

		// Week/month read runs the sweep FIRST (own transactions) — the expired
		// day is reconciled and its frozen values feed the board.
		const res = await board(period, 'V');

		const [after] = await db.select().from(schema.dailyPuzzles).where(sql`id = ${expiredPuzzle.id}`);
		expect(after.status).toBe('FINALIZED');
		expect(after.averageCompletionTimeMs).toBe(42_000);
		expect(after.nonCompletionPenaltyMs).toBe(42_000 + NON_COMPLETION_PENALTY_MS);
		if (!yesterdayInFrame) {
			// Trick fallback: the expired puzzle was today-dated → today is now
			// a finalized eligible day → V's completion counts (scored-level).
			expect(res.currentUser.completedDays).toBeGreaterThanOrEqual(1);
		}
		// Today's ACTIVE puzzle was never touched by the sweep.
		if (todayPuzzle) {
			const [todayRow] = await db.select().from(schema.dailyPuzzles).where(sql`id = ${todayPuzzle.id}`);
			expect(todayRow.status).toBe('ACTIVE');
		}
	});

	void schema;
});