import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createDb } from '../db/client';

// Runtime overrides arrive from the Worker environment (B3 platform bridge) or
// process.env (local dev/tests). The fallback connection string is inert — it
// is only there so this module can be imported without a .env present (used by
// `auth generate`). No real credentials ever live in source (Architecture §335).
const databaseUrl =
	process.env.DATABASE_URL ?? 'postgresql://unused:unused@localhost:5432/unused';

export const auth = betterAuth({
	appName: 'Leaderboard Wordle',
	secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me',
	baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
	database: drizzleAdapter(createDb(databaseUrl), { provider: 'pg' }),
	requireEmailVerification: true,
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID ?? '',
			clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
			// NG18: per-provider verification so `emailVerified` gates the
			// admin bootstrap even if a provider account is unverified.
			requireEmailVerification: true,
		}
	},
	user: {
		additionalFields: {
			// Application extensions (NC2). The same physical columns exist in
			// src/server/db/schema.ts (sourced from auth-schema.generated.ts) —
			// config alone does not create columns; migrations keep them in sync.
			avatarEmoji: {
				type: 'string',
				defaultValue: '🙂',
				input: true
			},
			role: {
				type: 'string',
				defaultValue: 'player',
				input: false // server-controlled (Architecture §394: admin promotion is server-side)
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

export type Session = typeof auth.$Infer.Session;