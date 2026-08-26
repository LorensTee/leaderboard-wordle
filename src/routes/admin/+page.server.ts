// Admin placeholder guard (D6): auth + onboarding + admin role — a REAL
// route guard even though the scheduling UI lands in Phase 4.
import { requireAdmin } from '$lib/app/guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);
	return { user: locals.user };
};