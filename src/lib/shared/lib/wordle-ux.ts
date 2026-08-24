// Client-side Wordle UX helpers — strictly a UX optimization (Architecture
// §Valid-guess dictionary: the server re-validates every guess; these helpers
// never contain or expose the answer).
import validGuesses from '$lib/shared/data/valid-guesses.json';
import type { GuessFeedback } from '$server/game/evaluate';

/** Board dimensions mirrored from the server's game rules (parity-tested). */
export const BOARD_ROWS = 6;
export const BOARD_COLS = 5;

/** The public valid-guess list as a lookup set (client-side UX only). */
export const VALID_GUESS_SET: ReadonlySet<string> = new Set(validGuesses as string[]);

export type KeyState = 'green' | 'yellow' | 'gray' | 'unused';

/**
 * Best-known keyboard state derived from server-confirmed feedback.
 * Ranking per letter: green > yellow > gray > unused.
 */
export function computeKeyStates(guesses: { feedback: GuessFeedback }[]): Map<string, KeyState> {
	const rank: Record<KeyState, number> = { green: 3, yellow: 2, gray: 1, unused: 0 };
	const states = new Map<string, KeyState>();
	for (const guess of guesses) {
		for (const tile of guess.feedback) {
			const current = states.get(tile.letter) ?? 'unused';
			if (rank[tile.status] > rank[current]) states.set(tile.letter, tile.status);
		}
	}
	return states;
}

/** Client-side word check (UX only — the server rejects invalid words anyway). */
export function isValidGuessWord(word: string): boolean {
	return VALID_GUESS_SET.has(word);
}