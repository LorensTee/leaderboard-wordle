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
const INERT_DB_URL = 'postgresql://unused:unused@localhost:5432/unused';

export function createAuth(env: AuthBindings) {
	return betterAuth({
		appName: 'Leaderboard Wordle',
		secret: env.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me',
		baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:5173',
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

// Per-isolate memo. Worker env is stable per request for one deployment; the
// DATABASE_URL key forces a rebuild if bindings legitimately change (tests).
let cachedAuth: Auth | null = null;
let cachedDatabaseUrl: string | undefined;

export function getAuth(env: AuthBindings): Auth {
	if (!cachedAuth || cachedDatabaseUrl !== env.DATABASE_URL) {
		cachedAuth = createAuth(env);
		cachedDatabaseUrl = env.DATABASE_URL;
	}
	return cachedAuth;
}