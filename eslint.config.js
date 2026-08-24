// ESLint flat config (ESLint 9) for the SvelteKit + TypeScript + Bun stack.
// Lint scope: src/, tests/, scripts/, and repo root config files. `svelte-check`
// remains the type checker — ESLint here is for genuine lint violations only
// (Phase 0 NG23: CI pipeline includes lint). Generated artifacts are excluded:
//   - auth-schema.generated.ts   — Better Auth CLI output (parity-guarded by auth:check)
//   - worker-configuration.d.ts  — wrangler types output (parity-guarded by types:check)
//   - .svelte-kit / build output / tool caches
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: [
			'node_modules/',
			'.svelte-kit/',
			'.wrangler/',
			'.cache/',
			'build/',
			'output/',
			'coverage/',
			'playwright-report/',
			'test-results/',
			'worker-configuration.d.ts',
			'src/server/db/auth-schema.generated.ts'
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs.recommended,
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser
			}
		}
	},
	{
		// Node/Bun context for scripts and tooling configs.
		files: ['scripts/**/*.ts', '*.config.ts', '*.config.js', 'playwright.config.ts'],
		languageOptions: {
			globals: globals.node
		}
	},
	{
		// Browser context for Svelte components and client-side code under src/lib.
		files: ['src/**/*.svelte', 'src/lib/**/*.{ts,js}'],
		languageOptions: {
			globals: globals.browser
		}
	}
);
