// Phase-2 profile service validation branches (plan §12) with a FAKE db —
// pins the pure decision logic (atomic onboarding, name rules, moderation
// message contract, reserved/duplicate mapping, avatar allow-list, UNIQUE
// catch) without a database. DB semantics themselves are covered by
// tests/integration/profile.test.ts on live Neon.
import { describe, expect, it, vi } from 'vitest';
import { AppError, ERROR_CODES } from '../../src/server/lib/errors';
import { createProfileService, isOnboarded, type ProfileService, type UserRow } from '../../src/server/profile/service';
import { AVATAR_EMOJIS } from '../../src/server/data/avatar-emojis';

type FakeDb = {
	query: {
		user: {
			findFirst: ReturnType<typeof vi.fn>;
		};
	};
	update: ReturnType<typeof vi.fn>;
};

function baseUser(overrides: Partial<UserRow> = {}): UserRow {
	return {
		id: 'user-1',
		name: 'Player',
		email: 'player@example.com',
		emailVerified: true,
		image: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		avatarEmoji: '🦊',
		role: 'player',
		display_name_normalized: null,
		onboarding_completed_at: null,
		...overrides
	} as UserRow;
}

function makeService(rows: UserRow[], updateResult: UserRow): { service: ProfileService; db: FakeDb } {
	const db: FakeDb = {
		query: {
			user: {
				// First lookup = the caller row; any later lookup (duplicate
				// pre-check) finds nothing unless a test overrides it.
				findFirst: vi
					.fn()
					.mockResolvedValueOnce(rows[0] ?? null)
					.mockResolvedValue(null)
			}
		},
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({ returning: vi.fn(async () => [updateResult]) }))
			}))
		}))
	};
	return { service: createProfileService(db as never), db };
}

describe('profile service — validation branches (fake db)', () => {
	it('isOnboarded matches the D1 contract', () => {
		expect(isOnboarded({ onboarding_completed_at: null })).toBe(false);
		expect(isOnboarded({ onboarding_completed_at: new Date() })).toBe(true);
		expect(isOnboarded({ onboarding_completed_at: undefined })).toBe(false);
	});

	it('getMe returns the minimal public shape (no email, no internals)', async () => {
		const row = baseUser({ name: 'Speedy', avatarEmoji: '🦉', role: 'admin', onboarding_completed_at: new Date() });
		const { service } = makeService([row], row);
		const me = await service.getMe('user-1');
		expect(me).toEqual({ id: 'user-1', name: 'Speedy', avatarEmoji: '🦉', role: 'admin', onboardingCompleted: true });
	});

	it('onboarding is atomic: BOTH fields required while incomplete (INCOMPLETE_ONBOARDING, nothing written)', async () => {
		// Fresh service per case (each updateProfile does its own caller lookup).
		for (const patch of [{ displayName: 'OnlyName' }, { avatarEmoji: '🦊' }]) {
			const { service, db } = makeService([baseUser()], baseUser());
			await expect(service.updateProfile('user-1', patch)).rejects.toMatchObject({
				code: ERROR_CODES.INCOMPLETE_ONBOARDING,
				status: 400
			});
			expect(db.update).not.toHaveBeenCalled();
		}
	});

	it('onboarding success writes BOTH fields + DB-time completion timestamp', async () => {
		const before = baseUser({});
		const after = baseUser({ name: 'alex', display_name_normalized: 'alex', onboarding_completed_at: new Date() });
		const { service, db } = makeService([before], after);
		const me = await service.updateProfile('user-1', { displayName: '  Alex  ', avatarEmoji: '🦊' });
		expect(me).toEqual({ id: 'user-1', name: 'alex', avatarEmoji: '🦊', role: 'player', onboardingCompleted: true });
		// The setName/where are chained fns — assert via the returned user, and
		// that a single UPDATE was issued (atomic single request).
		expect(db.update).toHaveBeenCalledTimes(1);
	});

	it('invalid charset/length → INVALID_NAME 400', async () => {
		for (const bad of ['x', 'a'.repeat(16), 'has.dot', 'emoji😀']) {
			const { service, db } = makeService([baseUser()], baseUser());
			await expect(service.updateProfile('user-1', { displayName: bad, avatarEmoji: '🦊' })).rejects.toMatchObject({
				code: ERROR_CODES.INVALID_NAME,
				status: 400
			});
			expect(db.update).not.toHaveBeenCalled();
		}
	});

	it('moderation rejection is GENERIC (never reveals the word)', async () => {
		for (const bad of ['f u c k', 'sh1thead', 'n1gger']) {
			const { service, db } = makeService([baseUser()], baseUser());
			const err = await service.updateProfile('user-1', { displayName: bad, avatarEmoji: '🦊' }).catch((e) => e);
			expect(err).toBeInstanceOf(AppError);
			expect((err as AppError).code).toBe(ERROR_CODES.NAME_MODERATED);
			expect((err as AppError).status).toBe(400);
			expect((err as AppError).message).toBe('This name is not allowed');
			expect((err as AppError).message.toLowerCase()).not.toContain('fuck');
			expect((err as AppError).message.toLowerCase()).not.toContain('shit');
			expect((err as AppError).message.toLowerCase()).not.toContain('nigger');
			expect(db.update).not.toHaveBeenCalled();
		}
	});

	it('reserved names → NAME_TAKEN 409 (same as duplicates)', async () => {
		for (const reserved of ['admin', 'Admin ', 'WORDLE', 'leaderboard', 'moderator', 'system']) {
			const { service, db } = makeService([baseUser()], baseUser());
			await expect(
				service.updateProfile('user-1', { displayName: reserved, avatarEmoji: '🦊' })
			).rejects.toMatchObject({ code: ERROR_CODES.NAME_TAKEN, status: 409 });
			expect(db.update).not.toHaveBeenCalled();
		}
	});

	it('duplicate pre-check → NAME_TAKEN 409', async () => {
		const other = baseUser({ id: 'user-2', name: 'Taken', display_name_normalized: 'taken' });
		const db: FakeDb = {
			query: {
				user: {
					// First findFirst = the caller; second = the duplicate pre-check.
					findFirst: vi
						.fn()
						.mockResolvedValueOnce(baseUser({}))
						.mockResolvedValueOnce(other)
				}
			},
			update: vi.fn()
		};
		const service = createProfileService(db as never);
		await expect(
			service.updateProfile('user-1', { displayName: 'Taken', avatarEmoji: '🦊' })
		).rejects.toMatchObject({ code: ERROR_CODES.NAME_TAKEN, status: 409 });
		expect(db.update).not.toHaveBeenCalled();
	});

	it('the UNIQUE constraint is the final guard: 23505 → NAME_TAKEN 409', async () => {
		const db: FakeDb = {
			query: { user: { findFirst: vi.fn(async () => baseUser({})) } },
			update: vi.fn(() => {
				throw Object.assign(new Error('Failed query'), { cause: { code: '23505' } });
			})
		};
		const service = createProfileService(db as never);
		await expect(
			service.updateProfile('user-1', { displayName: 'race', avatarEmoji: '🦊' })
		).rejects.toMatchObject({ code: ERROR_CODES.NAME_TAKEN, status: 409 });
	});

	it('non-curated avatar → INVALID_AVATAR 400', async () => {
		for (const bad of ['🙂', '😀', 'not-an-emoji', '']) {
			const { service, db } = makeService([baseUser()], baseUser());
			await expect(
				service.updateProfile('user-1', { displayName: 'alex', avatarEmoji: bad })
			).rejects.toMatchObject({ code: ERROR_CODES.INVALID_AVATAR, status: 400 });
			expect(db.update).not.toHaveBeenCalled();
		}
	});

	it('curated avatar passes the allow-list', async () => {
		const before = baseUser({});
		const after = baseUser({ name: 'alex', display_name_normalized: 'alex', avatarEmoji: AVATAR_EMOJIS[5].emoji, onboarding_completed_at: new Date() });
		const { service } = makeService([before], after);
		const me = await service.updateProfile('user-1', {
			displayName: 'alex',
			avatarEmoji: AVATAR_EMOJIS[5].emoji
		});
		expect(me.avatarEmoji).toBe(AVATAR_EMOJIS[5].emoji);
	});

	it('post-onboarding edits accept EITHER field (single-field PATCH)', async () => {
		const onboarded = baseUser({ name: 'alex', display_name_normalized: 'alex', onboarding_completed_at: new Date() });
		const renamed = baseUser({ ...onboarded, name: 'alan', display_name_normalized: 'alan' });
		const { service } = makeService([onboarded], renamed);
		const me = await service.updateProfile('user-1', { displayName: '  Alan  ' });
		expect(me.name).toBe('alan');
		expect(me.onboardingCompleted).toBe(true);

		const reAvatared = baseUser({ ...onboarded, avatarEmoji: '🐼' });
		const { service: s2 } = makeService([onboarded], reAvatared);
		const me2 = await s2.updateProfile('user-1', { avatarEmoji: '🐼' });
		expect(me2.avatarEmoji).toBe('🐼');
	});

	it('name ownership: re-patching the SAME canonical name is a no-op (no duplicate conflict)', async () => {
		const onboarded = baseUser({ name: 'alex', display_name_normalized: 'alex', onboarding_completed_at: new Date() });
		const { service, db } = makeService([onboarded], onboarded);
		const me = await service.updateProfile('user-1', { displayName: 'ALEX' });
		expect(me.name).toBe('alex');
		expect(db.update).toHaveBeenCalledTimes(1); // still issues the (no-op) UPDATE — UNIQUE self-match is allowed
	});
});