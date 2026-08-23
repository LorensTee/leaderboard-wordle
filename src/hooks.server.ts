// Better Auth session resolution for page-level behavior (Architecture §822).
// Hono remains the authoritative API authorization boundary and resolves the
// session independently (Phase 0 B4 structural gate).
import type { Handle } from '@sveltejs/kit';
import { getAuth, type AuthBindings } from '$server/auth/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const auth = getAuth((event.platform?.env ?? {}) as unknown as AuthBindings);

	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	// Docs pattern (integrations/svelte-kit.mdx): populate locals from getSession.
	event.locals.session = session?.session ?? null;
	event.locals.user = session?.user ?? null;

	return resolve(event);
};