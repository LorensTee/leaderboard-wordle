// Typed game API surface for the client (Hono RPC — the wire types flow
// straight from the server's AppType through `res.json()`; nothing here is
// hand-declared). TanStack Query calls these functions; the UI never builds
// raw fetches. The answer never appears in any of these payloads.
import { api, apiErrorFromResponse, ApiError } from './client';

/**
 * CI-15 — upper bound for one guess request. Real-Neon CI latency can exceed
 * several seconds per round trip (the 5th guess of the failing E7 run took
 * 3.5s of server `wait` alone), and a response that never arrives must not
 * pin the input forever. When the timeout fires, submitGuess rejects with an
 * ApiError (REQUEST_TIMEOUT) so the mutation's onError clears isPending and
 * the keyboard re-enables with the typed letters intact.
 */
export const GUESS_REQUEST_TIMEOUT_MS = 15_000;

export const gameApi = {
	/** POST /api/game/start — idempotent start/resume of today's game. */
	async startGame() {
		const res = await api.api.game.start.$post();
		if (!res.ok) throw await apiErrorFromResponse(res);
		return res.json();
	},

	/** GET /api/game/current — reconstruct the UI after reload (never the answer). */
	async getCurrentGame() {
		const res = await api.api.game.current.$get();
		if (!res.ok) throw await apiErrorFromResponse(res);
		return res.json();
	},

	/** POST /api/game/:gameId/guess — one server-authoritative guess. */
	async submitGuess(gameId: string, word: string) {
		// CI-15: a guess response that never arrives used to pin
		// guessMutation.isPending forever, disabling the keyboard (editing
		// guard) so no retry was possible (E7 CI-10/CI-12/CI-15 — the trace
		// showed a POST with status -1 under real-Neon latency). Bound the
		// request; on abort surface an ApiError so onError clears isPending
		// and the typed row can be resubmitted. Per-request `init` is
		// deep-merged with the client's `credentials: 'include'` (hono client).
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), GUESS_REQUEST_TIMEOUT_MS);
		try {
			const res = await api.api.game[':gameId'].guess.$post(
				{ param: { gameId }, json: { word } },
				{ init: { signal: controller.signal } }
			);
			if (!res.ok) throw await apiErrorFromResponse(res);
			return res.json();
		} catch (err) {
			if (err instanceof ApiError) throw err;
			if (controller.signal.aborted) {
				throw new ApiError(
					'REQUEST_TIMEOUT',
					'The server did not respond in time — please try again.',
					undefined,
					504
				);
			}
			throw err;
		} finally {
			clearTimeout(timer);
		}
	}
};