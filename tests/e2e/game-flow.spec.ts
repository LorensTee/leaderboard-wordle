// Phase-1 authenticated gameplay E2E (mandatory vertical-slice coverage).
// Authentication uses the deterministic session fixture (tests/e2e/helpers/
// auth-fixture.ts): a real user + session row on the non-production database
// and the exact Better Auth signed cookie — no live Google OAuth round-trip.
// The suite skips explicitly when DATABASE_URL / BETTER_AUTH_SECRET are
// unavailable (CI injects them; the unauthenticated smoke spec never skips).
import { expect, test } from '@playwright/test';
import { createAuthenticatedUser, e2eAuthAvailable, seedTodayPuzzle } from './helpers/auth-fixture';

const authAvailable = e2eAuthAvailable();

test.describe('authenticated gameplay (deterministic session fixture)', () => {
	// Both tests share the fixture database (TRUNCATE per setup) — serial only.
	test.describe.configure({ mode: 'serial' });
	test.skip(!authAvailable, 'requires DATABASE_URL + BETTER_AUTH_SECRET (env or .dev.vars)');

	test('start → board → guess feedback → win → reload resume → terminal state', async ({
		context,
		page
	}) => {
		// Fixture: fresh user session + today's ACTIVE puzzle (answer 'light').
		const { cookie } = await createAuthenticatedUser();
		await seedTodayPuzzle('light');
		await context.addCookies([
			{ name: 'better-auth.session_token', value: cookie, url: 'http://127.0.0.1:4173' }
		]);

		// Pre-game state: no hint leaked, Start available.
		await page.goto('/play');
		await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
		await expect(page.getByText(/Hint letter/i)).toHaveCount(0);
		// The answer must not be present anywhere in the rendered page yet.
		await expect(page.getByText('light', { exact: true })).toHaveCount(0);

		await page.getByRole('button', { name: 'Start' }).click();

		// Board + hint + timer appear after the server-authoritative start.
		const board = page.getByRole('grid', { name: 'Wordle board' });
		await expect(board).toBeVisible();
		await expect(page.getByText(/Hint letter:\s*L/i)).toBeVisible();
		await expect(page.getByLabel(/Elapsed time/)).toBeVisible();

		// First guess 'about' (wrong) — physical keyboard path. Feedback for
		// 't' (position 5) is green; board reflects it.
		await page.keyboard.type('about');
		await page.keyboard.press('Enter');
		await expect(page.getByRole('gridcell', { name: 'T — green' })).toBeVisible();
		await expect(page.getByRole('gridcell', { name: 'A — gray' })).toBeVisible();

		// Winning guess 'light' — in-app keyboard path (click a key first).
		await page.getByRole('button', { name: 'Letter l' }).click();
		await page.keyboard.type('ight');
		await page.keyboard.press('Enter');

		// Solved banner with the server-computed completion time.
		await expect(page.getByRole('status').filter({ hasText: /Solved in 2\/6/ })).toBeVisible();
		// Keyboard is disabled/removed for terminal games.
		await expect(page.getByRole('group', { name: 'Keyboard' })).toHaveCount(0);

		// Reload: the terminal state resumes from server data (no replay).
		await page.reload();
		await expect(page.getByRole('status').filter({ hasText: /Solved in 2\/6/ })).toBeVisible();
		await expect(page.getByRole('gridcell', { name: 'L — green' })).toBeVisible();
		await expect(page.getByRole('gridcell', { name: 'G — green' })).toBeVisible();
	});

	test('unauthenticated: /play redirects to the landing page and the API stays 401', async ({
		context,
		page,
		request
	}) => {
		test.skip(!authAvailable, 'requires DATABASE_URL + BETTER_AUTH_SECRET');
		await page.goto('/play');
		await expect(page.getByRole('heading', { name: /Leaderboard Wordle/ })).toBeVisible();

		const res = await request.get('/api/game/current');
		expect(res.status()).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
		expect(body.error.requestId).toBeDefined();
		void context;
	});
});