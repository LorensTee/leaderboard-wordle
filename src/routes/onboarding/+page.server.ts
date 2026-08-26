// Onboarding page guard (D1): guests go to the landing page; complete users
// are redirected to /play — /onboarding is the ONLY application surface
// reachable while onboarding is incomplete.
import { redirectAwayFromOnboarding } from '$lib/app/guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	redirectAwayFromOnboarding(locals.user);
	return { user: locals.user };
};