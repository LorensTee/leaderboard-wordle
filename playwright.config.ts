import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	// CI-2 — hold the shared-DB advisory-lock mutex for the whole e2e run
	// (the auth fixture TRUNCATEs the shared non-production Neon).
	globalSetup: './tests/e2e/global-setup.ts',
	// The authenticated specs share ONE non-production database and TRUNCATE
	// the app tables per fixture (tests/e2e/helpers/auth-fixture.ts) — files
	// must never run in parallel (a second worker's TRUNCATE would wipe the
	// first worker's state mid-test). Phase-3 added a second fixture file
	// (leaderboard.spec.ts); the runner is therefore explicit: one worker,
	// serial tests.
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'list',
	use: {
		baseURL: 'http://127.0.0.1:4173',
		// Security e2e (B6) will add scenarios; B5 ships the harness + smoke.
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'bun run preview -- --port 4173 --host 127.0.0.1',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: !process.env.CI
	}
});