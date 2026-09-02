// CI-2 — Playwright globalSetup: hold the shared-DB mutex for the whole
// e2e run (the fixture TRUNCATEs + reseeds the shared non-production Neon;
// without the mutex a concurrent integration run's rows would be wiped
// mid-suite — see the contradictions log CI-1). Skipped when the fixture
// env is unavailable (nothing touches the DB then).
import { acquireDbMutex } from '../integration/db-mutex';
import { e2eAuthAvailable, e2eDatabaseUrl } from './helpers/auth-fixture';

export default async function globalSetup(): Promise<() => Promise<void>> {
	const url = e2eDatabaseUrl();
	if (!e2eAuthAvailable() || !url) {
		// The authenticated specs skip without the fixture env — no DB use.
		return async () => {};
	}
	const release = await acquireDbMutex(url);
	console.log('[db-mutex] shared test database locked for the e2e run');
	return release;
}