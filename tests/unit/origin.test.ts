// NG4 — CSRF origin-validation unit tests (pure logic, no DB).
import { describe, expect, it } from 'vitest';
import { Context, Hono } from 'hono';
import { isSameOriginRequest } from '../../src/server/lib/origin';

async function makeContext(url: string, headers: Record<string, string>): Promise<Context> {
	const app = new Hono();
	let captured: Context | undefined;
	app.all('*', (c) => {
		captured = c;
		return c.text('ok');
	});
	await app.request(url, { headers });
	if (!captured) throw new Error('context not captured');
	return captured;
}

describe('isSameOriginRequest (NG4)', () => {
	it('accepts a browser same-origin POST (Sec-Fetch-Site: same-origin)', async () => {
		const c = await makeContext('http://localhost:5173/api/game/start', {
			'sec-fetch-site': 'same-origin',
			origin: 'http://localhost:5173'
		});
		expect(isSameOriginRequest(c)).toBe(true);
	});

	it('accepts Sec-Fetch-Site: none (browser navigation/direct entry)', async () => {
		const c = await makeContext('http://localhost:5173/api/game/start', {
			'sec-fetch-site': 'none'
		});
		expect(isSameOriginRequest(c)).toBe(true);
	});

	it('rejects a cross-site POST (Sec-Fetch-Site: cross-site)', async () => {
		const c = await makeContext('http://localhost:5173/api/game/start', {
			'sec-fetch-site': 'cross-site'
		});
		expect(isSameOriginRequest(c)).toBe(false);
	});

	it('rejects a cross-origin Origin header', async () => {
		const c = await makeContext('http://localhost:5173/api/game/start', {
			origin: 'http://evil.example'
		});
		expect(isSameOriginRequest(c)).toBe(false);
	});

	it('accepts an allowlisted dev origin (ALLOWED_ORIGINS)', async () => {
		const prev = process.env.ALLOWED_ORIGINS;
		process.env.ALLOWED_ORIGINS = 'http://dev.local';
		try {
			const c = await makeContext('http://localhost:5173/api/game/start', {
				origin: 'http://dev.local'
			});
			expect(isSameOriginRequest(c)).toBe(true);
		} finally {
			if (prev === undefined) delete process.env.ALLOWED_ORIGINS;
			else process.env.ALLOWED_ORIGINS = prev;
		}
	});

	it('rejects headerless mutations in production (https)', async () => {
		const c = await makeContext('https://leaderboard-wordle.example/api/game/start', {});
		expect(isSameOriginRequest(c)).toBe(false);
	});

	it('allows headerless mutations in local dev (http)', async () => {
		const c = await makeContext('http://localhost:5173/api/game/start', {});
		expect(isSameOriginRequest(c)).toBe(true);
	});
});