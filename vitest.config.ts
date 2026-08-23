import { defineConfig } from 'vitest/config';

// Unit/integration test runner config. Deliberately separate from
// vite.config.ts: the SvelteKit plugin must not load for pure TS tests.
export default defineConfig({
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