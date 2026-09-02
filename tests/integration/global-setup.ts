// CI-2 — vitest globalSetup: hold the shared-DB mutex for the whole
// integration run. Unit runs have no DATABASE_URL → no connection, no lock.
import { acquireDbMutex } from './db-mutex';

export default async function setup(): Promise<() => Promise<void>> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		// Unit/test runs without the DB env skip the mutex entirely.
		return async () => {};
	}
	const release = await acquireDbMutex(url);
	console.log('[db-mutex] shared test database locked for this run');
	return release;
}