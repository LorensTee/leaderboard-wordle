// NG4 — origin validation for cookie-authenticated JSON mutations.
// Browsers attach Sec-Fetch-Site and Origin to unsafe requests; both are
// attacker-unforgeable under same-site cookies. Hono's built-in csrf() only
// gates form content-types — this JSON boundary needs its own check.
import type { Context } from 'hono';

// Only same-origin is acceptable for unsafe methods. `Sec-Fetch-Site: none`
// is ambiguous (opaque origins, non-browser clients) — accepting it for
// mutations would be a fail-open (it may accompany cross-site requests from
// contexts that cannot compute an origin).
const ALLOWED_SEC_FETCH_SITE = new Set(['same-origin']);

/** Extra allowed origins (dev servers, etc.). Never '*' in production. */
export function allowedOrigins(): string[] {
	const extra = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];
	return [...new Set(extra)];
}

/**
 * True when this unsafe request is same-origin (or unambiguously
 * non-browser). Returns false when a browser-driven cross-site request is
 * detected:
 *  - Sec-Fetch-Site present but not same-origin/none → reject
 *  - Origin present but not the request's own origin (or an allowlisted one)
 *    → reject
 *  - neither header present (non-browser client) → reject in production
 *    (curl/tests must send an Origin), allow in dev for tooling ergonomics.
 */
export function isSameOriginRequest(c: Context): boolean {
	const url = new URL(c.req.url);
	const ownOrigin = url.origin;

	const secFetchSite = c.req.header('sec-fetch-site');
	if (secFetchSite && !ALLOWED_SEC_FETCH_SITE.has(secFetchSite)) return false;

	const origin = c.req.header('origin');
	if (origin) {
		return origin === ownOrigin || allowedOrigins().includes(origin);
	}

	// Neither signal present: this is not a browser-initiated request.
	// Reject unconditionally — no dev-permissive heuristic here: the previous
	// production-detection via x-forwarded-proto was client-spoofable
	// (fail-open). Tooling/tests must send an Origin header.
	return false;
}