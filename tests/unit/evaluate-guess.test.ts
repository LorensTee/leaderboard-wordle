// Phase-1 TDD: pure Wordle guess evaluation — exhaustive duplicate-letter
// semantics (Architecture §1419: "evaluateGuess() — Wordle duplicate-letter
// evaluator (exhaustive tests)"; invariant §6.4: no naive includes()-only
// algorithm; correct-position match consumes the available letter before
// yellow matching).
import { describe, expect, it } from 'vitest';
import {
	evaluateGuess,
	GUESS_LENGTH,
	MAX_GUESSES,
	normalizeWord,
	isValidWord
} from '../../src/server/game/evaluate';

describe('evaluateGuess', () => {
	it('exact match → every tile green', () => {
		expect(evaluateGuess('candy', 'candy')).toEqual([
			{ letter: 'c', status: 'green' },
			{ letter: 'a', status: 'green' },
			{ letter: 'n', status: 'green' },
			{ letter: 'd', status: 'green' },
			{ letter: 'y', status: 'green' }
		]);
	});

	it('all letters absent → every tile gray', () => {
		// 'tiger' shares no letter with 'candy'.
		expect(evaluateGuess('candy', 'tiger')).toEqual([
			{ letter: 't', status: 'gray' },
			{ letter: 'i', status: 'gray' },
			{ letter: 'g', status: 'gray' },
			{ letter: 'e', status: 'gray' },
			{ letter: 'r', status: 'gray' }
		]);
	});

	it('mixed green/yellow/gray', () => {
		// answer candy, guess cgany:
		// c==c green; g absent gray; a present elsewhere yellow; n yellow; y green.
		expect(evaluateGuess('candy', 'cgany')).toEqual([
			{ letter: 'c', status: 'green' },
			{ letter: 'g', status: 'gray' },
			{ letter: 'a', status: 'yellow' },
			{ letter: 'n', status: 'yellow' },
			{ letter: 'y', status: 'green' }
		]);
	});

	it('guessed letter repeated but answer has fewer occurrences → only one yellow, rest gray', () => {
		// answer has one 'a' at position 1 (march); guess 'axaaa' puts a's at
		// positions 0, 2, 3, 4 — none in the answer's 'a' position, so only the
		// first 'a' can be yellow; the rest must be gray.
		expect(evaluateGuess('march', 'axaaa')).toEqual([
			{ letter: 'a', status: 'yellow' },
			{ letter: 'x', status: 'gray' },
			{ letter: 'a', status: 'gray' },
			{ letter: 'a', status: 'gray' },
			{ letter: 'a', status: 'gray' }
		]);
	});

	it('answer repeats a letter and the guess distributes it differently (classic abbey/babes)', () => {
		// b at guess position 2 is a green match (consumes one 'b'); the guess
		// position 0 'b' can only be yellow against the remaining 'b'.
		expect(evaluateGuess('abbey', 'babes')).toEqual([
			{ letter: 'b', status: 'yellow' },
			{ letter: 'a', status: 'yellow' },
			{ letter: 'b', status: 'green' },
			{ letter: 'e', status: 'green' },
			{ letter: 's', status: 'gray' }
		]);
	});

	it('correct-position matches consume the letter before yellow matching', () => {
		// answer candy; guess ccccc: position 0 'c' is green and consumes the
		// only 'c' → positions 1–4 must be gray (NOT yellow).
		expect(evaluateGuess('candy', 'ccccc')).toEqual([
			{ letter: 'c', status: 'green' },
			{ letter: 'c', status: 'gray' },
			{ letter: 'c', status: 'gray' },
			{ letter: 'c', status: 'gray' },
			{ letter: 'c', status: 'gray' }
		]);
	});

	it('answer has two of a letter, guess has two in wrong positions → both yellow', () => {
		// answer 'llama' has two 'l' (positions 0,1); guess 'lxxll'?? — use
		// answer 'llama', guess 'allay': a? no: answer l,l,a,m,a; guess a,l,l,a,y:
		// pos0 a vs l: yellow candidate; pos1 l vs l: GREEN? no wait…
		// Use a cleaner vector: answer 'llama', guess 'lalax':
		// pos0 l green (consumes one l); pos1 a yellow; pos2 l yellow (second l
		// still available); pos3 a — remaining a count after pos1 yellow = 1 →
		// yellow; pos4 x gray. Expected: [green, yellow, yellow, yellow, gray].
		expect(evaluateGuess('llama', 'lalax')).toEqual([
			{ letter: 'l', status: 'green' },
			{ letter: 'a', status: 'yellow' },
			{ letter: 'l', status: 'yellow' },
			{ letter: 'a', status: 'yellow' },
			{ letter: 'x', status: 'gray' }
		]);
	});
});

describe('normalizeWord', () => {
	it('lowercases and trims input', () => {
		expect(normalizeWord('  LIGHT ')).toBe('light');
		expect(normalizeWord('River')).toBe('river');
	});
});

describe('word shape rules', () => {
	it('rejects anything that is not exactly 5 lowercase letters', () => {
		expect(isValidWord('light')).toBe(true);
		expect(isValidWord('Light')).toBe(false);
		expect(isValidWord('lights')).toBe(false);
		expect(isValidWord('four')).toBe(false);
		expect(isValidWord('')).toBe(false);
		expect(isValidWord('l1ght')).toBe(false);
		expect(isValidWord('light ')).toBe(false);
	});

	it('exposes the game constants used by guess-number validation', () => {
		expect(GUESS_LENGTH).toBe(5);
		expect(MAX_GUESSES).toBe(6);
	});
});