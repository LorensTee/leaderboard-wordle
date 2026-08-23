// NG21 — one requestId per request, surfaced in the error envelope and
// response header (X-Request-Id) for request correlation.
import type { Context, Next } from 'hono';

export function requestIdMiddleware(c: Context, next: Next): Promise<Response | void> {
	const existing = c.req.header('x-request-id');
	const id = existing && /^[A-Za-z0-9-]{8,64}$/.test(existing) ? existing : crypto.randomUUID();
	c.set('requestId', id);
	c.header('x-request-id', id);
	return next();
}