import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit/integration test runner config. Deliberately separate from
// vite.config.ts: the SvelteKit plugin must not load for pure TS tests.
// The `$server` alias mirrors vite.config.ts so bridge-importing tests (the
// Hono auth-helper suite) resolve the same module graph as the app.
//
// `$lib` mirrors SvelteKit's built-in alias (declared in the generated
// .svelte-kit/tsconfig.json paths). Vitest's resolver does NOT read tsconfig
// `paths`, so without this alias any unit-test-reachable `$lib` import fails
// with ERR_MODULE_NOT_FOUND (CI runs `bun run test:unit` = vitest; Bun's own
// test runner reads tsconfig paths, which is why `bun test` alone hides the
// gap — see the unit-and-build CI failure on game-ux.test.ts).
export default defineConfig({
	resolve: {
		alias: {
			$server: resolve('src/server'),
			$lib: resolve('src/lib')
		}
	},
	// CI-2 — the integration suite holds the shared-DB advisory-lock mutex
	// for the whole run (tests/integration/db-mutex.ts). No-op without
	// DATABASE_URL (unit runs stay DB-free).
	globalSetup: './tests/integration/global-setup.ts',
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
		// 60s (was 30s): the leaderboard month fixtures seed up to 30 days and
		// the sequential Neon suites legitimately run long; CI runners far from
		// the Neon region added ~2× latency and blew the old budget (I9 CI
		// failure #3). Fixtures are batched too; this is headroom, not a mask.
		testTimeout: 60_000
	}
});