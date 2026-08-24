// Protected game page gate — SvelteKit page-level auth behavior (redirect;
// the API itself is guarded independently by Hono requireAuth).
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(307, '/');
	}
	return { user: locals.user };
};