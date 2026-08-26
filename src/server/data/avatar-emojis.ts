// Canonical curated avatar allow-list (Phase-2 D4 / Spec §15). SERVER-OWNED
// authoritative data; the client picker uses the GENERATED twin
// (`src/lib/shared/config/avatar-emojis.generated.ts`, built by
// `bun run avatar-list` — never hand-edit the generated file).
//
// Chosen set (D4 reproducibility — documented in docs/contradictions-and-gaps.md):
// 24 entries, stable order, no skin-tone modifier sequences (cross-platform
// rendering consistency), friendly creature/animal glyphs fitting a private
// friend-group speedrun product. Tuning is allowed; an undocumented set is not.
export type AvatarEmoji = {
	/** The stored value: the Unicode emoji string (DB stores this only). */
	emoji: string;
	/** Accessibility label shown to screen readers and as tooltip. */
	label: string;
};

export const AVATAR_EMOJIS: readonly AvatarEmoji[] = [
	{ emoji: '🦊', label: 'Fox' },
	{ emoji: '🐺', label: 'Wolf' },
	{ emoji: '🐼', label: 'Panda' },
	{ emoji: '🐸', label: 'Frog' },
	{ emoji: '🦉', label: 'Owl' },
	{ emoji: '🐨', label: 'Koala' },
	{ emoji: '🦁', label: 'Lion' },
	{ emoji: '🐯', label: 'Tiger' },
	{ emoji: '🐷', label: 'Pig' },
	{ emoji: '🐵', label: 'Monkey' },
	{ emoji: '🐙', label: 'Octopus' },
	{ emoji: '🦄', label: 'Unicorn' },
	{ emoji: '🐲', label: 'Dragon' },
	{ emoji: '🦖', label: 'T-Rex' },
	{ emoji: '🐢', label: 'Turtle' },
	{ emoji: '🦈', label: 'Shark' },
	{ emoji: '🐬', label: 'Dolphin' },
	{ emoji: '🐝', label: 'Bee' },
	{ emoji: '🦋', label: 'Butterfly' },
	{ emoji: '🐞', label: 'Ladybug' },
	{ emoji: '🦀', label: 'Crab' },
	{ emoji: '🐧', label: 'Penguin' },
	{ emoji: '🦭', label: 'Seal' },
	{ emoji: '🐹', label: 'Hamster' }
] as const;

/** Server-side allow-list check (D4): emoji must be in the curated set. */
export function isValidAvatarEmoji(emoji: string): boolean {
	return AVATAR_EMOJIS.some((entry) => entry.emoji === emoji);
}