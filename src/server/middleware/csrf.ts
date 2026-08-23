// NG4 — CSRF protection for the JSON API boundary.
// Applied to all app mutations; Better Auth's own OAuth/session endpoints
// (/api/auth/*) are excluded because they perform their own CSRF handling
// and are intentionally reachable cross-origin during OAuth flows.
import type { Context, Next } from 'hono';
import { ERROR_CODES, errorEnvelope } from '../lib/errors';
import { isSameOriginRequest } from '../lib/origin';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function csrfProtection(c: Context, next: Next): Promise<Response | void> {
	const path = c.req.path;

	// Better Auth endpoints are excluded (OAuth redirects, callbacks).
	if (path === '/api/auth' || path.startsWith('/api/auth/')) return next();

	if (!UNSAFE_METHODS.has(c.req.method)) return next();

	if (!isSameOriginRequest(c)) {
		return c.json(
			errorEnvelope(
				ERROR_CODES.CSRF,
				'Cross-site request rejected',
				c.get('requestId') ?? 'unknown'
			),
			403
		);
	}
	return next();
}