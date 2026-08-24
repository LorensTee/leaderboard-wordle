// Daily finalization (Architecture §Settlement) — atomic, idempotent,
// independently retryable. Phase 1 implements the service so the NG9
// lock-order integration tests exercise the REAL application service; the
// cron trigger wiring lands in Phase 3.
//
// Lock discipline (NG9): the puzzle row is locked FIRST with FOR UPDATE and
// re-read after the lock — the same serialization point every game mutation
// uses, so a guess and a finalize can never deadlock and the loser observes
// the winner's committed state (READ COMMITTED).
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { dailyPuzzles, games } from '../db/schema';
import { AppError, ERROR_CODES } from '../lib/errors';
import { NON_COMPLETION_PENALTY_MS } from './manila';

export type FinalizeResult = {
	puzzleId: string;
	status: 'FINALIZED';
	/** ACTIVE games converted to FORFEITED by this (or a previous) finalize. */
	forfeitedCount: number;
	/** COMPLETED games used for the frozen averages. */
	completedCount: number;
	averageCompletionTimeMs: number | null;
	nonCompletionPenaltyMs: number | null;
	finalizedAt: Date | null;
	/** true when the puzzle was already FINALIZED (idempotent re-entry). */
	alreadyFinalized: boolean;
};

export type PuzzleService = {
	finalizePuzzle(puzzleId: string): Promise<FinalizeResult>;
};

export function createPuzzleService(db: Db): PuzzleService {
	return {
		async finalizePuzzle(puzzleId: string): Promise<FinalizeResult> {
			return db.transaction(async (tx) => {
				// 1. puzzle row lock — the serialization point for the day boundary.
				const [puzzle] = await tx
					.select()
					.from(dailyPuzzles)
					.where(eq(dailyPuzzles.id, puzzleId))
					.for('update');
				if (!puzzle) {
					throw new AppError(ERROR_CODES.NOT_FOUND, 'Puzzle not found', 404);
				}
				if (puzzle.status === 'FINALIZED') {
					// Idempotent re-entry: frozen record is the answer, no writes.
					const counts = await completedForfeitedCounts(tx, puzzleId);
					return {
						puzzleId: puzzle.id,
						status: 'FINALIZED',
						...counts,
						averageCompletionTimeMs: puzzle.averageCompletionTimeMs,
						nonCompletionPenaltyMs: puzzle.nonCompletionPenaltyMs,
						finalizedAt: puzzle.finalizedAt,
						alreadyFinalized: true
					};
				}
				if (puzzle.status !== 'ACTIVE') {
					// SCHEDULED puzzles are activated by cron/lazy start, never finalized.
					throw new AppError(
						ERROR_CODES.INVALID_STATE,
						`Only ACTIVE puzzles can be finalized (status: ${puzzle.status})`,
						409
					);
				}

				// 2. remaining ACTIVE games → FORFEITED (MISSED stays derived: no row).
				const forfeited = await tx
					.update(games)
					.set({ status: 'FORFEITED', updatedAt: sql`now()` })
					.where(and(eq(games.puzzleId, puzzle.id), eq(games.status, 'ACTIVE')))
					.returning({ id: games.id });

				// 3. frozen averages over COMPLETED games only (NG24).
				const completed = (await tx.execute(
					sql`SELECT count(*) FILTER (WHERE status = 'COMPLETED')::int AS "completedCount" FROM games WHERE puzzle_id = ${puzzle.id}`
				)) as unknown as { rows: [{ completedCount: number }] };
				const completedCount = completed.rows[0].completedCount;
				const avgResult = (await tx.execute(
					sql`SELECT round(avg(completion_time_ms))::int AS avg FROM games WHERE puzzle_id = ${puzzle.id} AND status = 'COMPLETED'`
				)) as unknown as { rows: [{ avg: number | null }] };
				const avg = avgResult.rows[0].avg;
				const averageCompletionTimeMs = completedCount > 0 ? avg : null;
				const nonCompletionPenaltyMs =
					completedCount > 0 && avg !== null ? avg + NON_COMPLETION_PENALTY_MS : null;

				// 4. FINALIZED + frozen values, atomic with the forfeit conversion.
				await tx
					.update(dailyPuzzles)
					.set({
						status: 'FINALIZED',
						finalizedAt: sql`transaction_timestamp()`,
						averageCompletionTimeMs,
						nonCompletionPenaltyMs
					})
					.where(eq(dailyPuzzles.id, puzzle.id));

				const [updated] = await tx
					.select()
					.from(dailyPuzzles)
					.where(eq(dailyPuzzles.id, puzzle.id))
					.limit(1);

				return {
					puzzleId: puzzle.id,
					status: 'FINALIZED',
					forfeitedCount: forfeited.length,
					completedCount,
					averageCompletionTimeMs: updated.averageCompletionTimeMs,
					nonCompletionPenaltyMs: updated.nonCompletionPenaltyMs,
					finalizedAt: updated.finalizedAt,
					alreadyFinalized: false
				};
			});
		}
	};
}

type CountsTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Completed/forfeited game counts for an already-finalized puzzle. */
async function completedForfeitedCounts(tx: CountsTx, puzzleId: string) {
	const result = (await tx.execute(
		sql`SELECT
			count(*) FILTER (WHERE status = 'COMPLETED')::int AS "completedCount",
			count(*) FILTER (WHERE status = 'FORFEITED')::int AS "forfeitedCount"
			FROM games WHERE puzzle_id = ${puzzleId}`
	)) as unknown as { rows: [{ completedCount: number; forfeitedCount: number }] };
	return result.rows[0];
}