// Phase-3 leaderboard constants contract (U2, plan §5/D7) — names, values,
// invariants. The weekly/monthly threshold VALUES are PROVISIONAL (product
// decision P1): this test pins them so a product change is a deliberate,
// visible diff in exactly this file + constants.ts (rename-with-usages
// check). The `>= 1` invariant is the hard rule — a 0 threshold would
// qualify everyone including never-played users (plan §5).
import { describe, expect, it } from 'vitest';
import {
	LEADERBOARD_DENSE_CUTOFF_DEFAULT,
	LEADERBOARD_LIMIT_MAX,
	LEADERBOARD_PERIODS,
	WEEKLY_QUALIFICATION_COMPLETED_DAYS,
	MONTHLY_QUALIFICATION_COMPLETED_DAYS,
	WEEK_START,
	leaderboardLimitSchema,
	qualificationThreshold,
	qualificationThresholdSchema
} from '../../src/server/leaderboard/constants';

describe('leaderboard constants (U2)', () => {
	it('week starts Monday (M1 — ISO week, resolved product constant)', () => {
		expect(WEEK_START).toBe('MONDAY');
	});

	it('thresholds are PROVISIONAL integers >= 1 (P1 — values must be confirmed before Phase-6)', () => {
		// Pinned provisional values — changing them is a deliberate product
		// decision (see constants.ts ⚠ markers).
		expect(WEEKLY_QUALIFICATION_COMPLETED_DAYS).toBe(3);
		expect(MONTHLY_QUALIFICATION_COMPLETED_DAYS).toBe(8);
		expect(Number.isInteger(WEEKLY_QUALIFICATION_COMPLETED_DAYS)).toBe(true);
		expect(Number.isInteger(MONTHLY_QUALIFICATION_COMPLETED_DAYS)).toBe(true);
	});

	it('threshold invariant: >= 1 (0 would qualify everyone)', () => {
		expect(qualificationThresholdSchema.safeParse(0).success).toBe(false);
		expect(qualificationThresholdSchema.safeParse(-2).success).toBe(false);
		expect(qualificationThresholdSchema.safeParse(1).success).toBe(true);
		expect(qualificationThresholdSchema.safeParse(8).success).toBe(true);
	});

	it('per-period threshold lookup matches the constants', () => {
		expect(qualificationThreshold('week')).toBe(WEEKLY_QUALIFICATION_COMPLETED_DAYS);
		expect(qualificationThreshold('month')).toBe(MONTHLY_QUALIFICATION_COMPLETED_DAYS);
	});

	it('dense cutoff defaults to 10 and caps at 50 (NG11/P5)', () => {
		expect(LEADERBOARD_DENSE_CUTOFF_DEFAULT).toBe(10);
		expect(LEADERBOARD_LIMIT_MAX).toBe(50);
	});

	it('limit schema: default 10, accepts 1..50 (query-object shape)', () => {
		expect(leaderboardLimitSchema.parse({})).toEqual({ limit: 10 });
		expect(leaderboardLimitSchema.parse({ limit: '1' })).toEqual({ limit: 1 });
		expect(leaderboardLimitSchema.parse({ limit: '50' })).toEqual({ limit: 50 });
		expect(leaderboardLimitSchema.safeParse({ limit: '0' }).success).toBe(false);
		expect(leaderboardLimitSchema.safeParse({ limit: '51' }).success).toBe(false);
		expect(leaderboardLimitSchema.safeParse({ limit: 'abc' }).success).toBe(false);
		expect(leaderboardLimitSchema.safeParse({ limit: '5.5' }).success).toBe(false);
		expect(leaderboardLimitSchema.safeParse({ limit: '' }).success).toBe(false);
	});

	it('exposes exactly the four documented periods', () => {
		expect([...LEADERBOARD_PERIODS]).toEqual(['today', 'yesterday', 'week', 'month']);
	});
});