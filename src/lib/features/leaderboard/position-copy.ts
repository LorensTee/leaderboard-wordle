// Phase-3 position-block copy mapping (U6, plan §9.2/D13) — pure, tested.
// The assignment: COMPLETED → position block from the viewer's rank; the
// block hides silently when the rank is unavailable (fetch failure or
// uncompleted); FAILED/FORFEITED → penalty line, NO position. Copy is
// display-only; the meaning ("position may change") is fixed (P6).
import type { LeaderboardPeriod } from '$server/leaderboard/constants';

export type PositionBlockCopy = { heading: string; note: string };

/**
 * Map the viewer's state to the result-block copy. Returns null when the
 * block must be hidden (no rank — fetch failed, uncompleted, or unranked).
 * `rank` comes from `currentUser.rank` on the today board (dense rank,
 * ties included); it is never final while the day is active.
 */
export function positionBlockCopy(
	rank: number | null,
	period: LeaderboardPeriod = 'today'
): PositionBlockCopy | null {
	if (rank === null || rank < 1) return null;
	return {
		heading: `Current position: #${rank}`,
		note:
			period === 'today'
				? 'Position may change as others finish today'
				: 'Position may change as the period progresses'
	};
}

/**
 * The competitive-penalty line for FAILED/FORFEITED result states (plan
 * §9.2): the daily penalty counts toward weekly/monthly standings. No
 * position is shown for these states.
 */
export function penaltyLineCopy(): string {
	return 'The daily penalty counts toward weekly and monthly standings';
}