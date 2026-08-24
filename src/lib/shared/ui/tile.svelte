<script lang="ts">
	// One board tile. States:
	//   empty  – no letter yet (dashed border)
	//   tbd    – typed, awaiting submission
	//   green/yellow/gray – server-confirmed feedback (flips in on reveal)
	// `revealDelayMs` staggers the CSS flip for submitted rows.
	type TileState = 'empty' | 'tbd' | 'green' | 'yellow' | 'gray';

	let {
		letter = '',
		state = 'empty',
		revealDelayMs = 0,
		colIndex = 1
	}: {
		letter?: string;
		state?: TileState;
		revealDelayMs?: number;
		colIndex?: number;
	} = $props();

	const stateClass = $derived(
		state === 'green'
			? 'bg-tile-green text-white'
			: state === 'yellow'
				? // Dark letters on the classic yellow: white on #c9b458 is only
					// ~2.1:1, dark text reaches ~8.4:1 (tile color keeps its hue).
					'bg-tile-yellow text-key-fg'
				: state === 'gray'
					? 'bg-tile-gray text-white'
					: state === 'tbd'
						? 'border-2 border-black/50 dark:border-white/50 text-[color:inherit]'
						: 'border-2 border-tile-empty-border dark:border-white/15'
	);
</script>

<div
	class="flex aspect-square w-full items-center justify-center rounded-sm text-2xl font-bold uppercase {stateClass}"
	class:revealed={state === 'green' || state === 'yellow' || state === 'gray'}
	class:pop={state === 'tbd' && letter !== ''}
	style:animation-delay={revealDelayMs > 0 ? `${revealDelayMs}ms` : undefined}
	style:animation-fill-mode={revealDelayMs > 0 ? 'backwards' : undefined}
	role="gridcell"
	aria-colindex={colIndex}
	aria-label={letter ? `${letter.toUpperCase()}${state !== 'tbd' && state !== 'empty' ? ` — ${state}` : ''}` : 'Empty tile'}
>
	{#if letter}
		<span class="translate-y-[0.02em]">{letter}</span>
	{/if}
</div>

<style>
	/* Flip reveal for submitted rows: rotateX with the color staged at the
	   90° midpoint (delay set per tile for the stagger). Trivial transition —
	   CSS, per Architecture (Anime.js reserved for coordinated sequences). */
	.revealed {
		animation:
			tile-flip 0.5s ease-in-out,
			tile-color 0.5s ease-in-out;
	}

	@keyframes tile-flip {
		0% {
			transform: rotateX(0deg);
		}
		50% {
			transform: rotateX(90deg);
		}
		100% {
			transform: rotateX(0deg);
		}
	}
</style>