// Phase-5 S2 (F3) — CSP enforcement on the production preview (plan §G.4):
//   - zero CSP violation console messages on ALL six routes, light+dark;
//   - pre-paint theme intact (data-theme + persistence regression, NG17);
//   - header contract on page responses (baseline + CSP with the pinned
//     pre-paint hash) and the API response (exact shared CSP value).
//
// Runs against `vite preview` of the production build (enforced CSP — the
// report-only ladder ends here; plan §G.1/D7). The authenticated routes use
// the deterministic session fixture; the spec skips without the fixture env
// (the public-route assertions still run in the smoke spec's spirit).
import { expect, test } from '@playwright/test';
import {
	createAuthenticatedUser,
	e2eAuthAvailable,
	seedTodayPuzzle
} from './helpers/auth-fixture';
import {
	PREPAINT_SCRIPT_SHA256,
	productionCspValue
} from '../../src/server/middleware/csp';

const authAvailable = e2eAuthAvailable();

async function addSessionCookie(
	context: import('@playwright/test').BrowserContext,
	cookie: string
): Promise<void> {
	await context.addCookies([
		{ name: 'better-auth.session_token', value: cookie, url: 'http://127.0.0.1:4173' }
	]);
}

/** Collects CSP violation messages on `page` for the duration of a callback. */
async function withCspWatch(
	page: import('@playwright/test').Page,
	fn: () => Promise<void>
): Promise<string[]> {
	const violations: string[] = [];
	const listener = (msg: import('@playwright/test').ConsoleMessage) => {
		if (/Content Security Policy|Refused to (execute|load)/i.test(msg.text())) {
			violations.push(msg.text());
		}
	};
	page.on('console', listener);
	try {
		await fn();
	} finally {
		page.off('console', listener);
	}
	return violations;
}

async function assertRouteCspClean(
	page: import('@playwright/test').Page,
	path: string,
	theme: string
): Promise<void> {
	const violations = await withCspWatch(page, async () => {
		const response = await page.goto(path);
		expect(response?.status(), `${path} (${theme}) must load`).not.toBe(500);
		// Pre-paint theme applied before first paint (data-theme on <html>).
		expect(
			await page.evaluate(() => document.documentElement.dataset.theme),
			`${path} (${theme}) pre-paint theme`
		).toBe(theme);
		// Page contract: baseline headers + CSP with the pinned pre-paint hash
		// (Kit augments script-src with its own bootstrap hashes — S2e).
		const headers = response?.headers() ?? {};
		expect(headers['x-content-type-options'], `${path} nosniff`).toBe('nosniff');
		expect(headers['x-frame-options'], `${path} xfo`).toBe('DENY');
		const csp = headers['content-security-policy'] ?? '';
		expect(csp, `${path} CSP present`).toContain('frame-ancestors \'none\'');
		expect(csp, `${path} pre-paint hash in script-src`).toContain(
			`script-src 'self' '${PREPAINT_SCRIPT_SHA256}'`
		);
	});
	expect(violations, `${path} (${theme}) CSP violations`).toEqual([]);
}

test.describe('CSP enforcement + theme (S2)', () => {
	test('public routes are CSP-clean in light+dark with pre-paint theme', async ({
		page
	}) => {
		for (const theme of ['light', 'dark'] as const) {
			await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
			await assertRouteCspClean(page, '/', theme);
			await assertRouteCspClean(page, '/onboarding', theme);
		}
	});

	test('authenticated routes are CSP-clean in light+dark + theme persistence', async ({
		browser
	}) => {
		test.skip(!authAvailable, 'requires DATABASE_URL + BETTER_AUTH_SECRET (env or .dev.vars)');
		const { cookie } = await createAuthenticatedUser(undefined, 'CSP Player', {
			onboarded: true
		});
		await seedTodayPuzzle('crane');
		const context = await browser.newContext();
		await addSessionCookie(context, cookie);
		const page = await context.newPage();

		for (const theme of ['light', 'dark'] as const) {
			await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
			await assertRouteCspClean(page, '/play', theme);
			await assertRouteCspClean(page, '/leaderboard', theme);
			await assertRouteCspClean(page, '/profile', theme);
		}

		// Theme persistence (regression vs Phase-2 scenario 11) — in a FRESH
		// context with no init scripts, so the reload exercises the real
		// localStorage → pre-paint path. The click must land AFTER hydration
		// (an SSR'd button has no listener until Svelte hydrates).
		const persistContext = await browser.newContext();
		await addSessionCookie(persistContext, cookie);
		const persistPage = await persistContext.newPage();
		await persistPage.goto('/play');
		await persistPage.waitForLoadState('networkidle');
		await persistPage.getByRole('button', { name: 'Switch to dark theme' }).click();
		expect(
			await persistPage.evaluate(() => document.documentElement.dataset.theme)
		).toBe('dark');
		expect(await persistPage.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
		await persistPage.reload();
		expect(
			await persistPage.evaluate(() => document.documentElement.dataset.theme)
		).toBe('dark');
		await persistContext.close();

		await context.close();
	});

	test('admin route is CSP-clean in light+dark', async ({ browser }) => {
		test.skip(!authAvailable, 'requires DATABASE_URL + BETTER_AUTH_SECRET (env or .dev.vars)');
		const { cookie } = await createAuthenticatedUser(
			`admin-${Date.now()}@test.dev`,
			'CSP Admin',
			{ onboarded: true, role: 'admin' }
		);
		const context = await browser.newContext();
		await addSessionCookie(context, cookie);
		const page = await context.newPage();
		for (const theme of ['light', 'dark'] as const) {
			await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
			await assertRouteCspClean(page, '/admin', theme);
		}
		await context.close();
	});

	test('API responses carry the exact shared CSP contract (S2e equality)', async ({
		request
	}) => {
		const res = await request.get('/api/game/current');
		expect(res.status()).toBe(401);
		expect(res.headers()['content-security-policy']).toBe(productionCspValue());
		expect(res.headers()['x-content-type-options']).toBe('nosniff');
		expect(res.headers()['x-frame-options']).toBe('DENY');
		expect(res.headers()['x-request-id']).toBeTruthy();
	});
});