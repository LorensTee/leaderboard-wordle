// Phase-2 profile route wire contract — DB-free, mirroring the composed
// middleware chain (requestId → CSRF → authContext → requireAuth → routes →
// onError/notFound) with an injectable profile service. Proves: 401 gating
// on /api/me/*, response shape, strict Zod body (unknown fields rejected),
// NG21 envelope mapping for the new profile-domain codes.
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { registerProfileRoutes } from '../../src/server/profile/handlers';
import { createAuthContext, requireAuth, type AuthContext, type SessionResolver } from '../../src/server/middleware/auth';
import { csrfProtection } from '../../src/server/middleware/csrf';
import { requestIdMiddleware } from '../../src/server/middleware/request-id';
import { notFoundHandler, onErrorHandler, AppError, ERROR_CODES } from '../../src/server/lib/errors';
import { createProfileService, type MeUser, type ProfileService } from '../../src/server/profile/service';
import type { SessionData } from '../../src/server/auth/auth';

const BASE = 'http://localhost:5173';
const NEXT = `${BASE}/api/me/profile`;

const ME: MeUser = {
	id: 'user-1',
	name: 'speedy',
	avatarEmoji: '🦊',
	role: 'player',
	onboardingCompleted: true
};

const fakeSession = {
	session: { id: 'session-1', token: 'token-1', userId: 'user-1', expiresAt: new Date() } as SessionData['session'],
	user: { id: 'user-1', email: 'player@example.com', name: 'Player' } as SessionData['user']
};

type MiniEnv = {
	Bindings: { DATABASE_URL: string; ADMIN_EMAIL?: string };
	Variables: { requestId: string; auth: AuthContext };
};

function makeApp(service: ProfileService, resolver: SessionResolver = async () => fakeSession) {
	const m = new Hono<MiniEnv>();
	m.use('*', requestIdMiddleware);
	m.use('*', csrfProtection);
	m.use('*', createAuthContext(resolver));
	m.use('/api/me/*', requireAuth);
	registerProfileRoutes(m as unknown as Hono<import('../../src/server/routes').AppEnv>, {
		getService: () => service
	});
	m.onError(onErrorHandler);
	m.notFound(notFoundHandler);
	return m;
}

function fakeService(overrides: Partial<ProfileService> = {}): ProfileService {
	return {
		getMe: vi.fn(async () => ME),
		updateProfile: vi.fn(async () => ME),
		...overrides
	};
}

/** Authenticated request headers (session cookie triggers authContext). */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return { cookie: 'better-auth.session_token=signed', ...extra };
}

async function patch(
	app: ReturnType<typeof makeApp>,
	body: unknown,
	headers: Record<string, string> = {}
): Promise<Response> {
	return app.request(NEXT, {
		method: 'PATCH',
		headers: authHeaders({ origin: BASE, 'content-type': 'application/json', ...headers }),
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

describe('profile routes (wire contract, DB-free)', () => {
	it('GET /api/me → 200 with the minimal user shape', async () => {
		const app = makeApp(fakeService());
		const res = await app.request(`${BASE}/api/me`, { headers: authHeaders({ origin: BASE }) });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ user: ME });
	});

	it('PATCH /api/me/profile → 200 with the updated user', async () => {
		const service = fakeService({ updateProfile: vi.fn(async () => ({ ...ME, name: 'alex' })) });
		const app = makeApp(service);
		const res = await patch(app, { displayName: 'alex' });
		expect(res.status).toBe(200);
		expect((await res.json()).user.name).toBe('alex');
	});

	it('unauthenticated /api/me stays 401 UNAUTHORIZED (requireAuth mounted)', async () => {
		const app = makeApp(fakeService(), async () => null);
		const res = await app.request(`${BASE}/api/me`);
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe(ERROR_CODES.UNAUTHORIZED);
	});

	it('strict body: unknown fields → 400 BAD_REQUEST', async () => {
		const app = makeApp(fakeService());
		const res = await patch(app, { displayName: 'alex', role: 'admin' });
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe(ERROR_CODES.BAD_REQUEST);
	});

	it('strict body: empty PATCH (no fields) → 400 BAD_REQUEST', async () => {
		const app = makeApp(fakeService());
		const res = await patch(app, {});
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe(ERROR_CODES.BAD_REQUEST);
	});

	it('malformed JSON → 400 BAD_REQUEST envelope (sanitized)', async () => {
		const app = makeApp(fakeService());
		const res = await patch(app, '{not json');
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe(ERROR_CODES.BAD_REQUEST);
	});

	it('profile error codes map to the NG21 envelope with their statuses', async () => {
		const cases: [string, number, string][] = [
			[ERROR_CODES.INVALID_NAME, 400, 'Name must'],
			[ERROR_CODES.NAME_MODERATED, 400, 'This name is not allowed'],
			[ERROR_CODES.NAME_TAKEN, 409, 'already taken'],
			[ERROR_CODES.INVALID_AVATAR, 400, 'curated set'],
			[ERROR_CODES.INCOMPLETE_ONBOARDING, 400, 'both required']
		];
		for (const [code, status, message] of cases) {
			const service = fakeService({
				updateProfile: vi.fn(async () => {
					throw new AppError(code, message, status);
				})
			});
			const app = makeApp(service);
			const res = await patch(app, { displayName: 'alex', avatarEmoji: '🦊' });
			expect(res.status, code).toBe(status);
			const body = await res.json();
			expect(body.error.code).toBe(code);
			expect(body.error.message).toBe(message);
			expect(body.error.requestId).toBeDefined();
		}
	});

	it('CSRF remains fail-closed for the PATCH mutation without an Origin', async () => {
		const app = makeApp(fakeService());
		const res = await patch(app, { displayName: 'alex' }, { origin: '' });
		expect(res.status).toBe(403);
		expect((await res.json()).error.code).toBe(ERROR_CODES.CSRF);
	});

	it('unknown /api/me path → 404 NG21 envelope', async () => {
		const app = makeApp(fakeService());
		const res = await app.request(`${BASE}/api/me/nope`, { headers: authHeaders() });
		expect(res.status).toBe(404);
		expect((await res.json()).error.code).toBe(ERROR_CODES.NOT_FOUND);
	});

	void createProfileService;
});