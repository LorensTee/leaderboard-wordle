// Profile page guard (D1): auth + onboarding required.
import { requireOnboarded } from '$lib/app/guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireOnboarded(locals.user);
	return { user: locals.user };
};