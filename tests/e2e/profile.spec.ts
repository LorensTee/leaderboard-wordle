// Phase-2 profile E2E (plan §12 scenarios 10–11): profile edits reflected in
// the header, and theme persistence across reload (data-theme + localStorage).
// Deterministic session fixture — no live Google OAuth in CI.
import { expect, test } from '@playwright/test';
import { createAuthenticatedUser, e2eAuthAvailable } from './helpers/auth-fixture';

const authAvailable = e2eAuthAvailable();

async function addSessionCookie(
	context: import('@playwright/test').BrowserContext,
	cookie: string
): Promise<void> {
	await context.addCookies([
		{ name: 'better-auth.session_token', value: cookie, url: 'http://127.0.0.1:4173' }
	]);
}

test.describe.configure({ mode: 'serial' });
test.skip(!authAvailable, 'requires DATABASE_URL + BETTER_AUTH_SECRET (env or .dev.vars)');

test('10. profile updates allowed fields — name change reflected in the header', async ({
	context,
	page,
	request
}) => {
	const { cookie } = await createAuthenticatedUser('prof-edit@test.dev', 'Old Name', {
		onboarded: true,
		avatarEmoji: '🦊'
	});
	await addSessionCookie(context, cookie);
	await page.goto('/profile');

	// Current values load from the ['me'] query.
	const input = page.getByLabel('Display name');
	await expect(input).toHaveValue('old name');
	await expect(page.getByRole('button', { name: 'Fox avatar' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	// Change name only → save → header chip updates from the cached ['me'].
	await input.fill('New Handle');
	const save = page.getByRole('button', { name: 'Save changes' });
	await save.click();
	await expect(page.getByRole('link', { name: 'new handle' })).toBeVisible();

	// Avatar change; wait on SERVER truth (the first toast can outlive the
	// second save, so toasts are not a completion signal).
	await page.getByRole('button', { name: 'Panda avatar' }).click();
	await save.click();
	await expect
		.poll(
			async () =>
				(
					await (
						await request.get('/api/me', {
							headers: {
								origin: 'http://127.0.0.1:4173',
								cookie: `better-auth.session_token=${cookie}`
							}
						})
					).json()
				).user.avatarEmoji,
			{ timeout: 10_000 }
		)
		.toBe('🐼');

	// Reload: SSR + query agree — both edits survived.
	await page.reload();
	await expect(page.getByLabel('Display name')).toHaveValue('new handle');
	await expect(page.getByRole('button', { name: 'Panda avatar' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('11. theme switching persists across reload (data-theme + localStorage)', async ({
	context,
	page
}) => {
	const { cookie } = await createAuthenticatedUser('prof-theme@test.dev', 'Theme Tester', {
		onboarded: true
	});
	await addSessionCookie(context, cookie);
	await page.goto('/play');

	// Default (system light in the test environment): light theme applied.
	await expect
		.poll(async () =>
			page.evaluate(() => document.documentElement.dataset.theme)
		)
		.toBe('light');

	const toggle = page.getByRole('button', { name: 'Switch to dark theme' });
	await toggle.click();
	await expect
		.poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
		.toBe('dark');
	await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();

	// localStorage persisted the explicit choice.
	expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

	// Reload → pre-paint script applies dark BEFORE first paint (no flash).
	await page.reload();
	await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

	// Profile theme switcher (radiogroup) also works and persists.
	await page.goto('/profile');
	await page.getByRole('button', { name: 'Light' }).click();
	await expect
		.poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
		.toBe('light');
	await page.reload();
	expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
	expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
});