import type { Env } from '../worker-configuration';
import type { SessionData } from '$server/auth/auth';

declare global {
	namespace App {
		interface Locals {
			// Populated by hooks.server.ts (Better Auth getSession).
			session: SessionData['session'] | null;
			user: SessionData['user'] | null;
		}

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