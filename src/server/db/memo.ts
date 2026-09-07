// Database lifecycle for the app — ONE rule:
//   a client belongs to exactly one request/invocation in Cloudflare
//   Workers; in Node/Bun the historical warm per-URL memo is both legal
//   and required for sane latency.
//
// WHY: Neon's WebSocket transport is request-scoped in the Workers
// runtime. A Pool opens its connection lazily, inside the first request
// that touches it; a module-level cache then hands that request-bound I/O
// object to every later request, and the runtime rejects the reuse with
// "Cannot perform I/O on behalf of a different request" (Workers best
// practices: I/O objects created in one request handler must not be
// accessed from a different request's handler). Production hit exactly
// that on the Google OAuth callback (Better Auth's verification read
// failed inside the Worker).
//
// Node/Bun has no request bound on sockets, but a per-request connection
// costs one TLS/WebSocket round-trip per request — ~2.4s from the CI
// runner to Neon (vs ~170ms warm), which broke the E2E toast budget. So
// the runtime is selected explicitly:
//   - workerd (deployed Worker, wrangler dev): every fetch/cron invocation
//     runs inside withDbScope(); getDb()/getAuth() share ONE client per
//     invocation and it is closed when the invocation ends.
//   - Node/Bun (vite dev, vite preview/E2E, vitest, CLI scripts): the
//     historical warm per-URL memo (never closed) — identical behavior to
//     the pre-Workers-fix code that CI/dev were tuned on.
// Detection is fail-safe: ONLY a Node.js or Bun user agent selects warm
// mode; any unknown runtime keeps the production-safe request-scoped path.
import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError, ERROR_CODES } from '../lib/errors';
import { createDb, closeDb, type Db } from './client';
import type { Auth } from '../auth/auth';

/** Dev/test-only inert URL for auth factories / schema generation. */
export const INERT_DB_URL = 'postgresql://unused:unused@localhost:5432/unused';

export type DbEnv = { DATABASE_URL?: string };

/**
 * State shared by every database/auth consumer within ONE request.
 * getDb() keys clients by DATABASE_URL; auth.ts keys Better Auth instances
 * by its existing identity key. `owned` tracks only the clients THIS
 * request created, so a caller-injected client (integration harness
 * LOCAL_PG=1) keeps its owner's lifecycle.
 */
export type RequestStore = {
	dbs: Map<string, Db>;
	owned: Set<Db>;
	auths: Map<string, Auth>;
};

const scope = new AsyncLocalStorage<RequestStore>();

/** Node/Bun warm memo (historical lifecycle; see module header). */
const nodeCache = new Map<string, Db>();

/** Test/ops seam: pin the runtime mode ('auto' restores detection). */
let forcedRuntime: 'workerd' | 'node' | undefined;
export function setDbRuntimeMode(mode: 'workerd' | 'node' | 'auto'): void {
	forcedRuntime = mode === 'auto' ? undefined : mode;
}

/**
 * True on the Cloudflare Workers runtime. Fail-safe: unknown runtimes are
 * treated as workerd (request-scoped I/O) — only the two Node-family
 * runtimes (Node.js, Bun) that plainly have no request-bound sockets get
 * the warm memo.
 */
export function isWorkerdRuntime(): boolean {
	if (forcedRuntime) return forcedRuntime === 'workerd';
	const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
	return !ua.startsWith('Node.js/') && !ua.startsWith('Bun/');
}

/** The active request store, or undefined outside a request scope. */
export function getRequestStore(): RequestStore | undefined {
	return isWorkerdRuntime() ? scope.getStore() : undefined;
}

/**
 * Run `fn` as one request/invocation scope and close every client the scope
 * created before returning. Close failures never mask the request result
 * (Promise.allSettled). On Node/Bun this is a passthrough — no request
 * scoping exists and the warm memo owns the clients. On workerd it is
 * called ONLY from the two runtime entry points (hooks.server.ts fetch
 * wrapper, scheduled-entry.ts cron shell).
 */
export async function withDbScope<T>(fn: () => Promise<T>): Promise<T> {
	if (!isWorkerdRuntime()) return fn();
	const store: RequestStore = { dbs: new Map(), owned: new Set(), auths: new Map() };
	return scope.run(store, async () => {
		try {
			return await fn();
		} finally {
			await Promise.allSettled([...store.owned].map((db) => closeDb(db)));
		}
	});
}

/**
 * Resolve the client for `url`: request-scoped on workerd (created lazily
 * on first use inside this request, closed at scope exit); warm per-URL
 * memo on Node/Bun. Never a workerd cross-request memo either way.
 */
function resolveDb(url: string): Db {
	if (!isWorkerdRuntime()) {
		let db = nodeCache.get(url);
		if (!db) {
			db = createDb(url);
			nodeCache.set(url, db);
		}
		return db;
	}
	const store = scope.getStore();
	if (!store) return createDb(url);
	let db = store.dbs.get(url);
	if (!db) {
		db = createDb(url);
		store.dbs.set(url, db);
		store.owned.add(db);
	}
	return db;
}

/**
 * Application DB client. Fail-closed: throws INTERNAL when DATABASE_URL is
 * missing (unchanged contract — the settlement shell and middleware rely on
 * it). Returns the runtime-appropriate client (never a workerd cross-request
 * memoized Pool).
 */
export function getDb(env: DbEnv): Db {
	const url = env.DATABASE_URL;
	if (!url) {
		throw new AppError(ERROR_CODES.INTERNAL, 'DATABASE_URL is not configured', 500);
	}
	return resolveDb(url);
}

/**
 * Auth-bound client: like getDb, but tolerates a missing DATABASE_URL with
 * INERT_DB_URL so auth factories stay constructible in dev/tests (the
 * secret-availability policy lives in auth.ts; a missing URL is a
 * test/tooling condition — production always has the binding and shares the
 * request client through this same path).
 */
export function getDbForAuth(env: DbEnv): Db {
	return resolveDb(env.DATABASE_URL ?? INERT_DB_URL);
}