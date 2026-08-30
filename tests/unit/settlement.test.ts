// Phase-3 settlement orchestration contract (U4, plan §11.1) — DB-free.
// Proves: finalize → activate order, the missing-puzzle alert marker format,
// error isolation in the per-row finalization loop (one failing finalize
// does not stop the sweep), idempotent re-entry, and report aggregation.
import { describe, expect, it, vi } from 'vitest';
import {
	finalizePuzzleRows,
	missingPuzzleMarker,
	runSettlement,
	type ActivationResult,
	type SettlementDeps,
	type SettlementPuzzleResult
} from '../../src/server/puzzle/settlement';

function puzzleResult(overrides: Partial<SettlementPuzzleResult> = {}): SettlementPuzzleResult {
	return {
		puzzleId: 'puzzle-1',
		puzzleDate: '2026-08-26',
		forfeitedCount: 2,
		completedCount: 1,
		alreadyFinalized: false,
		...overrides
	};
}

const ACTIVATION: ActivationResult = { activatedToday: true, alreadyActive: false, missingToday: false };

describe('settlement orchestration (U4, DB-free)', () => {
	it('runSettlement runs finalizeExpired BEFORE activateToday and aggregates the report', async () => {
		const order: string[] = [];
		const finalizeExpired = vi.fn(async (): Promise<SettlementPuzzleResult[]> => {
			order.push('finalize');
			return [puzzleResult(), puzzleResult({ puzzleId: 'puzzle-2', alreadyFinalized: true })];
		});
		const activateToday = vi.fn(async (): Promise<ActivationResult> => {
			order.push('activate');
			return ACTIVATION;
		});

		const report = await runSettlement({} as never, {
			finalizeExpired: finalizeExpired as unknown as SettlementDeps['finalizeExpired'],
			activateToday: activateToday as unknown as SettlementDeps['activateToday']
		});

		expect(order).toEqual(['finalize', 'activate']);
		expect(finalizeExpired).toHaveBeenCalledTimes(1);
		expect(activateToday).toHaveBeenCalledTimes(1);
		expect(report).toEqual({
			finalized: [
				puzzleResult(),
				puzzleResult({ puzzleId: 'puzzle-2', alreadyFinalized: true })
			],
			forfeitedCount: 4,
			completedCount: 2,
			activatedToday: true,
			alreadyActive: false,
			missingToday: false
		});
	});

	it('missing-puzzle alert marker is exact and correlatable (D15)', () => {
		expect(missingPuzzleMarker('2026-08-27')).toBe('[settlement] missing puzzle for date=2026-08-27');
	});

	it('runSettlement passes the report through when activation reports missingToday', async () => {
		const report = await runSettlement({} as never, {
			finalizeExpired: async () => [],
			activateToday: async () => ({ activatedToday: false, alreadyActive: false, missingToday: true })
		});
		expect(report.missingToday).toBe(true);
		expect(report.activatedToday).toBe(false);
		expect(report.finalized).toEqual([]);
	});

	it('error isolation: one failing finalize does not stop the sweep (U4)', async () => {
		const log = vi.fn();
		const finalizePuzzle = vi.fn(async (id: string) => {
			if (id === 'puzzle-bad') throw new Error('boom');
			return {
				puzzleId: id,
				status: 'FINALIZED' as const,
				forfeitedCount: 1,
				completedCount: 0,
				averageCompletionTimeMs: 5000,
				nonCompletionPenaltyMs: 65000,
				finalizedAt: new Date(),
				alreadyFinalized: false
			};
		});

		const result = await finalizePuzzleRows(
			[
				{ id: 'puzzle-a', puzzleDate: '2026-08-24' },
				{ id: 'puzzle-bad', puzzleDate: '2026-08-25' },
				{ id: 'puzzle-c', puzzleDate: '2026-08-26' }
			],
			{ finalizePuzzle, log }
		);

		expect(result.map((r) => r.puzzleId)).toEqual(['puzzle-a', 'puzzle-c']);
		expect(log).toHaveBeenCalledTimes(1);
		expect(String(log.mock.calls[0][0])).toContain('[settlement] finalize failed');
		expect(String(log.mock.calls[0][0])).toContain('puzzle_id=puzzle-bad');
		expect(String(log.mock.calls[0][0])).toContain('date=2026-08-25');
	});

	it('idempotent re-entry: runSettlement twice is safe and identical (D10)', async () => {
		const deps: SettlementDeps = {
			finalizeExpired: async () => [puzzleResult({ alreadyFinalized: true })],
			activateToday: async () => ({ activatedToday: false, alreadyActive: true, missingToday: false })
		};
		const first = await runSettlement({} as never, deps);
		const second = await runSettlement({} as never, deps);
		expect(second).toEqual(first);
		expect(second.finalized[0].alreadyFinalized).toBe(true);
	});

	it('scheduled (platform shell): a settlement failure is structured-logged AND rethrown so the invocation is marked FAILED (audit resolution)', async () => {
		const { scheduled } = await import('../../src/server/puzzle/scheduled-entry');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const controller = {
				cron: '0 16 * * *',
				scheduledTime: 0,
				noRetry: () => undefined
			};
			// Env without DATABASE_URL → runSettlement's getDb fails closed
			// (INTERNAL: DATABASE_URL is not configured) — DB-free.
			await expect(scheduled(controller, {} as never, {} as never)).rejects.toThrow(
				'DATABASE_URL is not configured'
			);
			expect(errorSpy).toHaveBeenCalled();
			expect(String(errorSpy.mock.calls[0][0])).toContain('[settlement] run failed');
			expect(JSON.stringify(errorSpy.mock.calls[0][1])).toContain('cron');
		} finally {
			errorSpy.mockRestore();
		}
	});
});