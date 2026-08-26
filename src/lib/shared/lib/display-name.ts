// Client twin of the server-authoritative display-name domain
// (src/server/profile/display-name.ts) — SAME logic, deliberately mirrored
// because `src/server` must not import FSD `src/lib` (and vice versa the
// client bundle must not pull server modules). Parity is pinned table-driven
// + property-based across ALL five behaviors in tests/unit/display-name.test.ts.
//
// Client validation is UX ONLY — the server re-validates everything and is
// authoritative (Spec §1: "the client picker is not trusted").
import bannedWordsJson from '../config/banned-words.json';

/** V1 explicit ASCII charset, case-insensitive (Spec §1/§15, D2). */
export const DISPLAY_NAME_CHARSET_RE = /^[a-z0-9 _-]+$/i;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 15;

/** App-level reserved names — rejected with the SAME 409 as duplicates (D2). */
export const RESERVED_DISPLAY_NAMES = [
	'admin',
	'wordle',
	'leaderboard',
	'moderator',
	'system'
] as const;
export type ReservedDisplayName = (typeof RESERVED_DISPLAY_NAMES)[number];

/** Curated banned-word baseline (D3) — same single file the server reads. */
export const BANNED_WORDS: readonly string[] = bannedWordsJson.words;

/** Leet/confusable map for the AGGRESSIVE moderation key (D2). */
const LEET_MAP: Readonly<Record<string, string>> = {
	'0': 'o',
	'1': 'i',
	'2': 'z',
	'3': 'e',
	'4': 'a',
	'5': 's',
	'6': 'g',
	'7': 't',
	'8': 'b',
	'9': 'q',
	'@': 'a',
	'!': 'i',
	'|': 'i',
	'$': 's',
	'+': 't'
};

/** Separators stripped by the moderation key (D2: `[-_. ]`). */
const MODERATION_SEPARATORS = new Set(['-', '_', '.', ' ']);

function keyChar(ch: string): string | null {
	const lower = ch.toLowerCase();
	const mapped = LEET_MAP[lower] ?? lower;
	if (MODERATION_SEPARATORS.has(mapped)) return null;
	return mapped;
}

/** Canonical form for the uniqueness column (mirrors the server module). */
export function canonicalizeDisplayName(input: string): string {
	return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Aggressive detection key (mirrors the server module). */
export function moderationKeyForDisplayName(input: string): string {
	let out = '';
	for (const ch of input) {
		const mapped = keyChar(ch);
		if (mapped === null) continue;
		if (mapped === out.at(-1)) continue;
		out += mapped;
	}
	return out;
}

/** Banned entries pre-normalized to their moderation keys (computed once). */
export const BANNED_MODERATION_KEYS: ReadonlySet<string> = new Set(
	BANNED_WORDS.map((word) => moderationKeyForDisplayName(word))
);

/** Canonical comparison against the app-level reserved set (D2). */
export function isReservedDisplayName(canonical: string): boolean {
	return (RESERVED_DISPLAY_NAMES as readonly string[]).includes(canonical);
}

export type DisplayNameValidation =
	| { ok: true; canonical: string; moderationKey: string }
	| { ok: false; code: 'INVALID_NAME' | 'NAME_MODERATED' };

/**
 * Full client-visible validation pipeline (UX only — the server re-runs
 * everything and is authoritative).
 */
export function validateDisplayName(input: string): DisplayNameValidation {
	const canonical = canonicalizeDisplayName(input);
	if (!DISPLAY_NAME_CHARSET_RE.test(canonical)) {
		return { ok: false, code: 'INVALID_NAME' };
	}
	if (canonical.length < DISPLAY_NAME_MIN || canonical.length > DISPLAY_NAME_MAX) {
		return { ok: false, code: 'INVALID_NAME' };
	}
	const moderationKey = moderationKeyForDisplayName(canonical);
	for (const banned of BANNED_MODERATION_KEYS) {
		if (moderationKey.includes(banned)) {
			return { ok: false, code: 'NAME_MODERATED' };
		}
	}
	return { ok: true, canonical, moderationKey };
}