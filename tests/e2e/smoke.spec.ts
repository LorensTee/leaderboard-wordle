// B5 smoke — the production preview serves the app through the full
// SvelteKit → Hono chain. Security/adversarial scenarios land in B6.
import { expect, test } from '@playwright/test';

test('homepage renders and the API returns the NG21 envelope for unknown routes', async ({
	page,
	request
}) => {
	await page.goto('/');
	await expect(page.locator('h1')).toContainText('Leaderboard Wordle');

	const res = await request.get('/api/definitely-not-a-route');
	expect(res.status()).toBe(404);
	const body = await res.json();
	expect(body).toHaveProperty('error.code', 'NOT_FOUND');
	expect(body.error).toHaveProperty('requestId');
});