// Phase-3 leaderboard API handlers (plan §8, D11) — thin Hono layer over
// the leaderboard service. Registered ONLY from src/server/routes.ts
// (single composition point; chained so the AppType/RPC schema stays
// intact). Authentication comes from the composed middleware chain
// (authContext + requireAuth on /api/leaderboard/*). Onboarding is NOT
// enforced at the API level (consistent with /api/game/*, /api/me/* —
// leaderboard data is non-sensitive group data; the page guard gates the UI).
//
// Read-only GETs: no CSRF applicability, no mutation (plan §8.3).
import type { Context, Hono, Schema } from 'hono';
import type { BlankSchema } from 'hono/types';
import { zValidator } from '@hono/zod-validator';
import { AppError, ERROR_CODES } from '../lib/errors';
import type { AppEnv } from '../routes';
import { leaderboardLimitSchema, type LeaderboardPeriod } from './constants';
import type { LeaderboardResponse, LeaderboardService } from './service';

export type LeaderboardRouteDeps = {
	/** Service factory — test seam (fake service in unit tests). */
	getService: (c: Context<AppEnv>) => LeaderboardService;
};

function authenticatedUser(c: Context<AppEnv>, action: string): { id: string } {
	const auth = c.get('auth');
	if (!auth) {
		// requireAuth already guards /api/leaderboard/* — defense in depth so
		// a route accidentally moved outside the guard still fails closed.
		throw new AppError(ERROR_CODES.UNAUTHORIZED, `Authentication required to ${action}`, 401);
	}
	return auth.user;
}

/**
 * `?limit=` validation: integer 1..50, default 10 — a DENSE-RANK cutoff
 * (`rank <= limit`; ties may exceed the limit, NG11). Failures map to the
 * NG21 BAD_REQUEST envelope. Not a row cap (plan §8.1).
 */
export const leaderboardLimitValidator = zValidator('query', leaderboardLimitSchema, (result) => {
	if (!result.success) {
		throw new AppError(
			ERROR_CODES.BAD_REQUEST,
			'Invalid limit — must be an integer between 1 and 50',
			400
		);
	}
});

async function sendBoard(
	c: Context<AppEnv>,
	deps: LeaderboardRouteDeps,
	period: LeaderboardPeriod,
	viewerId: string,
	limit: number
) {
	// NOTE: no explicit return annotation — Hono's `c.json` returns
	// `Response & TypedResponse<T>`; annotating `Promise<Response>` would
	// erase the payload type from the RPC client schema.
	const board: LeaderboardResponse = await deps.getService(c).getBoard(period, viewerId, limit);
	return c.json(board, 200);
}

/**
 * Register the Phase-3 leaderboard routes and RETURN the app (chained —
 * Hono accumulates the route Schema in the return type; do NOT annotate/cast).
 *
 * Chaining pattern: the SCHEMA parameter `S` is a TYPE VARIABLE
 * (Hono<AppEnv, S, BasePath>) while the ENV stays concrete (AppEnv) — the
 * phase-2 profile pattern, verified to preserve the accumulated AppType.
 */
export function registerLeaderboardRoutes<S extends Schema = BlankSchema>(
	app: Hono<AppEnv, S>,
	deps: LeaderboardRouteDeps
) {
	return app
		.get('/api/leaderboard/today', leaderboardLimitValidator, async (c) => {
			const user = authenticatedUser(c, 'read the leaderboard');
			const { limit } = c.req.valid('query');
			return sendBoard(c, deps, 'today', user.id, limit);
		})
		.get('/api/leaderboard/yesterday', leaderboardLimitValidator, async (c) => {
			const user = authenticatedUser(c, 'read the leaderboard');
			const { limit } = c.req.valid('query');
			return sendBoard(c, deps, 'yesterday', user.id, limit);
		})
		.get('/api/leaderboard/week', leaderboardLimitValidator, async (c) => {
			const user = authenticatedUser(c, 'read the leaderboard');
			const { limit } = c.req.valid('query');
			return sendBoard(c, deps, 'week', user.id, limit);
		})
		.get('/api/leaderboard/month', leaderboardLimitValidator, async (c) => {
			const user = authenticatedUser(c, 'read the leaderboard');
			const { limit } = c.req.valid('query');
			return sendBoard(c, deps, 'month', user.id, limit);
		});
}