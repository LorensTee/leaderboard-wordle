// Phase-2 profile/onboarding/admin-bootstrap integration suite (plan §12) —
// REAL PostgreSQL semantics on live Neon: onboarding persistence (DB time),
// atomicity, uniqueness (pre-check + UNIQUE final guard), moderation,
// avatar allow-list, post-onboarding edits, NG18 admin bootstrap
// (promote once / never demote / non-match untouched / ADMIN_EMAIL change
// never demotes), and the Google re-auth name-preservation regression.
import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, createIntegrationDb, type Db } from './helpers';
import * as schema from '../../src/server/db/schema';
import { getAuth } from '../../src/server/auth/auth';
import { applyAdminBootstrap } from '../../src/server/middleware/auth';
import { AppError, ERROR_CODES } from '../../src/server/lib/errors';
import { createProfileService, type ProfileService, type UserRow } from '../../src/server/profile/service';
import { AVATAR_EMOJIS } from '../../src/server/data/avatar-emojis';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const SECRET = process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me';

let db: Db;
let profile: ProfileService;

function appEnv(adminEmail?: string) {
	return { DATABASE_URL: databaseUrl!, BETTER_AUTH_SECRET: SECRET, ADMIN_EMAIL: adminEmail };
}

async function insertUser(overrides: Partial<UserRow> = {}): Promise<UserRow> {
	const [row] = await db
		.insert(schema.user)
		.values({
			id: `int-${randomUUID()}`,
			name: 'Integration Player',
			email: `int-${randomUUID()}@test.dev`,
			emailVerified: true,
			...overrides
		})
		.returning();
	return row as UserRow;
}

async function errOf(p: Promise<unknown>): Promise<AppError> {
	try {
		await p;
	} catch (e) {
		return e as AppError;
	}
	throw new Error('expected the promise to reject');
}

suite('Phase-2 profile domain (live Neon)', () => {
	beforeAll(async () => {
		db = await createIntegrationDb();
		// The suite owns the user table on the dedicated non-production DB
		// (same reset discipline as the E2E fixture).
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);
		profile = createProfileService(db);
	});

	afterAll(async () => {
		await closeDb(db);
	});

	it('getMe: authenticated shape (id/name/avatarEmoji/role/onboardingCompleted — no email, no internals)', async () => {
		const user = await insertUser({ name: 'Speedy', avatarEmoji: '🦉', onboarding_completed_at: new Date() });
		const me = await profile.getMe(user.id);
		expect(me).toEqual({
			id: user.id,
			name: 'Speedy',
			avatarEmoji: '🦉',
			role: 'player',
			onboardingCompleted: true
		});
		expect(Object.keys(me).sort()).toEqual(['avatarEmoji', 'id', 'name', 'onboardingCompleted', 'role']);
	});

	it('onboarding completion persists canonical name + display_name_normalized + DB-time timestamp', async () => {
		const user = await insertUser();
		const me = await profile.updateProfile(user.id, { displayName: '  Captain   Fast  ', avatarEmoji: '🦊' });
		expect(me).toMatchObject({ name: 'captain fast', avatarEmoji: '🦊', onboardingCompleted: true });

		const [row] = await db
			.select()
			.from(schema.user)
			.where(sql`${schema.user.id} = ${user.id}`)
			.limit(1);
		expect(row.display_name_normalized).toBe('captain fast');
		// DB time, not client time: the stored timestamp is close to NOW()
		// and was written by the service, not passed in.
		expect(row.onboarding_completed_at).not.toBeNull();
		// One row with two columns (now() + the persisted timestamp). NOTE: raw
		// postgres lowercases unquoted aliases → `dbnow`.
		const [row2] = (await db.execute(
			sql`SELECT now() AS dbnow, ${row.onboarding_completed_at}::timestamptz AS ts`
		)).rows as { dbnow: string; ts: string }[];
		expect(Math.abs(new Date(row2.ts).getTime() - new Date(row2.dbnow).getTime())).toBeLessThan(60_000);
	});

	it('atomicity: incomplete onboarding with ONE field → INCOMPLETE_ONBOARDING, NOTHING written', async () => {
		const user = await insertUser();
		const err = await errOf(profile.updateProfile(user.id, { displayName: 'Only Name' }));
		expect(err).toMatchObject({ code: ERROR_CODES.INCOMPLETE_ONBOARDING, status: 400 });
		const [row] = await db
			.select()
			.from(schema.user)
			.where(sql`${schema.user.id} = ${user.id}`)
			.limit(1);
		expect(row.name).toBe('Integration Player'); // untouched
		expect(row.display_name_normalized).toBeNull();
		expect(row.onboarding_completed_at).toBeNull();
	});

	it('uniqueness: a second user taking an onboarded name → NAME_TAKEN 409 (pre-check) + UNIQUE guard', async () => {
		const taken = await insertUser({ name: 'alex', display_name_normalized: 'alex', onboarding_completed_at: new Date() });
		void taken;
		const userB = await insertUser();
		const err = await errOf(profile.updateProfile(userB.id, { displayName: 'Alex', avatarEmoji: '🐼' }));
		expect(err).toMatchObject({ code: ERROR_CODES.NAME_TAKEN, status: 409 });
		// Nothing was persisted for userB.
		const [row] = await db
			.select()
			.from(schema.user)
			.where(sql`${schema.user.id} = ${userB.id}`)
			.limit(1);
		expect(row.display_name_normalized).toBeNull();
	});

	it('uniqueness stress: two users racing for one name → exactly one wins, the loser gets NAME_TAKEN (UNIQUE final guard)', async () => {
		const a = await insertUser();
		const b = await insertUser();
		const [ra, rb] = await Promise.allSettled([
			profile.updateProfile(a.id, { displayName: 'rasengan', avatarEmoji: '🦊' }),
			profile.updateProfile(b.id, { displayName: 'rasengan', avatarEmoji: '🐼' })
		]);
		const wins = [ra, rb].filter((r) => r.status === 'fulfilled');
		const losses = [ra, rb].filter((r) => r.status === 'rejected');
		expect(wins.length).toBe(1);
		expect(losses.length).toBe(1);
		const loser = (losses[0] as PromiseRejectedResult).reason as AppError;
		expect(loser).toMatchObject({ code: ERROR_CODES.NAME_TAKEN, status: 409 });
	});

	it('reserved names → NAME_TAKEN 409 (same as duplicates)', async () => {
		const user = await insertUser();
		for (const reserved of ['admin', 'wordle', 'leaderboard', 'moderator', 'system']) {
			const err = await errOf(profile.updateProfile(user.id, { displayName: reserved, avatarEmoji: '🦊' }));
			expect(err, reserved).toMatchObject({ code: ERROR_CODES.NAME_TAKEN, status: 409 });
		}
	});

	it('moderation rejection through the REAL pipeline (leet + separator evasions)', async () => {
		const user = await insertUser();
		for (const bad of ['f u c k', 'f4ck', 'sh1thead', 'n1gger', 'a55hole', 'bullsh1t']) {
			const err = await errOf(profile.updateProfile(user.id, { displayName: bad, avatarEmoji: '🦊' }));
			expect(err.code, bad).toBe(ERROR_CODES.NAME_MODERATED);
			expect(err.status).toBe(400);
			expect(err.message).toBe('This name is not allowed');
		}
	});

	it('avatar allow-list enforcement surface: non-curated emoji → INVALID_AVATAR 400', async () => {
		// Unique names per iteration: 'alex' is already taken on this DB from
		// the uniqueness test, and the name rules run BEFORE avatar validation.
		const names = ['alpha', 'bravo', 'charlie'];
		let i = 0;
		for (const bad of ['🙂', '😀', '🦊🏽']) {
			const user = await insertUser();
			const err = await errOf(
				profile.updateProfile(user.id, { displayName: `${names[i++]}${user.id.slice(-4)}`, avatarEmoji: bad })
			);
			expect(err.code, bad).toBe(ERROR_CODES.INVALID_AVATAR);
		}
	});

	it('post-onboarding single-field edits leave the completion timestamp unchanged', async () => {
		// Unique name: 'alex' is already claimed by the uniqueness test.
		const name = `edits${randomUUID().slice(0, 6)}`;
		const user = await insertUser();
		await profile.updateProfile(user.id, { displayName: name, avatarEmoji: '🦊' });
		const [before] = await db
			.select()
			.from(schema.user)
			.where(sql`${schema.user.id} = ${user.id}`)
			.limit(1);

		const me = await profile.updateProfile(user.id, { avatarEmoji: '🐼' });
		expect(me.avatarEmoji).toBe('🐼');
		expect(me.name).toBe(name);

		const [after] = await db
			.select()
			.from(schema.user)
			.where(sql`${schema.user.id} = ${user.id}`)
			.limit(1);
		expect(after.onboarding_completed_at?.getTime()).toBe(before.onboarding_completed_at?.getTime());
		expect(after.display_name_normalized).toBe(name);
	});

	it('admin bootstrap (NG18): matching email promotes ONCE, never rewrites, non-matching never promoted', async () => {
		const adminEmail = `admin-${randomUUID()}@test.dev`;
		const admin = await insertUser({ email: adminEmail, role: 'player' });
		const adminUser = {
			id: admin.id,
			email: adminEmail,
			name: 'Admin Ops',
			role: admin.role
		};

		// 1. Match → promoted.
		const promoted = await applyAdminBootstrap(appEnv(adminEmail), { session: {} as never, user: adminUser as never });
		expect(promoted.user.role).toBe('admin');
		const [row1] = await db.select().from(schema.user).where(sql`${schema.user.id} = ${admin.id}`).limit(1);
		expect(row1.role).toBe('admin');

		// 2. Second resolution → still admin, and refresh shows admin (WHERE no-op).
		const again = await applyAdminBootstrap(appEnv(adminEmail), { session: {} as never, user: { ...adminUser, role: 'admin' } as never });
		expect(again.user.role).toBe('admin');
		const [row2] = await db.select().from(schema.user).where(sql`${schema.user.id} = ${admin.id}`).limit(1);
		expect(row2.role).toBe('admin');

		// 3. Non-matching email is never promoted.
		const other = await insertUser({ role: 'player' });
		const untouched = await applyAdminBootstrap(appEnv(adminEmail), {
			session: {} as never,
			user: { id: other.id, email: other.email, name: other.name, role: other.role } as never
		});
		expect(untouched.user.role).toBe('player');
		const [row3] = await db.select().from(schema.user).where(sql`${schema.user.id} = ${other.id}`).limit(1);
		expect(row3.role).toBe('player');

		// 4. ADMIN_EMAIL change NEVER demotes the existing admin.
		const differentAdmin = await applyAdminBootstrap(appEnv(`someone-else-${randomUUID()}@test.dev`), {
			session: {} as never,
			user: { ...adminUser, role: 'admin' } as never
		});
		expect(differentAdmin.user.role).toBe('admin');
		const [row4] = await db.select().from(schema.user).where(sql`${schema.user.id} = ${admin.id}`).limit(1);
		expect(row4.role).toBe('admin');

		// 5. No ADMIN_EMAIL configured → nobody promoted.
		const noConf = await applyAdminBootstrap(appEnv(undefined), { session: {} as never, user: { ...adminUser, role: 'player' } as never });
		expect(noConf.user.role).toBe('player');

		// 6. Email identity is case-insensitive + whitespace-tolerant (review
		// finding): a mixed-case / padded ADMIN_EMAIL still promotes the
		// operator's account (better-auth stores the provider email verbatim;
		// Google Workspace identities may be mixed-case).
		const mixed = await insertUser({ email: `Mixed.Case.Admin-${randomUUID()}@test.dev`, role: 'player' });
		const mixedConfig = `  ${mixed.email.toUpperCase()}  `;
		const promotedMixed = await applyAdminBootstrap(appEnv(mixedConfig), {
			session: {} as never,
			user: { id: mixed.id, email: mixed.email, name: 'Mixed', role: 'player' } as never
		});
		expect(promotedMixed.user.role).toBe('admin');
		const [rowMixed] = await db.select().from(schema.user).where(sql`${schema.user.id} = ${mixed.id}`).limit(1);
		expect(rowMixed.role).toBe('admin');

		// 7. Still never demotes, and non-matching emails remain untouched
		// under the case-insensitive comparison.
		const nonMatchMixed = await insertUser({ role: 'player' });
		const untouchedMixed = await applyAdminBootstrap(appEnv(mixedConfig), {
			session: {} as never,
			user: { id: nonMatchMixed.id, email: nonMatchMixed.email, name: 'Other', role: 'player' } as never
		});
		expect(untouchedMixed.user.role).toBe('player');
	});

	it('Google re-auth name preservation (v22): fresh session resolution after onboarding never rewrites application-owned name', async () => {
		const email = `reauth-${randomUUID()}@test.dev`;
		const user = await insertUser({ email });
		await profile.updateProfile(user.id, { displayName: 'App Name', avatarEmoji: '🦊' });

		// Simulate a later Google sign-in: a REAL Better Auth session
		// resolution (signed cookie → getSession) against the fresh session row.
		const token = randomUUID();
		await db.insert(schema.session).values({
			id: `ses-${randomUUID()}`,
			token,
			userId: user.id,
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
		});
		const signature = createHmac('sha256', SECRET).update(token).digest('base64');
		const auth = getAuth(appEnv(undefined));
		const resolved = await auth.api.getSession({
			headers: new Headers({ cookie: `better-auth.session_token=${token}.${signature}` })
		});
		expect(resolved).not.toBeNull();
		expect(resolved!.user.name).toBe('app name');
		expect(resolved!.user.display_name_normalized).toBe('app name');

		// And the DB row is untouched after the resolution.
		const [row] = await db.select().from(schema.user).where(sql`${schema.user.id} = ${user.id}`).limit(1);
		expect(row.name).toBe('app name');
		expect(row.display_name_normalized).toBe('app name');

		// A bootstrap-style pass (the only user write authContext ever does)
		// with a NON-matching ADMIN_EMAIL also leaves the name untouched.
		await applyAdminBootstrap(appEnv(`nobody-${randomUUID()}@test.dev`), {
			session: {} as never,
			user: { id: user.id, email, name: 'app name', role: 'player' } as never
		});
		const [row2] = await db.select().from(schema.user).where(sql`${schema.user.id} = ${user.id}`).limit(1);
		expect(row2.name).toBe('app name');
		expect(row2.display_name_normalized).toBe('app name');
	});

	void AVATAR_EMOJIS;
});