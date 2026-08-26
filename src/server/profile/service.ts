// Phase-2 profile domain — onboarding + profile edits (plan §9 contract).
// Services live under src/server/profile/ (proposed-repo-tree home).
// The browser is untrusted: every mutation re-validates display-name rules,
// moderation, reserved names, and the avatar allow-list; the UNIQUE
// (display_name_normalized) constraint is the final guard (D2).
//
// Name ownership (v22 regression): after onboarding, `name` +
// `display_name_normalized` are application-owned and written ONLY here.
// Google re-auth / session resolution never rewrites them (the better-auth
// config maps no provider profile into user fields; authContext's only user
// write is the admin role promotion).
import { and, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { user } from '../db/schema';
import { isValidAvatarEmoji } from '../data/avatar-emojis';
import { AppError, ERROR_CODES } from '../lib/errors';
import { isReservedDisplayName, validateDisplayName } from './display-name';

/** The ONLY user shape crossing the HTTP boundary (plan §9). No email, no
 * token, no display_name_normalized internals. */
export type MeUser = {
	id: string;
	name: string;
	avatarEmoji: string;
	role: string;
	onboardingCompleted: boolean;
};

export type UserRow = typeof user.$inferSelect;

/** Phase-2 D1: onboarded ⇔ onboarding_completed_at IS NOT NULL. */
export function isOnboarded(row: { onboarding_completed_at?: Date | string | null }): boolean {
	return row.onboarding_completed_at != null;
}

export function toMeUser(row: UserRow): MeUser {
	return {
		id: row.id,
		name: row.name,
		avatarEmoji: row.avatarEmoji,
		role: row.role,
		onboardingCompleted: isOnboarded(row)
	};
}

/** Strict PATCH body fields (≥1 enforced by the handler schema). */
export type ProfilePatch = {
	displayName?: string;
	avatarEmoji?: string;
};

export type ProfileService = {
	/** GET /api/me — authenticated user's public profile. */
	getMe(userId: string): Promise<MeUser>;
	/** PATCH /api/me/profile — onboarding (atomic) or post-onboarding edits. */
	updateProfile(userId: string, patch: ProfilePatch): Promise<MeUser>;
};

/** Postgres unique_violation (SQLSTATE 23505) — the UNIQUE final guard. */
function isUniqueViolation(err: unknown): boolean {
	const cause = (err as { cause?: { code?: string } | Error }).cause as
		| { code?: string }
		| undefined;
	return cause?.code === '23505';
}

export function createProfileService(db: Db): ProfileService {
	return {
		async getMe(userId) {
			const row = await db.query.user.findFirst({ where: eq(user.id, userId) });
			if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
			return toMeUser(row);
		},

		async updateProfile(userId, patch) {
			const row = await db.query.user.findFirst({ where: eq(user.id, userId) });
			if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);

			const completingOnboarding = !isOnboarded(row);
			// D1 atomicity: while incomplete, BOTH fields are required in the
			// SAME request; nothing persists until the single successful submit.
			if (
				completingOnboarding &&
				(patch.displayName === undefined || patch.avatarEmoji === undefined)
			) {
				throw new AppError(
					ERROR_CODES.INCOMPLETE_ONBOARDING,
					'Both a display name and an avatar are required to finish onboarding',
					400
				);
			}

			// Display name: charset/length → moderation → reserved/duplicate.
			let canonical: string | undefined;
			if (patch.displayName !== undefined) {
				const validation = validateDisplayName(patch.displayName);
				if (!validation.ok) {
					if (validation.code === 'NAME_MODERATED') {
						// Generic message — never reveal the offending word (D2).
						throw new AppError(ERROR_CODES.NAME_MODERATED, 'This name is not allowed', 400);
					}
					throw new AppError(
						ERROR_CODES.INVALID_NAME,
						'Name must be 2–15 characters using letters, numbers, spaces, _ or -',
						400
					);
				}
				canonical = validation.canonical;
				// Reserved names share the SAME 409 as duplicates (D2 — the UI
				// cannot distinguish them).
				if (isReservedDisplayName(canonical)) {
					throw new AppError(ERROR_CODES.NAME_TAKEN, 'This name is already taken', 409);
				}
				if (canonical !== row.display_name_normalized) {
					const taken = await db.query.user.findFirst({
						where: and(eq(user.display_name_normalized, canonical), ne(user.id, userId))
					});
					if (taken) {
						throw new AppError(ERROR_CODES.NAME_TAKEN, 'This name is already taken', 409);
					}
				}
			}

			// Avatar: curated allow-list only (D4).
			if (patch.avatarEmoji !== undefined && !isValidAvatarEmoji(patch.avatarEmoji)) {
				throw new AppError(
					ERROR_CODES.INVALID_AVATAR,
					'Choose an avatar from the curated set',
					400
				);
			}

			try {
				const [updated] = await db
					.update(user)
					.set({
						...(canonical !== undefined
							? { name: canonical, display_name_normalized: canonical }
							: {}),
						...(patch.avatarEmoji !== undefined ? { avatarEmoji: patch.avatarEmoji } : {}),
						// DB time, set ONLY when first completing (D1).
						...(completingOnboarding ? { onboarding_completed_at: sql`now()` } : {})
					})
					.where(eq(user.id, userId))
					.returning();
				if (!updated) throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
				return toMeUser(updated);
			} catch (err) {
				// UNIQUE(display_name_normalized) is the final guard — a
				// concurrent claim of the same name maps to the same 409.
				if (isUniqueViolation(err)) {
					throw new AppError(ERROR_CODES.NAME_TAKEN, 'This name is already taken', 409);
				}
				throw err;
			}
		}
	};
}