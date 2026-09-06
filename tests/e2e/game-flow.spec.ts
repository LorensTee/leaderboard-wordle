// Phase-1 authenticated gameplay E2E (mandatory vertical-slice coverage).
// Authentication uses the deterministic session fixture (tests/e2e/helpers/
// auth-fixture.ts): a real user + session row on the non-production database
// and the exact Better Auth signed cookie — no live Google OAuth round-trip.
// The suite skips explicitly when DATABASE_URL / BETTER_AUTH_SECRET are
// unavailable (CI injects them; the unauthenticated smoke spec never skips).
import { expect, test, type Locator, type Page } from '@playwright/test';
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

/**
 * CI-15 — type a guess and wait for its row to evaluate, recovering from the
 * failure mode the E7 trace exposed: a guess POST the server never answers
 * used to pin `guessMutation.isPending` forever — the keyboard stayed
 * disabled (the `editing` guard) and every retry Enter was silently dropped.
 * The app now aborts the request after GUESS_REQUEST_TIMEOUT_MS (15s,
 * src/lib/shared/api/game.ts) and re-enables input with the typed letters
 * intact. This loop waits for evaluation; when the mutation has settled
 * without confirming, it rebuilds the in-progress row from its aria-labels
 * (typed tiles render a single uppercase letter; evaluated tiles carry
 * " — color" and are skipped), retypes any dropped letters, and resubmits.
 * A request that genuinely never settles still fails loudly at the deadline.
 */
async function submitGuessWithRecovery(
	page: Page,
	board: Locator,
	word: string,
	rowIndex: number
): Promise<void> {
	const keyboard = page.getByRole('group', { name: 'Keyboard' });
	const evaluated = board.getByRole('row').nth(rowIndex).getByRole('gridcell').first();
	const evaluatedLabel = /— (green|yellow|gray)/;

	await page.keyboard.type(word);
	await page.keyboard.press('Enter');

	// 15s client timeout + a resubmit round trip, plus margin.
	const deadline = Date.now() + 25_000;
	while (Date.now() < deadline) {
		try {
			await expect(evaluated).toHaveAttribute('aria-label', evaluatedLabel, { timeout: 1_500 });
			return;
		} catch {
			// Not evaluated yet — inspect the app state below.
		}
		if (await keyboard.isDisabled().catch(() => true)) {
			// A request is still in flight (or the client timeout hasn't fired).
			await page.waitForTimeout(400);
			continue;
		}
		// The previous submit settled without confirming: rebuild the input
		// row and resubmit.
		const cells = board.getByRole('row').nth(rowIndex).getByRole('gridcell');
		let typed = '';
		for (let c = 0; c < (await cells.count()); c++) {
			const label = await cells.nth(c).getAttribute('aria-label');
			if (label && /^[A-Z]$/.test(label)) typed += label.toLowerCase();
		}
		if (typed !== word) await page.keyboard.type(word.slice(typed.length));
		await page.keyboard.press('Enter');
	}
	throw new Error(`guess "${word}" never evaluated (row ${rowIndex + 1})`);
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
		// CI-15 — worst case every guess hangs once (15s client timeout) plus
		// a resubmit round trip; the default 30s cap cannot hold six of those,
		// so this test gets an explicit larger budget.
		test.setTimeout(180_000);

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
		// mutation is pending — a racing keystroke would be dropped. Each
		// guess waits for its row to evaluate and recovers from a hung
		// response (CI-15).
		for (let i = 0; i < words.length; i++) {
			await submitGuessWithRecovery(page, board, words[i], i);
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