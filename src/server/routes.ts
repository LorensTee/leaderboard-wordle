// The fully composed Hono application (proposed-repo-tree: routes.ts).
// Platform bridge = src/routes/api/[...path]/+server.ts (SvelteKit) — the
// ONLY place platform bindings are translated into Hono's environment.
//
// Composition note: Hono accumulates its route Schema in the TYPE of the
// chained return value (`app.post(...)` returns a new typed instance while
// mutating the same object at runtime). AppType (used by `hc<AppType>` RPC
// client) is only useful when every registration is chained — discarding
// the return value silently kills the client typing.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { timeout } from 'hono/timeout';
import { getAuth } from './auth/auth';
import { getDb } from './db/memo';
import { registerGameRoutes } from './game/handlers';
import { createGameService } from './game/service';
import { authContext, requireAuth, type AuthContext } from './middleware/auth';
import { csrfProtection } from './middleware/csrf';
import { requestIdMiddleware } from './middleware/request-id';
import { hstsOnHttps, securityHeadersMiddleware } from './middleware/security-headers';
import { ERROR_CODES, errorEnvelope, notFoundHandler, onErrorHandler } from './lib/errors';

// Runtime bindings delivered by the Worker environment (secrets/vars).
// Typed here for the boundary; wrangler types cover config-declared bindings.
export type HonoBindings = {
	DATABASE_URL: string;
	ADMIN_EMAIL?: string;
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
};

export type HonoVariables = {
	requestId: string;
	/**
	 * Resolved identity for the current request (Phase 0 B4 Hono auth helper).
	 * Set by authContext for every request; null when unauthenticated. Future
	 * application routes read this instead of scattering getSession calls.
	 */
	auth: AuthContext;
};

export type AppEnv = {
	Bindings: HonoBindings;
	Variables: HonoVariables;
};

// NG21 — requestId FIRST (every downstream envelope references it).
// NG19 — 30s timeout → JSON 408 envelope (via HTTPException carrying the response).
// NG20 — 64 KB request-body cap → JSON 413 envelope (pre-validation).
// NG22 — secure-header baseline (+ production-only HSTS over TLS).
// NG4  — CSRF for cookie-authenticated JSON mutations (excludes /api/auth/*).
// Phase 0 B4 — Hono-side authentication helper (fast-path: no session cookie
//              → null without a DB round-trip). Never trusts event.locals.
// Protected namespaces: requireAuth rejects unauthenticated requests with
// the standard UNAUTHORIZED envelope BEFORE any handler runs.
const base = new Hono<AppEnv>()
	.use('*', requestIdMiddleware)
	.use(
		'*',
		timeout(30_000, (c) =>
			new HTTPException(408, {
				res: c.json(
					errorEnvelope(
						ERROR_CODES.REQUEST_TIMEOUT,
						'Request timed out',
						c.get('requestId') ?? 'unknown'
					),
					408
				)
			})
		)
	)
	.use(
		'*',
		bodyLimit({
			maxSize: 64 * 1024,
			onError: (c) =>
				c.json(
					errorEnvelope(
						ERROR_CODES.PAYLOAD_TOO_LARGE,
						'Request body exceeds 64 KB',
						c.get('requestId') ?? 'unknown'
					),
					413
				)
		})
	)
	.use('*', securityHeadersMiddleware)
	.use('*', hstsOnHttps)
	.use('*', csrfProtection)
	.use('*', authContext)
	.use('/api/game/*', requireAuth)
	.use('/api/me/*', requireAuth)
	.use('/api/admin/*', requireAuth)
	// Better Auth — mounted per the current Hono integration docs:
	// `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))`. Runtime values
	// come from Hono bindings (getAuth factory). Deliberately NOT behind
	// requireAuth — OAuth callbacks/redirects must stay reachable and Better
	// Auth owns its own session/CSRF handling on these paths.
	// `?? {}` guards Hono's `app.request(url)` test path, where `c.env` is
	// actually undefined at runtime (verified; the bridge always passes an
	// object, so production behavior is unchanged).
	.all('/api/auth/*', (c) => getAuth((c.env ?? {}) as HonoBindings).handler(c.req.raw));

// Phase-1 game vertical slice (protected: requireAuth mounted above on
// /api/game/*). The service factory resolves the memoized DB client from the
// Worker bindings; the answers stay inside the service (never serialized).
export const app = registerGameRoutes(base, {
	getService: (c) => createGameService(getDb(c.env))
})
	// NG21 — centralized error/notFound handling.
	.onError(onErrorHandler)
	.notFound(notFoundHandler);

export type AppType = typeof app;
export default app;