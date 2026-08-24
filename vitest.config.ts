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