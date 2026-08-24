// Puzzle lifecycle — daily-boundary helpers (Architecture §Settlement,
// NG1/NG9/M3). All competitive timing uses PostgreSQL database time; the
// Asia/Manila calendar date is computed in SQL, never from a Worker clock.
import { sql } from 'drizzle-orm';

export const MANILA_TIMEZONE = 'Asia/Manila';

/** Non-completion penalty = average completion time + 20 minutes (ms). */
export const NON_COMPLETION_PENALTY_MS = 20 * 60 * 1000;

/**
 * SQL expression for today's Asia/Manila calendar date (a DATE, matching the
 * `puzzle_date` column type). Uses transaction_timestamp() so the value is
 * stable for the whole transaction — the same anchor as the expiry
 * eligibility contract (NG9).
 */
export const todayManilaDateExpr = sql`(transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date`;

/**
 * SQL expression for a puzzle's expiry instant: midnight (start of the next
 * day) in Asia/Manila (NG1). `puzzleDate` is an ISO 'YYYY-MM-DD' string.
 */
export function expiresAtExpr(puzzleDate: string): ReturnType<typeof sql> {
	return sql`(${puzzleDate}::date + 1) AT TIME ZONE 'Asia/Manila'`;
}