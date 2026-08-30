// Phase-3 cron platform shell (plan §7.1/§7.3, D8) — the ONLY place
// Cloudflare cron plumbing appears. It translates the ScheduledController +
// env into the settlement domain (runSettlement) and logs the report; the
// domain itself (src/server/puzzle/settlement.ts) is fully portable.
//
// The `scheduled` export is appended to the built worker by
// scripts/patch-worker-scheduled.ts (the adapter has no entrypoint option
// and its template exports only `fetch` — see plan §7.3/D8).
//
// Typing note: the runtime signature is Cloudflare's ExportedHandlerScheduled
// handler `(controller, env, ctx) => void | Promise<void>`. The platform
// types (@cloudflare/workers-types) are deliberately NOT loaded into this
// project's TS program (wrangler types --include-runtime=false; the DOM libs
// would conflict), so the consumed platform shapes are declared structurally
// below — identical at runtime, hermetic to type-check.
import { getDb } from '../db/memo';
import type { HonoBindings } from '../routes';
import { runSettlement } from './settlement';

/** Platform ScheduledController — the consumed shape only. */
export type ScheduledController = {
	readonly scheduledTime: number;
	readonly cron: string;
	noRetry(): void;
};

/** Platform ExecutionContext — the consumed shape only. */
export type ExecutionContext = {
	waitUntil(promise: Promise<unknown>): void;
	passThroughOnException(): void;
};

export type ExportedHandlerScheduledHandler<Env = unknown> = (
	controller: ScheduledController,
	env: Env,
	ctx: ExecutionContext
) => void | Promise<void>;

/**
 * Cron entry: reconcile expired puzzles, activate today, report.
 *
 * FAILURE SURFACING (audit-resolved): failures are structured-logged AND
 * rethrown. A scheduled handler that resolves successfully looks successful
 * to the platform even when nothing settled; rethrowing marks the invocation
 * FAILED in the Cloudflare dashboard so operations sees it (the parenthetical
 * in plan §7.3 — "a thrown error still marks the run failed in the
 * dashboard" — is the operative intent; the literal "errors are caught and
 * logged" wording is recorded as a deviation). Rethrowing adds no risk: cron
 * deliveries are at-most-once (no auto-retry duplication), and runSettlement
 * is retry-safe by construction anyway (SKIP LOCKED selection + idempotent
 * finalizePuzzle/activateToday — D10), so a manual re-invocation or the next
 * run is always harmless. Self-healing (next sweep, week/month lazy
 * finalization, startGame lazy activation) is unchanged.
 *
 * The awaited work itself keeps the worker alive (no ctx.wrap needed for the
 * settled work — the handler promise covers it).
 */
export const scheduled: ExportedHandlerScheduledHandler<HonoBindings> = async (
	controller,
	env
) => {
	const startedAt = new Date().toISOString();
	try {
		const report = await runSettlement(getDb(env));
		console.log('[settlement] run complete', {
			cron: controller.cron,
			startedAt,
			finalized: report.finalized.length,
			forfeitedCount: report.forfeitedCount,
			completedCount: report.completedCount,
			activatedToday: report.activatedToday,
			alreadyActive: report.alreadyActive,
			missingToday: report.missingToday
		});
	} catch (err) {
		console.error(
			'[settlement] run failed',
			{ cron: controller.cron, startedAt, error: err instanceof Error ? err.message : String(err) },
			err
		);
		// Surface the failure: the invocation must be marked FAILED (see the
		// failure-surfacing note above). Never swallow.
		throw err;
	}
};