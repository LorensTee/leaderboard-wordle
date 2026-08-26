// Phase-2 display-name domain tests (plan §12): table-driven/property-based
// PARITY between the server module (src/server/profile/display-name.ts —
// authoritative) and the client twin (src/lib/shared/lib/display-name.ts —
// UX only) across ALL five behaviors — charset, whitespace normalization,
// canonicalization, moderation transformation, reserved names — plus
// moderation in BOTH directions (evasions rejected; realistic benign names
// with ordinary substrings accepted — the acceptance gate for the curated
// banned-word dataset).
import { describe, expect, it } from 'vitest';
import {
	BANNED_WORDS,
	DISPLAY_NAME_MAX,
	DISPLAY_NAME_MIN,
	RESERVED_DISPLAY_NAMES,
	canonicalizeDisplayName,
	isReservedDisplayName,
	moderationKeyForDisplayName,
	validateDisplayName
} from '../../src/server/profile/display-name';
import * as client from '../../src/lib/shared/lib/display-name';

// ─── Shared test corpus (exercised against BOTH modules) ───────────────────

const CHARSET_CASES: { input: string; valid: boolean; canonical?: string }[] = [
	{ input: 'Alex', valid: true, canonical: 'alex' },
	{ input: 'ALEX', valid: true, canonical: 'alex' },
	{ input: 'Speedrunner Sam', valid: true, canonical: 'speedrunner sam' },
	{ input: 'john-smith', valid: true },
	{ input: 'jane_doe', valid: true },
	{ input: 'bob  the  builder', valid: true, canonical: 'bob the builder' },
	{ input: '  padded  ', valid: true, canonical: 'padded' },
	{ input: 'miXeD CaSe 42', valid: true, canonical: 'mixed case 42' },
	{ input: 'a', valid: false }, // below min length
	{ input: 'ab', valid: true },
	{ input: 'a'.repeat(15), valid: true },
	{ input: 'a'.repeat(16), valid: false }, // above max length
	{ input: 'with.dot', valid: false }, // '.' outside charset
	{ input: 'with,comma', valid: false },
	{ input: 'with@symbol', valid: false },
	{ input: 'emoji😀name', valid: false },
	{ input: 'übung', valid: false },
	{ input: '日本語', valid: false },
	{ input: '', valid: false },
	{ input: '   ', valid: false },
	{ input: 'a b', valid: true },
	{ input: '12345', valid: true },
	{ input: '____', valid: true },
	{ input: '----', valid: true }
];

// NOTE: 'tab\tname' — \t collapses to a single space by canonicalize BEFORE
// charset validation, so it is VALID with canonical 'tab name'.
const TAB_NAME = { input: 'tab\tname', valid: true, canonical: 'tab name' };

const MODERATION_CASES: { input: string; key: string }[] = [
	{ input: 'fuck', key: 'fuck' },
	{ input: 'FUCK', key: 'fuck' },
	{ input: 'f.u.c.k', key: 'fuck' },
	{ input: 'f u c k', key: 'fuck' },
	{ input: 'f_u_c_k', key: 'fuck' },
	{ input: 'fuuck', key: 'fuck' },
	{ input: 'f4ck', key: 'fack' },
	{ input: 'fucking', key: 'fucking' },
	{ input: 'phuck', key: 'phuck' },
	{ input: 'sh1thead', key: 'shithead' },
	{ input: 'n1gger', key: 'niger' },
	{ input: 'nigg3r', key: 'niger' },
	{ input: 'b1tch', key: 'bitch' },
	{ input: 'b17ch', key: 'bitch' },
	{ input: 'a55hole', key: 'ashole' },
	{ input: 'asshole', key: 'ashole' },
	{ input: 'superfuck', key: 'superfuck' },
	{ input: 'c u n t', key: 'cunt' },
	{ input: 'kunt', key: 'kunt' },
	{ input: 'b0b', key: 'bob' }, // leet of a benign name — key is not banned
	{ input: 'cool', key: 'col' }, // duplicate collapse on a benign word
	{ input: '1337', key: 'iet' },
	{ input: 'wordle', key: 'wordle' },
	{ input: 'a-b_c d', key: 'abcd' }
];

// Benign-name acceptance gate (plan §12, v23): realistic friend-group handles
// whose ordinary substrings must NOT trip moderation. The curated dataset’s
// acceptance criterion is that EVERY name here validates.
const BENIGN_NAMES = [
	'class',
	'glass',
	'pass',
	'classic',
	'massive',
	'document',
	'documentary',
	'title',
	'visit',
	'site',
	'sitting',
	'spice',
	'spicy',
	'mickey',
	'bobby',
	'bob',
	'adam',
	'adamant',
	'analog',
	'analyst',
	'peacock',
	'kilo',
	'harrison',
	'washington',
	'escape',
	'espresso',
	'excellent',
	'mustang',
	'monster',
	'distribute',
	'president',
	'family',
	'friendly',
	'goblin',
	'trophy',
	'winner',
	'streak',
	'speedrun',
	'leader',
	'king',
	'queen',
	'prince',
	'princess',
	'dragon',
	'phoenix',
	'unicorn',
	'pumpkin',
	'cookie',
	'muffin',
	'cupcake',
	'waffle',
	'broccoli',
	'spaghetti',
	'marshmallow',
	'ninja',
	'samurai',
	'captain',
	'general',
	'thunder',
	'lightning',
	'john-smith',
	'jane_doe',
	'penguin lover',
	'wordle wizard'
];

// Evasions that MUST be rejected (obvious / leet / separator / duplicate-runs).
const EVASIONS_REJECTED = [
	'fuck',
	'f u c k',
	'f_u_c_k',
	'fuuck',
	'f4ck',
	'fuk',
	'fuq',
	'fck',
	'facking',
	'phuck',
	'fucking',
	'fuckface',
	'sh1thead',
	'bullshit',
	'bullsh1t',
	'b1tch',
	'bitchy',
	'c u n t',
	'kunt',
	'a55hole',
	'asshole',
	'n1gger',
	'nigg3r',
	'nigga',
	'faggot',
	'f4gg0t',
	'd1ckhead',
	'wh0re',
	'slut',
	'p3do'
];

// ─── Parity helpers ─────────────────────────────────────────────────────────

function expectParity(fnServer: (input: string) => string | boolean, fnClient: (input: string) => string | boolean, sample: string[]) {
	for (const input of sample) {
		expect(fnClient(input), `parity mismatch for ${JSON.stringify(input)}`).toBe(fnServer(input));
	}
}

/** Property-style generator: charset-valid + leet/separator chaos inputs. */
function propertySamples(count: number): string[] {
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-@!$|+.';
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		let s = '';
		const len = 1 + ((i * 7) % 18);
		for (let j = 0; j < len; j++) {
			s += chars[(i * 13 + j * 29) % chars.length];
		}
		out.push(s);
	}
	return out;
}

// ─── Tests (both modules, table-driven over ALL five behaviors) ────────────

describe('display-name domain — server module (authoritative)', () => {
	it('charset + length (behavior 1) and whitespace normalization (behavior 2)', () => {
		for (const c of [...CHARSET_CASES, TAB_NAME]) {
			const result = validateDisplayName(c.input);
			expect(result.ok, `${JSON.stringify(c.input)} should ${c.valid ? 'pass' : 'fail'}`).toBe(c.valid);
			if (result.ok && c.valid && c.canonical !== undefined) {
				expect(result.canonical).toBe(c.canonical);
			}
			if (!result.ok) expect(result.code).toBe('INVALID_NAME');
		}
	});

	it('canonicalization is deterministic and matches the uniqueness contract (behavior 3)', () => {
		const samples = ['  ALPHA   beta  ', 'X Y Z', '  spaced-out-Name  ', 'a'.repeat(15), 'zzz'];
		for (const s of samples) {
			expect(canonicalizeDisplayName(canonicalizeDisplayName(s))).toBe(canonicalizeDisplayName(s));
		}
		expect(canonicalizeDisplayName('  Alpha   Beta  ')).toBe('alpha beta');
		expect(canonicalizeDisplayName('A')).toBe('a');
	});

	it('moderation key transformation (behavior 4)', () => {
		for (const c of MODERATION_CASES) {
			expect(moderationKeyForDisplayName(c.input), `key of ${JSON.stringify(c.input)}`).toBe(c.key);
		}
	});

	it('reserved names (behavior 5) — canonical comparison', () => {
		expect(RESERVED_DISPLAY_NAMES).toEqual(['admin', 'wordle', 'leaderboard', 'moderator', 'system']);
		for (const reserved of RESERVED_DISPLAY_NAMES) {
			expect(isReservedDisplayName(reserved)).toBe(true);
			// The service canonicalizes FIRST (lowercase/trim); the function
			// itself operates on the canonical form.
			expect(isReservedDisplayName(canonicalizeDisplayName(reserved.toUpperCase()))).toBe(true);
			expect(isReservedDisplayName(canonicalizeDisplayName(`  ${reserved}  `))).toBe(true);
		}
		expect(isReservedDisplayName('admin2')).toBe(false);
		expect(isReservedDisplayName('player')).toBe(false);
	});

	it('moderation rejects evasions (required direction)', () => {
		for (const name of EVASIONS_REJECTED) {
			const result = validateDisplayName(name);
			expect(result.ok, `${JSON.stringify(name)} must be moderated`).toBe(false);
			if (!result.ok) expect(result.code).toBe('NAME_MODERATED');
		}
	});

	it('moderation ACCEPTS the benign-name set (required direction — dataset gate)', () => {
		for (const name of BENIGN_NAMES) {
			const result = validateDisplayName(name);
			expect(result.ok, `benign name ${JSON.stringify(name)} must pass moderation`).toBe(true);
		}
	});

	it('moderation message contract: validation never reveals the banned word', () => {
		// The API-facing message is produced by the SERVICE with a fixed
		// generic string; the domain only returns the code (checked in
		// profile-service.test.ts). Here we pin the code granularity.
		const result = validateDisplayName('f u c k');
		expect(result).toEqual({ ok: false, code: 'NAME_MODERATED' });
	});

	it('dataset sanity: versioned provenance + no stray 1–2 char entries', () => {
		expect(BANNED_WORDS.length).toBeGreaterThanOrEqual(60);
		expect(BANNED_WORDS.length).toBeLessThanOrEqual(100);
		expect(new Set(BANNED_WORDS).size).toBe(BANNED_WORDS.length);
		for (const word of BANNED_WORDS) {
			expect(moderationKeyForDisplayName(word).length).toBeGreaterThanOrEqual(3);
		}
	});
});

describe('display-name PARITY — server ↔ client twin (all five behaviors)', () => {
	const sample = [
		...CHARSET_CASES.map((c) => c.input),
		TAB_NAME.input,
		...MODERATION_CASES.map((c) => c.input),
		...BENIGN_NAMES,
		...EVASIONS_REJECTED,
		...RESERVED_DISPLAY_NAMES,
		...propertySamples(400)
	];

	it('identical curated dataset (single source file, both twins)', () => {
		expect(client.BANNED_WORDS).toEqual(BANNED_WORDS);
		expect(client.RESERVED_DISPLAY_NAMES).toEqual(RESERVED_DISPLAY_NAMES);
	});

	it('charset + whitespace normalization parity', () => {
		expectParity(
			(input) => JSON.stringify(validateDisplayName(input)),
			(input) => JSON.stringify(client.validateDisplayName(input)),
			sample
		);
	});

	it('canonicalization parity', () => {
		expectParity(canonicalizeDisplayName, client.canonicalizeDisplayName, sample);
	});

	it('moderation transformation parity', () => {
		expectParity(moderationKeyForDisplayName, client.moderationKeyForDisplayName, sample);
	});

	it('reserved-name handling parity', () => {
		expectParity(isReservedDisplayName, client.isReservedDisplayName, sample);
	});

	it('constants parity (min/max/charset)', () => {
		expect(client.DISPLAY_NAME_MIN).toBe(DISPLAY_NAME_MIN);
		expect(client.DISPLAY_NAME_MAX).toBe(DISPLAY_NAME_MAX);
		expect(client.DISPLAY_NAME_MAX).toBe(15);
		expect(client.DISPLAY_NAME_MIN).toBe(2);
	});
});