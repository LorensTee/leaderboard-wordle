// Phase-1 game domain — pure, deterministic Wordle evaluation (server-side
// authority, Architecture §1419 / invariant §6.4). This module has NO
// database or network dependencies so it is fully unit-testable.
//
// Semantics (standard Wordle duplicate-letter rules):
//   1. correct-position matches are green and CONSUME one occurrence of the
//      letter from the answer;
//   2. remaining letters are yellow only while an unconsumed occurrence of
//      that letter remains in the answer, else gray.
// A naive includes()-only algorithm is forbidden — it mis-evaluates both
// repeated guesses and repeated answers (tested exhaustively).
export const GUESS_LENGTH = 5;
export const MAX_GUESSES = 6;

export type TileStatus = 'green' | 'yellow' | 'gray';

export type GuessTile = {
	letter: string;
	status: TileStatus;
};

/** Feedback for one submitted guess: one tile per letter position. */
export type GuessFeedback = GuessTile[];

/** Lowercase + trim — the canonical input form before validation. */
export function normalizeWord(input: string): string {
	return input.trim().toLowerCase();
}

/** Shape check only (server dictionary membership is a separate concern). */
export function isValidWord(word: string): boolean {
	return /^[a-z]{5}$/.test(word);
}

/**
 * Evaluate a guess against the answer (both lowercase 5-letter words).
 * Pure and deterministic. Correct-position matches consume the available
 * letter before yellow matching; a guess letter repeated more times than the
 * answer contains is gray beyond the available count.
 */
export function evaluateGuess(answer: string, guess: string): GuessFeedback {
	const feedback: GuessFeedback = new Array(guess.length);
	// Remaining (unconsumed) occurrences per letter, seeded from the answer.
	const remaining = new Map<string, number>();
	for (const letter of answer) {
		remaining.set(letter, (remaining.get(letter) ?? 0) + 1);
	}

	// Pass 1 — greens (exact positions). These consume answer occurrences
	// first, so they can never be double-counted as yellows.
	for (let i = 0; i < guess.length; i++) {
		if (guess[i] === answer[i]) {
			feedback[i] = { letter: guess[i], status: 'green' };
			remaining.set(guess[i], (remaining.get(guess[i]) ?? 0) - 1);
		}
	}

	// Pass 2 — yellows then grays for every non-green position.
	for (let i = 0; i < guess.length; i++) {
		if (feedback[i]) continue;
		const letter = guess[i];
		const count = remaining.get(letter) ?? 0;
		if (count > 0) {
			feedback[i] = { letter, status: 'yellow' };
			remaining.set(letter, count - 1);
		} else {
			feedback[i] = { letter, status: 'gray' };
		}
	}
	return feedback;
}