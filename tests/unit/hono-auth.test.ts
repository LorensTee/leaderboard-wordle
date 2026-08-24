// Phase 0 B4 — Hono-side authentication helper contract, DB-free.
//
// Coverage required by the Phase-0 audit:
//   1. an authenticated session resolves and is exposed as c.get('auth')
//   2. missing/invalid sessions are rejected with the UNAUTHORIZED envelope
//   3. Hono does NOT trust SvelteKit event.locals (bridge never passes it)
//   4. the auth middleware does not break /api/auth/*
//
// Authenticated-session resolution against a REAL Better Auth session store
// (valid signed cookie + DB row) is exercised by the B7 external gate (live
// Google OAuth flow); the unit layer proves the middleware contract with an
// injectable resolver so CI stays DB-free.
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createAuthContext, requireAuth, type AuthContext, type SessionResolver } from '../../src/server/middleware/auth';
import { requestIdMiddleware } from '../../src/server/middleware/request-id';
import app from '../../src/server/routes';
import { GET as bridgeGet } from '../../src/routes/api/[...path]/+server';

const BASE = 'http://localhost:5173';
// Inert env for composed-app requests (unit tests are DB-free; Better Auth
// treats no-cookie / bad-signature-cookie requests without a DB round-trip).
const ENV = { DATABASE_URL: 'postgresql://inert.invalid/unused' };

// Minimal shapes standing in for SessionData['session']/['user'] — the
// middleware does not interpret field values, only presence.
import type { SessionData } from '../../src/server/auth/auth';
const fakeSession = {
	session: { id: 'session-1', token: 'token-1', userId: 'user-1', expiresAt: new Date() } as SessionData['session'],
	user: { id: 'user-1', email: 'player@example.com', name: 'Player' } as SessionData['user']
};

function miniApp(resolver: SessionResolver) {
	const m = new Hono<{
		Bindings: { DATABASE_URL: string; BETTER_AUTH_SECRET?: string };
		Variables: { requestId: string; auth: AuthContext };
	}>();
	m.use('*', requestIdMiddleware);
	m.use('*', createAuthContext(resolver));
	m.use('/api/me/*', requireAuth);
	m.get('/api/me/profile', (c) => {
		const auth = c.get('auth');
		return c.json({ userId: auth?.user.id ?? null });
	});
	return m;
}

describe('Hono-side authentication helper (Phase 0 B4)', () => {
	it('resolves an authenticated session from cookies and exposes it via c.get("auth")', async () => {
		const resolver = vi.fn<SessionResolver>(async () => fakeSession);
		const m = miniApp(resolver);
		const res = await m.request(`${BASE}/api/me/profile`, {
			headers: { cookie: 'better-auth.session_token=signed-token' }
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ userId: 'user-1' });
		// The resolver received the request headers (independent session lookup).
		expect(resolver).toHaveBeenCalledTimes(1);
		const [, headers] = resolver.mock.calls[0];
		expect(headers.get('cookie')).toContain('better-auth.session_token');
	});

	it('rejects a request whose session cookie resolves to no session (invalid/revoked)', async () => {
		const m = miniApp(async () => null);
		const res = await m.request(`${BASE}/api/me/profile`, {
			headers: { cookie: 'better-auth.session_token=stale-token' }
		});
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
		expect(body.error.requestId).toBeDefined();
	});

	it('fast-path: without the session cookie the resolver is never called (DB-free)', async () => {
		const resolver = vi.fn(async () => null);
		const m = miniApp(resolver);
		const res = await m.request(`${BASE}/api/me/profile`);
		expect(res.status).toBe(401);
		expect(resolver).not.toHaveBeenCalled();
	});

	it('composed app: unauthenticated /api/game/* mutation → 401 envelope (CSRF still passes)', async () => {
		const res = await app.request(
			`${BASE}/api/game/start`,
			{
				method: 'POST',
				headers: { origin: BASE, 'content-type': 'application/json' },
				body: '{}'
			},
			ENV
		);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
		expect(typeof body.error.requestId).toBe('string');
	});

	it('composed app: invalid session cookie (bad signature) → 401 without a DB round-trip', async () => {
		// Better Auth returns null for a cookie that fails signature
		// verification BEFORE any session lookup (verified in 1.7.1 source);
		// bad-signature cookies therefore never reach the inert test DB URL.
		const res = await app.request(
			`${BASE}/api/me`,
			{ headers: { cookie: 'better-auth.session_token=not-a-valid-signed-cookie' } },
			ENV
		);
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe('UNAUTHORIZED');
	});

	it('bridge: SvelteKit event.locals is never trusted — populated locals still yield 401 without a cookie', async () => {
		// Simulates hooks.server.ts having resolved locals for a page request,
		// then the same browser request hitting the Hono API via the bridge.
		// The bridge passes only request/platform/ctx — locals must have no
		// effect on Hono's authentication decision.
		const event = {
			request: new Request(`${BASE}/api/me`, { method: 'GET' }),
			// As if hooks had resolved a session for SvelteKit composition.
			locals: { session: fakeSession.session, user: fakeSession.user }
		};
		const res = await bridgeGet(event as Parameters<typeof bridgeGet>[0]);
		expect(res.status).toBe(401);
	});

	it('/api/auth/* remains unaffected (get-session 200 null without session)', async () => {
		const res = await app.request(`${BASE}/api/auth/get-session`, undefined, ENV);
		expect(res.status).toBe(200);
		expect(await res.json()).toBeNull();
	});
});
