// Phase-4 admin E2E (plan §10.3: E-A1…E-A6) — deterministic session fixture
// with role:'admin' + server-seeded puzzles (SQL-computed Manila dates).
// Serialized runner (workers: 1) + TRUNCATE fixtures (shared non-production
// DB). The suite skips explicitly when DATABASE_URL / BETTER_AUTH_SECRET /
// ALLOW_DB_WIPE are unavailable (CI injects them).
import { expect, test } from '@playwright/test';
import {
	createAuthenticatedUser,
	e2eAuthAvailable,
	seedApprovedAnswer,
	seedScheduledPuzzle,
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

/** Today's Asia/Manila date ISO (client-side; matches the page's highlight). */
function manilaToday(): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Manila',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
}

function addDays(iso: string, days: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** First day of the month AFTER the current Manila month (UTC-safe math). */
function firstOfNextMonth(): string {
	const [y, m] = manilaToday().split('-').map(Number);
	return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** True when `date` falls in the SAME Manila month as today (calendar frame). */
function sameMonthAsToday(date: string): boolean {
	const today = manilaToday();
	return date.slice(0, 7) === today.slice(0, 7);
}

/** A future date guaranteed to be visible in the current calendar frame. */
function futureInFrame(): string {
	const tomorrow = addDays(manilaToday(), 1);
	return sameMonthAsToday(tomorrow) ? tomorrow : firstOfNextMonth();
}

test.describe('admin page (deterministic session + seeded puzzles)', () => {
	test.describe.configure({ mode: 'serial' });
	test.skip(!authAvailable, 'requires DATABASE_URL + BETTER_AUTH_SECRET + ALLOW_DB_WIPE (env or .dev.vars)');

	test('E-A1: admins see the Admin tab + populated calendar; players are redirected and get 403 from the API', async ({
		context,
		page
	}) => {
		const { cookie } = await createAuthenticatedUser(undefined, 'Admin One', {
			onboarded: true,
			role: 'admin'
		});
		// A future date in the CURRENT month if possible, else next month's
		// first day — the calendar frame adapts (never fabricates dates).
		const target = futureInFrame();
		await seedScheduledPuzzle(target, 'light');
		await addSessionCookie(context, cookie);

		await page.goto('/');
		// Admin sees the Admin tab.
		await page.getByRole('link', { name: 'Admin', exact: true }).click();
		await expect(page).toHaveURL(/\/admin$/);
		await expect(
			page.getByRole('heading', { name: 'Admin — puzzle scheduling' })
		).toBeVisible();
		// The populated calendar shows the seeded word.
		await expect(
			page.locator(`[data-date="${target}"]`).getByText('light', { exact: true })
		).toBeVisible();

		// Player: no tab, page redirect, API 403.
		const player = await createAuthenticatedUser(undefined, 'Plain Player', {
			onboarded: true,
			role: 'player',
			fresh: false
		});
		const playerCtx = await context.browser()!.newContext();
		await playerCtx.addCookies([
			{ name: 'better-auth.session_token', value: player.cookie, url: 'http://127.0.0.1:4173' }
		]);
		const playerPage = await playerCtx.newPage();
		await playerPage.goto('/');
		await expect(playerPage.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
		await playerPage.goto('/admin');
		await expect(playerPage).toHaveURL('/');
		const res = await playerPage.request.get('/api/admin/puzzles', {
			headers: { cookie: `better-auth.session_token=${player.cookie}` }
		});
		expect(res.status()).toBe(403);
		expect((await res.json()).error.code).toBe('FORBIDDEN');
		await playerCtx.close();
	});

	test('E-A2: schedule flow — fill word + hint → success toast → row appears in the month grid', async ({
		context,
		page
	}) => {
		const { cookie } = await createAuthenticatedUser(undefined, 'Admin Two', {
			onboarded: true,
			role: 'admin'
		});
		await seedApprovedAnswer('below');
		const target = futureInFrame();
		await addSessionCookie(context, cookie);

		await page.goto('/admin');
		// If the month frame has no future days, move to the next month.
		if (!sameMonthAsToday(target)) {
			await page.getByRole('button', { name: 'Next month' }).click();
		}
		// The target cell of the visible month offers "Schedule".
		await page
			.locator(`[data-date="${target}"]`)
			.getByRole('button', { name: /Schedule a puzzle/ })
			.click();
		// Preset date input, word + hint (prefilled from the word's first letter).
		const dateInput = page.getByLabel('Date');
		await expect(dateInput).toHaveValue(target);
		await page.getByLabel('Answer word').fill('below');
		await expect(page.getByText('✓ Approved answer')).toBeVisible();
		await expect(page.getByLabel('Hint letter')).toHaveValue('B');
		await page.getByRole('button', { name: 'Schedule', exact: true }).click();
		await expect(page.getByText('Puzzle scheduled')).toBeVisible();
		// The row appears in the month grid (the new word in its cell).
		await expect(
			page.locator(`[data-date="${target}"]`).getByText('below', { exact: true })
		).toBeVisible();
	});

	test('E-A3: validation states — rejected non-approved word; already-scheduled answer is flagged and submission rejected', async ({
		context,
		page
	}) => {
		const { cookie } = await createAuthenticatedUser(undefined, 'Admin Three', {
			onboarded: true,
			role: 'admin'
		});
		// 'light' is approved AND already scheduled (E-A3 duplicate case).
		const target = futureInFrame();
		await seedScheduledPuzzle(target, 'light');
		await addSessionCookie(context, cookie);

		await page.goto('/admin');
		// Any EMPTY future cell opens the schedule form (the target date is
		// already occupied by 'light' — the duplicate case). At month end
		// the current frame may have no future cells → move to next month.
		const scheduleButton = page.locator('[data-date] button[aria-label*="Schedule a puzzle"]').first();
		if ((await scheduleButton.count()) === 0) {
			await page.getByRole('button', { name: 'Next month' }).click();
		}
		await scheduleButton.click();

		// Non-approved word → the ✕ state; submission is rejected server-side.
		await page.getByLabel('Answer word').fill('zzzzz');
		await expect(page.getByText('✕ Not in approved answer list')).toBeVisible();
		await page.getByRole('button', { name: 'Schedule', exact: true }).click();
		await expect(page.getByText(/not in the approved answer list/)).toBeVisible();
		await expect(page.getByText('Puzzle scheduled')).toHaveCount(0);

		// Already-scheduled answer → the ⚠ state; submission rejected (409).
		await page.getByLabel('Answer word').fill('light');
		await expect(page.getByText(/⚠ Already scheduled\/used/)).toBeVisible();
		await page.getByRole('button', { name: 'Schedule', exact: true }).click();
		await expect(page.getByText(/already scheduled or used/)).toBeVisible();
		await expect(page.getByText('Puzzle scheduled')).toHaveCount(0);
	});

	test('E-A4: delete future SCHEDULED with confirmation; no delete affordance for ACTIVE or today', async ({
		context,
		page
	}) => {
		const { cookie } = await createAuthenticatedUser(undefined, 'Admin Four', {
			onboarded: true,
			role: 'admin'
		});
		const future = futureInFrame();
		await seedScheduledPuzzle(future, 'below');
		// Today ACTIVE (live) — never deletable.
		await seedTodayPuzzle('river');
		await addSessionCookie(context, cookie);

		await page.goto('/admin');
		// Future SCHEDULED row: delete requires the explicit confirmation.
		await page.getByRole('button', { name: `Delete puzzle for ${future}` }).click();
		await expect(page.getByRole('alertdialog')).toBeVisible();
		await page.getByRole('button', { name: 'Delete puzzle', exact: true }).click();
		await expect(page.getByText('Puzzle deleted')).toBeVisible();
		await expect(page.getByText('below', { exact: true })).toHaveCount(0);
		// Missing-puzzle gap warning surfaces the vacated date (D7).
		await expect(page.getByText(new RegExp(`no puzzle scheduled for\\s*${future}`))).toBeVisible();

		// Today's ACTIVE cell → no delete, no edit, immutable badge only.
		const todayCell = page.locator('[aria-current="date"]').first();
		await expect(todayCell.getByRole('button', { name: /Delete/ })).toHaveCount(0);
		await expect(todayCell.getByText('Live')).toBeVisible();
	});

	test('E-A5: same-day replacement for a seeded today-SCHEDULED puzzle — word updates in the calendar', async ({
		context,
		page
	}) => {
		const { cookie } = await createAuthenticatedUser(undefined, 'Admin Five', {
			onboarded: true,
			role: 'admin'
		});
		// Today's SCHEDULED puzzle (cron missed) — the recovery path.
		await seedScheduledPuzzle(undefined, 'river');
		await seedApprovedAnswer('about');
		await addSessionCookie(context, cookie);

		await page.goto('/admin');
		// The replacement panel appears for today-SCHEDULED-never-started.
		await expect(page.getByText(/Today's puzzle was never started/)).toBeVisible();
		await page.getByRole('button', { name: "Replace today's puzzle" }).first().click();

		await page.getByLabel('Answer word').fill('about');
		await expect(page.getByText('✓ Approved answer')).toBeVisible();
		await expect(page.getByLabel('Hint letter')).toHaveValue('A');
		await page.getByRole('button', { name: 'Replace now' }).click();
		await expect(page.getByText("Today's puzzle replaced")).toBeVisible();

		// The today cell now shows the replacement word (in-place UPDATE).
		const todayCell = page.locator('[aria-current="date"]').first();
		await expect(todayCell.getByText('about', { exact: true })).toBeVisible();
		await expect(page.getByText('river', { exact: true })).toHaveCount(0);
		// Still one puzzle — never delete+reschedule (no transient gap).
		await expect(page.getByText(/Missing puzzle alert/)).toHaveCount(0);
	});

	test('E-A6: responsive smoke (390×844) + dark/light render of the calendar', async ({
		context,
		page
	}) => {
		const { cookie } = await createAuthenticatedUser(undefined, 'Admin Six', {
			onboarded: true,
			role: 'admin'
		});
		await seedScheduledPuzzle(undefined, 'river');
		await addSessionCookie(context, cookie);
		await page.setViewportSize({ width: 390, height: 844 });

		await page.goto('/admin');
		await expect(page.getByRole('heading', { name: 'Admin — puzzle scheduling' })).toBeVisible();
		// Narrow screens keep usable cells: no horizontal overflow.
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
		expect(overflow).toBe(false);

		// Both themes render (the page uses the existing token system).
		await page.getByRole('button', { name: 'Switch to dark theme' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(page.getByText('river', { exact: true }).first()).toBeVisible();

		await page.getByRole('button', { name: 'Switch to light theme' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await expect(page.getByText('river', { exact: true }).first()).toBeVisible();
	});

	test('E-A7 (guard): unauthenticated /admin redirects to the landing page', async ({ page }) => {
		// SSR guard (requireOnboarded → redirect '/') — no session at all.
		await page.goto('/admin');
		await expect(page).toHaveURL('/');
	});
});