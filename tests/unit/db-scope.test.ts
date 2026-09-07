// Phase-6 production OAuth regression — database lifecycle per runtime.
//
// Root cause: getDb()/getAuth() used module-level memos, so every request
// after the first reused a Neon WebSocket client created inside request #1.
// Cloudflare Workers rejects that reuse with "Cannot perform I/O on behalf
// of a different request" (request-bound I/O objects must not be accessed
// from a different request handler), which is exactly what the production
// Google OAuth callback hit when Better Auth read the `verification` table.
//
// The lifecycle is runtime-selected (src/server/db/memo.ts):
//   - workerd (production, wrangler dev): one client per request/invocation
//     — never shared across invocations, closed at scope exit. These tests
//     PIN that invariant (mode forced to 'workerd'); the unit layer cannot
//     reproduce workerd's runtime error, so the invariant is what makes the
//     error impossible.
//   - Node/Bun (vite dev, vite preview/E2E, CI, tests): warm per-URL memo —
//     no request-bound I/O exists there, and a per-request connection costs
//     seconds from far runners (the E2E CI regression). The second group
//     pins that behavior so the two modes cannot silently drift.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb, getRequestStore, isWorkerdRuntime, setDbRuntimeMode, withDbScope } from '../../src/server/db/memo';
import { getAuth } from '../../src/server/auth/auth';
import { createDb, type Db } from '../../src/server/db/client';

const URL = 'postgresql://unused:unused@localhost:5432/unused';
const OTHER_URL = 'postgresql://other:other@localhost:5432/other';
const ENV = { DATABASE_URL: URL, BETTER_AUTH_SECRET: 'test-secret' };

function spyOnEnd(db: Db) {
	// The pools never connect in unit tests (inert URLs); stub `end` so the
	// close path is observable without touching the network.
	return vi.spyOn(db.$client, 'end').mockResolvedValue(undefined);
}

describe('runtime selection', () => {
	afterAll(() => setDbRuntimeMode('auto'));

	it('auto-detects the Node/Bun family under vitest (warm mode)', () => {
		expect(isWorkerdRuntime()).toBe(false);
	});

	it('can be pinned to workerd or node for tests/ops', () => {
		setDbRuntimeMode('workerd');
		expect(isWorkerdRuntime()).toBe(true);
		setDbRuntimeMode('node');
		expect(isWorkerdRuntime()).toBe(false);
	});
});

describe('workerd runtime (production): one client per request, never shared', () => {
	beforeAll(() => setDbRuntimeMode('workerd'));
	afterAll(() => setDbRuntimeMode('auto'));

	it('sequential request invocations never share a database client', () => {
		const first = getDb(ENV);
		const second = getDb(ENV);
		expect(first).not.toBe(second);
		expect(first.$client).not.toBe(second.$client);
	});

	it('sequential request invocations never share an auth instance', () => {
		expect(getAuth(ENV)).not.toBe(getAuth(ENV));
	});

	it('getDb still fails closed without DATABASE_URL (settlement/CLI contract)', async () => {
		await withDbScope(async () => {
			expect(() => getDb({})).toThrow('DATABASE_URL is not configured');
		});
		expect(() => getDb({})).toThrow('DATABASE_URL is not configured');
	});

	it('sequential scopes (simulated sequential Worker requests) never share a client, and each closes its own pool', async () => {
		const first = { db: undefined as unknown as Db, end: undefined as unknown as ReturnType<typeof spyOnEnd> };
		const second = { db: undefined as unknown as Db, end: undefined as unknown as ReturnType<typeof spyOnEnd> };

		await withDbScope(async () => {
			first.db = getDb(ENV);
			first.end = spyOnEnd(first.db);
		});
		await withDbScope(async () => {
			second.db = getDb(ENV);
			second.end = spyOnEnd(second.db);
		});

		expect(first.db).not.toBe(second.db);
		expect(first.db.$client).not.toBe(second.db.$client);
		// Each request closed only ITS OWN pool — nothing leaks into the next request.
		expect(first.end).toHaveBeenCalledTimes(1);
		expect(second.end).toHaveBeenCalledTimes(1);
	});

	it('parallel scopes (simulated concurrent Worker requests) never share a client', async () => {
		const results = await Promise.all(
			[1, 2, 3].map(() =>
				withDbScope(async () => {
					const db = getDb(ENV);
					const end = spyOnEnd(db);
					await new Promise((r) => setTimeout(r, 5));
					return { db, end };
				})
			)
		);
		expect(new Set(results.map((r) => r.db)).size).toBe(3);
		for (const r of results) expect(r.end).toHaveBeenCalledTimes(1);
	});

	it('within one request, getDb and getAuth share a single client (one pool per request)', async () => {
		await withDbScope(async () => {
			const db = getDb(ENV);
			expect(getDb(ENV)).toBe(db);
			const auth = getAuth(ENV);
			expect(getAuth(ENV)).toBe(auth); // one Auth per request
			// getAuth resolved its client through the same request scope.
			expect(getRequestStore()?.owned.size).toBe(1);
		});
	});

	it('auth instances differ across requests (same bindings, different invocations)', async () => {
		const first = await withDbScope(async () => getAuth(ENV));
		const second = await withDbScope(async () => getAuth(ENV));
		expect(first).not.toBe(second);
	});

	it('a scope closes its client even when work throws (no cross-request survivor)', async () => {
		let end: ReturnType<typeof spyOnEnd>;
		await expect(
			withDbScope(async () => {
				end = spyOnEnd(getDb(ENV));
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(end!).toHaveBeenCalledTimes(1);
	});

	it('a caller-injected client keeps its owner lifecycle (integration harness LOCAL_PG=1)', async () => {
		const injected = createDb(URL);
		const end = spyOnEnd(injected);
		await withDbScope(async () => {
			const auth = getAuth(ENV, injected);
			expect(auth).toBeDefined();
			// The injected client is not owned by the request scope.
			expect(getRequestStore()?.owned.size).toBe(0);
		});
		expect(end).not.toHaveBeenCalled();
	});
});

describe('node/Bun runtime (dev, preview/E2E, CI): warm per-URL memo', () => {
	beforeAll(() => setDbRuntimeMode('node'));
	afterAll(() => setDbRuntimeMode('auto'));

	it('getDb returns the same warm client across invocations (one pool per DATABASE_URL)', () => {
		const first = getDb(ENV);
		const second = getDb(ENV);
		expect(first).toBe(second);
		expect(first.$client).toBe(second.$client);
	});

	it('different DATABASE_URL values get separate pools', () => {
		expect(getDb(ENV)).not.toBe(getDb({ DATABASE_URL: OTHER_URL }));
	});

	it('getAuth returns the same warm instance across invocations', () => {
		expect(getAuth(ENV)).toBe(getAuth(ENV));
	});

	it('withDbScope is a passthrough: no store, no close, nothing leaks into the warm memo', async () => {
		const db = getDb(ENV);
		const end = spyOnEnd(db);
		await withDbScope(async () => {
			expect(getDb(ENV)).toBe(db);
			expect(getRequestStore()).toBeUndefined();
		});
		expect(end).not.toHaveBeenCalled();
	});

	it('getDb still fails closed without DATABASE_URL (settlement/CLI contract)', () => {
		expect(() => getDb({})).toThrow('DATABASE_URL is not configured');
	});
});