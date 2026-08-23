import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
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