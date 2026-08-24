// Integration harness — driver seam.
//
// The B6 integration suites assert PostgreSQL semantics (row locks, READ
// COMMITTED visibility, CHECK constraints) through the app's query surface.
// They run against:
//   - LOCAL_PG=1            → drizzle-orm/node-postgres + pg Pool (local
//                             Postgres; used in dev against a throwaway DB)
//   - otherwise (default)   → the app's real production path:
//                             @neondatabase/serverless Pool +
//                             drizzle-orm/neon-serverless (CI/external gate
//                             against Neon; requires a Neon DATABASE_URL)
//
// The Neon WebSocket transport itself is verified at the B7 external gate.
import { sql } from 'drizzle-orm';
import * as schema from '../../src/server/db/schema';
import type { Db as AppDb } from '../../src/server/db/client';

// The app's Db type (NeonDatabase + Neon Pool) — services accept exactly this.
export type Db = AppDb;

export async function createIntegrationDb(): Promise<Db> {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is required for integration tests');

	if (process.env.LOCAL_PG === '1') {
		const { Pool } = await import('pg');
		const { drizzle } = await import('drizzle-orm/node-postgres');
		const pool = new Pool({ connectionString: url });
		return drizzle(pool, { schema }) as unknown as Db;
	}

	const { Pool } = await import('@neondatabase/serverless');
	const { drizzle } = await import('drizzle-orm/neon-serverless');
	const pool = new Pool({ connectionString: url });
	return drizzle(pool, { schema }) as unknown as Db;
}

export async function closeDb(db: Db): Promise<void> {
	await db.$client.end();
}

/**
 * A single dedicated connection from the underlying pool (pg-compatible
 * interface on both drivers). Transactional sequences (BEGIN … COMMIT) must
 * run on ONE connection — drizzle's pooled API may dispatch each statement
 * to a different connection, which would silently break lock semantics.
 */
export async function connectClient(db: Db): Promise<{
	query(q: string): Promise<{ rows: unknown[] }>;
	release(): Promise<void> | void;
}> {
	const client = await db.$client.connect();
	return {
		query: (q: string) => client.query(q) as Promise<{ rows: unknown[] }>,
		release: () => client.release()
	};
}

/**
 * Wait until at least `expected` backends are blocked waiting for a
 * `daily_puzzles … FOR UPDATE` row lock (pg_stat_activity). Used by the NG9
 * lock-order tests to make interleavings deterministic across ANY latency —
 * the transactions are only released (sentinel COMMIT) once the caller has
 * observed that exactly the wanted services are queued, instead of relying
 * on fixed sleeps (which break when DB round-trip latency exceeds the sleep).
 * Throws with a descriptive message on timeout (fail fast, never hang).
 */
export async function waitForLockWaiters(
	db: Db,
	expected: number,
	timeoutMs = 20_000,
	intervalMs = 50
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let seen = 0;
	for (;;) {
		const [{ n }] = (
			await db.execute(
				sql`SELECT count(*)::int AS n FROM pg_stat_activity
					WHERE wait_event_type = 'Lock' AND query ILIKE '%daily_puzzles%for update%'`
			)
		).rows as { n: number }[];
		seen = n;
		if (n >= expected) return;
		if (Date.now() > deadline) {
			throw new Error(
				`timed out after ${timeoutMs}ms waiting for ${expected} lock waiter(s) on the puzzle row (saw ${seen})`
			);
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
}