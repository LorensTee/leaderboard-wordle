// Phase-3 leaderboard domain (plan §2–§4, §7.1, §8.2, §10.4; D2/D4/D6/D7/D9).
//
// The server/domain layer owns ALL aggregation semantics — the UI never
// computes periods, penalties, or qualification. Ranking is SQL window
// functions (DENSE_RANK) over raw facts; there is NO ranking table and
// MISSED is derived by LEFT-JOIN absence (no fake rows, raw model
// untouched). All day boundaries come from transaction_timestamp() AT TIME
// ZONE 'Asia/Manila' — the same anchor as the expiry contract (NG9).
//
// Lazy finalization (D9): week/month reads reconcile expired ACTIVE days by
// running finalizeExpired() BEFORE the aggregation, in its own transactions
// — never inside the read transaction. Today/Yesterday never finalize.
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { AppError, ERROR_CODES } from '../lib/errors';
import { todayManilaDateExpr } from '../puzzle/manila';
import type { SettlementPuzzleResult } from '../puzzle/settlement';
import { finalizeExpired } from '../puzzle/settlement';
import {
	LEADERBOARD_DENSE_CUTOFF_DEFAULT,
	qualificationThreshold,
	type LeaderboardPeriod
} from './constants';

// ─── Wire shapes (plan §8.2) ───────────────────────────────────────────────

export type SingleDayLeaderboardEntry = {
	/** Dense rank over (completion_time_ms, guess_count, completed_at). */
	rank: number;
	userId: string;
	/** user.name (app-wide display name); never null on the wire. */
	displayName: string;
	avatarEmoji: string;
	completionTimeMs: number;
	guessCount: number;
	/** ISO — completed_at. */
	completedAt: string;
};

export type MultiDayLeaderboardEntry = {
	/** Dense rank over (avg_time, avg_guesses, earliest_qualifying_completion_at). */
	rank: number;
	userId: string;
	displayName: string;
	avatarEmoji: string;
	/** ROUND(avg, 0) — milliseconds. */
	averageTimeMs: number;
	/** Exact numeric average (display 2dp — provisional, P4). */
	averageGuesses: number;
	/** Finalized-day COMPLETED count (threshold basis, D7). */
	completedDays: number;
	/** ISO — earliest qualifying completion; null when no COMPLETED game. */
	earliestQualifyingCompletedAt: string | null;
};

export type LeaderboardEntry = SingleDayLeaderboardEntry | MultiDayLeaderboardEntry;

export type LeaderboardResponse = {
	/** Entries through the dense cutoff (ties included). */
	entries: LeaderboardEntry[];
	/** Single-day: total COMPLETED players. Multi-day: total qualified players. */
	count: number;
	currentUser: {
		/** Viewer's rank (when completed/qualified), else null. */
		rank: number | null;
		/** Single-day: completed that day. Multi-day: completedDays >= threshold. */
		qualified: boolean;
		/** Single-day: 1 | 0 (completed that day). Multi-day: finalized-day count. */
		completedDays: number;
		entry: LeaderboardEntry | null;
	};
};

export type LeaderboardService = {
	getBoard(period: LeaderboardPeriod, viewerId: string, limit?: number): Promise<LeaderboardResponse>;
};

export type LeaderboardServiceDeps = {
	/**
	 * Lazy-finalization seam (D9, plan §7.1): week/month reads reconcile
	 * expired ACTIVE days before aggregating. Defaults to the real sweep;
	 * injectable for DB-free tests.
	 */
	finalizeExpired?: () => Promise<SettlementPuzzleResult[]>;
};

// ─── Row plumbing ──────────────────────────────────────────────────────────

type RawRow = Record<string, unknown>;

function text(row: RawRow, key: string): string {
	const v = row[key];
	return v === null || v === undefined ? '' : String(v);
}

function numberOrNull(row: RawRow, key: string): number | null {
	const v = row[key];
	return v === null || v === undefined ? null : Number(v);
}

function int(row: RawRow, key: string): number {
	return Number(row[key]);
}

function isoOrNull(row: RawRow, key: string): string | null {
	const v = row[key];
	if (v === null || v === undefined) return null;
	return v instanceof Date ? v.toISOString() : String(v);
}

const FALLBACK_AVATAR = '🙂';

// ─── SQL fragments (boundaries in DB time — plan §10.3) ────────────────────

const yesterdayManilaDateExpr = sql`(${todayManilaDateExpr} - 1)`;
const weekStartManilaDateExpr = sql`date_trunc('week', ${todayManilaDateExpr})::date`;
const monthStartManilaDateExpr = sql`date_trunc('month', ${todayManilaDateExpr})::date`;

function frameStartExpr(period: 'week' | 'month'): ReturnType<typeof sql> {
	return period === 'week' ? weekStartManilaDateExpr : monthStartManilaDateExpr;
}

// ─── Service ────────────────────────────────────────────────────────────────

export function createLeaderboardService(
	db: Db,
	deps: LeaderboardServiceDeps = {}
): LeaderboardService {
	const reconcile = deps.finalizeExpired ?? (() => finalizeExpired(db));

	return {
		async getBoard(period, viewerId, limit = LEADERBOARD_DENSE_CUTOFF_DEFAULT) {
			if (!Number.isInteger(limit) || limit < 1) {
				throw new AppError(ERROR_CODES.BAD_REQUEST, 'limit must be a positive integer', 400);
			}
			if (period === 'today' || period === 'yesterday') {
				return singleDayBoard(db, period, viewerId, limit);
			}
			// D9 — read-path reconciliation (own transactions), never inside
			// the read transaction. Today/Yesterday never need it.
			await reconcile();
			return multiDayBoard(db, period, viewerId, limit);
		}
	};
}

// ─── Single-day boards (plan §10.4 — Today) ─────────────────────────────────

async function singleDayBoard(
	db: Db,
	period: 'today' | 'yesterday',
	viewerId: string,
	limit: number
): Promise<LeaderboardResponse> {
	const dateExpr = period === 'today' ? todayManilaDateExpr : yesterdayManilaDateExpr;

	// One window query over COMPLETED games only (Spec §11: single-day boards
	// exclude all non-completed results). The rank window never contains
	// user_id (NG14/M2); display order is (rank, user_id).
	const result = (await db.execute(sql`
		SELECT u.id::text AS user_id,
		       COALESCE(u.name, 'Player') AS display_name,
		       COALESCE(u.avatar_emoji, ${FALLBACK_AVATAR}) AS avatar_emoji,
		       g.completion_time_ms, g.guess_count, g.completed_at,
		       DENSE_RANK() OVER (
		         ORDER BY g.completion_time_ms ASC, g.guess_count ASC, g.completed_at ASC
		       ) AS rank
		FROM games g
		JOIN daily_puzzles p ON p.id = g.puzzle_id
		JOIN "user" u ON u.id = g.user_id
		WHERE p.puzzle_date = ${dateExpr}
		  AND g.status = 'COMPLETED'
		ORDER BY rank, u.id
	`)) as unknown as { rows: RawRow[] };

	const rows = result.rows;
	const entries: SingleDayLeaderboardEntry[] = rows
		.filter((row) => int(row, 'rank') <= limit)
		.map((row) => ({
			rank: int(row, 'rank'),
			userId: text(row, 'user_id'),
			displayName: text(row, 'display_name'),
			avatarEmoji: text(row, 'avatar_emoji'),
			completionTimeMs: int(row, 'completion_time_ms'),
			guessCount: int(row, 'guess_count'),
			completedAt: isoOrNull(row, 'completed_at') ?? ''
		}));

	const viewerRow = rows.find((row) => text(row, 'user_id') === viewerId) ?? null;

	return {
		entries,
		count: rows.length,
		currentUser: viewerRow
			? {
					rank: int(viewerRow, 'rank'),
					qualified: true,
					completedDays: 1,
					entry: {
						rank: int(viewerRow, 'rank'),
						userId: text(viewerRow, 'user_id'),
						displayName: text(viewerRow, 'display_name'),
						avatarEmoji: text(viewerRow, 'avatar_emoji'),
						completionTimeMs: int(viewerRow, 'completion_time_ms'),
						guessCount: int(viewerRow, 'guess_count'),
						completedAt: isoOrNull(viewerRow, 'completed_at') ?? ''
					}
				}
			: { rank: null, qualified: false, completedDays: 0, entry: null }
	};
}

// ─── Multi-day boards (plan §10.4 — Week/Month) ─────────────────────────────

// The frame CTE list — shared by the board query and the viewer query.
function frameCtes(
	startExpr: ReturnType<typeof sql>,
	threshold: number,
	viewerFilter?: ReturnType<typeof sql>
): ReturnType<typeof sql> {
	const scoredWhere = viewerFilter
		? sql`WHERE user_id = ${viewerFilter}`
		: sql`WHERE days_count > 0 AND completed_days >= ${threshold}`;
	const window = viewerFilter
		? sql``
		: sql`,
		       DENSE_RANK() OVER (
		         ORDER BY total_time::numeric / days_count ASC,
		                  total_guesses::numeric / days_count ASC,
		                  earliest_qualifying_completion_at ASC NULLS LAST
		       ) AS rank`;
	return sql`
		WITH frame AS (
		  SELECT p.id AS puzzle_id, p.puzzle_date::text,
		         p.average_completion_time_ms, p.non_completion_penalty_ms,
		         (p.status = 'FINALIZED') AS finalized
		  FROM daily_puzzles p
		  WHERE p.puzzle_date BETWEEN ${startExpr} AND ${todayManilaDateExpr}
		    AND ( (p.status = 'FINALIZED' AND p.average_completion_time_ms IS NOT NULL)
		          OR p.puzzle_date = ${todayManilaDateExpr} )
		),
		day_rows AS (
		  SELECT u.id::text AS user_id, f.puzzle_id, f.finalized,
		         f.non_completion_penalty_ms,
		         g.status, g.completion_time_ms, g.guess_count, g.completed_at
		  FROM frame f
		  CROSS JOIN "user" u
		  LEFT JOIN games g ON g.puzzle_id = f.puzzle_id AND g.user_id = u.id
		),
		scored AS (
		  SELECT user_id,
		    SUM(CASE WHEN finalized THEN COALESCE(
		          CASE WHEN status = 'COMPLETED' THEN completion_time_ms END,
		          non_completion_penalty_ms)
		        WHEN status = 'COMPLETED' THEN completion_time_ms
		        ELSE NULL END)::bigint AS total_time,
		    COUNT(CASE WHEN finalized OR status = 'COMPLETED' THEN 1 END)::int AS days_count,
		    SUM(CASE WHEN finalized THEN COALESCE(
		          CASE WHEN status = 'COMPLETED' THEN guess_count END, 6)
		        WHEN status = 'COMPLETED' THEN guess_count
		        ELSE NULL END)::bigint AS total_guesses,
		    COUNT(CASE WHEN finalized AND status = 'COMPLETED' THEN 1 END)::int AS completed_days,
		    MIN(completed_at) AS earliest_qualifying_completion_at
		  FROM day_rows
		  GROUP BY user_id
		),
		source AS (
		  SELECT user_id, completed_days,
		         ROUND(total_time::numeric / days_count)::int AS average_time_ms,
		         total_guesses::numeric / days_count AS average_guesses,
		         earliest_qualifying_completion_at,
		         (days_count > 0 AND completed_days >= ${threshold}) AS qualified${window}
		  FROM scored
		  ${scoredWhere}
		)
		SELECT source.*,
		       COALESCE(u.name, 'Player') AS display_name,
		       COALESCE(u.avatar_emoji, ${FALLBACK_AVATAR}) AS avatar_emoji
		FROM source
		JOIN "user" u ON u.id::text = source.user_id
		${viewerFilter ? sql`ORDER BY source.user_id` : sql`ORDER BY source.rank, source.user_id`}
	`;
}

async function multiDayBoard(
	db: Db,
	period: 'week' | 'month',
	viewerId: string,
	limit: number
): Promise<LeaderboardResponse> {
	const threshold = qualificationThreshold(period);
	const startExpr = frameStartExpr(period);

	// Board query: every qualified player with their dense rank (no cutoff —
	// the cutoff is applied below so ties at the boundary are included and
	// the viewer's rank is available at any position, NG11/NG13).
	const boardResult = (await db.execute(
		frameCtes(startExpr, threshold, undefined)
	)) as unknown as { rows: RawRow[] };
	const rows = boardResult.rows;

	const entries: MultiDayLeaderboardEntry[] = rows
		.filter((row) => int(row, 'rank') <= limit)
		.map((row) => multiDayEntry(row));

	const viewerRow = rows.find((row) => text(row, 'user_id') === viewerId) ?? null;
	if (viewerRow) {
		return {
			entries,
			count: rows.length,
			currentUser: {
				rank: int(viewerRow, 'rank'),
				qualified: true,
				completedDays: int(viewerRow, 'completed_days'),
				entry: multiDayEntry(viewerRow)
			}
		};
	}

	// Viewer not qualified (or has no slot at all): their completedDays still
	// explains non-qualification to the UI (D7).
	const viewerResult = (await db.execute(
		frameCtes(startExpr, threshold, sql`${viewerId}`)
	)) as unknown as { rows: RawRow[] };
	const scoredRow = viewerResult.rows[0] ?? null;

	return {
		entries,
		count: rows.length,
		currentUser: scoredRow
			? {
					rank: null,
					qualified: Boolean(scoredRow.qualified),
					completedDays: int(scoredRow, 'completed_days'),
					entry: null
				}
			: { rank: null, qualified: false, completedDays: 0, entry: null }
	};
}

function multiDayEntry(row: RawRow): MultiDayLeaderboardEntry {
	return {
		rank: int(row, 'rank'),
		userId: text(row, 'user_id'),
		displayName: text(row, 'display_name'),
		avatarEmoji: text(row, 'avatar_emoji'),
		averageTimeMs: int(row, 'average_time_ms'),
		averageGuesses: numberOrNull(row, 'average_guesses') ?? 0,
		completedDays: int(row, 'completed_days'),
		earliestQualifyingCompletedAt: isoOrNull(row, 'earliest_qualifying_completion_at')
	};
}