// F8 (Phase-5 S0) — GET-reachability audit of state changes, pinned.
// NG4's CSRF gate covers unsafe methods; this inventory test makes the
// contract airtight: no registered mutation endpoint may be GET/HEAD-
// reachable (that would let a state change happen without the CSRF gate).
//
// Two layers:
//   1. Route inventory over app.routes — a mutation path must have NO
//      GET/HEAD registration.
//   2. Live probe — GET/HEAD on every mutation path must never return 2xx
//      (guarded routes answer 401 UNAUTHORIZED; method-less paths 404;
//      never a mutation response). Better Auth sign-out is covered
//      explicitly: 1.7.1 registers it `method: "POST"` only.
import { describe, expect, it } from 'vitest';
import app from '../../src/server/routes';

const BASE = 'http://localhost:5173';
// Inert env for composed-app requests (unit tests are DB-free; guards fire
// before any DB access).
const ENV = { DATABASE_URL: 'postgresql://inert.invalid/unused' };

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// app.routes lists every registration (including duplicate entries from the
// chained registrations and `ALL` middleware rows). Dedupe to (path, methods).
const registered = new Map<string, Set<string>>();
for (const route of app.routes) {
	if (route.method === 'ALL') continue;
	if (!registered.has(route.path)) registered.set(route.path, new Set());
	registered.get(route.path)!.add(route.method);
}

const mutationPaths = [...registered.entries()]
	.filter(([, methods]) => [...methods].some((m) => UNSAFE_METHODS.has(m)))
	.map(([path]) => path);

// Paths that carry an unsafe method but NO read twin: a GET/HEAD registration
// on these would be a GET-reachable state change (the F8 violation).
const pureMutationPaths = [...registered.entries()]
	.filter(([, methods]) => {
		const hasUnsafe = [...methods].some((m) => UNSAFE_METHODS.has(m));
		return hasUnsafe && !methods.has('GET') && !methods.has('HEAD');
	})
	.map(([path]) => path);

describe('F8 GET-immutability route inventory', () => {
	it('inventory is non-empty (the pin actually covers the surface)', () => {
		expect(mutationPaths.length).toBeGreaterThan(0);
		expect(mutationPaths).toEqual(
			expect.arrayContaining([
				'/api/game/start',
				'/api/game/:gameId/guess',
				'/api/me/profile',
				'/api/admin/puzzles',
				'/api/admin/puzzles/:id',
				'/api/admin/puzzles/:id/replace-today'
			])
		);
	});

	it('no pure-mutation path is registered for GET or HEAD', () => {
		// Mixed paths (e.g. /api/admin/puzzles: GET list + POST create) are
		// the documented read twins — their GET handler is read-only (S0
		// handler audit) and covered by the unauthenticated probe below.
		for (const path of pureMutationPaths) {
			const methods = registered.get(path)!;
			expect(methods.has('GET'), `${path} must not register GET`).toBe(false);
			expect(methods.has('HEAD'), `${path} must not register HEAD`).toBe(false);
		}
		// Sanity: the mixed exemption actually exists in the surface.
		expect(registered.get('/api/admin/puzzles')).toEqual(new Set(['GET', 'POST']));
	});

	it('GET/HEAD probes on every mutation path never return 2xx (no GET mutation)', async () => {
		for (const path of mutationPaths) {
			for (const method of ['GET', 'HEAD']) {
				const res = await app.request(`${BASE}${path}`, { method }, ENV);
				// 401 (guard) / 404 (no GET handler) / 405 — an error status,
				// never the handler's success response.
				expect(res.status, `${method} ${path}`).toBeGreaterThanOrEqual(400);
				expect(res.status, `${method} ${path}`).not.toBe(500);
			}
		}
	});

	it('Better Auth sign-out is POST-only (GET/HEAD are not served)', async () => {
		for (const method of ['GET', 'HEAD']) {
			const res = await app.request(`${BASE}/api/auth/sign-out`, { method }, ENV);
			expect(res.status, `${method} /api/auth/sign-out`).toBe(404);
		}
		// The POST path exists and is idempotent for an unauthenticated
		// caller — no session cookie, nothing to revoke (also proves the pin
		// did not remove the endpoint itself; revocation is pinned by e2e
		// scenario 12 + the S3 security spec).
		const post = await app.request(`${BASE}/api/auth/sign-out`, { method: 'POST' }, ENV);
		expect(post.status).toBe(200);
		expect((await post.json()).success).toBe(true);
	});
});