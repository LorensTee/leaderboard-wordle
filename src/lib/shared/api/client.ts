// Typed Hono RPC client (Architecture §Hono RPC / type boundary rule).
// `hc<AppType>` is the ONLY API client; no parallel fetch wrappers for the
// same endpoints. The AppType import is type-only — server runtime code never
// enters the browser bundle (answer secrecy + bundle proofs depend on it).
import { hc } from 'hono/client';
import type { AppType } from '$server/routes';
import type { ErrorEnvelope } from '$server/lib/errors';

/** Application API error — the NG21 envelope surfaced to the UI. */
export class ApiError extends Error {
	readonly code: string;
	readonly requestId?: string;
	readonly status?: number;

	constructor(code: string, message: string, requestId?: string, status?: number) {
		super(message);
		this.name = 'ApiError';
		this.code = code;
		this.requestId = requestId;
		this.status = status;
	}
}

/** Read the NG21 envelope from a non-ok response (throws a generic ApiError otherwise). */
export async function apiErrorFromResponse(res: Response): Promise<ApiError> {
	try {
		const body = (await res.json()) as { error?: ErrorEnvelope['error'] };
		if (body?.error) {
			return new ApiError(body.error.code, body.error.message, body.error.requestId, res.status);
		}
	} catch {
		// Non-JSON failure (proxy/network): fall through to the generic error.
	}
	return new ApiError('HTTP_ERROR', `Request failed with status ${res.status}`, undefined, res.status);
}

/**
 * The shared typed client. Injectable fetch keeps the documented seam
 * (Architecture §404) for tests/SSR call sites; the browser default sends
 * same-origin cookies with every request.
 */
export function createApiClient(fetchImpl?: typeof fetch) {
	return hc<AppType>('', {
		...((fetchImpl && { fetch: fetchImpl }) ?? {}),
		init: { credentials: 'include' }
	});
}

export const api = createApiClient();