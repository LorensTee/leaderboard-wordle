// Per-request database lifecycle for Cloudflare Workers (Phase-6 OAuth fix).
//
// WHY NOT A MODULE-LEVEL MEMO: Neon's WebSocket transport is request-scoped
// in the Workers runtime. A Pool opens its connection lazily, inside the
// first request that touches it; a module-level cache then hands that
// request-bound I/O object to every later request, and the runtime rejects
// the reuse with "Cannot perform I/O on behalf of a different request"
// (Workers best practices: I/O objects created in one request handler must
// not be accessed from a different request's handler). Production hit
// exactly that on the Google OAuth callback — Better Auth's verification
// read failed inside the Worker, not at Google or the database.
//
// Lifecycle: every client is owned by exactly ONE request/invocation.
// All fetch traffic is wrapped in a per-request scope by hooks.server.ts
// (SvelteKit `handle` runs before every route/handler/page load); the cron
// shell wraps itself (scheduled-entry.ts). Inside a scope, getDb()/getAuth()
// share a single Pool per request via AsyncLocalStorage (nodejs_compat —
// already a hard dependency of Better Auth), and withDbScope() closes it
// when the request ends. Outside a scope (CLI scripts, unit tests) a fresh
// client is created per call and NEVER memoized — cross-request reuse is
// impossible by construction.
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

/** The active request store, or undefined outside a request scope. */
export function getRequestStore(): RequestStore | undefined {
	return scope.getStore();
}

/**
 * Run `fn` as one request/invocation scope and close every client the scope
 * created before returning. Close failures never mask the request result
 * (Promise.allSettled). Called ONLY from the two runtime entry points
 * (hooks.server.ts fetch wrapper, scheduled-entry.ts cron shell).
 */
export async function withDbScope<T>(fn: () => Promise<T>): Promise<T> {
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
 * Resolve the client for `url`: the request-scoped client (created lazily
 * on first use inside this request, closed at scope exit) when a scope is
 * active; a fresh unshared client otherwise. Never a cross-request memo.
 */
function resolveDb(url: string): Db {
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
 * it). Returns the request-scoped client (one per request, closed at
 * request end) — never a cross-request memoized Pool.
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