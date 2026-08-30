// Phase-3 leaderboard E2E (plan §11.3: E1, E3, E4, E8, E9, E10) —
// deterministic session fixture + server-seeded competition (rivals with
// explicit completion values relative to Manila today; the fixtures derive
// dates in SQL from the DB clock).
// The suite skips explicitly when DATABASE_URL / BETTER_AUTH_SECRET are
// unavailable (CI injects them).
import { expect, test, type Page } from '@playwright/test';
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

test.describe('leaderboard page (deterministic session + seeded competition)', () => {
	test.describe.configure({ mode: 'serial' });
	test.skip(!authAvailable, 'requires DATABASE_URL + BETTER_AUTH_SECRET (env or .dev.vars)');

	test('E1: header tab navigates; all four period tabs render their own server-driven content', async ({
		context,
		page
	}) => {
		const { cookie } = await createAuthenticatedUser(undefined, 'Board Watcher', {
			onboarded: true,
			avatarEmoji: '🦊'
		});
		await seedTodayPuzzle('light');
		await addSessionCookie(context, cookie);

		// Header tab → the leaderboard page renders (Today is the default).
		await page.goto('/');
		await page.getByRole('link', { name: 'Leaderboard', exact: true }).click();
		await expect(page).toHaveURL(/\/leaderboard$/);
		await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();

		// Today (default) — no completions seeded → the today empty state.
		await expect(page.getByText('No completed results yet today')).toBeVisible();

		// Each tab fetches its own period (server-owned empty copy differs).
		const tabs: { label: string; copy: string }[] = [
			{ label: 'Yesterday', copy: 'No results yet for yesterday' },
			{ label: 'This week', copy: 'No qualified players this week' },
			{ label: 'This month', copy: 'No qualified players this month' },
			{ label: 'Today', copy: 'No completed results yet today' }
		];
		for (const tab of tabs) {
			await page.getByRole('tab', { name: tab.label }).click();
			await expect(page.getByText(tab.copy)).toBeVisible();
		}
	});

	test('E3: seeded today board — order, values and shared dense ranks (ties)', async ({
		context,
		page
	}) => {
		const { cookie, userId } = await createAuthenticatedUser(undefined, 'Speed Racer', {
			onboarded: true,
			avatarEmoji: '🙂'
		});
		const rivalA = await createUserOnly('Rival Alpha', '🐯');
		const rivalB = await createUserOnly('Rival Beta', '🐰');
		const rivalC = await createUserOnly('Rival Gamma', '🐼');
		await seedTodayPuzzle('light');
		// r1: 25000/4, r2: 25000/4 (full tie → shared dense rank 1), r3: 50000/6.
		await seedTodayCompletions([
			{ userId: rivalA.userId, completionTimeMs: 25_000, guessCount: 4 },
			{ userId: rivalB.userId, completionTimeMs: 25_000, guessCount: 4 },
			{ userId: rivalC.userId, completionTimeMs: 50_000, guessCount: 6 },
			{ userId, completionTimeMs: 60_000, guessCount: 6 }
		]);
		await addSessionCookie(context, cookie);

		await page.goto('/leaderboard');

		const rows = page.getByRole('row');
		await expect(rows).toHaveCount(4);

		// Dense ranks: 1, 1 (tie), 2, 3. The two tied rivals share rank 1 —
		// their relative slot (UUID display-order key) is not asserted; the
		// values are identical.
		await expect(rows.nth(0).getByLabel('Rank 1')).toBeVisible();
		await expect(rows.nth(1).getByLabel('Rank 1')).toBeVisible();
		await expect(rows.nth(2).getByLabel('Rank 2')).toBeVisible();
		await expect(rows.nth(3).getByLabel('Rank 3')).toBeVisible();

		// Values: formatDuration + N/6 (server values, rendered verbatim).
		await expect(rows.nth(0).getByText('0:25')).toBeVisible();
		await expect(rows.nth(0).getByText('4/6')).toBeVisible();
		await expect(rows.nth(2).getByText('0:50')).toBeVisible();
		await expect(rows.nth(2).getByText('6/6')).toBeVisible();
		await expect(rows.nth(3).getByText('1:00')).toBeVisible(); // 60000ms

		// Rival display names render (both tie members, any slot).
		await expect(rows.getByText('rival alpha')).toBeVisible();
		await expect(rows.getByText('rival beta')).toBeVisible();
	});

	test('E4: current-user row gets the accent + "You" badge (from the ["me"] cache)', async ({
		context,
		page
	}) => {
		const { cookie, userId } = await createAuthenticatedUser(undefined, 'Me Player', {
			onboarded: true,
			avatarEmoji: '🙂'
		});
		const rival = await createUserOnly('Rival One', '🐯');
		await seedTodayPuzzle('light');
		await seedTodayCompletions([
			{ userId: rival.userId, completionTimeMs: 20_000, guessCount: 4 },
			{ userId, completionTimeMs: 60_000, guessCount: 6 }
		]);
		await addSessionCookie(context, cookie);

		await page.goto('/leaderboard');

		const myRow = page.getByRole('row').filter({ hasText: 'me player' });
		await expect(myRow).toBeVisible();
		await expect(myRow.getByText('You')).toBeVisible();
		await expect(myRow).toHaveAttribute('data-current-user', 'true');
	});

	test('E8: empty states — no-completions day + unqualified week viewer callout', async ({
		context,
		page
	}) => {
		const { cookie, userId } = await createAuthenticatedUser(undefined, 'Fresh Player', {
			onboarded: true,
			avatarEmoji: '🙂'
		});
		await seedTodayPuzzle('light');
		await seedTodayCompletions([{ userId, completionTimeMs: 60_000, guessCount: 6 }]);
		await addSessionCookie(context, cookie);

		await page.goto('/leaderboard');

		// Today has a completion → the row shows; the viewer is in it.
		await expect(page.getByRole('row')).toHaveCount(1);

		// Yesterday: nothing there (empty state for that period).
		await page.getByRole('tab', { name: 'Yesterday' }).click();
		await expect(page.getByText('No results yet for yesterday')).toBeVisible();

		// Week: the viewer completed only today → unqualified callout with the
		// server facts (no duplicated threshold knowledge).
		await page.getByRole('tab', { name: 'This week' }).click();
		await expect(page.getByText('Not qualified yet')).toBeVisible();
		await expect(
			page.getByText('You have no completed days this period — play more days to qualify.')
		).toBeVisible();
	});

	test('E9: mobile 390×844 — tabs usable, rows fit, no page-level horizontal overflow', async ({
		context,
		page
	}) => {
		const { cookie, userId } = await createAuthenticatedUser(undefined, 'Mobile User', {
			onboarded: true,
			avatarEmoji: '🙂'
		});
		await seedTodayPuzzle('light');
		await seedTodayCompletions([{ userId, completionTimeMs: 30_000, guessCount: 5 }]);
		await addSessionCookie(context, cookie);
		await page.setViewportSize({ width: 390, height: 844 });

		await page.goto('/leaderboard');
		await expect(page.getByRole('row')).toHaveCount(1);

		// Tabs remain usable at mobile width.
		await page.getByRole('tab', { name: 'Yesterday' }).click();
		await expect(page.getByText('No results yet for yesterday')).toBeVisible();
		await page.getByRole('tab', { name: 'This week' }).click();
		await expect(page.getByText('Not qualified yet')).toBeVisible();

		// No horizontal overflow at the page level (the tab strip scrolls
		// internally by design).
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth + 1
		);
		expect(overflow).toBe(false);
	});

	test('E10: light/dark — leaderboard rows and status text pass the computed-contrast audit in both themes', async ({
		context,
		page
	}) => {
		const { cookie, userId } = await createAuthenticatedUser(undefined, 'Theme User', {
			onboarded: true,
			avatarEmoji: '🙂'
		});
		const rival = await createUserOnly('Rival Theme', '🐯');
		await seedTodayPuzzle('light');
		await seedTodayCompletions([
			{ userId: rival.userId, completionTimeMs: 20_000, guessCount: 4 },
			{ userId, completionTimeMs: 60_000, guessCount: 6 }
		]);
		await addSessionCookie(context, cookie);

		await page.goto('/leaderboard');
		await expect(page.getByRole('row')).toHaveCount(2);

		// Audited elements: row names + values, the empty/status copy. The
		// decorative chips (bordered micro-labels) are excluded — same audit
		// conventions as Phase 2 (body/status text ≥ 4.5:1).
		const audit = async (p: Page) => {
			const selectors = [
				'[role="row"] span.text-sm', // display names + values
				'[role="status"] p'
			];
			const failures = await p.evaluate((sels) => {
				const LUM = (rgb: [number, number, number]) => {
					const f = (c: number) => {
						const s = c / 255;
						return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
					};
					return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
				};
				// Composite the element color over the document background with
				// the BROWSER's own math (1×1 canvas) — this resolves modern
				// color syntax (color-mix/rgba/oklab) exactly like the rendered
				// page, so the contrast ratio is the perceived one.
				const canvas = document.createElement('canvas');
				canvas.width = 1;
				canvas.height = 1;
				const ctx = canvas.getContext('2d')!;
				const bodyBg = getComputedStyle(document.body).backgroundColor;
				const chip = (over: string): [number, number, number] => {
					ctx.clearRect(0, 0, 1, 1);
					ctx.fillStyle = bodyBg;
					ctx.fillRect(0, 0, 1, 1);
					ctx.fillStyle = over;
					ctx.fillRect(0, 0, 1, 1);
					const d = ctx.getImageData(0, 0, 1, 1).data;
					return [d[0], d[1], d[2]];
				};
				const bgL = LUM(chip(bodyBg));
				const bad: string[] = [];
				for (const sel of sels) {
					for (const el of Array.from(document.querySelectorAll(sel))) {
						const fgL = LUM(chip(getComputedStyle(el).color));
						const ratio = (Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05);
						if (ratio < 4.5) {
							bad.push(`${sel} → "${el.textContent?.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`);
						}
					}
				}
				return bad;
			}, selectors);
			expect(failures, failures.join('\n')).toEqual([]);
		};

		await audit(page);

		// Dark theme.
		await page.getByRole('button', { name: 'Switch to dark theme' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await audit(page);

		// Back to light (persisted toggle).
		await page.getByRole('button', { name: 'Switch to light theme' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await audit(page);
	});
});