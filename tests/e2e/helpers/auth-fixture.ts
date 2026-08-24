// E2E authenticated-state fixture — deterministic sessions for the gameplay
// spec WITHOUT a live Google OAuth round-trip.
//
// Mechanism (documented, reproducible in CI): insert a real user + session
// row into the non-production database and construct the exact session
// cookie Better Auth issues — `better-auth.session_token=<token>.<signature>`
// where the signature is Hono's signed-cookie HMAC-SHA256 (base64, padded)
// over the token with BETTER_AUTH_SECRET (verified against better-auth 1.7.1
// + hono 4.13.3 sources). Better Auth then resolves the session exactly like
// a Google sign-in: signed-cookie verification + session-table lookup.
//
// Requirements: DATABASE_URL (non-production) + BETTER_AUTH_SECRET
// (locally from .dev.vars/.env, read without printing; in CI injected as job
// env vars) + ALLOW_DB_WIPE=1/true — an explicit opt-in because the fixture
// TRUNCATEs the app tables; without any of them the gameplay spec skips
// explicitly (the unauthenticated smoke spec never skips).
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../../../src/server/db/schema';

// .dev.vars is parsed for local runs only (gitignored, never printed).
function loadLocalEnv(): { DATABASE_URL?: string; BETTER_AUTH_SECRET?: string; ALLOW_DB_WIPE?: string } {
	const vars: Record<string, string> = {};
	try {
		for (const line of readFileSync(resolve('.dev.vars'), 'utf8').split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const eq = trimmed.indexOf('=');
			if (eq > 0) vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
		}
	} catch {
		// No .dev.vars (CI): rely on process env.
	}
	return {
		DATABASE_URL: process.env.DATABASE_URL ?? vars.DATABASE_URL,
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? vars.BETTER_AUTH_SECRET,
		ALLOW_DB_WIPE: process.env.ALLOW_DB_WIPE ?? vars.ALLOW_DB_WIPE
	};
}

export type E2eSession = {
	cookieHeader: string;
	userId: string;
	secret: string;
	databaseUrl: string;
};

/** True when the deterministic auth fixture can run (incl. the wipe opt-in). */
export function e2eAuthAvailable(): boolean {
	const env = loadLocalEnv();
	return Boolean(
		env.DATABASE_URL &&
			env.BETTER_AUTH_SECRET &&
			(env.ALLOW_DB_WIPE === '1' || env.ALLOW_DB_WIPE === 'true')
	);
}

export function requireE2eEnv(): E2eSession {
	const env = loadLocalEnv();
	if (
		!env.DATABASE_URL ||
		!env.BETTER_AUTH_SECRET ||
		!(env.ALLOW_DB_WIPE === '1' || env.ALLOW_DB_WIPE === 'true')
	) {
		throw new Error(
			'E2E auth fixture requires DATABASE_URL + BETTER_AUTH_SECRET + ALLOW_DB_WIPE=1 ' +
				'(env, .dev.vars, or CI job env) — ALLOW_DB_WIPE opts into the app-table TRUNCATE'
		);
	}
	return {
		cookieHeader: '',
		userId: '',
		secret: env.BETTER_AUTH_SECRET,
		databaseUrl: env.DATABASE_URL
	};
}

/**
 * Reset the app tables and create a session for `email` (fresh user).
 * Returns the session cookie value for Playwright `context.addCookies`.
 */
export async function createAuthenticatedUser(
	email = `e2e-${randomUUID()}@test.dev`,
	displayName = 'E2E Player'
): Promise<{ cookie: string; userId: string }> {
	const { databaseUrl, secret } = requireE2eEnv();
	const pool = new Pool({ connectionString: databaseUrl });
	try {
		const db = drizzle(pool, { schema });
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);

		const [user] = await db
			.insert(schema.user)
			.values({
				id: `e2e-${randomUUID()}`,
				name: displayName,
				email,
				emailVerified: true
			})
			.returning();

		const token = randomUUID();
		const [session] = await db
			.insert(schema.session)
			.values({
				id: `ses-${randomUUID()}`,
				token,
				userId: user.id,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
			})
			.returning();
		void session;

		// Hono signed cookie: value.signature, signature = base64(HMAC-SHA256).
		const signature = createHmac('sha256', secret).update(token).digest('base64');
		return { cookie: `${token}.${signature}`, userId: user.id };
	} finally {
		await pool.end();
	}
}

/**
 * Seed today's ACTIVE puzzle (Asia/Manila date, answer from the public
 * valid-guess list) so the gameplay flow has a real daily target.
 * The answer word is a TEST fixture — the non-production DB is reset-safe.
 */
export async function seedTodayPuzzle(answerWord: string): Promise<void> {
	const { databaseUrl } = requireE2eEnv();
	const pool = new Pool({ connectionString: databaseUrl });
	try {
		const db = drizzle(pool, { schema });
		const [{ d }] = (await db.execute(
			sql`SELECT ((now() AT TIME ZONE 'Asia/Manila')::date)::text AS d`
		)).rows as { d: string }[];
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word: answerWord, normalizedWord: answerWord })
			.returning();
		await db
			.insert(schema.dailyPuzzles)
			.values({
				puzzleDate: d,
				answerId: answer.id,
				hintLetter: answerWord[0].toUpperCase(),
				status: 'ACTIVE',
				expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
			})
			.returning();
	} finally {
		await pool.end();
	}
}