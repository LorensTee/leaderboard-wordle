// Server-authoritative display-name domain (Phase-2 D2 / NG6 / Architecture
// §Display-name rules). PURE — no DB, no request objects; the profile service
// applies these rules and the database UNIQUE constraint is the final guard.
//
// Boundary note (recorded in docs/contradictions-and-gaps.md): the curated
// banned-word dataset is authored per decision D3 at
// `src/lib/shared/config/banned-words.json` (provenance fields inside). This
// module imports that file as INERT DATA across the FSD boundary — the
// alternative (duplicating the dataset server-side) would create drift
// against D3's "one list, one code path" rule. The client twin
// (`src/lib/shared/lib/display-name.ts`) reads the SAME file, and
// tests/unit/display-name.test.ts pins the two modules' behavior across all
// five behaviors (charset, whitespace normalization, canonicalization,
// moderation transformation, reserved names) table-driven + property-based.
import bannedWordsJson from '../../lib/shared/config/banned-words.json';

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

/** Curated banned-word baseline (D3) — surface words; keys computed below. */
export const BANNED_WORDS: readonly string[] = bannedWordsJson.words;

/**
 * Leet/confusable map for the AGGRESSIVE moderation key (deliberately
 * separate from the canonical form used for uniqueness — Architecture
 * §Display-name rules). Letters map to themselves (lowercased first); the
 * digits/symbols that commonly stand in for letters map to that letter.
 */
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

/**
 * Canonical form for the `display_name_normalized` UNIQUENESS column:
 * lowercase, trim, collapse internal whitespace runs (D2/Architecture). This
 * is deliberately NOT the moderation key — identity and detection are
 * separate concerns.
 */
export function canonicalizeDisplayName(input: string): string {
	return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Aggressive detection key for profanity/obfuscation checks: lowercase →
 * leet/confusable mapping → strip separators and duplicate runs (D2). A
 * banned entry (normalized the same way) contained as a substring of this
 * key ⇒ NAME_MODERATED. Never used for uniqueness.
 */
export function moderationKeyForDisplayName(input: string): string {
	let out = '';
	for (const ch of input) {
		const mapped = keyChar(ch);
		if (mapped === null) continue;
		// Collapse duplicate runs: f.u.c.k → fuck → fuk; fuuck → fuk.
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
 * Full client-visible validation pipeline (D2 order): trim/collapse →
 * charset → canonical length → moderation. Reserved/duplicate checks are
 * NOT here — they map to NAME_TAKEN 409 and need the DB (service layer).
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
			// Generic message only — never reveal which word (D2).
			return { ok: false, code: 'NAME_MODERATED' };
		}
	}
	return { ok: true, canonical, moderationKey };
}