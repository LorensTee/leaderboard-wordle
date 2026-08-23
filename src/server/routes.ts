// The fully composed Hono application (proposed-repo-tree: routes.ts).
// Platform bridge = src/routes/api/[...path]/+server.ts (SvelteKit) — the
// ONLY place platform bindings are translated into Hono's environment.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { timeout } from 'hono/timeout';
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
};

export type AppEnv = {
	Bindings: HonoBindings;
	Variables: HonoVariables;
};

export const app = new Hono<AppEnv>();

// NG19 — 30s timeout → JSON 408 envelope (via HTTPException carrying the response).
const TIMEOUT_MS = 30_000;
app.use(
	'*',
	timeout(TIMEOUT_MS, (c) =>
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
);

// NG20 — 64 KB request-body cap → JSON 413 envelope (pre-validation).
app.use(
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
);

// NG21 — requestId on every request (first, so envelopes can reference it).
app.use('*', requestIdMiddleware);

// NG22 — secure-header baseline (+ production-only HSTS over TLS).
app.use('*', securityHeadersMiddleware);
app.use('*', hstsOnHttps);

// NG4 — CSRF for cookie-authenticated JSON mutations (excludes /api/auth/*).
app.use('*', csrfProtection);

// NG21 — centralized error/notFound handling.
app.onError(onErrorHandler);
app.notFound(notFoundHandler);

// Route mounting: Better Auth handler at /api/auth (Phase 0 B4), then
// application routes (Phase 1+). Keep this file the only composition point.

export type AppType = typeof app;
export default app;