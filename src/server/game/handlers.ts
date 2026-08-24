// Phase-1 game API handlers — thin Hono layer over the game service.
// Registered ONLY from src/server/routes.ts (single composition point).
// Authentication/authorization come from the composed middleware chain
// (authContext + requireAuth on /api/game/*); ownership is re-checked in the
// service under the puzzle lock. The answer never enters this layer.
import type { Context, Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AppError, ERROR_CODES } from '../lib/errors';
import type { AppEnv } from '../routes';
import type { GameService } from './service';

/** Strict: only `word` is accepted — client timing/score fields are rejected. */
export const guessBodySchema = z
	.object({
		word: z.string().regex(/^[a-z]{5}$/, 'word must be exactly 5 lowercase letters')
	})
	.strict();

export type GuessBody = z.infer<typeof guessBodySchema>;

/** Validates the JSON body; failures map to the NG21 BAD_REQUEST envelope. */
export const guessBodyValidator = zValidator('json', guessBodySchema, (result) => {
	if (!result.success) {
		throw new AppError(
			ERROR_CODES.BAD_REQUEST,
			'Invalid guess',
			400,
			result.error.issues.map((issue) => ({
				path: issue.path.join('.'),
				message: issue.message
			}))
		);
	}
});

export type GameRouteDeps = {
	/** Service factory — test seam (fake service in unit tests). */
	getService: (c: Context<AppEnv>) => GameService;
};

function authenticatedUser(c: Context<AppEnv>, action: string): { id: string } {
	const auth = c.get('auth');
	if (!auth) {
		// requireAuth already guards /api/game/* — this is defense in depth so a
		// route accidentally moved outside the guard still fails closed.
		throw new AppError(ERROR_CODES.UNAUTHORIZED, `Authentication required to ${action}`, 401);
	}
	return auth.user;
}

/**
 * Register the Phase-1 game routes and RETURN the app (Hono accumulates its
 * route Schema in the chained return type — AppType/RPC depends on it; do
 * NOT annotate the return type or cast, that erases the accumulated schema).
 */
export function registerGameRoutes<T extends Hono<AppEnv>>(app: T, deps: GameRouteDeps) {
	return app
		.post('/api/game/start', async (c) => {
			const user = authenticatedUser(c, 'start a game');
			const game = await deps.getService(c).startGame(user.id);
			return c.json({ game }, 200);
		})
		.get('/api/game/current', async (c) => {
			const user = authenticatedUser(c, 'read the current game');
			const result = await deps.getService(c).getCurrentGame(user.id);
			// { game } | { game: null, puzzle: { date } | null } — answer-free by construction.
			return c.json(result, 200);
		})
		.post('/api/game/:gameId/guess', guessBodyValidator, async (c) => {
			const user = authenticatedUser(c, 'submit a guess');
			const gameId = c.req.param('gameId');
			const { word } = c.req.valid('json');
			const outcome = await deps.getService(c).submitGuess(user.id, gameId, word);
			return c.json(outcome, 200);
		});
}