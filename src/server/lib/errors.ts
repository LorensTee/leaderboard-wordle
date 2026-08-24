// NG21 — structured error envelope contract + centralized error handling.
// Every API error response has the shape:
//   { error: { code, message, requestId, issues? } }
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export type ErrorEnvelope = {
	error: {
		code: string;
		message: string;
		requestId: string;
		issues?: unknown;
	};
};

export const ERROR_CODES = {
	BAD_REQUEST: 'BAD_REQUEST',
	UNAUTHORIZED: 'UNAUTHORIZED',
	FORBIDDEN: 'FORBIDDEN',
	CSRF: 'CSRF',
	NOT_FOUND: 'NOT_FOUND',
	CONFLICT: 'CONFLICT',
	PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
	REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
	RATE_LIMITED: 'RATE_LIMITED',
	INTERNAL: 'INTERNAL',
	// Phase-1 game domain codes (documented in docs/phase-1-api.md).
	INVALID_WORD: 'INVALID_WORD',
	GUESS_LIMIT_EXCEEDED: 'GUESS_LIMIT_EXCEEDED',
	GAME_NOT_FOUND: 'GAME_NOT_FOUND',
	GAME_NOT_ACTIVE: 'GAME_NOT_ACTIVE',
	GAME_EXPIRED: 'GAME_EXPIRED',
	PUZZLE_UNAVAILABLE: 'PUZZLE_UNAVAILABLE',
	INVALID_STATE: 'INVALID_STATE'
} as const;

export class AppError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly status: number = 500,
		readonly issues?: unknown
	) {
		super(message);
		this.name = 'AppError';
	}
}

export function errorEnvelope(
	code: string,
	message: string,
	requestId: string,
	issues?: unknown
): ErrorEnvelope {
	const body: ErrorEnvelope = { error: { code, message, requestId } };
	if (issues !== undefined) body.error.issues = issues;
	return body;
}

/** Returns status + envelope body for a thrown error (AppError mapping). */
export function resolveError(err: unknown, requestId: string): { status: number; body: ErrorEnvelope } {
	if (err instanceof AppError) {
		return {
			status: err.status,
			body: errorEnvelope(err.code, err.message, requestId, err.issues)
		};
	}
	// Never leak internal details (architecture §900 error envelope contract).
	return {
		status: 500,
		body: errorEnvelope(
			ERROR_CODES.INTERNAL,
			'An unexpected error occurred',
			requestId
		)
	};
}

/** Centralized onError: JSON envelope for every thrown error (NG21). */
export function onErrorHandler(err: Error, c: Context): Response {
	const requestId = c.get('requestId') ?? 'unknown';
	// Custom onError replaces Hono's default. The ONLY intentional raw
	// HTTPException payload is the NG19 408 timeout envelope (routes.ts) —
	// preserve exactly that. A 400 HTTPException (hono/zod-validator
	// malformed-JSON case, which never reaches the validation hook) is an
	// intentional client-error signal: map it to the standard BAD_REQUEST
	// envelope (still sanitized — no raw content). Any other HTTPException
	// stays on the sanitized internal envelope.
	if (err instanceof HTTPException) {
		if (err.status === 408) return err.getResponse();
		if (err.status === 400) {
			return c.json(
				errorEnvelope(ERROR_CODES.BAD_REQUEST, 'Invalid request', requestId),
				400
			);
		}
	}

	const { status, body } = resolveError(err, requestId);
	// Internal errors keep a server-side trace via the requestId.
	if (status >= 500) console.error(`[internal] requestId=${requestId}`, err);
	return c.json(body, status as 500);
}

/** Centralized notFound: JSON envelope (NG21) — never HTML for /api. */
export function notFoundHandler(c: Context): Response {
	const requestId = c.get('requestId') ?? 'unknown';
	return c.json(
		errorEnvelope(ERROR_CODES.NOT_FOUND, 'Route not found', requestId),
		404
	);
}