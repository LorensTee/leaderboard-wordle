// Better Auth session resolution for page-level behavior (Architecture §822).
// Hono remains the authoritative API authorization boundary and resolves the
// session independently (Phase 0 B4 structural gate).
import type { Handle } from '@sveltejs/kit';
import { getAuth, type AuthBindings } from '$server/auth/auth';

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

	return resolve(event);
};