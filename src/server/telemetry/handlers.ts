// Phase-6 J-A2 — game-API timing beacon (mandatory verification
// infrastructure, plan §J). Registered ONLY from src/server/routes.ts
// (single composition point). Strict schema, timings ONLY: endpoint +
// durationMs (+ optional http status). NEVER words, secrets, or user ids —
// a payload containing any other field is rejected (400) before the writer
// runs. Server-side PH filter: `cf-ipcountry` is appended by Cloudflare at
// the edge and cannot be spoofed by the browser, so the beacon itself
// carries no location data. No DB access (Analytics Engine only — zero
// migration preserved).
import type { Context, Hono, Schema } from 'hono';
import type { BlankSchema } from 'hono/types';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AppError, ERROR_CODES } from '../lib/errors';
import type { AppEnv } from '../routes';

/**
 * Structural shape of the Analytics Engine dataset binding. The
 * `cloudflare:analytics-engine` module is not declared in the installed
 * @cloudflare/workers-types, so the binding is typed structurally — mirrors
 * the RateLimitBinding precedent in middleware/rate-limit.ts (S1c).
 */
export type AnalyticsEngineDatasetBinding = {
	writeDataPoint(event: {
		blobs?: (string | null)[] | null;
		doubles?: number[] | null;
		indexes?: string[] | null;
	}): void;
};

/**
 * Strict: only `endpoint` + `durationMs` (+ optional `status`) are accepted —
 * any other field (e.g. a guess word) is rejected with 400. zod object
 * parsing also rejects any string body (e.g. a bare word). `durationMs` is
 * bounded to 60 s (client timeout is 15 s, the Hono timeout is 30 s;
 * anything larger is a clock artifact, not a real sample).
 */
export const telemetrySchema = z
	.object({
		endpoint: z.enum(['game-current', 'game-guess']),
		durationMs: z.number().int().min(0).max(60_000),
		status: z.number().int().min(100).max(599).optional()
	})
	.strict();

export type TelemetrySample = z.infer<typeof telemetrySchema>;

/** Validates the JSON body; failures map to the NG21 BAD_REQUEST envelope. */
export const telemetryBodyValidator = zValidator('json', telemetrySchema, (result) => {
	if (!result.success) {
		throw new AppError(
			ERROR_CODES.BAD_REQUEST,
			'Invalid telemetry payload',
			400,
			result.error.issues.map((issue) => ({
				path: issue.path.join('.'),
				message: issue.message
			}))
		);
	}
});

/** Server-side PH-country gate (plan §J: PH-filtered; cf-ipcountry is
 * Cloudflare-set, never browser-controlled). */
export function isPhilippinesRequest(c: Context): boolean {
	return (c.req.header('cf-ipcountry') ?? '').toUpperCase() === 'PH';
}

/**
 * Production writer: Analytics Engine `latency` dataset, PH-only. No-op when
 * the binding is absent (local dev / tests / preview) or the request is not
 * from the Philippines. Stores: endpoint (+ iso date blob for daily
 * baselines) and the duration in ms. Never any word/secret/user id.
 */
export function writeLatencyDataPoint(c: Context<AppEnv>, sample: TelemetrySample): void {
	const dataset = c.env.LATENCY;
	if (!dataset) return;
	if (!isPhilippinesRequest(c)) return;
	dataset.writeDataPoint({
		blobs: [sample.endpoint, new Date().toISOString().slice(0, 10)],
		doubles: [sample.durationMs],
		indexes: []
	});
}

export type TelemetryRouteDeps = {
	/** Writer seam — production composes writeLatencyDataPoint (routes.ts). */
	write: (c: Context<AppEnv>, sample: TelemetrySample) => void;
};

/**
 * Register the Phase-6 J-A2 telemetry route and RETURN the app (Hono
 * accumulates its route Schema in the chained return type — AppType/RPC
 * depends on it; the `S extends Schema` parameter carries the caller's
 * accumulated schema through the chain, matching registerGameRoutes/
 * registerAdminRoutes/… convention).
 */
export function registerTelemetryRoutes<S extends Schema = BlankSchema>(
	app: Hono<AppEnv, S>,
	deps: TelemetryRouteDeps
) {
	return app.post('/api/telemetry', telemetryBodyValidator, async (c) => {
		// requireAuth is mounted on /api/telemetry in routes.ts — this is
		// defense in depth so a route accidentally moved outside the guard
		// still fails closed (mirrors authenticatedUser in game/handlers.ts).
		const auth = c.get('auth');
		if (!auth) {
			throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
		}
		deps.write(c, c.req.valid('json'));
		// 202 Accepted — the beacon is asynchronous/best-effort.
		return c.json({ ok: true }, 202);
	});
}