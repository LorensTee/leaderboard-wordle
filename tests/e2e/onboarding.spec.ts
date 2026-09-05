// Phase-2 onboarding E2E (plan §12 scenarios 1–9, 12): guards, atomic
// completion, invalid/banned/duplicate names, avatar selection, refresh
// persistence, shell reachability, logout. Deterministic session fixture —
// no live Google OAuth in CI.
import { expect, test } from '@playwright/test';
import { createAuthenticatedUser, e2eAuthAvailable } from './helpers/auth-fixture';

const authAvailable = e2eAuthAvailable();

function addSessionCookie(
	context: import('@playwright/test').BrowserContext,
	cookie: string
): Promise<void> {
	return context.addCookies([
		{ name: 'better-auth.session_token', value: cookie, url: 'http://127.0.0.1:4173' }
	]);
}

test.describe.configure({ mode: 'serial' });
test.skip(!authAvailable, 'requires DATABASE_URL + BETTER_AUTH_SECRET (env or .dev.vars)');

test('1. unauthenticated: landing shows Continue with Google; /onboarding redirects to landing', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();

	await page.goto('/onboarding');
	await expect(page.getByRole('heading', { name: /Leaderboard Wordle/i })).toBeVisible();
});

test('2. authenticated incomplete user is sent to /onboarding from every application route', async ({
	context,
	page
}) => {
	const { cookie } = await createAuthenticatedUser('onb-incomplete@test.dev', 'Newbie Kit');
	await addSessionCookie(context, cookie);

	for (const route of ['/play', '/profile', '/leaderboard', '/admin']) {
		await page.goto(route);
		await expect(
			page.getByRole('heading', { name: 'Welcome to the group' }),
			`${route} must redirect to /onboarding`
		).toBeVisible();
	}
	// The minimal (tab-less) header for incomplete users.
	await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
});

test('3. onboarding completes atomically (name + avatar) and lands on /play with tabs', async ({
	context,
	page
}) => {
	const { cookie } = await createAuthenticatedUser('onb-complete@test.dev', 'Newbie Kit');
	await addSessionCookie(context, cookie);
	await page.goto('/onboarding');

	const input = page.getByLabel('Display name');
	await input.fill('Speedrunner Sam');
	// Avatar picker (Phase-6): search the production set for the Fox.
	const search = page.getByLabel('Search emoji');
	await search.fill('fox');
	const fox = page.getByRole('button', { name: 'Fox avatar' });
	await expect(fox).toBeVisible();
	await fox.click();
	await expect(fox).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('button', { name: 'Start playing' }).click();

	// Atomic completion → app shell with tabs, on /play.
	await expect(page).toHaveURL(/\/play$/);
	await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Leaderboard', exact: true })).toBeVisible();
	// Header chip shows the canonicalized name (accessible name = chip text).
	await expect(page.getByRole('link', { name: 'speedrunner sam' })).toBeVisible();
});

test('4. invalid display name rejected — client UX AND server path', async ({ context, page, request }) => {
	const { cookie, userId } = await createAuthenticatedUser('onb-invalid@test.dev', 'Newbie Kit');
	await addSessionCookie(context, cookie);
	await page.goto('/onboarding');

	// Client UX: below min length → inline error, submit blocked.
	const input = page.getByLabel('Display name');
	await input.fill('x');
	await page.getByLabel('Search emoji').fill('fox');
	await page.getByRole('button', { name: 'Fox avatar' }).click();
	await expect(page.getByText('Use 2–15 characters: letters, numbers, spaces, _ or -')).toBeVisible();
	await page.getByRole('button', { name: 'Start playing' }).click();
	await expect(page).toHaveURL(/\/onboarding$/);

	// Server path (authoritative): raw PATCH with an invalid name → 400.
	const res = await request.patch('/api/me/profile', {
		headers: { origin: 'http://127.0.0.1:4173', cookie: `better-auth.session_token=${cookie}` },
		data: { displayName: 'x', avatarEmoji: '🦊' }
	});
	expect(res.status()).toBe(400);
	expect((await res.json()).error.code).toBe('INVALID_NAME');
	void userId;
});

test('5. banned name rejected with the GENERIC message (client + server)', async ({
	context,
	page,
	request
}) => {
	const { cookie } = await createAuthenticatedUser('onb-banned@test.dev', 'Newbie Kit');
	await addSessionCookie(context, cookie);
	await page.goto('/onboarding');

	const input = page.getByLabel('Display name');
	await input.fill('f u c k');
	await expect(page.getByText('This name is not allowed')).toBeVisible();

	const res = await request.patch('/api/me/profile', {
		headers: { origin: 'http://127.0.0.1:4173', cookie: `better-auth.session_token=${cookie}` },
		data: { displayName: 'f u c k', avatarEmoji: '🦊' }
	});
	expect(res.status()).toBe(400);
	const body = await res.json();
	expect(body.error.code).toBe('NAME_MODERATED');
	expect(body.error.message).toBe('This name is not allowed');
});

test('6. duplicate (and reserved) name rejected with NAME_TAKEN', async ({ context, page, request }) => {
	// Existing onboarded user owns 'dupeplayer'.
	const first = await createAuthenticatedUser('onb-dupe-owner@test.dev', 'dupeplayer', {
		onboarded: true,
		fresh: true
	});
	void first;
	// Second user coexists (no TRUNCATE).
	const second = await createAuthenticatedUser('onb-dupe@test.dev', 'Newbie Kit', { fresh: false });
	await addSessionCookie(context, second.cookie);
	await page.goto('/onboarding');

	await page.getByLabel('Display name').fill('dupeplayer');
	await page.getByLabel('Search emoji').fill('fox');
	await page.getByRole('button', { name: 'Fox avatar' }).click();
	await page.getByRole('button', { name: 'Start playing' }).click();
	await expect(page.getByText('That name is already taken')).toBeVisible();
	await expect(page).toHaveURL(/\/onboarding$/);

	// Reserved name via the raw server path → same 409 as duplicates.
	const res = await request.patch('/api/me/profile', {
		headers: { origin: 'http://127.0.0.1:4173', cookie: `better-auth.session_token=${second.cookie}` },
		data: { displayName: 'admin', avatarEmoji: '🦊' }
	});
	expect(res.status()).toBe(409);
	expect((await res.json()).error.code).toBe('NAME_TAKEN');
});

test('7. avatar search is keyboard-accessible; production set is windowed (never thousands of DOM nodes)', async ({
	context,
	page
}) => {
	const { cookie } = await createAuthenticatedUser('onb-avatar@test.dev', 'Newbie Kit');
	await addSessionCookie(context, cookie);
	await page.goto('/onboarding');

	// The picker group is labelled by the "Avatar" field label via
	// aria-labelledby (the label id is NOT duplicated onto the picker root).
	const grid = page.getByRole('group', { name: 'Avatar' });
	// Phase-6 windowed rendering: exactly one 96-item page is mounted (96
	// emoji buttons + the "Show more" control = 97) — the 3,944-entry
	// production set never mounts thousands of buttons at once.
	await expect(grid.getByRole('button')).toHaveCount(97);
	// The biggest category (People & Body, 2,418 entries) exposes "Show more".
	await page.getByRole('tab', { name: 'People & Body' }).click();
	await expect(grid.getByRole('button', { name: /Show more/ })).toBeVisible();

	// Keyboard: search 'panda', ArrowDown from the search control into the
	// first result, Enter selects.
	await page.getByLabel('Display name').fill('panda picker');
	const search = page.getByLabel('Search emoji');
	await search.fill('panda');
	const panda = page.getByRole('button', { name: 'Panda avatar' });
	await expect(panda).toBeVisible();
	await search.press('ArrowDown');
	await expect(panda).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(panda).toHaveAttribute('aria-pressed', 'true');
	// Arrow-key navigation moves focus through the grid (roving tabindex) —
	// verified on a multi-result query.
	await search.fill('heart');
	const first = grid.getByRole('button').first();
	await expect(first).toBeVisible();
	await first.focus();
	await page.keyboard.press('ArrowRight');
	await expect(first).not.toBeFocused();
	await expect(grid.getByRole('button').nth(1)).toBeFocused();
});

test('8. refresh preserves completed onboarding (SSR guard passes)', async ({ context, page }) => {
	const { cookie } = await createAuthenticatedUser('onb-refresh@test.dev', 'Newbie Kit');
	await addSessionCookie(context, cookie);
	await page.goto('/onboarding');
	await page.getByLabel('Display name').fill('steady user');
	await page.getByLabel('Search emoji').fill('fox');
	await page.getByRole('button', { name: 'Fox avatar' }).click();
	await page.getByRole('button', { name: 'Start playing' }).click();
	await expect(page).toHaveURL(/\/play$/);

	await page.reload();
	await expect(page).toHaveURL(/\/play$/);
	await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();
});

test('9. completed user reaches the normal shell — tabs, and Admin tab only for admins', async ({
	context,
	page
}) => {
	const player = await createAuthenticatedUser('onb-shell-player@test.dev', 'Shell Player', {
		onboarded: true
	});
	await addSessionCookie(context, player.cookie);
	await page.goto('/play');
	await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Play', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.getByRole('link', { name: 'Leaderboard', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);

	// Admin role user coexists (no TRUNCATE) — Admin tab visible (D6).
	const admin = await createAuthenticatedUser('onb-shell-admin@test.dev', 'Shell Admin', {
		onboarded: true,
		role: 'admin',
		fresh: false
	});
	const adminContext = await context.browser()!.newContext();
	await addSessionCookie(adminContext, admin.cookie);
	const adminPage = await adminContext.newPage();
	await adminPage.goto('/play');
	await expect(adminPage.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();
	await adminPage.goto('/admin');
	await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
	await adminContext.close();

	// A non-admin hitting /admin is redirected away (real route guard).
	await page.goto('/admin');
	await expect(page).toHaveURL(/\/play$|\/$/);
});

test('12. logout still works — landing page + API 401', async ({ context, page, request }) => {
	const { cookie } = await createAuthenticatedUser('onb-logout@test.dev', 'Logout User', {
		onboarded: true
	});
	await addSessionCookie(context, cookie);
	await page.goto('/play');
	await page.getByRole('button', { name: 'Sign out' }).click();
	// Full reload to the landing page (signOutUser assigns '/').
	await expect(page.getByRole('heading', { name: /Leaderboard Wordle/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();

	const res = await request.get('/api/me', {
		headers: { origin: 'http://127.0.0.1:4173', cookie: `better-auth.session_token=${cookie}` }
	});
	expect(res.status()).toBe(401);
});