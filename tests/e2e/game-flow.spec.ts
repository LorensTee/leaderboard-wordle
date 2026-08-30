// Phase-1 authenticated gameplay E2E (mandatory vertical-slice coverage).
// Authentication uses the deterministic session fixture (tests/e2e/helpers/
// auth-fixture.ts): a real user + session row on the non-production database
// and the exact Better Auth signed cookie — no live Google OAuth round-trip.
// The suite skips explicitly when DATABASE_URL / BETTER_AUTH_SECRET are
// unavailable (CI injects them; the unauthenticated smoke spec never skips).
import { expect, test } from '@playwright/test';
import {
	createAuthenticatedUser,
	createUserOnly,
	e2eAuthAvailable,
	seedTodayCompletions,
	seedTodayPuzzle
} from './helpers/auth-fixture';

const authAvailable = e2eAuthAvailable();

async function addSessionCookie(
	context: import('@playwright/test').BrowserContext,
	cookie: string
): Promise<void> {
	await context.addCookies([
		{ name: 'better-auth.session_token', value: cookie, url: 'http://127.0.0.1:4173' }
	]);
}

test.describe('authenticated gameplay (deterministic session fixture)', () => {
	// Both tests share the fixture database (TRUNCATE per setup) — serial only.
	test.describe.configure({ mode: 'serial' });
	test.skip(!authAvailable, 'requires DATABASE_URL + BETTER_AUTH_SECRET (env or .dev.vars)');

	test('start → board → guess feedback → win → reload resume → terminal state', async ({
		context,
		page
	}) => {
		// Fixture: fresh ONBOARDED user session (Phase-2: unfinished onboarding
		// redirects application routes to /onboarding) + today's ACTIVE puzzle.
		const { cookie } = await createAuthenticatedUser(undefined, 'E2E Player', {
			onboarded: true
		});
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

	test('E5+E6: completed game → position block (#N + may-change caption) → View leaderboard lands on the Today tab', async ({
		context,
		page
	}) => {
		const { cookie } = await createAuthenticatedUser(undefined, 'Position Seeker', {
			onboarded: true,
			avatarEmoji: '🙂'
		});
		// A rival strictly faster than any human-speed play (200ms) and one
		// slower (10m) pin the viewer's dense rank at #2 regardless of machine
		// speed — with the deliberate typing delays below, the real play's
		// elapsed time is bounded to (200ms, 10m).
		const fast = await createUserOnly('Turbo Rival', '🐯');
		const slow = await createUserOnly('Slow Rival', '🐢');
		await seedTodayPuzzle('light');
		await seedTodayCompletions([
			{ userId: fast.userId, completionTimeMs: 200, guessCount: 4 },
			{ userId: slow.userId, completionTimeMs: 600_000, guessCount: 6 }
		]);
		await addSessionCookie(context, cookie);

		await page.goto('/play');
		await page.getByRole('button', { name: 'Start' }).click();
		// Wait for the board to be mounted before typing (a racing keystroke
		// would be dropped and change the guess count).
		const board = page.getByRole('grid', { name: 'Wordle board' });
		await expect(board).toBeVisible();
		await page.keyboard.type('about', { delay: 120 });
		await page.keyboard.press('Enter');
		await page.getByRole('button', { name: 'Letter l' }).click();
		await page.keyboard.type('ight', { delay: 120 });
		await page.keyboard.press('Enter');

		// Terminal COMPLETED: Solved line + the position block (dense rank,
		// explicitly non-final) with the leaderboard navigation action.
		await expect(page.getByRole('status').filter({ hasText: /Solved in 2\/6/ })).toBeVisible();
		await expect(page.getByText('Current position: #2')).toBeVisible();
		await expect(page.getByText('Position may change as others finish today')).toBeVisible();

		// E6: the block's action navigates to /leaderboard, Today tab active,
		// with the viewer's highlighted row present.
		await page.getByRole('button', { name: 'View leaderboard' }).click();
		await expect(page).toHaveURL(/\/leaderboard$/);
		await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(page.getByRole('row').filter({ hasText: 'position seeker' })).toBeVisible();
	});

	test('E7: FAILED terminal game → penalty line rendered, NO position block', async ({
		context,
		page
	}) => {
		const { cookie } = await createAuthenticatedUser(undefined, 'Stuck Player', {
			onboarded: true,
			avatarEmoji: '🙂'
		});
		const rival = await createUserOnly('Turbo Rival', '🐯');
		await seedTodayPuzzle('light');
		await seedTodayCompletions([{ userId: rival.userId, completionTimeMs: 3_000, guessCount: 4 }]);
		await addSessionCookie(context, cookie);

		// Six real wrong guesses → FAILED (answer is 'light'; all six words
		// are valid guesses).
		await page.goto('/play');
		await page.getByRole('button', { name: 'Start' }).click();
		const board = page.getByRole('grid', { name: 'Wordle board' });
		await expect(board).toBeVisible();
		const words = ['about', 'after', 'again', 'below', 'candy', 'drain'];
		// Submit one guess at a time: the input is disabled while the guess
		// mutation is pending — a racing keystroke would be dropped.
		for (let i = 0; i < words.length; i++) {
			await page.keyboard.type(words[i]);
			await page.keyboard.press('Enter');
			await expect(
				board.getByRole('row').nth(i).getByRole('gridcell').first()
			).toHaveAttribute('aria-label', /— (green|yellow|gray)/);
		}

		await expect(page.getByRole('status').filter({ hasText: /Out of guesses/ })).toBeVisible();
		// The competitive penalty line (Spec §13) — no position for FAILED.
		await expect(
			page.getByText('The daily penalty counts toward weekly and monthly standings')
		).toBeVisible();
		await expect(page.getByText(/Current position/)).toHaveCount(0);
		await expect(page.getByText(/Position may change/)).toHaveCount(0);
	});
});