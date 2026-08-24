// Typed game API surface for the client (Hono RPC — the wire types flow
// straight from the server's AppType through `res.json()`; nothing here is
// hand-declared). TanStack Query calls these functions; the UI never builds
// raw fetches. The answer never appears in any of these payloads.
import { api, apiErrorFromResponse } from './client';

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
		const res = await api.api.game[':gameId'].guess.$post({
			param: { gameId },
			json: { word }
		});
		if (!res.ok) throw await apiErrorFromResponse(res);
		return res.json();
	}
};