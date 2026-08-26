// Leaderboard placeholder guard (D1): auth + onboarding required. Phase 3
// replaces the placeholder; the guard stays.
import { requireOnboarded } from '$lib/app/guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireOnboarded(locals.user);
	return { user: locals.user };
};