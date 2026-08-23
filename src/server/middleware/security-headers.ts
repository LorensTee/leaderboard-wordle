// NG22 — secure-header baseline.
// Explicit subset: X-Content-Type-Options (nosniff), X-Frame-Options (DENY),
// Referrer-Policy. HSTS is emitted on HTTPS responses only (production
// behavior; http responses can't carry it). CSP is deliberately NOT set here
// — reserved for the Phase 5 hardening pass.
import { secureHeaders } from 'hono/secure-headers';

export const securityHeadersMiddleware = secureHeaders({
	xContentTypeOptions: 'nosniff',
	xFrameOptions: 'DENY',
	referrerPolicy: 'strict-origin-when-cross-origin',
	// Emitted only for https requests (the middleware decides per response).
	strictTransportSecurity: undefined
});

// HSTS gate: decorate responses that went over TLS. `next()` may resolve to
// void when no downstream handler produced a response — then there is nothing
// to decorate (Hono composes the chain result itself).
export async function hstsOnHttps(
	c: import('hono').Context,
	next: import('hono').Next
): Promise<Response | undefined> {
	const res = (await next()) as Response | undefined;
	if (res?.headers) {
		const url = new URL(c.req.url);
		if (url.protocol === 'https:') {
			res.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
		}
	}
	return res;
}