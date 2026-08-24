// Phase-1 service-level integration coverage on the REAL Neon WebSocket
// path (drizzle db.transaction → SELECT ... FOR UPDATE):
//   - start idempotency + concurrent starts (one attempt per user/puzzle)
//   - resume (getCurrentGame / started_at immutability)
//   - ownership denial (403 FORBIDDEN)
//   - expired-game rejection (expiry contract)
//   - guesses 1–6, seventh-guess rejection, completed/failed immutability
//   - server-side timing (completed_at + completion_time_ms set exactly once)
//   - answer secrecy of serialized state
//   - dictionary validation
//   - finalize idempotency
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/server/db/schema';
import { ERROR_CODES } from '../../src/server/lib/errors';
import { createGameService, type SafeGameState } from '../../src/server/game/service';
import { createPuzzleService } from '../../src/server/puzzle/finalize';
import { closeDb, createIntegrationDb, type Db } from './helpers';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('game service (real Neon, interactive transactions)', () => {
	let db: Db;
	let otherDb: Db;
	let gameService: ReturnType<typeof createGameService>;
	let puzzleService: ReturnType<typeof createPuzzleService>;

	beforeAll(async () => {
		db = await createIntegrationDb();
		otherDb = await createIntegrationDb(); // second pool: cross-connection concurrency
		gameService = createGameService(db);
		puzzleService = createPuzzleService(db);
	});

	beforeEach(async () => {
		await db.execute(
			sql`TRUNCATE TABLE guesses, games, daily_puzzles, answer_dictionary, "user" RESTART IDENTITY CASCADE`
		);
	});

	afterAll(async () => {
		await closeDb(db);
		await closeDb(otherDb);
	});

	async function todayManilaDate(): Promise<string> {
		const [{ d }] = (
			await db.execute(sql`SELECT ((now() AT TIME ZONE 'Asia/Manila')::date)::text AS d`)
		).rows as { d: string }[];
		return d;
	}

	async function insertUser(id: string, name = 'P1') {
		const [user] = await db
			.insert(schema.user)
			.values({ id, name, email: `${id}@test.dev`, emailVerified: true })
			.returning();
		return user;
	}

	/** ACTIVE puzzle (default: today, far-future expiry). */
	async function insertActivePuzzle(puzzleDate: string, word: string, expiresAt = new Date('2099-12-31T00:00:00Z')) {
		const [answer] = await db
			.insert(schema.answerDictionary)
			.values({ word, normalizedWord: word })
			.returning();
		const [puzzle] = await db
			.insert(schema.dailyPuzzles)
			.values({
				puzzleDate,
				answerId: answer.id,
				hintLetter: word[0].toUpperCase(),
				status: 'ACTIVE',
				expiresAt
			})
			.returning();
		return puzzle;
	}

	// All fixture guesses are from the public valid-guess list (the server
	// dictionary rejects everything else).
	const WRONG = ['about', 'after', 'again', 'below', 'candy', 'stone'];

	describe('start / resume', () => {
		it('start is idempotent: same game id and started_at across calls', async () => {
			const today = await todayManilaDate();
			await insertActivePuzzle(today, 'light');
			const user = await insertUser('u-idem');

			const first = await gameService.startGame(user.id);
			const second = await gameService.startGame(user.id);

			expect(second.id).toBe(first.id);
			expect(second.startedAt).toBe(first.startedAt);
			expect(second.guessCount).toBe(0);
		});

		it('concurrent starts converge to ONE game (UNIQUE(user_id, puzzle_id) final guard)', async () => {
			const today = await todayManilaDate();
			await insertActivePuzzle(today, 'river');
			const user = await insertUser('u-concurrent');

			// Two different pools/connections, same user, same instant.
			const [a, b] = await Promise.all([
				gameService.startGame(user.id),
				createGameService(otherDb).startGame(user.id)
			]);

			expect(a.id).toBe(b.id);
			expect(a.startedAt).toBe(b.startedAt);
			const [{ n }] = (
				await db.execute(sql`SELECT count(*)::int AS n FROM games WHERE user_id = ${user.id}`)
			).rows as { n: number }[];
			expect(n).toBe(1);
		});

		it('resume: getCurrentGame reconstructs the same state (started_at never moves)', async () => {
			const today = await todayManilaDate();
			await insertActivePuzzle(today, 'quick');
			const user = await insertUser('u-resume');

			await gameService.startGame(user.id);
			const resume1 = await gameService.getCurrentGame(user.id);
			const resume2 = await gameService.getCurrentGame(user.id);

			expect(resume1.game!.id).toBeDefined();
			expect(resume2.game!.id).toBe(resume1.game!.id);
			expect(resume2.game!.startedAt).toBe(resume1.game!.startedAt);
		});

		it('pre-game current returns puzzle metadata without a hint (N14)', async () => {
			const today = await todayManilaDate();
			await insertActivePuzzle(today, 'grain');
			const user = await insertUser('u-pregame');

			const result = await gameService.getCurrentGame(user.id);
			if (result.game) throw new Error('expected pre-game state');
			expect(result.puzzle?.date).toBe(today);
			if (result.puzzle) expect(result.puzzle).not.toHaveProperty('hintLetter');
		});
	});

	describe('guess lifecycle', () => {
		it('guesses 1–6 work, the seventh is rejected, completion timing is set exactly once', async () => {
			const today = await todayManilaDate();
			await insertActivePuzzle(today, 'light');
			const user = await insertUser('u-six');
			const game = await gameService.startGame(user.id);

			let state: SafeGameState = game;
			for (let i = 0; i < 5; i++) {
				const outcome = await gameService.submitGuess(user.id, game.id, WRONG[i]);
				expect(outcome.guess.guessNumber).toBe(i + 1);
				expect(outcome.game.guessCount).toBe(i + 1);
				expect(outcome.game.status).toBe('ACTIVE');
				expect(outcome.game.completedAt).toBeNull();
				state = outcome.game;
			}
			// Sixth guess solves.
			const solved = await gameService.submitGuess(user.id, game.id, 'light');
			expect(solved.solved).toBe(true);
			expect(solved.game.status).toBe('COMPLETED');
			expect(solved.game.guessCount).toBe(6);
			expect(solved.game.completedAt).not.toBeNull();
			expect(typeof solved.game.completionTimeMs).toBe('number');
			expect(solved.game.completionTimeMs!).toBeGreaterThan(0);
			expect(solved.game.guesses).toHaveLength(6);
			expect(solved.game.guesses[5].feedback.every((t) => t.status === 'green')).toBe(true);

			// Seventh guess (and any post-completion mutation) is rejected and
			// the frozen completion values are NOT rewritten.
			await expect(gameService.submitGuess(user.id, game.id, 'light')).rejects.toMatchObject({
				code: ERROR_CODES.GAME_NOT_ACTIVE,
				status: 409
			});
			const afterReject = await gameService.getCurrentGame(user.id);
			expect(afterReject.game!.completedAt).toBe(solved.game.completedAt);
			expect(afterReject.game!.completionTimeMs).toBe(solved.game.completionTimeMs);
			expect(afterReject.game!.guessCount).toBe(6);
			expect(state.guesses.length).toBeLessThanOrEqual(5);
		});

		it('six wrong guesses → FAILED; further guesses rejected', async () => {
			const today = await todayManilaDate();
			await insertActivePuzzle(today, 'river');
			const user = await insertUser('u-failed');
			const game = await gameService.startGame(user.id);

			for (const word of WRONG) {
				const outcome = await gameService.submitGuess(user.id, game.id, word);
				expect(outcome.solved).toBe(false);
			}
			const finalOutcome = await gameService.getCurrentGame(user.id);
			expect(finalOutcome.game!.status).toBe('FAILED'); // 6th guess → FAILED
			expect(finalOutcome.game!.completionTimeMs).toBeNull(); // FAILED has no completion time
			expect(finalOutcome.game!.completedAt).toBeNull();
			await expect(gameService.submitGuess(user.id, game.id, 'light')).rejects.toMatchObject({
				code: ERROR_CODES.GAME_NOT_ACTIVE,
				status: 409
			});
		});

		it('rejects words outside the authoritative dictionary', async () => {
			const today = await todayManilaDate();
			await insertActivePuzzle(today, 'mount');
			const user = await insertUser('u-dict');
			const game = await gameService.startGame(user.id);

			await expect(gameService.submitGuess(user.id, game.id, 'zzzzz')).rejects.toMatchObject({
				code: ERROR_CODES.INVALID_WORD,
				status: 400
			});
			await expect(gameService.submitGuess(user.id, game.id, 'LIGHT')).rejects.toMatchObject({
				code: ERROR_CODES.INVALID_WORD,
				status: 400
			});
			// Nothing was recorded.
			const [{ n }] = (
				await db.execute(sql`SELECT count(*)::int AS n FROM guesses WHERE game_id = ${game.id}`)
			).rows as { n: number }[];
			expect(n).toBe(0);
		});

		it('serialized state never contains the answer (service-level secrecy)', async () => {
			const today = await todayManilaDate();
			await insertActivePuzzle(today, 'ocean');
			const user = await insertUser('u-secret');
			const game = await gameService.startGame(user.id);
			await gameService.submitGuess(user.id, game.id, 'light');

			const resumed = await gameService.getCurrentGame(user.id);
			const json = JSON.stringify(resumed);
			expect(json).not.toContain('ocean');
			expect(json).not.toContain('answerId');
		});
	});

	describe('ownership and expiry', () => {
		it('a user can never mutate another user\'s game (403 FORBIDDEN, nothing written)', async () => {
			const today = await todayManilaDate();
			await insertActivePuzzle(today, 'about');
			const owner = await insertUser('u-owner');
			const attacker = await insertUser('u-attacker');
			const game = await gameService.startGame(owner.id);

			await expect(gameService.submitGuess(attacker.id, game.id, 'about')).rejects.toMatchObject({
				code: ERROR_CODES.FORBIDDEN,
				status: 403
			});
			const [{ n }] = (
				await db.execute(sql`SELECT count(*)::int AS n FROM guesses WHERE game_id = ${game.id}`)
			).rows as { n: number }[];
			expect(n).toBe(0);
			// The attacker cannot even read the owner's game through current.
			const attackerView = await gameService.getCurrentGame(attacker.id);
			expect(attackerView.game).toBeNull();

			// Unknown game ids are 404 (no existence oracle).
			await expect(
				gameService.submitGuess(attacker.id, '00000000-0000-0000-0000-000000000000', 'about')
			).rejects.toMatchObject({ code: ERROR_CODES.GAME_NOT_FOUND, status: 404 });
		});

		it('expired puzzles reject mutants even when the game row is still ACTIVE', async () => {
			const expiresAt = new Date('2020-01-01T00:00:00Z'); // long expired
			const puzzle = await insertActivePuzzle('2099-06-06', 'early', expiresAt);
			const user = await insertUser('u-expired');
			// Seed the game row directly (startGame would refuse on an expired puzzle).
			const [game] = await db
				.insert(schema.games)
				.values({ userId: user.id, puzzleId: puzzle.id })
				.returning();

			await expect(gameService.submitGuess(user.id, game.id, 'early')).rejects.toMatchObject({
				code: ERROR_CODES.GAME_EXPIRED,
				status: 409
			});
			const [{ n }] = (
				await db.execute(sql`SELECT count(*)::int AS n FROM guesses WHERE game_id = ${game.id}`)
			).rows as { n: number }[];
			expect(n).toBe(0);
		});
	});

	describe('finalization', () => {
		it('finalize converts only ACTIVE games, freezes averages, and is idempotent', async () => {
			const today = await todayManilaDate();
			const puzzle = await insertActivePuzzle(today, 'flame');
			const winner = await insertUser('u-final-win');
			const loser = await insertUser('u-final-loss');
			const idle = await insertUser('u-final-idle');

			// Winner completes on the 6th guess; loser is mid-game; idle never starts.
			const winGame = await gameService.startGame(winner.id);
			for (const word of WRONG.slice(0, 5)) await gameService.submitGuess(winner.id, winGame.id, word);
			const solved = await gameService.submitGuess(winner.id, winGame.id, 'flame');
			await gameService.startGame(loser.id); // stays ACTIVE

			const first = await puzzleService.finalizePuzzle(puzzle.id);
			expect(first.alreadyFinalized).toBe(false);
			expect(first.completedCount).toBe(1);
			expect(first.forfeitedCount).toBe(1); // only the loser's ACTIVE game
			expect(first.averageCompletionTimeMs).toBe(solved.game.completionTimeMs);
			expect(first.nonCompletionPenaltyMs).toBe(first.averageCompletionTimeMs! + 20 * 60 * 1000);

			// Idempotent re-entry: frozen values, no further changes.
			const again = await puzzleService.finalizePuzzle(puzzle.id);
			expect(again.alreadyFinalized).toBe(true);
			expect(again.averageCompletionTimeMs).toBe(first.averageCompletionTimeMs);
			expect(again.forfeitedCount).toBe(first.forfeitedCount);

			// Loser's game became FORFEITED; idle user has no row (MISSED derived).
			const loserRow = await db.query.games.findFirst({
				where: (g, { and, eq }) => and(eq(g.userId, loser.id), eq(g.puzzleId, puzzle.id))
			});
			expect(loserRow?.status).toBe('FORFEITED');
			const [{ n }] = (
				await db.execute(sql`SELECT count(*)::int AS n FROM games WHERE user_id = ${idle.id}`)
			).rows as { n: number }[];
			expect(n).toBe(0);
		});
	});
});