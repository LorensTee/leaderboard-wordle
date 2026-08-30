// Phase-3 typed leaderboard API surface for the client (Hono RPC — wire
// types flow from the server's AppType through `res.json()`; nothing
// hand-declared). TanStack Query keys: `['leaderboard', period]` — shared by
// /leaderboard tabs and the /play result block (cache is naturally shared).
// The client NEVER owns aggregation semantics — the server service owns all
// period/penalty/qualification rules (plan §9.4/D4).
import { api, apiErrorFromResponse } from './client';
import type { LeaderboardPeriod } from '$server/leaderboard/constants';
import type { LeaderboardResponse } from '$server/leaderboard/service';

export const leaderboardKeys = {
	all: ['leaderboard'] as const,
	period: (period: LeaderboardPeriod) => ['leaderboard', period] as const
};

export const leaderboardApi = {
	/** GET /api/leaderboard/:period — board + viewer position (rank inline). */
	async getBoard(period: LeaderboardPeriod): Promise<LeaderboardResponse> {
		// No client limit: the server default (dense cutoff 10) applies.
		const res = await api.api.leaderboard[period].$get({ query: {} });
		if (!res.ok) throw await apiErrorFromResponse(res);
		return res.json();
	}
};