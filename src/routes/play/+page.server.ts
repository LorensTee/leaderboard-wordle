// Protected game page gate — SvelteKit page-level auth behavior (redirect;
// the API itself is guarded independently by Hono requireAuth). Phase-2 D1:
// incomplete onboarding must be redirected to /onboarding from EVERY
// application route, /play included.
import { requireOnboarded } from '$lib/app/guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireOnboarded(locals.user);
	return { user: locals.user };
};