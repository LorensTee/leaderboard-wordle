// Phase-6 E.3 — ADMIN_EMAIL two-admin allowlist (D-ADMINSEP: comma), DB-free.
// The product lock requires BOTH admin addresses; the pre-Phase-6
// single-string match could only ever promote one. These tests pin the
// parser semantics (separator, trim, lowercase, dedup, empty) and the
// bootstrap's promote-when-any-entry-matches / never-demote contract
// (DB-free via the injectable client seam — CI-8). The real-DB contract
// (UPDATE … WHERE role <> 'admin', idempotent no-op) stays covered by
// tests/integration/profile.test.ts.
import { describe, expect, it, vi } from 'vitest';
import {
	applyAdminBootstrap,
	parseAdminEmailAllowlist
} from '../../src/server/middleware/auth';
import type { Db } from '../../src/server/db/client';

const fakeDb = () => ({ execute: vi.fn(async () => undefined) }) as unknown as Db;

const fakeAuth = (email: string, role: 'player' | 'admin' = 'player') =>
	({
		session: { id: 'session-1' },
		user: { id: 'user-1', email, name: 'Someone', role }
	}) as never as NonNullable<Parameters<typeof applyAdminBootstrap>[1]>;

const envOf = (adminEmail: string | undefined) =>
	({ ADMIN_EMAIL: adminEmail }) as Parameters<typeof applyAdminBootstrap>[0];

describe('parseAdminEmailAllowlist (D-ADMINSEP — comma separator)', () => {
	it('empty/missing input → empty allowlist (no admin ever promotes, NG18)', () => {
		expect(parseAdminEmailAllowlist(undefined)).toEqual([]);
		expect(parseAdminEmailAllowlist('')).toEqual([]);
		expect(parseAdminEmailAllowlist('   ')).toEqual([]);
		expect(parseAdminEmailAllowlist(',,')).toEqual([]);
	});

	it('single address stays a single-entry allowlist (back-compat)', () => {
		expect(parseAdminEmailAllowlist('tee.johnlor@gmail.com')).toEqual(['tee.johnlor@gmail.com']);
	});

	it('two addresses → both entries, in order', () => {
		expect(
			parseAdminEmailAllowlist('tee.johnlor@gmail.com,leaderboardwordle@gmail.com')
		).toEqual(['tee.johnlor@gmail.com', 'leaderboardwordle@gmail.com']);
	});

	it('trims + lowercases each entry (Google Workspace mixed-case)', () => {
		expect(parseAdminEmailAllowlist('  Tee.Johnlor@gmail.com , LEADERBOARDWORDLE@Gmail.com ')).toEqual([
			'tee.johnlor@gmail.com',
			'leaderboardwordle@gmail.com'
		]);
	});

	it('ignores empty entries and dedupes', () => {
		expect(parseAdminEmailAllowlist('a@x.com,,  ,a@x.com')).toEqual(['a@x.com']);
	});
});

describe('applyAdminBootstrap — two-admin allowlist (E.3)', () => {
	it('promotes when the verified email matches ANY allowlist entry', async () => {
		const db = fakeDb();
		const promoted = await applyAdminBootstrap(
			envOf('a@x.com,b@x.com'),
			fakeAuth('b@x.com'),
			db
		);
		expect(promoted.user.role).toBe('admin');
		expect(db.execute).toHaveBeenCalledTimes(1);
	});

	it('promotes the FIRST address too (both admins reachable)', async () => {
		const db = fakeDb();
		const promoted = await applyAdminBootstrap(
			envOf('a@x.com,b@x.com'),
			fakeAuth('a@x.com'),
			db
		);
		expect(promoted.user.role).toBe('admin');
	});

	it('email comparison is case-insensitive on both sides', async () => {
		const db = fakeDb();
		const promoted = await applyAdminBootstrap(
			envOf('  A@X.COM , b@x.com '),
			fakeAuth('a@x.com'),
			db
		);
		expect(promoted.user.role).toBe('admin');
	});

	it('non-matching email is never promoted (no DB write)', async () => {
		const db = fakeDb();
		const untouched = await applyAdminBootstrap(
			envOf('a@x.com,b@x.com'),
			fakeAuth('c@x.com'),
			db
		);
		expect(untouched.user.role).toBe('player');
		expect(db.execute).not.toHaveBeenCalled();
	});

	it('empty/missing ADMIN_EMAIL → nobody promoted (NG18 manual bootstrap)', async () => {
		for (const config of [undefined, '', '  ,  ']) {
			const db = fakeDb();
			const untouched = await applyAdminBootstrap(envOf(config), fakeAuth('a@x.com'), db);
			expect(untouched.user.role).toBe('player');
			expect(db.execute).not.toHaveBeenCalled();
		}
	});

	it('already-admin is left untouched (WHERE no-op, never demotes)', async () => {
		const db = fakeDb();
		const still = await applyAdminBootstrap(envOf('a@x.com'), fakeAuth('a@x.com', 'admin'), db);
		expect(still.user.role).toBe('admin');
		expect(db.execute).not.toHaveBeenCalled();
	});

	it('changing ADMIN_EMAIL never demotes an existing admin', async () => {
		const db = fakeDb();
		const still = await applyAdminBootstrap(envOf('someone-else@x.com'), fakeAuth('a@x.com', 'admin'), db);
		expect(still.user.role).toBe('admin');
		expect(db.execute).not.toHaveBeenCalled();
	});
});