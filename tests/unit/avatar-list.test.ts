// Phase-2 avatar pipeline tests (D4): allow-list shape/uniqueness/parity
// between the canonical SERVER list and the GENERATED client artifact, plus
// the validator used by the build script.
import { describe, expect, it } from 'vitest';
import { AVATAR_EMOJIS as SERVER_LIST, isValidAvatarEmoji } from '../../src/server/data/avatar-emojis';
import { AVATAR_EMOJIS as CLIENT_LIST } from '../../src/lib/shared/config/avatar-emojis.generated';
import { renderAvatarArtifact, validateAvatarList } from '../../scripts/build-avatar-list';

describe('avatar allow-list', () => {
	it('has the documented curated size and stable shape', () => {
		expect(SERVER_LIST.length).toBeGreaterThanOrEqual(20);
		expect(SERVER_LIST.length).toBeLessThanOrEqual(30);
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

	it('server allow-list validation accepts curated entries and rejects everything else', () => {
		for (const entry of SERVER_LIST) {
			expect(isValidAvatarEmoji(entry.emoji)).toBe(true);
		}
		expect(isValidAvatarEmoji('🙂')).toBe(false); // default fallback is NOT in the set
		expect(isValidAvatarEmoji('😀')).toBe(false);
		expect(isValidAvatarEmoji('')).toBe(false);
		expect(isValidAvatarEmoji('🦊🏽')).toBe(false); // skin-tone sequence not allowed
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