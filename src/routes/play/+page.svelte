<script lang="ts">
	// The daily puzzle game page. Server state via TanStack Query (current
	// game / start / guess mutations); ephemeral UI state (current input,
	// shake, celebration) stays local. The answer never appears in any
	// response we render — the board draws only SafeGameState.
	import { createMutation, createQuery } from '@tanstack/svelte-query';
	import { animate, stagger } from 'animejs';
	import { toast } from 'svelte-sonner';
	import { RefreshCw } from '@lucide/svelte';
	import Board from '$lib/shared/ui/board.svelte';
	import Keyboard from '$lib/shared/ui/keyboard.svelte';
	import Timer from '$lib/shared/ui/timer.svelte';
	import { gameApi } from '$lib/shared/api/game';
	import { ApiError } from '$lib/shared/api/client';
	import { queryClient } from '$lib/app/query-client';
	import { BOARD_COLS, computeKeyStates, isValidGuessWord } from '$lib/shared/lib/wordle-ux';
	import { formatDuration } from '$lib/shared/lib/format-duration';

	const CURRENT_GAME_KEY = ['game', 'current'] as const;

	let currentInput = $state('');
	let expired = $state(false);
	let lastSubmittedIndex = $state(-1);

	const currentQuery = createQuery(() => ({
		queryKey: CURRENT_GAME_KEY,
		queryFn: () => gameApi.getCurrentGame()
	}));

	const startMutation = createMutation(() => ({
		mutationFn: () => gameApi.startGame(),
		onSuccess: (data) => {
			queryClient.setQueryData([...CURRENT_GAME_KEY], { game: data.game });
			currentInput = '';
		},
		onError: (err) => {
			toast.error(err instanceof ApiError ? err.message : 'Starting the game failed.');
		}
	}));

	const guessMutation = createMutation(() => ({
		mutationFn: (vars: { gameId: string; word: string }) =>
			gameApi.submitGuess(vars.gameId, vars.word),
		onSuccess: (outcome) => {
			queryClient.setQueryData([...CURRENT_GAME_KEY], { game: outcome.game });
			currentInput = '';
			lastSubmittedIndex = outcome.guess.guessNumber - 1;
			if (outcome.terminal && outcome.solved) celebrate(outcome.guess.guessNumber - 1);
		},
		onError: (err) => {
			if (err instanceof ApiError && err.code === 'GAME_EXPIRED') {
				expired = true;
				toast.error(err.message);
			} else if (err instanceof ApiError && err.code === 'INVALID_WORD') {
				toast.error(err.message);
			} else {
				toast.error(err instanceof ApiError ? err.message : 'Submitting the guess failed.');
			}
		}
	}));

	const editing = $derived(
		!currentQuery.isPending &&
			!guessMutation.isPending &&
			!startMutation.isPending &&
			!expired &&
			currentQuery.data?.game?.status === 'ACTIVE'
	);

	function shake() {
		// Invalid input: CSS shake on the board (trivial transition → CSS).
		const board = document.getElementById('board');
		if (!board) return;
		board.classList.remove('shake');
		void board.offsetWidth; // restart the animation
		board.classList.add('shake');
	}

	function celebrate(rowIndex: number) {
		// Restrained success: pop the solved row, ease the board (Anime.js
		// coordinated sequence — the flip itself stays CSS).
		animate(`#board [role="row"]:nth-child(${rowIndex + 1}) .revealed`, {
			scale: [0.9, 1.05, 1],
			duration: 500,
			delay: stagger(60),
			easing: 'easeOutQuad'
		});
		animate('#board', { translateY: [0, -6, 0], duration: 450, easing: 'easeInOutQuad' });
	}

	function handleKey(letter: string) {
		if (!editing || currentInput.length >= BOARD_COLS) return;
		currentInput += letter;
	}

	function handleBackspace() {
		if (!editing || currentInput.length === 0) return;
		currentInput = currentInput.slice(0, -1);
	}

	function handleEnter() {
		if (!editing) return;
		const game = currentQuery.data?.game;
		if (!game || game.status !== 'ACTIVE') return;
		if (currentInput.length < BOARD_COLS) {
			shake();
			toast.message('Not enough letters');
			return;
		}
		if (!isValidGuessWord(currentInput)) {
			shake();
			toast.error('Not in the word list');
			return;
		}
		guessMutation.mutate({ gameId: game.id, word: currentInput });
	}

	function handleStart() {
		if (startMutation.isPending) return;
		startMutation.mutate();
	}
</script>

<header class="flex items-center justify-between px-1 py-2">
	{#if currentQuery.data?.game}
		<span class="text-sm font-medium text-black/60 dark:text-white/60">
			{currentQuery.data.game.puzzle.date}
		</span>
		<Timer
			startedAt={currentQuery.data.game.startedAt}
			completionTimeMs={currentQuery.data.game.completionTimeMs}
			status={currentQuery.data.game.status}
		/>
	{/if}
</header>

{#if currentQuery.isPending}
	<div class="flex flex-1 items-center justify-center" aria-busy="true">
		<span class="size-6 animate-spin rounded-full border-2 border-black/20 border-t-black/80 dark:border-white/20 dark:border-t-white"></span>
	</div>
{:else if currentQuery.isError}
	<div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
		<p class="text-sm text-black/60 dark:text-white/60">
			Could not load today&rsquo;s game.
		</p>
		<button
			type="button"
			class="inline-flex h-10 items-center gap-2 rounded-lg bg-key-bg px-4 font-semibold dark:bg-white/15"
			onclick={() => currentQuery.refetch()}
		>
			<RefreshCw size={16} aria-hidden="true" />
			Try again
		</button>
	</div>
{:else if currentQuery.data.game}
	{@const game = currentQuery.data.game}

	{#if game.status === 'ACTIVE' && !expired}
		<div class="mb-1 flex items-center justify-center gap-2 text-sm text-black/60 dark:text-white/60">
			<span class="rounded-full border border-black/10 px-3 py-0.5 dark:border-white/15">
				Hint letter: <span class="font-bold uppercase">{game.puzzle.hintLetter}</span>
			</span>
		</div>
	{/if}

	<div class="flex flex-1 flex-col justify-center">
		<Board
			guesses={game.guesses}
			currentInput={currentInput}
			pending={guessMutation.isPending}
			lastSubmittedIndex={editing ? -1 : lastSubmittedIndex}
		/>
	</div>

	{#if game.status === 'COMPLETED'}
		<p
			class="py-3 text-center text-sm font-semibold text-[#1a7f37] dark:text-[#3fb950]"
			role="status"
		>
			Solved in {game.guessCount}/6 &middot; {game.completionTimeMs !== null ? formatDuration(game.completionTimeMs) : ''}
		</p>
	{:else if game.status === 'FAILED' || expired}
		<p class="py-3 text-center text-sm text-black/60 dark:text-white/60" role="status">
			Out of guesses &mdash; tomorrow&rsquo;s puzzle is waiting.
		</p>
	{:else if game.status === 'FORFEITED'}
		<p class="py-3 text-center text-sm text-black/60 dark:text-white/60" role="status">
			This puzzle ended &mdash; see you tomorrow.
		</p>
	{/if}

	{#if game.status === 'ACTIVE' && !expired}
		<div class="mt-3">
			<Keyboard
				keyStates={computeKeyStates(game.guesses)}
				disabled={!editing}
				onKey={handleKey}
				onEnter={handleEnter}
				onBackspace={handleBackspace}
			/>
		</div>
	{/if}
{:else if currentQuery.data.puzzle}
	<div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
		<p class="text-sm text-black/60 dark:text-white/60">Today&rsquo;s puzzle is ready.</p>
		<button
			type="button"
			class="inline-flex h-11 items-center gap-2 rounded-xl bg-tile-green px-6 font-semibold text-white hover:brightness-105"
			onclick={handleStart}
			disabled={startMutation.isPending}
		>
			{#if startMutation.isPending}
				<span class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true"></span>
				Starting…
			{:else}
				Start
			{/if}
		</button>
	</div>
{:else}
	<div class="flex flex-1 items-center justify-center text-center text-sm text-black/60 dark:text-white/60">
		No puzzle is available today.
	</div>
{/if}