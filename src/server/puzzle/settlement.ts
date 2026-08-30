// Phase-3 daily settlement domain (plan §6–§7, D8/D10/D15) — pure service,
// fully portable. Cloudflare cron plumbing lives ONLY in scheduled-entry.ts:
// this module never imports platform types.
//
// Semantics:
//  - finalizeExpired — reconciliation sweep: every expired ACTIVE puzzle is
//    finalized through the existing idempotent finalizePuzzle (puzzle-row
//    lock first, transaction_timestamp() anchor — NG9 preserved).
//    LOCKING MODEL (plan §6, audit-resolved): the sweep SELECT applies
//    `FOR UPDATE SKIP LOCKED` at SELECTION time — because it runs in
//    autocommit (db.execute), that row lock is released when the SELECT
//    ends, so SKIP LOCKED is a SOFT FILTER: rows locked by another
//    transaction at that instant are skipped for this run. It reduces
//    contention and overlap, but it is NOT a held lock: the authoritative
//    guard against double-processing is finalizePuzzle itself — every
//    selected row is re-locked puzzle-first inside its OWN transaction
//    (plan-mandated), and its already-FINALIZED re-entry is a no-op, so in
//    EVERY interleaving of concurrent sweeps at most ONE real finalization
//    happens and the losers observe the frozen record. Rows skipped because
//    another transaction held their lock are never lost: the next sweep run
//    (cron retry or a week/month read's lazy finalization) picks them up —
//    self-healing by design. Holding the sweep's SELECT locks across
//    finalization was evaluated and REJECTED: per-row own-transaction
//    finalizePuzzle (the plan's structure) with a pooled driver would run on
//    a different connection than the held lock and deadlock. One failing
//    finalize must not stop the sweep (error isolation — plan U4).
//  - activateToday — cron-side lazy activation: today's SCHEDULED puzzle →
//    ACTIVE under the puzzle lock with the same guards as startGame (today's
//    date, no other ACTIVE for today). A missing row FAILS CLOSED with a
//    structured console.error marker — no puzzle is ever fabricated (D15).
//  - runSettlement — orchestration: finalizeExpired → activateToday →
//    structured report. Every operation is independently retryable; the
//    whole handler may be re-run safely (D10).
import { and, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { dailyPuzzles } from '../db/schema';
import { AppError, ERROR_CODES } from '../lib/errors';
import { createPuzzleService, type FinalizeResult } from './finalize';
import { todayManilaDateExpr } from './manila';

/** Operational logger seam — defaults to console.error (alert markers). */
export type Logger = (message: string) => void;

const defaultLog: Logger = (message) => console.error(message);

export type SettlementPuzzleResult = {
	puzzleId: string;
	puzzleDate: string;
	/** Games converted ACTIVE → FORFEITED by this (or a previous) finalize. */
	forfeitedCount: number;
	/** COMPLETED games used for the frozen averages. */
	completedCount: number;
	/** True when the puzzle was already FINALIZED (idempotent re-entry). */
	alreadyFinalized: boolean;
};

export type ActivationResult = {
	/** True when today's SCHEDULED puzzle was flipped to ACTIVE. */
	activatedToday: boolean;
	/** True when today was already ACTIVE (no-op path). */
	alreadyActive: boolean;
	/** True when no SCHEDULED/ACTIVE puzzle exists for today (fail-closed). */
	missingToday: boolean;
};

export type SettlementReport = {
	finalized: SettlementPuzzleResult[];
	forfeitedCount: number;
	completedCount: number;
	activatedToday: boolean;
	alreadyActive: boolean;
	missingToday: boolean;
};

export type SettlementDeps = {
	/** Test seam: the whole sweep (defaults to the real finalizeExpired). */
	finalizeExpired?: () => Promise<SettlementPuzzleResult[]>;
	/** Test seam: whole activation (defaults to the real activateToday). */
	activateToday?: () => Promise<ActivationResult>;
	/** Test seam: per-puzzle finalizer used by the real sweep. */
	finalizePuzzle?: (puzzleId: string) => Promise<FinalizeResult>;
	/** Test seam: operational log. */
	log?: Logger;
};

export type SettlementService = {
	finalizeExpired(): Promise<SettlementPuzzleResult[]>;
	activateToday(): Promise<ActivationResult>;
	runSettlement(): Promise<SettlementReport>;
};

/**
 * The missing-puzzle alert marker (D15) — structured, correlatable:
 * `[settlement] missing puzzle for date=YYYY-MM-DD`. Extracted as a pure
 * function so the marker contract is unit-testable without a DB.
 */
export function missingPuzzleMarker(date: string): string {
	return `[settlement] missing puzzle for date=${date}`;
}

export function createSettlementService(db: Db, deps: SettlementDeps = {}): SettlementService {
	return {
		finalizeExpired: () => finalizeExpired(db, deps),
		activateToday: () => activateToday(db, deps.log),
		runSettlement: () => runSettlement(db, deps)
	};
}

// ─── finalizeExpired (sweep) ────────────────────────────────────────────────

/**
 * Finalize every expired non-finalized puzzle (plan §7.4: any depth of
 * missed runs). Selection is per-sweep: `FOR UPDATE SKIP LOCKED` filters the
 * row set at selection time (autocommit — the statement's lock ends with the
 * SELECT, so it is a SOFT FILTER, not a held lock; see the module header for
 * the audited locking model). The authoritative anti-double-processing guard
 * is finalizePuzzle: each selected puzzle is re-locked puzzle-first (NG9) and
 * finalized in its OWN transaction, and its already-FINALIZED re-entry is a
 * write-free no-op — in every interleaving of concurrent sweeps exactly one
 * real finalization happens. Rows skipped because another transaction held
 * their lock are never lost: the next sweep (cron retry or week/month lazy
 * finalization) picks them up (self-healing).
 *
 * Expired-but-SCHEDULED puzzles are untouched (only ACTIVE is swept — a
 * missed activation is recovered by activateToday, a missed finalization by
 * this sweep; the two jobs never fight over the same row).
 *
 * Error isolation: a failing finalize is logged and the sweep continues —
 * one bad row must not stop the reconciliation of the rest (plan U4).
 */
export async function finalizeExpired(
	db: Db,
	deps: Omit<SettlementDeps, 'finalizeExpired' | 'activateToday'> = {}
): Promise<SettlementPuzzleResult[]> {
	const finalizePuzzle = deps.finalizePuzzle ?? ((id: string) => createPuzzleService(db).finalizePuzzle(id));
	const log = deps.log ?? defaultLog;

	const result = (await db.execute(sql`
		SELECT id::text AS id, puzzle_date::text AS puzzle_date
		FROM daily_puzzles
		WHERE status = 'ACTIVE' AND expires_at <= transaction_timestamp()
		ORDER BY puzzle_date
		FOR UPDATE SKIP LOCKED
	`)) as unknown as { rows: { id: string; puzzle_date: string }[] };

	return finalizePuzzleRows(
		result.rows.map((row) => ({ id: row.id, puzzleDate: row.puzzle_date })),
		{ finalizePuzzle, log }
	);
}

/**
 * The per-row finalization loop — extracted so error isolation and result
 * shaping are testable DB-free (plan U4). Each row is finalized through the
 * idempotent finalizer in its own transaction; a failing row is logged with
 * a structured marker and never aborts the sweep.
 */
export async function finalizePuzzleRows(
	rows: { id: string; puzzleDate: string }[],
	deps: {
		finalizePuzzle: (puzzleId: string) => Promise<FinalizeResult>;
		log?: Logger;
	}
): Promise<SettlementPuzzleResult[]> {
	const log = deps.log ?? defaultLog;
	const finalized: SettlementPuzzleResult[] = [];
	for (const row of rows) {
		try {
			const res = await deps.finalizePuzzle(row.id);
			finalized.push({
				puzzleId: res.puzzleId,
				puzzleDate: row.puzzleDate,
				forfeitedCount: res.forfeitedCount,
				completedCount: res.completedCount,
				alreadyFinalized: res.alreadyFinalized
			});
		} catch (err) {
			// Error isolation — never let one row abort the sweep. The error
			// is structured + correlatable (puzzle id + date).
			log(
				`[settlement] finalize failed puzzle_id=${row.id} date=${row.puzzleDate} error=${err instanceof Error ? err.message : String(err)}`
			);
		}
	}
	return finalized;
}

// ─── activateToday ──────────────────────────────────────────────────────────

/**
 * Cron-side activation of today's puzzle (mirrors startGame's M3 lazy
 * activation: today's date via the WHERE, SCHEDULED branch, no other ACTIVE
 * for today, all under the puzzle-row lock). Missing row ⇒ fail-closed:
 * `missingToday: true` + structured alert marker — NEVER fabricate a puzzle
 * (D15); startGame's PUZZLE_UNAVAILABLE remains the play-path fail-closed.
 */
export async function activateToday(db: Db, log: Logger = defaultLog): Promise<ActivationResult> {
	return db.transaction(async (tx) => {
		const [today] = (
			(await tx.execute(
				sql`SELECT ${todayManilaDateExpr}::text AS d`
			)) as unknown as { rows: { d: string }[] }
		).rows;

		const [puzzle] = await tx
			.select()
			.from(dailyPuzzles)
			.where(eq(dailyPuzzles.puzzleDate, todayManilaDateExpr))
			.for('update');
		if (!puzzle) {
			log(missingPuzzleMarker(today.d));
			return { activatedToday: false, alreadyActive: false, missingToday: true };
		}
		if (puzzle.status === 'ACTIVE') {
			return { activatedToday: false, alreadyActive: true, missingToday: false };
		}
		if (puzzle.status === 'FINALIZED') {
			// Today cannot be FINALIZED in a consistent world (finalization
			// happens after expiry); log + no-op rather than fabricate state.
			log(`[settlement] today already finalized date=${puzzle.puzzleDate}`);
			return { activatedToday: false, alreadyActive: false, missingToday: false };
		}

		// SCHEDULED → ACTIVE under the lock, with the lazy-activation guards:
		// no other ACTIVE puzzle for today (UNIQUE(puzzle_date) makes this a
		// consistency check, not a functional guard).
		const [otherActive] = await tx
			.select({ id: dailyPuzzles.id })
			.from(dailyPuzzles)
			.where(
				and(
					eq(dailyPuzzles.puzzleDate, puzzle.puzzleDate),
					eq(dailyPuzzles.status, 'ACTIVE'),
					ne(dailyPuzzles.id, puzzle.id)
				)
			)
			.limit(1);
		if (otherActive) {
			throw new AppError(
				ERROR_CODES.INVALID_STATE,
				'Conflicting puzzle state: more than one ACTIVE puzzle for today',
				500
			);
		}
		await tx
			.update(dailyPuzzles)
			.set({ status: 'ACTIVE' })
			.where(eq(dailyPuzzles.id, puzzle.id));
		return { activatedToday: true, alreadyActive: false, missingToday: false };
	});
}

// ─── runSettlement (orchestration) ──────────────────────────────────────────

/**
 * The cron entry point body: finalizeExpired → activateToday → report.
 * Order is deliberate (plan U4): reconciliation FIRST so the activated day
 * is the only unfinalized day when the next sweep runs. Each step is
 * independently retryable; deps are injectable for DB-free orchestration
 * tests.
 */
export async function runSettlement(db: Db, deps: SettlementDeps = {}): Promise<SettlementReport> {
	const finalizeStep =
		deps.finalizeExpired ??
		(() =>
			finalizeExpired(db, { finalizePuzzle: deps.finalizePuzzle, log: deps.log ?? defaultLog }));
	const activateStep = deps.activateToday ?? (() => activateToday(db, deps.log ?? defaultLog));

	const finalized = await finalizeStep();
	const activation = await activateStep();

	return {
		finalized,
		forfeitedCount: finalized.reduce((sum, r) => sum + r.forfeitedCount, 0),
		completedCount: finalized.reduce((sum, r) => sum + r.completedCount, 0),
		activatedToday: activation.activatedToday,
		alreadyActive: activation.alreadyActive,
		missingToday: activation.missingToday
	};
}