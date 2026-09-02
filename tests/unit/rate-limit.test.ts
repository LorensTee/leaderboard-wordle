// Phase-5 S1 (F1) — rate-limiting middleware contract (plan §F).
//   - missing binding ⇒ pass-through, never fail closed;
//   - 429 RATE_LIMITED envelope + Retry-After + x-ratelimit-* headers;
//   - keying: session user_id, else CF-Connecting-IP, else explicit
//     per-request dev key (never a shared constant);
//   - OPTIONS and non-unsafe methods skipped (GET reads not app-limited;
//     auth class POST-only so OAuth callback GETs are never throttled);
//   - per-class config resolves its own binding namespace.
// The composed-app cases run binding-absent (pass-through) — DB-free.
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { requestIdMiddleware } from '../../src/server/middleware/request-id';
import {
	createRateLimitMiddleware,
	RATE_LIMIT_CLASSES,
	type RateLimitBinding
} from '../../src/server/middleware/rate-limit';
import type { AuthContext } from '../../src/server/middleware/auth';
import app from '../../src/server/routes';

const BASE = 'http://localhost:5173';
const ENV = { DATABASE_URL: 'postgresql://inert.invalid/unused' };

const okLimiter: RateLimitBinding = { limit: async () => ({ success: true }) };
const denyLimiter: RateLimitBinding = { limit: async () => ({ success: false }) };

/** Typed spy limiter (records the key argument; typed params fix mock.calls). */
function makeSpy(outcome: boolean) {
	return vi.fn(async (options: { key: string }) => {
		void options;
		return { success: outcome };
	});
}

type ProbeEnv = {
	Variables: { requestId: string; auth: AuthContext };
};

function probeApp(opts: {
	className: 'auth' | 'game' | 'me' | 'admin';
	limiter?: RateLimitBinding;
	auth?: AuthContext;
}) {
	return new Hono<ProbeEnv>()
		.use('*', requestIdMiddleware)
		.use('*', (c, next) => {
			c.set('auth', opts.auth ?? null);
			return next();
		})
		.use(
			`/api/${opts.className}/*`,
			createRateLimitMiddleware(opts.className, {
				getBinding: () => opts.limiter ?? undefined
			})
		)
		.all('/api/*', (c) => c.json({ ok: true }, 200));
}

describe('rate limiting (S1)', () => {
	it('F.6 pass-through: binding absent → requests succeed (never fail closed)', async () => {
		const res = await app.request(
			`${BASE}/api/game/start`,
			{ method: 'POST', headers: { origin: BASE } },
			ENV
		);
		// Guard fires before the limiter (401 fast-path), and without a
		// binding no 429 can appear anywhere on the composed app.
		expect(res.status).toBe(401);
		const authRes = await app.request(
			`${BASE}/api/auth/sign-in`,
			{ method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } },
			ENV
		);
		expect(authRes.status).not.toBe(429);
	});

	it('F.4: 429 carries the RATE_LIMITED envelope + rate-limit headers', async () => {
		const res = await probeApp({ className: 'auth', limiter: denyLimiter }).request(
			`${BASE}/api/auth/sign-in`,
			{ method: 'POST' }
		);
		expect(res.status).toBe(429);
		const body = await res.json();
		expect(body.error.code).toBe('RATE_LIMITED');
		expect(body.error.message).toBe('Rate limit exceeded');
		expect(body.error.requestId).toBeTruthy();
		// requestId echoed in the header too (NG21 correlation).
		expect(res.headers.get('x-request-id')).toBe(body.error.requestId);
		expect(res.headers.get('retry-after')).toBe('60');
		expect(res.headers.get('x-ratelimit-limit')).toBe('10'); // auth class PROPOSED
		expect(res.headers.get('x-ratelimit-remaining')).toBe('0');
		expect(Number(res.headers.get('x-ratelimit-reset'))).toBeGreaterThan(Date.now() / 1000);
	});

	it('success outcome → request proceeds', async () => {
		const res = await probeApp({ className: 'game', limiter: okLimiter }).request(
			`${BASE}/api/game/start`,
			{ method: 'POST' }
		);
		expect(res.status).toBe(200);
		expect((await res.json()).ok).toBe(true);
	});

	it('F.3 keying: authenticated → user_id-scoped key', async () => {
		const spy = makeSpy(true);
		await probeApp({
			className: 'me',
			limiter: { limit: spy },
			auth: {
				session: { userId: 'user-1' } as never,
				user: { id: 'user-1' } as never
			}
		}).request(`${BASE}/api/me/profile`, { method: 'PATCH' });
		expect(spy).toHaveBeenCalledWith({ key: 'me:user-1' });
	});

	it('F.3 keying: no session → CF-Connecting-IP-scoped key', async () => {
		const spy = makeSpy(true);
		await probeApp({ className: 'game', limiter: { limit: spy } }).request(
			`${BASE}/api/game/start`,
			{ method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.7' } }
		);
		expect(spy).toHaveBeenCalledWith({ key: 'game:ip:203.0.113.7' });
	});

	it('F.3 keying: no session, no IP → explicit per-request dev key (never shared)', async () => {
		const spy = makeSpy(true);
		const first = await probeApp({ className: 'auth', limiter: { limit: spy } }).request(
			`${BASE}/api/auth/sign-in`,
			{ method: 'POST' }
		);
		const second = await probeApp({ className: 'auth', limiter: { limit: spy } }).request(
			`${BASE}/api/auth/sign-in`,
			{ method: 'POST' }
		);
		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(spy).toHaveBeenCalledTimes(2);
		const keys = spy.mock.calls.map((call) => (call[0] as { key: string }).key);
		const [k1, k2] = keys;
		expect(k1).toMatch(/^auth:dev:/);
		expect(k2).toMatch(/^auth:dev:/);
		expect(k1).not.toBe(k2); // per-request unique → cannot trip on a shared value
	});

	it('F.3: OPTIONS is skipped (limiter never called)', async () => {
		const spy = makeSpy(false);
		const res = await probeApp({ className: 'me', limiter: { limit: spy } }).request(
			`${BASE}/api/me/profile`,
			{ method: 'OPTIONS' }
		);
		expect(res.status).toBe(200);
		expect(spy).not.toHaveBeenCalled();
	});

	it('auth class is POST-only: GET is never throttled (OAuth callbacks)', async () => {
		const spy = makeSpy(false);
		const res = await probeApp({ className: 'auth', limiter: { limit: spy } }).request(
			`${BASE}/api/auth/callback/google`,
			{ method: 'GET' }
		);
		expect(res.status).toBe(200);
		expect(spy).not.toHaveBeenCalled();
	});

	it('session classes throttle only unsafe methods (GET reads pass)', async () => {
		const spy = makeSpy(false);
		const res = await probeApp({
			className: 'game',
			limiter: { limit: spy },
			auth: { session: { userId: 'user-1' } as never, user: { id: 'user-1' } as never }
		}).request(`${BASE}/api/game/current`, { method: 'GET' });
		expect(res.status).toBe(200);
		expect(spy).not.toHaveBeenCalled();
	});

	it('per-class config resolves its own binding namespace', () => {
		expect(RATE_LIMIT_CLASSES.auth.bindingName).toBe('AUTH_RATE_LIMITER');
		expect(RATE_LIMIT_CLASSES.game.bindingName).toBe('GAME_RATE_LIMITER');
		expect(RATE_LIMIT_CLASSES.me.bindingName).toBe('ME_RATE_LIMITER');
		expect(RATE_LIMIT_CLASSES.admin.bindingName).toBe('ADMIN_RATE_LIMITER');
	});

	it('mounted order on the composed app: guards before session limiters', async () => {
		// POST /api/game/start unauthenticated → CSRF (403, headerless) then
		// guard (401, same-origin): the game limiter is only reachable AFTER
		// requireAuth, so an unauthenticated request can never be 429.
		const noOrigin = await app.request(`${BASE}/api/game/start`, { method: 'POST' }, ENV);
		expect(noOrigin.status).toBe(403); // CSRF before guards (plan §D.1)
		const res = await app.request(
			`${BASE}/api/game/start`,
			{ method: 'POST', headers: { origin: BASE } },
			ENV
		);
		expect(res.status).toBe(401);
		// /api/admin/* limiter mounts after requireAdmin: unauthenticated is
		// 401 (same-origin), never 429.
		const admin = await app.request(
			`${BASE}/api/admin/puzzles`,
			{ method: 'POST', headers: { origin: BASE } },
			ENV
		);
		expect(admin.status).toBe(401);
	});
});