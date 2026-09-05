// Phase-2 avatar pipeline tests (D4): allow-list shape/uniqueness/parity
// between the canonical SERVER list and the GENERATED client artifact, plus
// the validator used by the build script.
import { describe, expect, it } from 'vitest';
import { AVATAR_EMOJIS as SERVER_LIST, isValidAvatarEmoji } from '../../src/server/data/avatar-emojis';
import { AVATAR_EMOJIS as CLIENT_LIST } from '../../src/lib/shared/config/avatar-emojis.generated';
import { renderAvatarArtifact, validateAvatarList } from '../../scripts/build-avatar-list';

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
		}
	});

	it('has no duplicate emoji and no duplicate labels (stable ordering source)', () => {
		const emojis = SERVER_LIST.map((e) => e.emoji);
		const labels = SERVER_LIST.map((e) => e.label);
		expect(new Set(emojis).size).toBe(emojis.length);
		expect(new Set(labels).size).toBe(labels.length);
	});

	it('parity: server list and generated client artifact are identical (emoji + label + order)', () => {
		expect(CLIENT_LIST).toEqual(SERVER_LIST);
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

	it('build script validation rejects malformed/duplicate lists and renders deterministically', () => {
		expect(validateAvatarList(SERVER_LIST)).toBe(SERVER_LIST);
		expect(() => validateAvatarList([{ emoji: '', label: 'x' }])).toThrow(/missing emoji/);
		expect(() => validateAvatarList([{ emoji: '🦊', label: '' }])).toThrow(/missing label/);
		expect(() =>
			validateAvatarList([
				{ emoji: '🦊', label: 'Fox' },
				{ emoji: '🦊', label: 'Wolf' }
			])
		).toThrow(/duplicate avatar emoji/);
		expect(() =>
			validateAvatarList([
				{ emoji: '🦊', label: 'Fox' },
				{ emoji: '🐺', label: 'Fox' }
			])
		).toThrow(/duplicate avatar label/);

		const rendered = renderAvatarArtifact(SERVER_LIST);
		expect(rendered).toContain('DO NOT HAND-EDIT');
		// The artifact serializes the exact committed set.
		for (const entry of SERVER_LIST.slice(0, 3)) {
			expect(rendered).toContain(entry.emoji);
			expect(rendered).toContain(entry.label);
		}
		expect(renderAvatarArtifact(SERVER_LIST)).toBe(rendered); // deterministic
	});
});