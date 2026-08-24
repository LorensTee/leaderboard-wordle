import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit/integration test runner config. Deliberately separate from
// vite.config.ts: the SvelteKit plugin must not load for pure TS tests.
// The `$server` alias mirrors vite.config.ts so bridge-importing tests (the
// Hono auth-helper suite) resolve the same module graph as the app.
export default defineConfig({
	resolve: {
		alias: {
			$server: resolve('src/server')
		}
	},
	test: {
		include: [
			'tests/unit/**/*.test.ts',
			'tests/security/**/*.test.ts',
			'tests/integration/**/*.test.ts'
		],
		environment: 'node',
		// Integration tests exercise real database locks — never parallelize
		// files (concurrent TRUNCATEs/fixtures would interleave).
		fileParallelism: false,
		// Integration tests that need a real database set this themselves.
		// Unit tests are deliberately DB-free.
		hookTimeout: 30_000,
		testTimeout: 30_000
	}
});