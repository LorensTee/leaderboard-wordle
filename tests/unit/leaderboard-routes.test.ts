// Phase-3 leaderboard route wire contract (U1) — DB-free, mirroring the
// composed middleware chain (requestId → CSRF → authContext → requireAuth →
// routes → onError/notFound) with an injectable leaderboard service. Proves:
// 401 gating on /api/leaderboard/*, all four period endpoints, `?limit=`
// parsing/clamping to the dense-rank cutoff, response pass-through, NG21
// envelope mapping.
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../src/server/middleware/auth';
import { createAuthContext, requireAuth, type SessionResolver } from '../../src/server/middleware/auth';
import { csrfProtection } from '../../src/server/middleware/csrf';
import { requestIdMiddleware } from '../../src/server/middleware/request-id';
import { notFoundHandler, onErrorHandler, AppError } from '../../src/server/lib/errors';
import {
	createRateLimitMiddleware,
	type RateLimitBinding
} from '../../src/server/middleware/rate-limit';
import { registerLeaderboardRoutes } from '../../src/server/leaderboard/handlers';
import type { LeaderboardPeriod } from '../../src/server/leaderboard/constants';
import type {
	LeaderboardResponse,
	LeaderboardService
} from '../../src/server/leaderboard/service';
import type { SessionData } from '../../src/server/auth/auth';

const BASE = 'http://localhost:5173';
const VIEWER_ID = 'user-1';

const fakeSession = {
	session: { id: 'session-1', token: 'token-1', userId: VIEWER_ID, expiresAt: new Date() } as SessionData['session'],
	user: { id: VIEWER_ID, email: 'player@example.com', name: 'Player' } as SessionData['user']
};

type MiniEnv = {
	Bindings: { DATABASE_URL: string; ADMIN_EMAIL?: string };
	Variables: { requestId: string; auth: AuthContext };
};

function makeApp(
	service: LeaderboardService,
	resolver: SessionResolver = async () => fakeSession,
	limiter?: RateLimitBinding
) {
	const m = new Hono<MiniEnv>();
	m.use('*', requestIdMiddleware);
	m.use('*', csrfProtection);
	m.use('*', createAuthContext(resolver));
	// Normative order (plan §D.1, S1k): requireAuth first (cheap 401
	// fast-path), then the leaderboard read-class limiter (identity known).
	// Binding absent (undefined) ⇒ pass-through, matching the composed app.
	m.use('/api/leaderboard/*', requireAuth);
	m.use(
		'/api/leaderboard/*',
		createRateLimitMiddleware('leaderboard', { getBinding: () => limiter })
	);
	registerLeaderboardRoutes(m as unknown as Hono<import('../../src/server/routes').AppEnv>, {
		getService: () => service
	});
	m.onError(onErrorHandler);
	m.notFound(notFoundHandler);
	return m;
}

function fakeService(
	overrides: Partial<LeaderboardService> = {},
	boardOverrides: Partial<LeaderboardResponse> = {}
): { service: LeaderboardService; calls: { period: LeaderboardPeriod; viewerId: string; limit: number }[] } {
	const calls: { period: LeaderboardPeriod; viewerId: string; limit: number }[] = [];
	const service: LeaderboardService = {
		getBoard: vi.fn(async (period, viewerId, limit) => {
			calls.push({ period, viewerId, limit: limit ?? 10 });
			return {
				entries: [],
				count: 0,
				currentUser: { rank: null, qualified: false, completedDays: 0, entry: null },
				...boardOverrides
			};
		}),
		...overrides
	};
	return { service, calls };
}

async function get(
	app: ReturnType<typeof makeApp>,
	path: string,
	headers: Record<string, string> = {}
): Promise<Response> {
	return app.request(`${BASE}${path}`, { headers: { cookie: 'better-auth.session_token=signed', ...headers } });
}

/** A representative multi-day board for pass-through assertions. */
const SAMPLE_BOARD: LeaderboardResponse = {
	entries: [
		{
			rank: 1,
			userId: 'user-2',
			displayName: 'fast',
			avatarEmoji: '🦊',
			averageTimeMs: 12_000,
			averageGuesses: 3.5,
			completedDays: 4,
			earliestQualifyingCompletedAt: '2026-08-24T00:00:00.000Z'
		}
	],
	count: 1,
	currentUser: { rank: null, qualified: true, completedDays: 1, entry: null }
};

describe('leaderboard routes (wire contract, DB-free)', () => {
	it.each(['today', 'yesterday', 'week', 'month'] as const)(
		'GET /api/leaderboard/%s → 200, service called with period + viewer + default limit 10',
		async (period) => {
			const { service, calls } = fakeService();
			const app = makeApp(service);
			const res = await get(app, `/api/leaderboard/${period}`);
			expect(res.status).toBe(200);
			expect(calls).toEqual([{ period, viewerId: VIEWER_ID, limit: 10 }]);
			expect(await res.json()).toEqual({
				entries: [],
				count: 0,
				currentUser: { rank: null, qualified: false, completedDays: 0, entry: null }
			});
		}
	);

	it('`?limit=` is parsed and passed through as the dense-rank cutoff', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const res = await get(app, '/api/leaderboard/week?limit=25');
		expect(res.status).toBe(200);
		expect(calls[0].limit).toBe(25);
	});

	it('response body passes through unchanged (server owns the shapes)', async () => {
		const { service } = fakeService({}, SAMPLE_BOARD);
		const app = makeApp(service);
		const res = await get(app, '/api/leaderboard/month');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(SAMPLE_BOARD);
	});

	it.each(['0', '51', 'abc', '5.5', '-3', ''])(
		'invalid ?limit=%s → 400 BAD_REQUEST (NG21 envelope)',
		async (limit) => {
			const { service } = fakeService();
			const app = makeApp(service);
			const res = await get(app, `/api/leaderboard/today?limit=${limit}`);
			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.error.code).toBe('BAD_REQUEST');
			expect(body.error.requestId).toBeDefined();
		}
	);

	it('unauthenticated /api/leaderboard/* stays 401 UNAUTHORIZED (requireAuth mounted)', async () => {
		const { service } = fakeService();
		const app = makeApp(service, async () => null);
		const res = await app.request(`${BASE}/api/leaderboard/today`);
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe('UNAUTHORIZED');
	});

	it('service AppError maps to its NG21 envelope status', async () => {
		const { service } = fakeService({
			getBoard: vi.fn(async () => {
				throw new AppError('BOARD_ERROR', 'board down', 500);
			})
		});
		const app = makeApp(service);
		const res = await get(app, '/api/leaderboard/today');
		expect(res.status).toBe(500);
		expect((await res.json()).error.code).toBe('BOARD_ERROR');
	});

	it('unknown /api/leaderboard path → 404 NG21 envelope', async () => {
		const { service } = fakeService();
		const app = makeApp(service);
		const res = await get(app, '/api/leaderboard/next-week');
		expect(res.status).toBe(404);
		expect((await res.json()).error.code).toBe('NOT_FOUND');
	});
});

describe('S1k — leaderboard read class rate limiting (wire contract)', () => {
	const denyLimiter: RateLimitBinding = { limit: async () => ({ success: false }) };
	const okLimiter: RateLimitBinding = { limit: async () => ({ success: true }) };

	it.each(['today', 'yesterday', 'week', 'month'] as const)(
		'GET /api/leaderboard/%s over the limit → 429 RATE_LIMITED + headers + NG21 envelope',
		async (period) => {
			const { service } = fakeService();
			const app = makeApp(service, async () => fakeSession, denyLimiter);
			const res = await get(app, `/api/leaderboard/${period}`);
			expect(res.status).toBe(429);
			expect(res.headers.get('retry-after')).toBe('60');
			expect(res.headers.get('x-ratelimit-limit')).toBe('100'); // leaderboard class PROPOSED
			expect(res.headers.get('x-ratelimit-remaining')).toBe('0');
			expect(Number(res.headers.get('x-ratelimit-reset'))).toBeGreaterThan(Date.now() / 1000);
			const body = await res.json();
			expect(body.error.code).toBe('RATE_LIMITED');
			expect(body.error.requestId).toBeTruthy();
		}
	);

	it('GET below the limit → 200, service called (no 429)', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service, async () => fakeSession, okLimiter);
		const res = await get(app, '/api/leaderboard/month?limit=25');
		expect(res.status).toBe(200);
		expect(calls).toEqual([{ period: 'month', viewerId: VIEWER_ID, limit: 25 }]);
	});

	it('cache-busting query strings (?cb= / ?t=) never bypass the limiter', async () => {
		const spy = vi.fn(async (options: { key: string }) => {
			void options;
			return { success: false };
		});
		const { service } = fakeService();
		const app = makeApp(service, async () => fakeSession, { limit: spy });
		const first = await get(app, '/api/leaderboard/month?cb=random1');
		const second = await get(app, '/api/leaderboard/month?t=1710000000000');
		expect(first.status).toBe(429);
		expect(second.status).toBe(429);
		// Both requests resolve to the SAME identity key (user_id) — the URL
		// never participates in keying, so cache-busting cannot reset quota.
		const keys = spy.mock.calls.map((call) => (call[0] as { key: string }).key);
		expect(keys).toEqual(['leaderboard:user-1', 'leaderboard:user-1']);
	});

	it('unauthenticated → 401 fast-path, limiter never called (guards before limiter)', async () => {
		const spy = vi.fn(async () => ({ success: false }));
		const { service } = fakeService();
		const app = makeApp(service, async () => null, { limit: spy });
		const res = await app.request(`${BASE}/api/leaderboard/today`);
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe('UNAUTHORIZED');
		expect(spy).not.toHaveBeenCalled();
	});
});