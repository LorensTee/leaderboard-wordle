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
 *
 * NOTE (Phase-4 deviation, 2026-08-30): the naive form `(date + 1) AT TIME
 * ZONE 'Asia/Manila'` resolves to `timestamp WITHOUT time zone` (date values
 * coerce to plain `timestamp` first; `date AT TIME ZONE zone` yields GTM
 * wall time as a naive value), so a naive insert into the TIMESTAMPTZ
 * column interprets it in the SESSION timezone — 8h late on Neon (GMT).
 * The explicit `::timestamp` cast selects the
 * `timestamp AT TIME ZONE zone → timestamptz` operator, producing the NG1
 * instant (Manila midnight = 16:00Z). Verified against Neon.
 */
export function expiresAtExpr(puzzleDate: string): ReturnType<typeof sql> {
	return sql`((${puzzleDate}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')`;
}