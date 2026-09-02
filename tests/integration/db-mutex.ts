// CI-2 — cross-run mutex for the SHARED non-production test database.
//
// The integration + e2e suites TRUNCATE and re-seed the same Neon database;
// nothing prevented TWO workflow runs (e.g. a main push + a dependabot PR
// run) or a local run from wiping each other's fixtures mid-suite — this
// corrupted CI (2026-09-02: FK violations on just-inserted rows, vanished
// fixtures, TRUNCATE deadlocks; recorded in the contradictions log CI-1).
//
// Design: a PostgreSQL SESSION advisory lock held for the entire suite run.
// - The lock is taken on a DEDICATED pool client (not bare pool.query):
//   `SET lock_timeout` and `pg_advisory_lock` are both session-scoped, so
//   they must run on the SAME physical connection — otherwise a second pool
//   session could run the blocking lock WITHOUT the timeout (Luna v27
//   review point, 2026-09-02; the dedicated client makes the session
//   affinity explicit and the wait bounded).
// - `pg_advisory_lock` BLOCKS until free; `SET lock_timeout` converts a
//   busy DB into a loud, retryable failure (never a silent skip).
// - Release is client.release() + pool.end() only — advisory locks die with
//   their session, so there is no unlock-on-the-wrong-connection race.
import { Pool } from '@neondatabase/serverless';

/** Arbitrary but fixed application-wide key (documented in the log). */
export const DB_MUTEX_KEY = 839274615;

export const DB_MUTEX_TIMEOUT_MS = 300_000;

/**
 * Acquires the shared-DB mutex. Resolves with a release function; rejects
 * (loudly, with re-run guidance) when the lock is held by another run past
 * the timeout.
 */
export async function acquireDbMutex(
	databaseUrl: string,
	timeoutMs: number = DB_MUTEX_TIMEOUT_MS
): Promise<() => Promise<void>> {
	// max: 1 — the mutex pool owns exactly one session; the dedicated client
	// below is that session, held for the whole suite.
	const pool = new Pool({ connectionString: databaseUrl, max: 1 });
	const client = await pool.connect();
	try {
		// Same session for BOTH statements (session-scoped semantics).
		await client.query(`SET lock_timeout = '${timeoutMs}ms'`);
		await client.query('SELECT pg_advisory_lock($1)', [DB_MUTEX_KEY]);
	} catch (err) {
		releaseClient(client);
		await pool.end().catch(() => {});
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(
			`[db-mutex] could not acquire the shared test-database lock (key ${DB_MUTEX_KEY}) ` +
				`within ${timeoutMs} ms — another workflow/local run is using the shared non-production ` +
				`database. Re-run this job once the other run finishes. Details: ${detail}`
		);
	}
	let released = false;
	return async () => {
		if (released) return;
		released = true;
		// Closing the session auto-releases the advisory lock.
		releaseClient(client);
		await pool.end().catch(() => {});
	};
}

/** PoolClient.release() is sync (void) — guard the teardown path anyway. */
function releaseClient(client: { release(err?: unknown): void }): void {
	try {
		client.release();
	} catch {
		// The session dies with pool.end() regardless.
	}
}