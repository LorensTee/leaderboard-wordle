// Hono-side authentication helper — the API boundary's independent identity
// resolution (Architecture-v3 §Hono responsibilities; Phase 0 B4 requirement:
// "Hono authentication helper, independent from SvelteKit hooks").
//
// Why this exists alongside hooks.server.ts:
//   - hooks.server.ts resolves sessions for SvelteKit page rendering
//     (event.locals) — it is NOT the authorization source for the API.
//   - The bridge (src/routes/api/[...path]/+server.ts) passes only
//     request/platform bindings into Hono; event.locals never crosses it.
//   - These middleware re-resolve the Better Auth session from the raw
//     request cookies/headers inside Hono, so application API routes
//     authenticate against Better Auth directly — no second session system.
//
// Better Auth remains the identity/session owner. This helper only exposes
// the resolved session as a typed context value (`c.get('auth')`); roles and
// route-level authorization stay application-owned.
import type { Context, Next } from 'hono';
import { sql } from 'drizzle-orm';
import type { SessionData } from '../auth/auth';
import { getAuth, type AuthBindings } from '../auth/auth';
import { getDb } from '../db/memo';
import { ERROR_CODES, errorEnvelope } from '../lib/errors';

// Session cookie owned by Better Auth (same name `hooks.server.ts` fast-path
// checks). The helper resolves the session only when this cookie is present;
// otherwise the request is treated as unauthenticated without a DB round-trip.
export const SESSION_COOKIE_NAME = 'better-auth.session_token';

/** Resolved identity for a request, or null when unauthenticated. */
export type AuthContext =
	| {
			session: SessionData['session'];
			user: SessionData['user'];
	  }
	| null;

/** env/variables subset this middleware needs (satisfied by AppEnv). */
export type AuthMiddlewareEnv = {
	Bindings: AuthBindings & { ADMIN_EMAIL?: string };
	Variables: {
		requestId: string;
		auth: AuthContext;
	};
};

/** For Hono `use` contexts: `c.get('auth')` — typed in routes.ts AppEnv. */
export type AuthVariables = { auth: AuthContext };

export type SessionResolver = (env: AuthBindings, headers: Headers) => Promise<AuthContext>;

/**
 * Default resolver: Better Auth's own session lookup (cookies/headers only —
 * never SvelteKit `event.locals`).
 */
export const resolveAuthSession: SessionResolver = async (env, headers) => {
	const session = await getAuth(env).api.getSession({ headers });
	if (!session) return null;
	return { session: session.session, user: session.user };
};

/**
 * NG18 admin bootstrap — promote-only, idempotent, keyed on the verified
 * email (Architecture §Admin bootstrap). Runs from authContext on every
 * resolved session for the configured email; the WHERE clause makes it a
 * no-op after the first promotion. NEVER demotes: changing ADMIN_EMAIL
 * demotes nobody; a no-admin state is a manual operator bootstrap.
 * Exported for the integration suite (real DB semantics against Neon).
 */
export async function applyAdminBootstrap(
	env: (AuthBindings & { ADMIN_EMAIL?: string }) | undefined,
	auth: NonNullable<AuthContext>
): Promise<NonNullable<AuthContext>> {
	// `c.env` can be undefined in Hono's app.request() test path (routes.ts
	// guards the same case for /api/auth/*) — a missing env means no
	// bootstrap to apply.
	// Email identity is case-insensitive (better-auth's own account linking
	// compares lowercased emails; Google Workspace identities may be stored
	// mixed-case verbatim) — compare trimmed + lowercased on BOTH sides so a
	// mixed-case ADMIN_EMAIL binding still promotes (review finding).
	const configured = env?.ADMIN_EMAIL?.trim();
	const userEmail = auth.user.email?.trim().toLowerCase();
	if (
		!configured ||
		!env ||
		userEmail !== configured.toLowerCase() ||
		auth.user.role === 'admin'
	) {
		return auth;
	}
	await getDb(env).execute(
		sql`UPDATE "user" SET role = 'admin' WHERE id = ${auth.user.id} AND role <> 'admin'`
	);
	// Refresh the context user — the promotion is visible to THIS request.
	return { session: auth.session, user: { ...auth.user, role: 'admin' } };
}

/**
 * Session-resolution middleware. Runs app-wide (including /api/auth/* — it is
 * read-only and never rejects, so Better Auth's own endpoints keep their
 * behavior). Sets `auth` on the context for downstream handlers/middleware.
 *
 * Resolver is injectable for DB-free unit tests; the production instance
 * (exported as `authContext`) resolves through Better Auth.
 */
export function createAuthContext(resolver: SessionResolver = resolveAuthSession) {
	return async function authContext(c: Context<AuthMiddlewareEnv>, next: Next) {
		// Fast path: without the session cookie there is nothing to resolve
		// (mirrors hooks.server.ts; keeps logged-out API calls DB-free).
		// Boundary match on the parsed cookie list — a lookalike cookie name
		// must not trigger a resolver call (the signed-cookie verification
		// remains authoritative either way).
		const cookie = c.req.header('cookie') ?? '';
		const hasSessionCookie = cookie
			.split(';')
			.some((pair) => pair.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
		if (!hasSessionCookie) {
			c.set('auth', null);
			return next();
		}
		// Fail closed: if Better Auth cannot verify the session (missing,
		// expired, revoked, or DB unreachable), the request is unauthenticated
		// or errors out — it is never granted identity.
		const auth = await resolver(c.env as AuthBindings, c.req.raw.headers);
		if (auth) {
			// NG18: the bootstrap is the ONLY user write this middleware ever
			// performs (name/display_name_normalized are application-owned and
			// written ONLY by PATCH /api/me/profile — v22 regression).
			c.set('auth', await applyAdminBootstrap(c.env, auth));
		} else {
			c.set('auth', null);
		}
		return next();
	};
}

/** Production authContext (Better Auth session resolution). */
export const authContext = createAuthContext();

/**
 * Guard for protected application route groups (/api/game/*, /api/me/*,
 * /api/admin/* ...). Rejects unauthenticated requests with the standard
 * error envelope before any application handler runs.
 */
export async function requireAuth(c: Context<AuthMiddlewareEnv>, next: Next): Promise<Response | void> {
	if (!c.get('auth')) {
		return c.json(
			errorEnvelope(
				ERROR_CODES.UNAUTHORIZED,
				'Authentication required',
				c.get('requestId') ?? 'unknown'
			),
			401
		);
	}
	return next();
}
