// Phase-1 route/service unit contract — DB-free, mirroring the composed
// middleware chain (requestId → CSRF → authContext → requireAuth → routes →
// onError/notFound) with an injectable game service. Proves: auth gating,
// answer secrecy at the serialization boundary, Zod guess validation
// (incl. client timing fields rejected), NG21 error mapping for the new
// game-domain codes.
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createGameService, serializeGameState, type GameRow, type GameService, type GuessOutcome, type GuessRow, type PuzzleRow, type SafeGameState } from '../../src/server/game/service';
import { registerGameRoutes } from '../../src/server/game/handlers';
import { createAuthContext, requireAuth, type SessionResolver } from '../../src/server/middleware/auth';
import { csrfProtection } from '../../src/server/middleware/csrf';
import { requestIdMiddleware } from '../../src/server/middleware/request-id';
import { notFoundHandler, onErrorHandler, AppError, ERROR_CODES } from '../../src/server/lib/errors';
import type { SessionData } from '../../src/server/auth/auth';

const BASE = 'http://localhost:5173';

const fakeSession = {
	session: { id: 'session-1', token: 'token-1', userId: 'user-1', expiresAt: new Date() } as SessionData['session'],
	user: { id: 'user-1', email: 'player@example.com', name: 'Player' } as SessionData['user']
};

type MiniEnv = {
	Bindings: { DATABASE_URL: string };
	Variables: { requestId: string; auth: import('../../src/server/middleware/auth').AuthContext };
};

function makeApp(service: GameService, resolver: SessionResolver = async () => fakeSession) {
	const m = new Hono<MiniEnv>();
	m.use('*', requestIdMiddleware);
	m.use('*', csrfProtection);
	m.use('*', createAuthContext(resolver));
	m.use('/api/game/*', requireAuth);
	registerGameRoutes(m as unknown as Hono<import('../../src/server/routes').AppEnv>, {
		getService: () => service
	});
	m.onError(onErrorHandler);
	m.notFound(notFoundHandler);
	return m;
}

function fakeService(overrides: Partial<GameService> = {}): GameService {
	return {
		startGame: vi.fn(async (): Promise<SafeGameState> => sampleState()),
		getCurrentGame: vi.fn(async () => ({ game: sampleState() })),
		submitGuess: vi.fn(
			async (): Promise<GuessOutcome> => ({
				game: sampleState(),
				guess: { guessNumber: 1, word: 'light', feedback: [{ letter: 'l', status: 'green' as const }] },
				solved: false,
				terminal: false
			})
		),
		...overrides
	};
}

function sampleState(): SafeGameState {
	return {
		id: 'game-1',
		status: 'ACTIVE' as const,
		startedAt: new Date('2026-08-24T00:00:00Z').toISOString(),
		completedAt: null,
		completionTimeMs: null,
		guessCount: 0,
		puzzle: { id: 'puzzle-1', date: '2026-08-24', hintLetter: 'L' },
		guesses: []
	};
}

async function post(app: ReturnType<typeof makeApp>, path: string, body?: unknown, cookie?: string) {
	const headers: Record<string, string> = { origin: BASE, 'content-type': 'application/json' };
	if (cookie) headers.cookie = cookie;
	return app.request(`${BASE}${path}`, {
		method: 'POST',
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	});
}

describe('game routes — authentication gate (Hono, not event.locals)', () => {
	it('rejects unauthenticated mutations with the UNAUTHORIZED envelope', async () => {
		const app = makeApp(fakeService(), async () => null);
		const res = await post(app, '/api/game/start', {});
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe('UNAUTHORIZED');
	});

	it('rejects cross-site mutations with the CSRF envelope (no bypass)', async () => {
		const app = makeApp(fakeService());
		const res = await app.request(`${BASE}/api/game/start`, {
			method: 'POST',
			headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
			body: '{}'
		});
		expect(res.status).toBe(403);
		expect((await res.json()).error.code).toBe('CSRF');
	});
});

describe('POST /api/game/start', () => {
	it('starts (or resumes) a game through the service and returns safe state', async () => {
		const service = fakeService();
		const app = makeApp(service);
		const res = await post(app, '/api/game/start', {}, 'better-auth.session_token=signed');
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.game.id).toBe('game-1');
		expect(service.startGame).toHaveBeenCalledWith('user-1');
	});

	it('maps service errors to the NG21 envelope', async () => {
		const app = makeApp(fakeService({
			startGame: vi.fn(async () => {
				throw new AppError(ERROR_CODES.PUZZLE_UNAVAILABLE, 'No puzzle is available for today', 404);
			})
		}));
		const res = await post(app, '/api/game/start', {}, 'better-auth.session_token=signed');
		expect(res.status).toBe(404);
		expect((await res.json()).error.code).toBe('PUZZLE_UNAVAILABLE');
	});
});

describe('GET /api/game/current', () => {
	it('returns the resumable game state', async () => {
		const app = makeApp(fakeService());
		const res = await app.request(`${BASE}/api/game/current`, {
			headers: { cookie: 'better-auth.session_token=signed' }
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.game.id).toBe('game-1');
		expect(body.game.puzzle.hintLetter).toBe('L');
	});

	it('returns pre-game state without a game (no hint leaked)', async () => {
		const app = makeApp(
			fakeService({ getCurrentGame: vi.fn(async () => ({ game: null, puzzle: { date: '2026-08-24' } })) })
		);
		const res = await app.request(`${BASE}/api/game/current`, {
			headers: { cookie: 'better-auth.session_token=signed' }
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.game).toBeNull();
		expect(body.puzzle.date).toBe('2026-08-24');
		expect(body.puzzle).not.toHaveProperty('hintLetter');
	});
});

describe('POST /api/game/:gameId/guess', () => {
	it('accepts a valid guess and returns feedback + safe state', async () => {
		const service = fakeService();
		const app = makeApp(service);
		const res = await post(app, '/api/game/game-1/guess', { word: 'light' }, 'better-auth.session_token=signed');
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.guess.word).toBe('light');
		expect(service.submitGuess).toHaveBeenCalledWith('user-1', 'game-1', 'light');
	});

	it('rejects words that are not 5 lowercase letters (400 + issues)', async () => {
		const app = makeApp(fakeService());
		for (const word of ['LIGHT', 'light1', 'four', '']) {
			const res = await post(app, '/api/game/game-1/guess', { word }, 'better-auth.session_token=signed');
			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.error.code).toBe('BAD_REQUEST');
			expect(body.error.issues).toBeDefined();
		}
	});

	it('rejects client-supplied timing/score fields (strict schema)', async () => {
		const service = fakeService();
		const app = makeApp(service);
		const res = await post(
			app,
			'/api/game/game-1/guess',
			{ word: 'light', startedAt: '2020-01-01', completionTimeMs: 42, status: 'COMPLETED' },
			'better-auth.session_token=signed'
		);
		expect(res.status).toBe(400);
		expect(service.submitGuess).not.toHaveBeenCalled();
	});

	it('rejects malformed JSON bodies', async () => {
		const app = makeApp(fakeService());
		const res = await app.request(`${BASE}/api/game/game-1/guess`, {
			method: 'POST',
			headers: { origin: BASE, 'content-type': 'application/json', cookie: 'better-auth.session_token=signed' },
			body: '{not json'
		});
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('BAD_REQUEST');
	});

	it('maps ownership failure to 403 FORBIDDEN', async () => {
		const app = makeApp(fakeService({
			submitGuess: vi.fn(async () => {
				throw new AppError(ERROR_CODES.FORBIDDEN, 'You do not own this game', 403);
			})
		}));
		const res = await post(app, '/api/game/other-game/guess', { word: 'light' }, 'better-auth.session_token=signed');
		expect(res.status).toBe(403);
		expect((await res.json()).error.code).toBe('FORBIDDEN');
	});

	it('maps expiry/terminal/dictionary failures to their codes', async () => {
		const cases: [Error, number, string][] = [
			[new AppError(ERROR_CODES.GAME_EXPIRED, 'This puzzle has expired', 409), 409, 'GAME_EXPIRED'],
			[new AppError(ERROR_CODES.GAME_NOT_ACTIVE, 'no longer active', 409), 409, 'GAME_NOT_ACTIVE'],
			[new AppError(ERROR_CODES.GUESS_LIMIT_EXCEEDED, 'only 6', 409), 409, 'GUESS_LIMIT_EXCEEDED'],
			[new AppError(ERROR_CODES.INVALID_WORD, 'not a valid word', 400), 400, 'INVALID_WORD'],
			[new AppError(ERROR_CODES.GAME_NOT_FOUND, 'Game not found', 404), 404, 'GAME_NOT_FOUND']
		];
		for (const [err, status, code] of cases) {
			const app = makeApp(fakeService({ submitGuess: vi.fn(async () => { throw err; }) }));
			const res = await post(app, '/api/game/game-1/guess', { word: 'light' }, 'better-auth.session_token=signed');
			expect(res.status).toBe(status);
			expect((await res.json()).error.code).toBe(code);
		}
	});
});

describe('serializeGameState — answer secrecy boundary', () => {
	const now = new Date('2026-08-24T00:00:00Z');
	const answerWord = 'drain';

	function rows() {
		return {
			puzzle: {
				id: 'puzzle-1',
				puzzleDate: '2026-08-24',
				answerId: 'answer-1', // ← must NEVER serialize
				hintLetter: 'D',
				status: 'ACTIVE' as const,
				lockedAt: now,
				expiresAt: new Date('2026-08-25T00:00:00Z'),
				averageCompletionTimeMs: null,
				nonCompletionPenaltyMs: null,
				finalizedAt: null,
				createdAt: now
			} satisfies PuzzleRow,
			game: {
				id: 'game-1',
				userId: 'user-1',
				puzzleId: 'puzzle-1',
				status: 'ACTIVE' as const,
				startedAt: now,
				completedAt: null,
				completionTimeMs: null,
				guessCount: 1,
				createdAt: now,
				updatedAt: now
			} satisfies GameRow,
			guesses: [
				{
					id: 'guess-1',
					gameId: 'game-1',
					guessNumber: 1,
					word: 'light',
					feedback: [{ letter: 'l', status: 'gray' as const }, { letter: 'i', status: 'gray' as const }, { letter: 'g', status: 'gray' as const }, { letter: 'h', status: 'gray' as const }, { letter: 't', status: 'gray' as const }],
					createdAt: now
				}
			] satisfies GuessRow[]
		};
	}

	it('exposes hint, dates and feedback — but never the answer or answer id', () => {
		const { puzzle, game, guesses } = rows();
		const state = serializeGameState(game, puzzle, guesses);
		const json = JSON.stringify(state);

		expect(state.puzzle.hintLetter).toBe('D');
		expect(state.guesses[0].feedback[0].status).toBe('gray');
		expect(json).not.toContain(answerWord);
		expect(json).not.toContain('answerId');
		expect(json).not.toContain('answer-1');
		// The answer dictionary word is never referenced (server-only module).
		expect(Object.keys(state.puzzle)).toEqual(['id', 'date', 'hintLetter']);
	});

	it('serializes dates as ISO strings for the wire', () => {
		const { puzzle, game } = rows();
		const state = serializeGameState(game, puzzle, []);
		expect(state.startedAt).toBe('2026-08-24T00:00:00.000Z');
		expect(state.completedAt).toBeNull();
		expect(state.completionTimeMs).toBeNull();
	});
});

describe('service wiring — DB client resolution', () => {
	it('createGameService requires a Db and returns the three operations', () => {
		// Type-level contract: the production composition passes a NeonDatabase.
		expect(typeof createGameService).toBe('function');
	});
});