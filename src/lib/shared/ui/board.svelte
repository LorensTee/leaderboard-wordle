<script lang="ts">
	// The 6×5 board. Server-confirmed guesses render with feedback; the
	// in-progress row renders the current input; empty rows stay dashed.
	// Answer data can never reach this component (it renders only the
	// answer-free SafeGameState). Dimensions come from the client-safe
	// shared config (parity with the server rules is unit-tested).
	import Tile from './tile.svelte';
	import { BOARD_COLS, BOARD_ROWS } from '$lib/shared/lib/wordle-ux';
	import type { SafeGuess } from '$server/game/service';

	let {
		guesses,
		currentInput = '',
		pending = false,
		lastSubmittedIndex = -1,
		id = 'board'
	}: {
		guesses: SafeGuess[];
		currentInput?: string;
		pending?: boolean;
		lastSubmittedIndex?: number;
		id?: string;
	} = $props();

	// 6 rows × 5 tiles as { letter, state, reveal } tuples.
	type Row = { letter: string; state: 'empty' | 'tbd' | 'green' | 'yellow' | 'gray'; revealDelay: number };
	const rows: Row[][] = $derived.by(() => {
		const out: Row[][] = [];
		for (let r = 0; r < BOARD_ROWS; r++) {
			const row: Row[] = [];
			if (r < guesses.length) {
				const guess = guesses[r];
				for (let c = 0; c < BOARD_COLS; c++) {
					row.push({
						letter: guess.word[c] ?? '',
						state: guess.feedback[c]?.status ?? 'empty',
						// Stagger the flip only on the row that was just submitted.
						revealDelay: r === lastSubmittedIndex ? c * 90 : 0
					});
				}
			} else if (r === guesses.length) {
				for (let c = 0; c < BOARD_COLS; c++) {
					row.push({ letter: currentInput[c] ?? '', state: 'tbd', revealDelay: 0 });
				}
			} else {
				for (let c = 0; c < BOARD_COLS; c++) {
					row.push({ letter: '', state: 'empty', revealDelay: 0 });
				}
			}
			out.push(row);
		}
		return out;
	});
</script>

<div
	{id}
	class="mx-auto grid w-full max-w-105 grid-rows-6 gap-1.5"
	role="grid"
	aria-label="Wordle board"
	aria-busy={pending}
>
	{#each rows as row, r (r)}
		<div class="grid grid-cols-5 gap-1.5" role="row" aria-rowindex={r + 1}>
			{#each row as tile, c (c)}
				<Tile
					letter={tile.letter}
					state={tile.state}
					revealDelayMs={tile.revealDelay}
					colIndex={c + 1}
				/>
			{/each}
		</div>
	{/each}
</div>