// Phase-2/Phase-6 avatar pipeline tests (D4): allow-list shape/uniqueness/parity
// between the canonical SERVER list and the GENERATED client artifact, the
// validator used by the build script, and the Phase-6 category metadata pins
// (Unicode groups) + source reproducibility.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	AVATAR_EMOJIS as SERVER_LIST,
	AVATAR_GROUPS,
	isValidAvatarEmoji
} from '../../src/server/data/avatar-emojis';
import { AVATAR_EMOJIS as CLIENT_LIST } from '../../src/lib/shared/config/avatar-emojis.generated';
import { renderAvatarArtifact, validateAvatarList } from '../../scripts/build-avatar-list';
import {
	AVATAR_SOURCE,
	parseAvatarSource,
	renderCanonicalAvatarModule
} from '../../scripts/import-avatar-data';

const GROUP_COUNTS: Record<string, number> = {
	'Smileys & Emotion': 171,
	'People & Body': 2418,
	'Animals & Nature': 160,
	'Food & Drink': 131,
	'Travel & Places': 219,
	'Activities': 85,
	'Objects': 266,
	'Symbols': 224,
	'Flags': 270
};

describe('avatar allow-list', () => {
	it('has the documented production size (Unicode Emoji 17.0 RGI) and stable shape', () => {
		// Pre-phase-6 production policy: every fully-qualified RGI emoji in
		// Unicode Emoji 17.0 (emoji-test.txt 2025-08-04) = 3,944 entries.
		expect(SERVER_LIST.length).toBe(3944);
		for (const entry of SERVER_LIST) {
			expect(typeof entry.emoji).toBe('string');
			expect(entry.emoji.length).toBeGreaterThan(0);
			expect(typeof entry.label).toBe('string');
			expect(entry.label.length).toBeGreaterThan(0);
			expect(typeof entry.group).toBe('string');
			expect(entry.group.length).toBeGreaterThan(0);
		}
	});

	it('has no duplicate emoji and no duplicate labels (stable ordering source)', () => {
		const emojis = SERVER_LIST.map((e) => e.emoji);
		const labels = SERVER_LIST.map((e) => e.label);
		expect(new Set(emojis).size).toBe(emojis.length);
		expect(new Set(labels).size).toBe(labels.length);
	});

	it('category metadata: exactly 9 Unicode groups in the authoritative file order', () => {
		expect(AVATAR_GROUPS).toEqual([
			'Smileys & Emotion',
			'People & Body',
			'Animals & Nature',
			'Food & Drink',
			'Travel & Places',
			'Activities',
			'Objects',
			'Symbols',
			'Flags'
		]);
	});

	it('category metadata: every entry has a known group and group counts are pinned', () => {
		const counts: Record<string, number> = {};
		for (const entry of SERVER_LIST) {
			expect(AVATAR_GROUPS).toContain(entry.group);
			counts[entry.group] = (counts[entry.group] ?? 0) + 1;
		}
		expect(counts).toEqual(GROUP_COUNTS);
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(3944);
	});

	it('parity: server list and generated client artifact are identical (emoji + label + group + order)', () => {
		expect(CLIENT_LIST).toEqual(SERVER_LIST);
	});

	it('reproducibility: the pinned Unicode source parses to the committed canonical list (emoji + label + order)', () => {
		const source = readFileSync(AVATAR_SOURCE, 'utf8');
		const parsed = parseAvatarSource(source);
		expect(parsed.map((e) => ({ emoji: e.emoji, label: e.label }))).toEqual(
			SERVER_LIST.map((e) => ({ emoji: e.emoji, label: e.label }))
		);
		expect(parsed.map((e) => e.group)).toEqual(SERVER_LIST.map((e) => e.group));
		// The rendered canonical module is deterministic.
		expect(renderCanonicalAvatarModule(parsed, 'deadbeef')).toBe(
			renderCanonicalAvatarModule(parsed, 'deadbeef')
		);
	});

	it('server allow-list validation accepts RGI emoji (incl. gender/skin-tone sequences) and rejects non-RGI forms', () => {
		for (const entry of SERVER_LIST) {
			expect(isValidAvatarEmoji(entry.emoji)).toBe(true);
		}
		// Fully-qualified RGI sequences ARE allowed by the production policy —
		// including standard gender and skin-tone sequences (manifest rule).
		expect(isValidAvatarEmoji('👍🏽')).toBe(true); // thumbs up: medium skin tone
		expect(isValidAvatarEmoji('🧑‍💻')).toBe(true); // technologist (gender-neutral)
		expect(isValidAvatarEmoji('😀')).toBe(true);
		expect(isValidAvatarEmoji('🙂')).toBe(true);
		// Rejected: standalone components, unqualified forms, non-RGI sequences.
		expect(isValidAvatarEmoji('🏽')).toBe(false); // standalone skin-tone component
		expect(isValidAvatarEmoji('©')).toBe(false); // bare copyright, no VS16 (unqualified form)
		expect(isValidAvatarEmoji('🦊🏽')).toBe(false); // non-RGI combination (fox has no skin tones)
		expect(isValidAvatarEmoji('')).toBe(false);
		expect(isValidAvatarEmoji('abc')).toBe(false);
	});

	it('build script validation rejects malformed/duplicate/unknown-group lists and renders deterministically', () => {
		expect(validateAvatarList(SERVER_LIST)).toBe(SERVER_LIST);
		expect(() => validateAvatarList([{ emoji: '', label: 'x', group: 'Symbols' }])).toThrow(
			/missing emoji/
		);
		expect(() => validateAvatarList([{ emoji: '🦊', label: '', group: 'Symbols' }])).toThrow(
			/missing label/
		);
		expect(() => validateAvatarList([{ emoji: '🦊', label: 'Fox', group: '' }])).toThrow(
			/missing group/
		);
		expect(() =>
			validateAvatarList([{ emoji: '🦊', label: 'Fox', group: 'Not A Group' }])
		).toThrow(/unknown group/);
		expect(() =>
			validateAvatarList([
				{ emoji: '🦊', label: 'Fox', group: 'Symbols' },
				{ emoji: '🦊', label: 'Wolf', group: 'Symbols' }
			])
		).toThrow(/duplicate avatar emoji/);
		expect(() =>
			validateAvatarList([
				{ emoji: '🦊', label: 'Fox', group: 'Symbols' },
				{ emoji: '🐺', label: 'Fox', group: 'Symbols' }
			])
		).toThrow(/duplicate avatar label/);

		const rendered = renderAvatarArtifact(SERVER_LIST);
		expect(rendered).toContain('DO NOT HAND-EDIT');
		// The artifact serializes the exact committed set (incl. group metadata).
		for (const entry of SERVER_LIST.slice(0, 3)) {
			expect(rendered).toContain(entry.emoji);
			expect(rendered).toContain(entry.label);
			expect(rendered).toContain(entry.group);
		}
		expect(renderAvatarArtifact(SERVER_LIST)).toBe(rendered); // deterministic
	});
});
