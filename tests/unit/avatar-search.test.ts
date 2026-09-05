// Phase-6 avatar picker — pure search/paging/category logic tests (plan §8.1).
import { describe, expect, it } from 'vitest';
import {
	AVATAR_PAGE_SIZE,
	avatarLabelScore,
	entriesByGroup,
	normalizeAvatarQuery,
	pageEntries,
	searchAvatars
} from '../../src/lib/shared/lib/avatar-search';
import { AVATAR_EMOJIS } from '../../src/lib/shared/config/avatar-emojis.generated';

const fixture = [
	{ emoji: '🦊', label: 'Fox', group: 'Animals & Nature' },
	{ emoji: '🐺', label: 'Wolf', group: 'Animals & Nature' },
	{ emoji: '🦝', label: 'Raccoon', group: 'Animals & Nature' },
	{ emoji: '🍜', label: 'Steaming bowl', group: 'Food & Drink' },
	{ emoji: '🍞', label: 'Bread', group: 'Food & Drink' }
] as const;

describe('avatar search (pure)', () => {
	it('normalizes queries (trim + lowercase) and rejects empty/whitespace', () => {
		expect(normalizeAvatarQuery('  Fox ')).toBe('fox');
		expect(normalizeAvatarQuery('')).toBe('');
		expect(normalizeAvatarQuery('   ')).toBe('');
		expect(searchAvatars(fixture, '')).toEqual([]);
		expect(searchAvatars(fixture, '   ')).toEqual([]);
	});

	it('scores exact > prefix > substring', () => {
		expect(avatarLabelScore({ label: 'Fox' }, 'fox')).toBe(0);
		expect(avatarLabelScore({ label: 'Fox' }, 'fo')).toBe(1);
		expect(avatarLabelScore({ label: 'Fox' }, 'ox')).toBe(2);
		expect(avatarLabelScore({ label: 'Wolf' }, 'fox')).toBe(-1);
		// Case-insensitive.
		expect(avatarLabelScore({ label: 'Fox' }, 'FOX')).toBe(0);
	});

	it('search: exact match first, then prefix, then substring, alphabetical within a tier', () => {
		const withPrefix = [
			{ emoji: 'a', label: 'Fox', group: 'g' },
			{ emoji: 'b', label: 'Fondue', group: 'g' },
			{ emoji: 'c', label: 'Raccoon', group: 'g' },
			{ emoji: 'e', label: 'Before', group: 'g' }
		] as const;
		// 'fo' → prefix tier (Fondue, Fox) alphabetical; 'Before' is substring tier after.
		expect(searchAvatars(withPrefix, 'fo').map((e) => e.label)).toEqual(['Fondue', 'Fox', 'Before']);
		expect(searchAvatars(fixture, 'fox').map((e) => e.emoji)).toEqual(['🦊']);
		// 'raccoon' is not a prefix of anything else; exact-first still holds.
		expect(searchAvatars(fixture, 'raccoon').map((e) => e.emoji)).toEqual(['🦝']);
	});

	it('search: substring matches and case-insensitive partial matching', () => {
		expect(searchAvatars(fixture, 'WOLF').map((e) => e.emoji)).toEqual(['🐺']);
		expect(searchAvatars(fixture, 'wolf').map((e) => e.emoji)).toEqual(['🐺']);
		expect(searchAvatars(fixture, 'ox').map((e) => e.emoji)).toEqual(['🦊']);
		expect(searchAvatars(fixture, 'zzz')).toEqual([]);
	});

	it('search: "heart" over the production set returns label matches deterministically', () => {
		const heart = searchAvatars(AVATAR_EMOJIS, 'heart');
		expect(heart.length).toBeGreaterThan(5);
		// Every result matches case-insensitively and the ordering is deterministic.
		for (const e of heart) expect(e.label.toLowerCase()).toContain('heart');
		expect(searchAvatars(AVATAR_EMOJIS, 'heart')).toEqual(heart);
		// Exact-label match ('Red heart' etc. are not exact for 'heart'; all are
		// prefix/substring — verify prefix tier comes before substring tier).
		const first = heart[0].label.toLowerCase();
		expect(first.startsWith('heart')).toBe(true);
	});

	it('search: "fox" over the production set finds the Fox (exact match first)', () => {
		const fox = searchAvatars(AVATAR_EMOJIS, 'fox');
		expect(fox[0]).toMatchObject({ emoji: '🦊', label: 'Fox' });
	});

	it('groups: deterministic grouping preserving canonical order within each group', () => {
		const grouped = entriesByGroup(fixture);
		expect(grouped.get('Animals & Nature')?.map((e) => e.emoji)).toEqual(['🦊', '🐺', '🦝']);
		expect(grouped.get('Food & Drink')?.map((e) => e.emoji)).toEqual(['🍜', '🍞']);
		// Production set: all 3,944 entries land in exactly the 9 Unicode groups.
		const all = entriesByGroup(AVATAR_EMOJIS);
		expect(all.size).toBe(9);
		const total = [...all.values()].reduce((n, list) => n + list.length, 0);
		expect(total).toBe(3944);
	});

	it('paging: first page only (windowed rendering budget)', () => {
		const list = Array.from({ length: 200 }, (_, i) => i);
		expect(pageEntries(list, AVATAR_PAGE_SIZE)).toEqual(list.slice(0, 96));
		expect(pageEntries(list, AVATAR_PAGE_SIZE).length).toBe(96);
		expect(pageEntries([1, 2], AVATAR_PAGE_SIZE)).toEqual([1, 2]);
	});
});
