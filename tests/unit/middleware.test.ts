// App-level middleware behavior through the fully composed Hono app
// (no server, no DB — direct app.request calls).
import { HTTPException } from 'hono/http-exception';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { onErrorHandler } from '../../src/server/lib/errors';
import app from '../../src/server/routes';

const BASE = 'http://localhost:5173';

describe('B3 middleware baseline (composed app)', () => {
	it('NG20: bodyLimit rejects >64 KB payloads with the 413 envelope + requestId', async () => {
		const res = await app.request(`${BASE}/api/game/start`, {
			method: 'POST',
			headers: { origin: BASE, 'content-type': 'application/json' },
			body: JSON.stringify({ data: 'x'.repeat(70 * 1024) })
		});
		expect(res.status).toBe(413);
		const body = await res.json();
		expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
		expect(body.error.requestId).toBeDefined();
	});

	it('NG4: cross-site mutation rejected with the CSRF envelope', async () => {
		const res = await app.request(`${BASE}/api/game/start`, {
			method: 'POST',
			headers: { origin: 'http://evil.example' },
			body: '{}'
		});
		expect(res.status).toBe(403);
		expect((await res.json()).error.code).toBe('CSRF');
	});

	it('NG21: unknown route → NOT_FOUND envelope, x-request-id header matches', async () => {
		const res = await app.request(`${BASE}/api/nope`);
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error.code).toBe('NOT_FOUND');
		const header = res.headers.get('x-request-id');
		expect(header).toBeTruthy();
		expect(header).toBe(body.error.requestId);
	});

	it('NG22: secure-header baseline present on responses', async () => {
		const res = await app.request(`${BASE}/api/nope`);
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
		expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
	});

	it('NG19: HTTPException responses (408 timeout envelope) survive the custom onError', async () => {
		// Regression: the custom onError replaces Hono's default, which is the
		// only place HTTPException responses are preserved — otherwise a
		// 30s-timeout 408 would degrade to a 500 INTERNAL envelope.
		const capture = new Hono<{ Variables: { requestId: string } }>();
		let ctx: Parameters<typeof onErrorHandler>[1] | undefined;
		capture.all('*', (c) => {
			ctx = c;
			return c.text('ok');
		});
		await capture.request(`${BASE}/probe`);
		if (!ctx) throw new Error('context not captured');

		const envelope = new Response(
			JSON.stringify({
				error: { code: 'REQUEST_TIMEOUT', message: 'Request timed out', requestId: 'r1' }
			}),
			{ status: 408, headers: { 'content-type': 'application/json' } }
		);
		const res = onErrorHandler(new HTTPException(408, { res: envelope }), ctx);
		expect(res.status).toBe(408);
		expect((await res.json()).error.code).toBe('REQUEST_TIMEOUT');
	});
});