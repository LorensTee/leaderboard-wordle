// F2 (Phase-5 S0) — NG22 page-surface header baseline applied in
// src/hooks.server.ts. Verifies the page/API contract split (plan §H):
//   - page responses carry nosniff / X-Frame-Options DENY / Referrer-Policy;
//   - HSTS is added ONLY over https (same gate as the API hstsOnHttps);
//   - /api/* responses pass through untouched (Hono owns the API contract —
//     no duplicate header owner);
//   - the session-identity fast path is unchanged (no cookie → null locals).
import type { Handle } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { handle } from '../../src/hooks.server';
import {
	HSTS_HEADER_VALUE,
	PAGE_HEADER_BASELINE
} from '../../src/server/middleware/security-headers';

type RequestEventLike = Parameters<Handle>[0]['event'];

function makeHandleEvent(url: string, cookie?: string): RequestEventLike {
	return {
		request: new Request(url, { headers: cookie ? { cookie } : {} }),
		url: new URL(url),
		locals: {},
		platform: { env: {} },
		cookies: {},
		fetch: async () => new Response('fetched', { status: 200 }),
		isDataRequest: false,
		isSubRequest: false,
		clientAddress: '127.0.0.1',
		getClientAddress: () => '127.0.0.1',
		params: {},
		route: { id: '/', pattern: /^\// }
	} as unknown as RequestEventLike;
}

async function runHandle(
	url: string,
	opts: { cookie?: string; resolveBody?: string } = {}
): Promise<Response> {
	return await handle({
		event: makeHandleEvent(url, opts.cookie),
		resolve: async () => new Response(opts.resolveBody ?? 'page', { status: 200 })
	});
}

describe('F2 page header baseline (hooks.server.ts)', () => {
	it('page responses carry the shared NG22 baseline (http: no HSTS)', async () => {
		const res = await runHandle('http://127.0.0.1:4173/play');
		for (const [name, value] of Object.entries(PAGE_HEADER_BASELINE)) {
			expect(res.headers.get(name), name).toBe(value);
		}
		expect(res.headers.get('strict-transport-security')).toBeNull();
	});

	it('HSTS is emitted over https only (same gate as the API)', async () => {
		const res = await runHandle('https://leaderboard-wordle.example/play');
		expect(res.headers.get('strict-transport-security')).toBe(HSTS_HEADER_VALUE);
		const http = await runHandle('http://leaderboard-wordle.example/play');
		expect(http.headers.get('strict-transport-security')).toBeNull();
	});

	it('baseline headers are set on existing non-api page paths (admin, onboarding)', async () => {
		for (const path of ['/admin', '/onboarding', '/leaderboard', '/profile', '/']) {
			const res = await runHandle(`http://127.0.0.1:4173${path}`);
			expect(res.headers.get('x-content-type-options')).toBe('nosniff');
			expect(res.headers.get('x-frame-options')).toBe('DENY');
		}
	});

	it('/api/* responses pass through untouched — Hono owns the API contract', async () => {
		const res = await runHandle('http://127.0.0.1:4173/api/game/current', {
			resolveBody: '{"error":{}}'
		});
		expect(res.headers.get('x-content-type-options')).toBeNull();
		expect(res.headers.get('x-frame-options')).toBeNull();
		expect(res.headers.get('referrer-policy')).toBeNull();
		expect(res.headers.get('strict-transport-security')).toBeNull();
	});

	it('session-identity fast path unchanged: no cookie → null locals', async () => {
		let captured: RequestEventLike['locals'] | undefined;
		await handle({
			event: makeHandleEvent('http://127.0.0.1:4173/'),
			resolve: async (e) => {
				captured = e.locals;
				return new Response('page', { status: 200 });
			}
		});
		expect(captured?.session).toBeNull();
		expect(captured?.user).toBeNull();
	});
});