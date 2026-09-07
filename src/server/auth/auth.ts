// Better Auth configuration — single source for identity (Google OIDC,
// sessions, cookies). The application owns roles/display-name/avatar
// (Architecture §798). Built as a factory so runtime values come from the
// Worker environment (Hono bindings) instead of process.env at import time.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createDb, type Db } from '../db/client';
import { getDbForAuth, getRequestStore, INERT_DB_URL, isWorkerdRuntime } from '../db/memo';

export { INERT_DB_URL };

// Subset of HonoBindings consumed by auth. Structural typing — HonoBindings
// satisfies this (see routes.ts).
export type AuthBindings = {
	DATABASE_URL: string;
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
};

// Inert fallback URL re-exported from the db lifecycle module (src/server/
// db/memo.ts) so imports like auth.generate.ts keep working. Never a real
// credential — it lets schema generation / structural tests construct the
// auth factory without a .env.

// Dev/test-only session secret. Production is the DEFAULT: Workers never
// set NODE_ENV (nodejs_compat → undefined), so without a real binding the
// app fails hard. The non-production escape hatch is explicit and
// tooling-controlled: vite dev sets NODE_ENV=development, vitest sets test.
// This is deliberately NOT fold-dependent — bundlers have been observed to
// emit `process.env.NODE_ENV === 'production'` dynamically in SSR chunks,
// which would silently select DEV_SECRET on a deployed Worker (the earlier
// 'fold guarantee' was validated against the wrong artifact — the adapter
// shell — and is removed).
const DEV_SECRET = 'dev-only-secret-change-me';
const NON_PRODUCTION_ENVS = new Set(['development', 'test']);

export function createAuth(env: AuthBindings, db?: Db) {
	const secret =
		env.BETTER_AUTH_SECRET ??
		(NON_PRODUCTION_ENVS.has(process.env.NODE_ENV ?? '') ? DEV_SECRET : undefined);
	if (!secret) {
		throw new Error('BETTER_AUTH_SECRET is required (refusing to start with a known fallback secret)');
	}
	return betterAuth({
		appName: 'Leaderboard Wordle',
		secret,
		baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:5173',
		// Phase-2 (scenario 12) finding: better-auth's origin check rejects
		// state-changing requests whose Origin is not the baseURL origin —
		// the local preview/E2E host (127.0.0.1:4173) differs from the dev
		// baseURL (localhost:5173), so the header sign-out returned 403
		// INVALID_ORIGIN. Both local hosts are trusted; production origins
		// are covered by BETTER_AUTH_URL itself (CSRF stays fail-closed
		// against arbitrary origins).
		trustedOrigins: ['http://localhost:5173', 'http://127.0.0.1:4173'],
		database: drizzleAdapter(
			db ?? createDb(env.DATABASE_URL || INERT_DB_URL),
			{ provider: 'pg' }
		),
		requireEmailVerification: true,
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID ?? '',
				clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
				// NG18: per-provider verification so `emailVerified` gates the
				// admin bootstrap even if a provider account is unverified.
				requireEmailVerification: true
			}
		},
		user: {
			additionalFields: {
				// Application extensions (NC2). The same physical columns exist in
				// src/server/db/schema.ts (via auth-schema.generated.ts) — config
				// alone does not create columns; migrations keep them in sync.
				avatarEmoji: {
					type: 'string',
					defaultValue: '🙂',
					input: true
				},
				role: {
					type: 'string',
					defaultValue: 'player',
					input: false // server-controlled (Architecture §394)
				},
				display_name_normalized: {
					type: 'string',
					input: false,
					required: false, // nullable-unique until set at onboarding
					unique: true
				},
				onboarding_completed_at: {
					type: 'date',
					input: false,
					required: false // nullable — set when onboarding completes
				}
			}
		}
	});
}

export type Auth = ReturnType<typeof createAuth>;
/** getSession result shape: { session, user } (docs: integrations/svelte-kit). */
export type SessionData = Auth['$Infer']['Session'];

// Instance lifecycle follows the database lifecycle (src/server/db/memo.ts;
// runtime-selected by navigator UA): a Better Auth instance must not
// outlive the request that built it ON workerd — it embeds the request-
// bound Neon WebSocket client, and reusing it across Worker requests is
// exactly what the runtime rejects with "Cannot perform I/O on behalf of a
// different request". Authorization/session state never lives on the
// instance (all state is in the DB), so per-request instances are
// behavior-identical; rotation and misconfiguration still fail fast
// because every request rebuilds from the current bindings. On Node/Bun
// (dev, preview/E2E, tests) there is no request-bound I/O, so the auth
// instance is cached warm — the historical pre-fix behavior CI was tuned
// on. The cache key covers the binding values that define the
// session-signing identity (DATABASE_URL + BETTER_AUTH_SECRET).
let cachedAuth: Auth | null = null;
let cachedKey = '';

export function getAuth(env: AuthBindings, db?: Db): Auth {
	// Caller-injected client (integration harness under LOCAL_PG=1) is a
	// different identity than the env-derived Neon client — keep it out of
	// the memo key namespace so an override can never reuse a cached
	// instance built with the wrong driver.
	const key = [env.DATABASE_URL, env.BETTER_AUTH_SECRET ?? '', db ? '\u0000client-override' : ''].join('\u0000');
	const authDb = db ?? getDbForAuth(env);
	const store = getRequestStore();
	if (store) {
		// workerd, inside a request scope: one Auth per request (shared by
		// the SvelteKit hooks and the Hono surface); its database client is
		// closed by withDbScope when the request ends.
		let auth = store.auths.get(key);
		if (!auth) {
			auth = createAuth(env, authDb);
			store.auths.set(key, auth);
		}
		return auth;
	}
	if (isWorkerdRuntime()) {
		// workerd outside a scope (a code path that skipped withDbScope): a
		// fresh instance per call — NEVER a module-level memo (see the
		// lifecycle note above; cross-request reuse of request-bound Neon
		// clients must stay impossible by construction).
		return createAuth(env, authDb);
	}
	// Node/Bun: warm module memo. Same keying as the workerd per-request
	// memo; a key change rebuilds, never silently reuses.
	if (!cachedAuth || cachedKey !== key) {
		cachedAuth = createAuth(env, authDb);
		cachedKey = key;
	}
	return cachedAuth;
}