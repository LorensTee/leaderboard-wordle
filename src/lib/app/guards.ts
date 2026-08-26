// Phase-2 SSR page guards (D1): onboarding gating on EVERY application route
// and the role guard on /admin. SvelteKit page behavior only — the API is
// guarded independently by Hono requireAuth (locals are never an API
// authorization source).
import { redirect } from '@sveltejs/kit';
import type { SessionData } from '$server/auth/auth';

/** D1: onboarded ⇔ onboarding_completed_at IS NOT NULL (server-side twin
 * of `isOnboarded` in src/server/profile/service.ts — page rendering only). */
export function isOnboarded(user: SessionData['user'] | null): boolean {
	return user?.onboarding_completed_at != null;
}

/**
 * Guard for authenticated application surfaces (`/play`, `/profile`,
 * `/leaderboard`, `/admin`): unauthenticated → landing; incomplete
 * onboarding → `/onboarding` (the ONLY reachable surface while incomplete).
 */
export function requireOnboarded(user: SessionData['user'] | null): void {
	if (!user) redirect(307, '/');
	if (!isOnboarded(user)) redirect(307, '/onboarding');
}

/** `/onboarding` guard: complete users leave; guests go to the landing page. */
export function redirectAwayFromOnboarding(user: SessionData['user'] | null): void {
	if (!user) redirect(307, '/');
	if (isOnboarded(user)) redirect(307, '/play');
}

/** `/admin` guard: onboarding first, then the role check (D6). */
export function requireAdmin(user: SessionData['user'] | null): void {
	requireOnboarded(user);
	if (user!.role !== 'admin') redirect(307, '/');
}