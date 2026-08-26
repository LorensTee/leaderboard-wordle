// Phase-2 profile API handlers (plan §9) — thin Hono layer over the profile
// service. Registered ONLY from src/server/routes.ts (single composition
// point; chained so the AppType/RPC schema stays intact).
// Authentication comes from the composed middleware chain (authContext +
// requireAuth on /api/me/*). Ownership is implicit: the authenticated
// user's row is the only target (no ids in the path).
import type { Context, Hono, Schema } from 'hono';
import type { BlankSchema } from 'hono/types';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AppError, ERROR_CODES } from '../lib/errors';
import type { AppEnv } from '../routes';
import type { ProfileService } from './service';

/** Strict body: ONLY displayName/avatarEmoji are accepted (plan §9). */
export const profileBodySchema = z
	.object({
		displayName: z.string().max(64).optional(),
		avatarEmoji: z.string().max(64).optional()
	})
	.strict()
	.refine((body) => body.displayName !== undefined || body.avatarEmoji !== undefined, {
		message: 'At least one of displayName or avatarEmoji is required'
	});

export type ProfileBody = z.infer<typeof profileBodySchema>;

/** Validates the JSON body; failures map to the NG21 BAD_REQUEST envelope. */
export const profileBodyValidator = zValidator('json', profileBodySchema, (result) => {
	if (!result.success) {
		throw new AppError(
			ERROR_CODES.BAD_REQUEST,
			'Invalid profile update',
			400,
			result.error.issues.map((issue) => ({
				path: issue.path.join('.'),
				message: issue.message
			}))
		);
	}
});

export type ProfileRouteDeps = {
	/** Service factory — test seam (fake service in unit tests). */
	getService: (c: Context<AppEnv>) => ProfileService;
};

function authenticatedUser(c: Context<AppEnv>, action: string): { id: string } {
	const auth = c.get('auth');
	if (!auth) {
		// requireAuth already guards /api/me/* — defense in depth so a route
		// accidentally moved outside the guard still fails closed.
		throw new AppError(ERROR_CODES.UNAUTHORIZED, `Authentication required to ${action}`, 401);
	}
	return auth.user;
}

/**
 * Register the Phase-2 profile routes and RETURN the app (chained — Hono
 * accumulates the route Schema in the return type; do NOT annotate/cast).
 *
 * Type-threading note: the SCHEMA parameter `S` must be a TYPE VARIABLE in
 * the signature (Hono<AppEnv, S, BasePath>) while the ENV stays concrete
 * (AppEnv) — a `T extends Hono<AppEnv>` generic resolves method calls
 * against the constraint's empty schema (erasing the incoming game schema
 * from AppType), and a generic env makes zValidator's handler context
 * conditional fail to reduce. Both verified empirically; the Phase-1
 * decision-log chaining rule depends on this shape.
 */
export function registerProfileRoutes<S extends Schema = BlankSchema>(
	app: Hono<AppEnv, S>,
	deps: ProfileRouteDeps
) {
	return app
		.get('/api/me', async (c) => {
			const user = authenticatedUser(c, 'read your profile');
			const result = await deps.getService(c).getMe(user.id);
			return c.json({ user: result }, 200);
		})
		.patch('/api/me/profile', profileBodyValidator, async (c) => {
			const user = authenticatedUser(c, 'update your profile');
			const body = c.req.valid('json');
			const updated = await deps.getService(c).updateProfile(user.id, body);
			return c.json({ user: updated }, 200);
		});
}