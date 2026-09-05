// Phase-4 admin route wire contract (plan §10.1) — DB-free, mirroring the
// composed middleware chain (requestId → CSRF → authContext → requireAuth →
// requireAdmin → routes → onError/notFound) with an injectable admin
// service. Proves: 401 gating, 403 role gating (D1), six endpoints,
// strict-body rejection, UUID short-circuit 404, NG21 envelope mapping,
// and response pass-through.
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../src/server/middleware/auth';
import { createAuthContext, requireAdmin, requireAuth, type SessionResolver } from '../../src/server/middleware/auth';
import { csrfProtection } from '../../src/server/middleware/csrf';
import { requestIdMiddleware } from '../../src/server/middleware/request-id';
import { notFoundHandler, onErrorHandler, AppError } from '../../src/server/lib/errors';
import { registerAdminRoutes } from '../../src/server/admin/handlers';
import type {
	AdminPuzzle,
	AdminPuzzleService,
	AnswerSearchResponse,
	ValidateWordResult
} from '../../src/server/admin/service';
import type { SessionData } from '../../src/server/auth/auth';

const BASE = 'http://localhost:5173';
const ADMIN_ID = 'user-admin';
const FUZZY_UUID = '00000000-0000-4000-8000-000000000001';

function makeSession(role: 'admin' | 'player') {
	const fakeSession = {
		session: { id: 'session-1', token: 'token-1', userId: ADMIN_ID, expiresAt: new Date() } as SessionData['session'],
		user: {
			id: ADMIN_ID,
			email: role === 'admin' ? 'admin@test.dev' : 'player@test.dev',
			name: 'Tester',
			role
		} as SessionData['user']
	};
	return fakeSession;
}

type MiniEnv = {
	Bindings: { DATABASE_URL: string; ADMIN_EMAIL?: string };
	Variables: { requestId: string; auth: AuthContext };
};

function makeApp(
	service: AdminPuzzleService,
	resolver: SessionResolver = async () => makeSession('admin')
) {
	const m = new Hono<MiniEnv>();
	m.use('*', requestIdMiddleware);
	m.use('*', csrfProtection);
	m.use('*', createAuthContext(resolver));
	m.use('/api/admin/*', requireAuth);
	m.use('/api/admin/*', requireAdmin);
	registerAdminRoutes(m as unknown as Hono<import('../../src/server/routes').AppEnv>, {
		getService: () => service
	});
	m.onError(onErrorHandler);
	m.notFound(notFoundHandler);
	return m;
}

const SAMPLE_PUZZLE: AdminPuzzle = {
	id: FUZZY_UUID,
	date: '2026-09-10',
	status: 'SCHEDULED',
	hintLetter: 'R',
	lockedAt: null,
	expiresAt: '2026-09-10T16:00:00.000Z',
	word: 'river'
};

function fakeService(overrides: Partial<AdminPuzzleService> = {}): {
	service: AdminPuzzleService;
	calls: { method: string; args: unknown[] }[];
} {
	const calls: { method: string; args: unknown[] }[] = [];
	const record =
		(method: string) =>
		(...args: unknown[]) => {
			calls.push({ method, args });
		};
	const service: AdminPuzzleService = {
		listPuzzles: vi.fn(async (from?: string, to?: string) => {
			record('listPuzzles')(from, to);
			return [SAMPLE_PUZZLE];
		}),
		validateWord: vi.fn(async (word: string): Promise<ValidateWordResult> => {
			record('validateWord')(word);
			return { approved: true, previouslyUsed: false, usedOn: null };
		}),
		searchAnswers: vi.fn(
			async (rawQuery: string, limit: number): Promise<AnswerSearchResponse> => {
				record('searchAnswers')(rawQuery, limit);
				return { results: [{ word: 'about', usedOn: null }], total: 1 };
			}
		),
		schedulePuzzle: vi.fn(async () => {
			record('schedulePuzzle')();
			return SAMPLE_PUZZLE;
		}),
		updatePuzzle: vi.fn(async () => {
			record('updatePuzzle')();
			return { puzzle: SAMPLE_PUZZLE, gaps: [] };
		}),
		deletePuzzle: vi.fn(async (): Promise<{ deleted: true; gaps: string[] }> => {
			record('deletePuzzle')();
			return { deleted: true, gaps: [] };
		}),
		replaceTodayPuzzle: vi.fn(async () => {
			record('replaceTodayPuzzle')();
			return SAMPLE_PUZZLE;
		}),
		...overrides
	};
	return { service, calls };
}

const COOKIE = { cookie: 'better-auth.session_token=signed' };
// CSRF (NG4): unsafe methods need a same-origin signal — mirror the
// profile-routes unit pattern (origin header matching the request base).
const ADMIN_JSON = { origin: BASE, 'content-type': 'application/json' };

async function req(
	app: ReturnType<typeof makeApp>,
	path: string,
	init: RequestInit = {}
): Promise<Response> {
	return app.request(`${BASE}${path}`, { headers: { ...COOKIE, ...ADMIN_JSON }, ...init });
}

describe('admin routes (wire contract, DB-free)', () => {
	it('GET /api/admin/puzzles → 200 pass-through with the D4 default window (no query)', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ puzzles: [SAMPLE_PUZZLE] });
		expect(calls[0]).toEqual({ method: 'listPuzzles', args: [undefined, undefined] });
	});

	it('GET with from/to passes the window through', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles?from=2026-08-01&to=2026-09-30');
		expect(res.status).toBe(200);
		expect(calls[0].args).toEqual(['2026-08-01', '2026-09-30']);
	});

	it('GET with an invalid window → 400 BAD_REQUEST (NG21 envelope)', async () => {
		const { service } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles?from=nope');
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('BAD_REQUEST');
		expect(body.error.requestId).toBeDefined();
	});

	it('POST /api/admin/puzzles → 201 { puzzle } with a strict body', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles', {
			method: 'POST',
			body: JSON.stringify({ puzzleDate: '2026-09-10', word: 'river', hintLetter: 'R' })
		});
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ puzzle: SAMPLE_PUZZLE });
		expect(calls[0].method).toBe('schedulePuzzle');
	});

	it('POST with an extra/unknown field → 400 (strict body rejection)', async () => {
		const { service } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles', {
			method: 'POST',
			body: JSON.stringify({ puzzleDate: '2026-09-10', word: 'river', hintLetter: 'R', status: 'ACTIVE' })
		});
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('BAD_REQUEST');
	});

	it('POST with a malformed date (2026-02-30) → 400 (calendar validity)', async () => {
		const { service } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles', {
			method: 'POST',
			body: JSON.stringify({ puzzleDate: '2026-02-30', word: 'river', hintLetter: 'R' })
		});
		expect(res.status).toBe(400);
	});

	it('PATCH /api/admin/puzzles/:id → 200 { puzzle, gaps } (empty patch → 400)', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const ok = await req(app, `/api/admin/puzzles/${FUZZY_UUID}`, {
			method: 'PATCH',
			body: JSON.stringify({ hintLetter: 'V' })
		});
		expect(ok.status).toBe(200);
		expect(calls[0].method).toBe('updatePuzzle');
		const empty = await req(app, `/api/admin/puzzles/${FUZZY_UUID}`, {
			method: 'PATCH',
			body: JSON.stringify({})
		});
		expect(empty.status).toBe(400);
	});

	it('DELETE /api/admin/puzzles/:id → 200 { deleted, gaps }', async () => {
		const { service } = fakeService();
		const app = makeApp(service);
		const res = await req(app, `/api/admin/puzzles/${FUZZY_UUID}`, { method: 'DELETE' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ deleted: true, gaps: [] });
	});

	it('POST /api/admin/puzzles/:id/replace-today → 200 { puzzle } (strict body without date)', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const res = await req(app, `/api/admin/puzzles/${FUZZY_UUID}/replace-today`, {
			method: 'POST',
			body: JSON.stringify({ word: 'about', hintLetter: 'A' })
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ puzzle: SAMPLE_PUZZLE });
		expect(calls[0].method).toBe('replaceTodayPuzzle');
		const withDate = await req(app, `/api/admin/puzzles/${FUZZY_UUID}/replace-today`, {
			method: 'POST',
			body: JSON.stringify({ puzzleDate: '2026-09-10', word: 'about', hintLetter: 'A' })
		});
		expect(withDate.status).toBe(400); // strict — no date field allowed
	});

	it('POST /api/admin/puzzles/validate → 200 D5 result (never reaches service for empty word)', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles/validate', {
			method: 'POST',
			body: JSON.stringify({ word: 'river' })
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ approved: true, previouslyUsed: false, usedOn: null });
		expect(calls[0]).toEqual({ method: 'validateWord', args: ['river'] });
	});

	it('GET /api/admin/puzzles/search → 200 bounded response with the default limit (20)', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles/search?q=about');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ results: [{ word: 'about', usedOn: null }], total: 1 });
		expect(calls[0]).toEqual({ method: 'searchAnswers', args: ['about', 20] });
	});

	it('GET search passes an explicit limit through', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles/search?q=ab&limit=5');
		expect(res.status).toBe(200);
		expect(calls[0].args).toEqual(['ab', 5]);
	});

	it('GET search with a limit of 50 (max) is accepted; the SQL LIMIT stays the real bound', async () => {
		const { service } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles/search?q=ab&limit=50');
		expect(res.status).toBe(200);
	});

	it.each([
		['missing q', '/api/admin/puzzles/search'],
		['blank q', '/api/admin/puzzles/search?q=%20%20'],
		['too-long q', `/api/admin/puzzles/search?q=${'a'.repeat(65)}`],
		['non-integer limit', '/api/admin/puzzles/search?q=ab&limit=2.5'],
		['limit 0', '/api/admin/puzzles/search?q=ab&limit=0'],
		['limit 51', '/api/admin/puzzles/search?q=ab&limit=51'],
		['unknown param', '/api/admin/puzzles/search?q=ab&extra=x']
	])('GET search with %s → 400 BAD_REQUEST (service never reached)', async (_label, path) => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const res = await req(app, path);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('BAD_REQUEST');
		expect(body.error.requestId).toBeDefined();
		expect(calls).toEqual([]);
	});

	it('GET search with a service error maps to its NG21 envelope status', async () => {
		const { service } = fakeService({
			searchAnswers: vi.fn(async () => {
				throw new AppError('BAD_REQUEST', 'Search query must be 1–64 characters after trimming', 400);
			})
		});
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles/search?q=ab');
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('BAD_REQUEST');
	});

	it('non-UUID :id short-circuits to 404 WITHOUT a DB round-trip', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles/not-a-uuid', { method: 'DELETE' });
		expect(res.status).toBe(404);
		expect((await res.json()).error.code).toBe('NOT_FOUND');
		expect(calls).toEqual([]);
	});

	it('unauthenticated /api/admin/* → 401 UNAUTHORIZED (requireAuth first)', async () => {
		const { service } = fakeService();
		const app = makeApp(service, async () => null);
		const res = await app.request(`${BASE}/api/admin/puzzles`);
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe('UNAUTHORIZED');
	});

	it('authenticated non-admin (role: player) → 403 FORBIDDEN on every endpoint', async () => {
		const { service, calls } = fakeService();
		const app = makeApp(service, async () => makeSession('player'));
		const endpoints: [string, RequestInit?][] = [
			['/api/admin/puzzles'],
			['/api/admin/puzzles', { method: 'POST', body: JSON.stringify({ puzzleDate: '2026-09-10', word: 'river', hintLetter: 'R' }) }],
			[`/api/admin/puzzles/${FUZZY_UUID}`, { method: 'PATCH', body: JSON.stringify({ hintLetter: 'V' }) }],
			[`/api/admin/puzzles/${FUZZY_UUID}`, { method: 'DELETE' }],
			[`/api/admin/puzzles/${FUZZY_UUID}/replace-today`, { method: 'POST', body: JSON.stringify({ word: 'about', hintLetter: 'A' }) }],
			['/api/admin/puzzles/validate', { method: 'POST', body: JSON.stringify({ word: 'river' }) }],
			['/api/admin/puzzles/search?q=about']
		];
		for (const [path, init] of endpoints) {
			const res = await req(app, path, init);
			expect(res.status).toBe(403);
			expect((await res.json()).error.code).toBe('FORBIDDEN');
		}
		expect(calls).toEqual([]); // the service was never reached
	});

	it('service AppError maps to its NG21 envelope status', async () => {
		const { service } = fakeService({
			schedulePuzzle: vi.fn(async () => {
				throw new AppError('ANSWER_NOT_APPROVED', 'not approved', 400);
			})
		});
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles', {
			method: 'POST',
			body: JSON.stringify({ puzzleDate: '2026-09-10', word: 'river', hintLetter: 'R' })
		});
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('ANSWER_NOT_APPROVED');
	});

	it('unknown /api/admin path → 404 NG21 envelope', async () => {
		const { service } = fakeService();
		const app = makeApp(service);
		const res = await req(app, '/api/admin/puzzles/extra-path');
		expect(res.status).toBe(404);
		expect((await res.json()).error.code).toBe('NOT_FOUND');
	});
});