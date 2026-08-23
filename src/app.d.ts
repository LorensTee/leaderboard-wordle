import type { Env } from '../worker-configuration';

declare global {
	namespace App {
		// Better Auth session resolution types land in Phase 0 B4 (hooks.server.ts).
		// interface Locals {}

		// `env` typing comes from `wrangler types` (worker-configuration.d.ts) so
		// bindings stay in sync with wrangler config. The adapter's ambient types
		// provide ctx / context / caches / cf (see
		// node_modules/@sveltejs/adapter-cloudflare/ambient.d.ts) and deliberately
		// leave `env` for the app to define here.
		interface Platform {
			env: Env;
		}
	}
}

export {};