// Phase-6 J-A2 — game-API timing beacon contract (plan §J). DB-free:
// composed-app requests prove auth/CSRF gating; a mini app with an
// injectable session resolver + writer seam proves the strict payload
// contract (extra fields incl. guess words rejected, string bodies
// rejected, no writer call on invalid input); writeLatencyDataPoint proves
// the server-side PH filter (cf-ipcountry) + Analytics Engine row shape.
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import app from '../../src/server/routes';
import {
	registerTelemetryRoutes,
	writeLatencyDataPoint,
	type AnalyticsEngineDatasetBinding,
	type TelemetryRouteDeps,
	type TelemetrySample
} from '../../src/server/telemetry/handlers';
import { createAuthContext, requireAuth, type AuthContext, type SessionResolver } from '../../src/server/middleware/auth';
import { csrfProtection } from '../../src/server/middleware/csrf';
import { requestIdMiddleware } from '../../src/server/middleware/request-id';
import { notFoundHandler, onErrorHandler } from '../../src/server/lib/errors';
import type { SessionData } from '../../src/server/auth/auth';
import type { AppEnv } from '../../src/server/routes';

const BASE = 'http://localhost:5173';
// Inert env for composed-app requests (unit tests are DB-free; authContext's
// fast path resolves null without a session cookie — no Better Auth call).
const ENV = { DATABASE_URL: 'postgresql://inert.invalid/unused' };

const fakeSession = {
	session: { id: 'session-1', token: 'token-1', userId: 'user-1', expiresAt: new Date() } as SessionData['session'],
	user: { id: 'user-1', email: 'player@example.com', name: 'Player' } as SessionData['user']
};

type MiniEnv = {
	Bindings: { DATABASE_URL: string };
	Variables: { requestId: string; auth: AuthContext };
};

function makeApp(
	write: TelemetryRouteDeps['write'],
	resolver: SessionResolver = async () => fakeSession
) {
	const m = new Hono<MiniEnv>();
	m.use('*', requestIdMiddleware);
	m.use('*', csrfProtection);
	m.use('*', createAuthContext(resolver));
	m.use('/api/telemetry', requireAuth);
	registerTelemetryRoutes(m as unknown as Hono<AppEnv>, { write });
	m.onError(onErrorHandler);
	m.notFound(notFoundHandler);
	return m;
}

function postTelemetry(
	m: ReturnType<typeof makeApp>,
	body: unknown,
	opts: { cookie?: string; origin?: string } = {}
) {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		origin: opts.origin ?? BASE
	};
	if (opts.cookie) headers.cookie = opts.cookie;
	return m.request(`${BASE}/api/telemetry`, {
		method: 'POST',
		headers,
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

const validSample: TelemetrySample = { endpoint: 'game-guess', durationMs: 1_234, status: 200 };

describe('POST /api/telemetry — auth + CSRF gate (composed app)', () => {
	it('401 UNAUTHORIZED envelope without a session cookie (requireAuth fast path)', async () => {
		const res = await app.request(
			`${BASE}/api/telemetry`,
			{
				method: 'POST',
				headers: { origin: BASE, 'content-type': 'application/json' },
				body: JSON.stringify(validSample)
			},
			ENV
		);
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe('UNAUTHORIZED');
	});

	it('cross-site beacon → 403 CSRF (fail-closed, unchanged NG4)', async () => {
		const res = await app.request(
			`${BASE}/api/telemetry`,
			{
				method: 'POST',
				headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
				body: JSON.stringify(validSample)
			},
			ENV
		);
		expect(res.status).toBe(403);
		expect((await res.json()).error.code).toBe('CSRF');
	});
});

describe('POST /api/telemetry — strict payload contract', () => {
	it('accepts a valid timing sample → 202, writer called with the parsed sample', async () => {
		const write = vi.fn<TelemetryRouteDeps['write']>();
		const m = makeApp(write);
		const res = await postTelemetry(m, validSample, { cookie: 'better-auth.session_token=signed' });
		expect(res.status).toBe(202);
		expect(await res.json()).toEqual({ ok: true });
		expect(write).toHaveBeenCalledTimes(1);
		const [, sample] = write.mock.calls[0];
		expect(sample).toEqual(validSample);
	});

	it('rejects any extra field — including a guess word (no words ever)', async () => {
		const write = vi.fn<TelemetryRouteDeps['write']>();
		const m = makeApp(write);
		const res = await postTelemetry(
			m,
			{ ...validSample, word: 'light' },
			{ cookie: 'better-auth.session_token=signed' }
		);
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('BAD_REQUEST');
		expect(write).not.toHaveBeenCalled();
	});

	it('rejects string bodies (a bare word cannot pass)', async () => {
		const write = vi.fn<TelemetryRouteDeps['write']>();
		const m = makeApp(write);
		const res = await postTelemetry(m, '"light"', { cookie: 'better-auth.session_token=signed' });
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('BAD_REQUEST');
		expect(write).not.toHaveBeenCalled();
	});

	it('rejects unknown endpoint values', async () => {
		const write = vi.fn<TelemetryRouteDeps['write']>();
		const m = makeApp(write);
		const res = await postTelemetry(
			m,
			{ endpoint: 'leaderboard', durationMs: 5 },
			{ cookie: 'better-auth.session_token=signed' }
		);
		expect(res.status).toBe(400);
		expect(write).not.toHaveBeenCalled();
	});

	it('rejects non-numeric durationMs (zod does not coerce strings)', async () => {
		const write = vi.fn<TelemetryRouteDeps['write']>();
		const m = makeApp(write);
		const res = await postTelemetry(
			m,
			{ endpoint: 'game-current', durationMs: '5' },
			{ cookie: 'better-auth.session_token=signed' }
		);
		expect(res.status).toBe(400);
		expect(write).not.toHaveBeenCalled();
	});

	it('rejects out-of-range status values', async () => {
		const write = vi.fn<TelemetryRouteDeps['write']>();
		const m = makeApp(write);
		const res = await postTelemetry(
			m,
			{ endpoint: 'game-current', durationMs: 5, status: 600 },
			{ cookie: 'better-auth.session_token=signed' }
		);
		expect(res.status).toBe(400);
		expect(write).not.toHaveBeenCalled();
	});
});

describe('writeLatencyDataPoint — Analytics Engine writer (PH-filtered)', () => {
	async function capturedContext(headers: Record<string, string>, env: object) {
		let captured: Context | undefined;
		const m = new Hono<{ Bindings: Record<string, unknown> }>();
		m.use('*', async (c, next) => {
			captured = c;
			return next();
		});
		m.get('/probe', (c) => c.text('ok'));
		await m.request(`${BASE}/probe`, { headers }, env);
		if (!captured) throw new Error('context not captured');
		return captured as Context<AppEnv>;
	}

	it('writes a PH row with endpoint + iso-date blobs and durationMs', async () => {
		const dataset: AnalyticsEngineDatasetBinding = { writeDataPoint: vi.fn() };
		const c = await capturedContext({ 'cf-ipcountry': 'PH' }, { LATENCY: dataset });
		writeLatencyDataPoint(c, validSample);
		expect(dataset.writeDataPoint).toHaveBeenCalledTimes(1);
		const [event] = (dataset.writeDataPoint as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(event.blobs[0]).toBe('game-guess');
		expect(event.blobs[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(event.doubles).toEqual([1234]);
	});

	it('drops non-PH countries (JP): nothing reaches Analytics Engine', async () => {
		const dataset: AnalyticsEngineDatasetBinding = { writeDataPoint: vi.fn() };
		const c = await capturedContext({ 'cf-ipcountry': 'JP' }, { LATENCY: dataset });
		writeLatencyDataPoint(c, validSample);
		expect(dataset.writeDataPoint).not.toHaveBeenCalled();
	});

	it('drops requests without cf-ipcountry (header is Cloudflare-set)', async () => {
		const dataset: AnalyticsEngineDatasetBinding = { writeDataPoint: vi.fn() };
		const c = await capturedContext({}, { LATENCY: dataset });
		writeLatencyDataPoint(c, validSample);
		expect(dataset.writeDataPoint).not.toHaveBeenCalled();
	});

	it('no-ops when the LATENCY binding is absent (local/tests/preview)', async () => {
		const c = await capturedContext({ 'cf-ipcountry': 'PH' }, {});
		expect(() => writeLatencyDataPoint(c, validSample)).not.toThrow();
	});
});