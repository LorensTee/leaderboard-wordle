// CI-2 — vitest globalSetup: hold the shared-DB mutex for the whole
// integration run. Unit runs have no DATABASE_URL → no connection, no lock.
import { acquireDbMutex } from './db-mutex';

export default async function setup(): Promise<() => Promise<void>> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		// Unit/test runs without the DB env skip the mutex entirely.
		return async () => {};
	}
	// CI-7 — LOCAL_PG=1 runs against an EPHEMERAL job-scoped postgres
	// (CI service container / local throwaway DB): nothing shares it, so the
	// shared-DB advisory lock is unnecessary — and the Neon WebSocket driver
	// used by db-mutex cannot connect to a plain postgres anyway.
	if (process.env.LOCAL_PG === '1') {
		console.log('[db-mutex] LOCAL_PG=1 — ephemeral job-local database, mutex skipped');
		return async () => {};
	}
	const release = await acquireDbMutex(url);
	console.log('[db-mutex] shared test database locked for this run');
	return release;
}