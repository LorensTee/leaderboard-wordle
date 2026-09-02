// NG22 — secure-header baseline.
// Explicit subset: X-Content-Type-Options (nosniff), X-Frame-Options (DENY),
// Referrer-Policy. HSTS is emitted on HTTPS responses only (production
// behavior; http responses can't carry it). CSP is deliberately NOT set here
// — reserved for the Phase 5 hardening pass (Slice 2, csp.ts).
import { secureHeaders } from 'hono/secure-headers';

// Single source for the NG22 header contract shared by BOTH response
// surfaces (plan §H): the Hono API surface (below) and SvelteKit page
// responses (hooks.server.ts — F2 Phase-5 S0). Keep values in one place so
// the page and API contracts cannot drift.
export const PAGE_HEADER_BASELINE = {
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'strict-origin-when-cross-origin'
} as const;

export const HSTS_HEADER_VALUE = 'max-age=31536000; includeSubDomains';

export const securityHeadersMiddleware = secureHeaders({
	xContentTypeOptions: PAGE_HEADER_BASELINE['x-content-type-options'],
	xFrameOptions: PAGE_HEADER_BASELINE['x-frame-options'],
	referrerPolicy: PAGE_HEADER_BASELINE['referrer-policy'],
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
			res.headers.set('strict-transport-security', HSTS_HEADER_VALUE);
		}
	}
	return res;
}