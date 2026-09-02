// Better Auth session resolution for page-level behavior (Architecture §822).
// Hono remains the authoritative API authorization boundary and resolves the
// session independently (Phase 0 B4 structural gate).
import type { Handle } from '@sveltejs/kit';
import { getAuth, type AuthBindings } from '$server/auth/auth';
import {
	HSTS_HEADER_VALUE,
	PAGE_HEADER_BASELINE
} from '$server/middleware/security-headers';

export const handle: Handle = async ({ event, resolve }) => {
	// Fast path: without the Better Auth session cookie there is nothing to
	// resolve (keeps asset requests and logged-out browsing DB-free).
	// Boundary match on the parsed cookie list — a lookalike cookie name
	// must not trigger a session lookup (getSession verifies the signature).
	const cookie = event.request.headers.get('cookie') ?? '';
	const hasSessionCookie = cookie
		.split(';')
		.some((pair) => pair.trim().startsWith('better-auth.session_token='));
	if (!hasSessionCookie) {
		event.locals.session = null;
		event.locals.user = null;
	} else {
		const auth = getAuth((event.platform?.env ?? {}) as unknown as AuthBindings);
		const session = await auth.api.getSession({
			headers: event.request.headers
		});
		// Docs pattern (integrations/svelte-kit.mdx): populate locals from getSession.
		event.locals.session = session?.session ?? null;
		event.locals.user = session?.user ?? null;
	}

	const response = await resolve(event);

	// F2 (Phase-5 S0) — NG22 page-surface header baseline, sharing the single
	// header contract with the Hono API surface (security-headers.ts, plan §H).
	// The bridge (src/routes/api/[...path]/+server.ts) passes the Hono
	// response through hooks unchanged; Hono already emits the same contract
	// for /api/*, so applying it here too would make hooks a duplicate owner
	// — page surfaces only (decision recorded in contradictions log).
	const path = event.url.pathname;
	if (path !== '/api' && !path.startsWith('/api/')) {
		for (const [name, value] of Object.entries(PAGE_HEADER_BASELINE)) {
			response.headers.set(name, value);
		}
		// Same https-only gate as the API hstsOnHttps middleware (plan §H):
		// http responses must not advertise HSTS.
		if (event.url.protocol === 'https:') {
			response.headers.set('strict-transport-security', HSTS_HEADER_VALUE);
		}
	}

	return response;
};