// Phase-3 leaderboard product constants (plan §5, D7).
//
// ⚠ PROVISIONAL VALUES — the weekly/monthly qualification thresholds are
// OPEN product decisions (P1, plan §13). They must be confirmed by the
// product owner before the Phase-6 production deployment. Do NOT treat
// these numbers as final product values; do not silently change them.
//
// Semantics: a player is QUALIFIED for a multi-day period ⇔
// `completedDays >= threshold`, where `completedDays` counts COMPLETED
// games on finalized eligible days only (today never counts —
// Architecture §1309 / plan §3.2). FAILED/FORFEITED/MISSED never count.
import { z } from 'zod';

/** Week start (M1 — resolved product constant): ISO weeks start Monday. */
export const WEEK_START = 'MONDAY' as const;

/** ⚠ PROVISIONAL (P1) — weekly qualification threshold. */
export const WEEKLY_QUALIFICATION_COMPLETED_DAYS = 3;

/** ⚠ PROVISIONAL (P1) — monthly qualification threshold. */
export const MONTHLY_QUALIFICATION_COMPLETED_DAYS = 8;

/** NG11 — dense-rank cutoff (rank <= N); ties may exceed the limit. */
export const LEADERBOARD_DENSE_CUTOFF_DEFAULT = 10;

/** Guardrail cap for `?limit=` (no invented limit semantics, P5). */
export const LEADERBOARD_LIMIT_MAX = 50;

/**
 * `?limit=` query validation (plan §8.1): integer 1..max, default 10.
 * Not a row cap — a dense-rank cutoff (`rank <= limit`). Object-shaped so
 * @hono/zod-validator can validate the raw query params directly.
 */
export const leaderboardLimitSchema = z.object({
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(LEADERBOARD_LIMIT_MAX)
		.default(LEADERBOARD_DENSE_CUTOFF_DEFAULT)
});

/** Period names exposed by the API (Today/Yesterday/Week/Month). */
export type LeaderboardPeriod = 'today' | 'yesterday' | 'week' | 'month';

export const LEADERBOARD_PERIODS: readonly LeaderboardPeriod[] = [
	'today',
	'yesterday',
	'week',
	'month'
];

/**
 * Threshold for a period (P1 — the provisional values above). Kept in one
 * place so a future product decision changes exactly one table.
 */
export function qualificationThreshold(period: 'week' | 'month'): number {
	return period === 'week'
		? WEEKLY_QUALIFICATION_COMPLETED_DAYS
		: MONTHLY_QUALIFICATION_COMPLETED_DAYS;
}

/** Invariant guard (U2): thresholds of 0 would qualify everyone
 * (all-penalty averages) — the product values are expected >= 1. */
export const qualificationThresholdSchema = z
	.number()
	.int()
	.min(1)
	.refine((n) => Number.isSafeInteger(n) && n > 0);