// Phase-5 S1 (F1) — Cloudflare Workers Rate Limiting API middleware.
// Contract: plan §F. One binding per class (see contradictions log S1b —
// simple-limit namespaces apply ONE limit per key, so per-class PROPOSED
// limits need per-class namespaces). Missing binding ⇒ pass-through (never
// fail closed locally; unit-tested). The API is abuse protection only — NOT
// an accounting mechanism (eventually consistent; plan §F.1).
//
// The `cloudflare:rate-limit` module is not declared in the installed
// @cloudflare/workers-types, so the binding is typed structurally below
// (verified identical to the workers-types global `RateLimit`:
// `limit({ key }) → Promise<{ success }>` — see contradictions log S1c).
import type { Context, MiddlewareHandler } from 'hono';
import { ERROR_CODES, errorEnvelope } from '../lib/errors';

/** Structural shape of the Workers Rate Limiting binding (workers-types RateLimit). */
export type RateLimitBinding = {
	limit(options: { key: string }): Promise<{ success: boolean }>;
};

/**
 * Rate-limit classes — PROPOSED/product-tunable thresholds (plan §N D1,
 * copied from Architecture-v3 §Rate limiting "Suggested limit" column).
 * The operator must provision matching namespaces (handoff operator steps);
 * limits are informational in-app (the binding is the enforcement point).
 */
export const RATE_LIMIT_CLASSES = {
	auth: { bindingName: 'AUTH_RATE_LIMITER', limit: 10, keyPrefix: 'auth' },
	game: { bindingName: 'GAME_RATE_LIMITER', limit: 30, keyPrefix: 'game' },
	me: { bindingName: 'ME_RATE_LIMITER', limit: 10, keyPrefix: 'me' },
	admin: { bindingName: 'ADMIN_RATE_LIMITER', limit: 20, keyPrefix: 'admin' }
} as const;

export type RateLimitClassName = keyof typeof RATE_LIMIT_CLASSES;

/** Unsafe methods each class throttles (reads are edge-limited, not app-limited). */
const CLASS_UNSAFE_METHODS: Record<RateLimitClassName, ReadonlySet<string>> = {
	// OAuth callback GETs must never be throttled — POST-only (plan §F.2).
	auth: new Set(['POST']),
	game: new Set(['POST', 'PUT', 'PATCH', 'DELETE']),
	me: new Set(['POST', 'PUT', 'PATCH', 'DELETE']),
	admin: new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
};

/** Injectable limiter seam (mirrors the SessionResolver precedent in auth.ts). */
export type RateLimiter = RateLimitBinding;

export type RateLimitMiddlewareOptions = {
	/**
	 * Resolves the binding for the current request env. Returns undefined
	 * when the binding is absent (local dev / tests / preview) → the
	 * middleware passes through without limiting.
	 */
	getBinding: (c: Context) => RateLimitBinding | undefined;
	/** Test seam: override the limiter call (defaults to the resolved binding). */
	limiter?: RateLimiter;
};

function resolveKey(c: Context, className: RateLimitClassName): string {
	const cfg = RATE_LIMIT_CLASSES[className];
	const auth = c.get('auth');
	// Session classes are mounted after requireAuth/requireAdmin, so identity
	// is always present; the defensive fallback mirrors the auth-class rule.
	if (auth) return `${cfg.keyPrefix}:${auth.user.id}`;
	const ip = c.req.header('cf-connecting-ip');
	if (ip) return `${cfg.keyPrefix}:ip:${ip}`;
	// Explicit per-request no-op key (never a shared constant): a synthetic
	// request without an IP (local probe) gets a unique key per requestId, so
	// the limiter cannot trip on a single shared value (plan §F.3).
	return `${cfg.keyPrefix}:dev:${c.get('requestId') ?? 'unknown'}`;
}

/**
 * Creates the rate-limit middleware for one class. Mounting order is
 * normative (plan §D.1): CSRF first, guards before session-class limiters,
 * the auth class before the Better Auth handler.
 */
export function createRateLimitMiddleware(
	className: RateLimitClassName,
	opts: RateLimitMiddlewareOptions
): MiddlewareHandler {
	const cfg = RATE_LIMIT_CLASSES[className];
	return async function rateLimitMiddleware(c, next) {
		const unsafe = CLASS_UNSAFE_METHODS[className];
		if (!unsafe.has(c.req.method)) return next();

		const binding = opts.getBinding(c);
		if (!binding) return next(); // pass-through (binding absent)

		const key = resolveKey(c, className);
		const outcome = await (opts.limiter ?? binding).limit({ key });
		if (outcome.success) return next();

		// 429 with the NG21 envelope + rate-limit headers (plan §F.4). The
		// binding exposes only `success` — limit/remaining/reset are
		// synthesized from the class config (contradictions log S1d).
		const requestId = c.get('requestId') ?? 'unknown';
		c.header('retry-after', '60');
		c.header('x-ratelimit-limit', String(cfg.limit));
		c.header('x-ratelimit-remaining', '0');
		c.header('x-ratelimit-reset', String(Math.floor(Date.now() / 1000) + 60));
		return c.json(
			errorEnvelope(ERROR_CODES.RATE_LIMITED, 'Rate limit exceeded', requestId),
			429
		);
	};
}