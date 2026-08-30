// Phase-4 admin API handlers (plan §8, D1–D10) — thin Hono layer over the
// admin service. Registered ONLY from src/server/routes.ts (single
// composition point; chained so the AppType/RPC schema stays intact).
// Authorization: the composed middleware chain (authContext → requireAuth →
// requireAdmin on /api/admin/*) + a defense-in-depth re-check in
// authenticatedAdmin. Onboarding is NOT enforced at the API level
// (consistent with /api/game/*, /api/me/*, /api/leaderboard/* — the page
// guard gates the UI; the role gate is the admin boundary).
//
// Secrecy: `word` appears ONLY in these admin responses (behind the role
// gate) — never statically bundled, never in non-admin payloads.
import type { Context, Hono, Schema } from 'hono';
import type { BlankSchema } from 'hono/types';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AppError, ERROR_CODES } from '../lib/errors';
import type { AppEnv } from '../routes';
import { UUID_RE } from '../game/handlers';
import { isValidIsoDate } from './validation';
import type { AdminPuzzleService, ReplaceTodayInput, ScheduleInput, UpdatePatch } from './service';

export type AdminRouteDeps = {
	/** Service factory — test seam (fake service in unit tests). */
	getService: (c: Context<AppEnv>) => AdminPuzzleService;
};

function authenticatedAdmin(c: Context<AppEnv>, action: string): { id: string } {
	const auth = c.get('auth');
	if (!auth) {
		// requireAuth already guards /api/admin/* — defense in depth so a
		// route accidentally moved outside the guard still fails closed.
		throw new AppError(ERROR_CODES.UNAUTHORIZED, `Authentication required to ${action}`, 401);
	}
	if (auth.user.role !== 'admin') {
		// requireAdmin already guards /api/admin/* — defense in depth (D1).
		throw new AppError(ERROR_CODES.FORBIDDEN, 'Admin access required', 403);
	}
	return auth.user;
}

/** A real calendar date in ISO YYYY-MM-DD (shape + calendar validity). */
const isoDateField = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
	.refine(isValidIsoDate, 'Not a valid calendar date');

/** Word: normalized server-side (trim + lowercase); raw length guard only. */
const wordField = z.string().trim().min(1).max(64);
const hintField = z.string().trim().min(1).max(1);

// Strict bodies — any unknown/extra field is rejected (400 BAD_REQUEST).
const scheduleBodySchema = z
	.object({ puzzleDate: isoDateField, word: wordField, hintLetter: hintField })
	.strict();

const validateBodySchema = z.object({ word: wordField }).strict();

const replaceBodySchema = z.object({ word: wordField, hintLetter: hintField }).strict();

const updateBodySchema = z
	.object({
		puzzleDate: isoDateField.optional(),
		word: wordField.optional(),
		hintLetter: hintField.optional()
	})
	.strict()
	.refine(
		(p) => p.puzzleDate !== undefined || p.word !== undefined || p.hintLetter !== undefined,
		'At least one of puzzleDate, word, or hintLetter is required'
	);

const listQuerySchema = z
	.object({
		from: isoDateField.optional(),
		to: isoDateField.optional()
	})
	.strict();

/** Shared zValidator hook → NG21 BAD_REQUEST envelope (game-handler pattern). */
function badRequestError(what: string, issues: { path: PropertyKey[]; message: string }[]): never {
	throw new AppError(
		ERROR_CODES.BAD_REQUEST,
		`Invalid ${what}`,
		400,
		issues.map((issue) => ({
			path: issue.path.join('.'),
			message: issue.message
		}))
	);
}

/**
 * UUID-shaped path ids short-circuit to 404 without a DB round-trip.
 * (`c.req.param` may return undefined for unknown paths — treat as a miss.)
 */
function requirePuzzleId(c: Context<AppEnv>): string {
	const id = c.req.param('id') ?? '';
	if (!UUID_RE.test(id)) {
		throw new AppError(ERROR_CODES.NOT_FOUND, 'Puzzle not found', 404);
	}
	return id;
}

/**
 * Register the Phase-4 admin routes and RETURN the app (chained — Hono
 * accumulates the route Schema in the return type; do NOT annotate/cast).
 * The chain pattern mirrors registerLeaderboardRoutes (phase-3), which
 * preserves the accumulated AppType for the hc client.
 *
 * Registration order: static `/api/admin/puzzles/validate` is registered
 * before the `:id` param route so no router precedence ambiguity exists.
 */
export function registerAdminRoutes<S extends Schema = BlankSchema>(
	app: Hono<AppEnv, S>,
	deps: AdminRouteDeps
) {
	return app
		.get(
			'/api/admin/puzzles',
			zValidator('query', listQuerySchema, (result) => {
				if (!result.success) badRequestError('date window', result.error.issues);
			}),
			async (c) => {
				authenticatedAdmin(c, 'list puzzles');
				const { from, to } = c.req.valid('query');
				const puzzles = await deps.getService(c).listPuzzles(from, to);
				// No explicit return annotation — c.json's TypedResponse must
				// reach the RPC client schema (leaderboard handler discipline).
				return c.json({ puzzles }, 200);
			}
		)
		.post(
			'/api/admin/puzzles/validate',
			zValidator('json', validateBodySchema, (result) => {
				if (!result.success) badRequestError('word', result.error.issues);
			}),
			async (c) => {
				authenticatedAdmin(c, 'validate a word');
				const { word } = c.req.valid('json');
				const result = await deps.getService(c).validateWord(word);
				return c.json(result, 200);
			}
		)
		.post(
			'/api/admin/puzzles',
			zValidator('json', scheduleBodySchema, (result) => {
				if (!result.success) badRequestError('schedule', result.error.issues);
			}),
			async (c) => {
				authenticatedAdmin(c, 'schedule a puzzle');
				const body = c.req.valid('json') as ScheduleInput;
				const puzzle = await deps.getService(c).schedulePuzzle(body);
				return c.json({ puzzle }, 201);
			}
		)
		.patch(
			'/api/admin/puzzles/:id',
			zValidator('json', updateBodySchema, (result) => {
				if (!result.success) badRequestError('update', result.error.issues);
			}),
			async (c) => {
				authenticatedAdmin(c, 'update a puzzle');
				const id = requirePuzzleId(c);
				const patch = c.req.valid('json') as UpdatePatch;
				const result = await deps.getService(c).updatePuzzle(id, patch);
				return c.json(result, 200);
			}
		)
		.delete('/api/admin/puzzles/:id', async (c) => {
			authenticatedAdmin(c, 'delete a puzzle');
			const id = requirePuzzleId(c);
			const result = await deps.getService(c).deletePuzzle(id);
			return c.json(result, 200);
		})
		.post(
			'/api/admin/puzzles/:id/replace-today',
			zValidator('json', replaceBodySchema, (result) => {
				if (!result.success) badRequestError('replacement', result.error.issues);
			}),
			async (c) => {
				authenticatedAdmin(c, 'replace today\'s puzzle');
				const id = requirePuzzleId(c);
				const body = c.req.valid('json') as ReplaceTodayInput;
				const puzzle = await deps.getService(c).replaceTodayPuzzle(id, body);
				return c.json({ puzzle }, 200);
			}
		);
}