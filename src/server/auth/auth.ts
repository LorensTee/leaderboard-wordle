// Better Auth configuration — single source for identity (Google OIDC,
// sessions, cookies). The application owns roles/display-name/avatar
// (Architecture §798). Built as a factory so runtime values come from the
// Worker environment (Hono bindings) instead of process.env at import time.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createDb } from '../db/client';

// Subset of HonoBindings consumed by auth. Structural typing — HonoBindings
// satisfies this (see routes.ts).
export type AuthBindings = {
	DATABASE_URL: string;
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
};

// Inert fallback so this module can be imported without a .env (schema
// generation, structural tests). Never a real credential.
export const INERT_DB_URL = 'postgresql://unused:unused@localhost:5432/unused';

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

export function createAuth(env: AuthBindings) {
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
			createDb(env.DATABASE_URL || INERT_DB_URL),
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

// Per-isolate memo. The cache key covers the binding values that define the
// session-signing identity (DATABASE_URL + BETTER_AUTH_SECRET): rotation
// rebuilds, never silently reuses. Provider/URL overrides intentionally
// stay out of the key — they are stable per deployment and have no isolated
// security consequence. Worker env is stable per deployment; a misconfigured
// deploy therefore fails fast on the first request (module scope cannot read
// env in workers — the fetch handler is the earliest point) and every
// subsequent request re-throws.
let cachedAuth: Auth | null = null;
let cachedKey = '';

export function getAuth(env: AuthBindings): Auth {
	const key = [env.DATABASE_URL, env.BETTER_AUTH_SECRET ?? ''].join('\u0000');
	if (!cachedAuth || cachedKey !== key) {
		cachedAuth = createAuth(env);
		cachedKey = key;
	}
	return cachedAuth;
}