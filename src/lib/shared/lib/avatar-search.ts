// Phase-6 avatar picker — pure search/paging/category logic (unit-testable,
// mirrors leaderboard-format.ts / wordle-ux.ts). The picker operates over the
// GENERATED client metadata (src/lib/shared/config/avatar-emojis.generated.ts);
// the server allow-list stays authoritative for submitted values.
import type { AvatarEmoji } from '$lib/shared/config/avatar-emojis.generated';

/** Windowed-rendering page size — see docs/phases/pre phase 6/pre-phase-6-plan.md §4.3. */
export const AVATAR_PAGE_SIZE = 96;

/** Trim + lowercase a search query (case-insensitive matching). */
export function normalizeAvatarQuery(raw: string): string {
	return raw.trim().toLowerCase();
}

/**
 * Label match score: 0 = exact, 1 = prefix, 2 = substring, -1 = no match.
 * Matching is case-insensitive over the CLDR short name (accessibility label);
 * the query is normalized here too (trim + lowercase), so callers may pass
 * the raw input.
 */
export function avatarLabelScore(
	entry: Pick<AvatarEmoji, 'label'>,
	query: string
): number {
	const q = query.trim().toLowerCase();
	if (q === '') return -1;
	const label = entry.label.toLowerCase();
	if (label === q) return 0;
	if (label.startsWith(q)) return 1;
	if (label.includes(q)) return 2;
	return -1;
}

/** Deterministic label ordering (codepoint compare — locale-independent). */
function compareLabels(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Search entries by CLDR label: exact match first, then prefix, then
 * substring; ties are ordered alphabetically (codepoint). Deterministic:
 * same input + same entry order → same output. Empty/whitespace query → [].
 */
export function searchAvatars(
	entries: readonly Pick<AvatarEmoji, 'emoji' | 'label' | 'group'>[],
	rawQuery: string
): typeof entries {
	const q = normalizeAvatarQuery(rawQuery);
	if (q === '') return [];
	const scored: { entry: (typeof entries)[number]; score: number }[] = [];
	for (const entry of entries) {
		const score = avatarLabelScore(entry, q);
		if (score >= 0) scored.push({ entry, score });
	}
	scored.sort((a, b) => a.score - b.score || compareLabels(a.entry.label, b.entry.label));
	return scored.map((s) => s.entry);
}

/**
 * Group entries by their Unicode group, preserving the canonical entry order
 * within each group (deterministic; first-appearance order of the array).
 */
export function entriesByGroup(
	entries: readonly Pick<AvatarEmoji, 'emoji' | 'label' | 'group'>[]
): Map<string, (typeof entries)[number][]> {
	const map = new Map<string, (typeof entries)[number][]>();
	for (const entry of entries) {
		const bucket = map.get(entry.group);
		if (bucket) bucket.push(entry);
		else map.set(entry.group, [entry]);
	}
	return map;
}

/** The first `count` entries (windowed page). */
export function pageEntries<T>(list: readonly T[], count: number): T[] {
	return list.slice(0, count);
}
