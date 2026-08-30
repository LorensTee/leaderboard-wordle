// Phase-4 typed admin API surface for the client (Hono RPC — wire types
// flow from the server's AppType through `res.json()`; nothing hand-declared).
// TanStack Query keys: `['admin']` / `['admin','puzzles']` family — mutations
// invalidate the `puzzles` prefix (windowed sub-keys refetch automatically).
//
// SECRECY (plan §4.3/§14): `word` exists ONLY in admin responses behind the
// role gate; this module never embeds answer material — the page fetches
// word data at runtime from the protected API (never statically bundled).
import { api, apiErrorFromResponse } from './client';
import type { AdminPuzzle, ValidateWordResult } from '$server/admin/service';
import type { ScheduleInput, ReplaceTodayInput } from '$server/admin/service';
import type { UpdatePatch } from '$server/admin/service';

export const adminKeys = {
	all: ['admin'] as const,
	/** Family key — invalidated by every mutation (prefix invalidation). */
	puzzles: ['admin', 'puzzles'] as const,
	/** Windowed list key (D4: from/to per displayed month). */
	window: (from: string, to: string) => ['admin', 'puzzles', from, to] as const
};

export const adminApi = {
	/** GET /api/admin/puzzles — windowed list (D4 defaults when omitted). */
	async list(from?: string, to?: string): Promise<AdminPuzzle[]> {
		// Undefined omitted entirely (hc would otherwise serialize them).
		const query: { from?: string; to?: string } = {};
		if (from !== undefined) query.from = from;
		if (to !== undefined) query.to = to;
		const res = await api.api.admin.puzzles.$get({ query });
		if (!res.ok) throw await apiErrorFromResponse(res);
		return (await res.json()).puzzles;
	},

	/** POST /api/admin/puzzles/validate — D5 live validation (never mutates). */
	async validate(word: string): Promise<ValidateWordResult> {
		const res = await api.api.admin.puzzles.validate.$post({ json: { word } });
		if (!res.ok) throw await apiErrorFromResponse(res);
		return res.json();
	},

	/** POST /api/admin/puzzles — schedule a future puzzle. */
	async schedule(input: ScheduleInput): Promise<AdminPuzzle> {
		const res = await api.api.admin.puzzles.$post({ json: input });
		if (!res.ok) throw await apiErrorFromResponse(res);
		return (await res.json()).puzzle;
	},

	/** PATCH /api/admin/puzzles/:id — edit/move a future SCHEDULED puzzle. */
	async update(id: string, patch: UpdatePatch): Promise<{ puzzle: AdminPuzzle; gaps: string[] }> {
		const res = await api.api.admin.puzzles[':id'].$patch({ param: { id }, json: patch });
		if (!res.ok) throw await apiErrorFromResponse(res);
		return res.json();
	},

	/** DELETE /api/admin/puzzles/:id — future SCHEDULED only (D6). */
	async remove(id: string): Promise<{ deleted: true; gaps: string[] }> {
		const res = await api.api.admin.puzzles[':id'].$delete({ param: { id } });
		if (!res.ok) throw await apiErrorFromResponse(res);
		return res.json();
	},

	/** POST /api/admin/puzzles/:id/replace-today — atomic same-day replacement (D8). */
	async replaceToday(id: string, input: ReplaceTodayInput): Promise<AdminPuzzle> {
		const res = await api.api.admin.puzzles[':id']['replace-today'].$post({
			param: { id },
			json: input
		});
		if (!res.ok) throw await apiErrorFromResponse(res);
		return (await res.json()).puzzle;
	}
};