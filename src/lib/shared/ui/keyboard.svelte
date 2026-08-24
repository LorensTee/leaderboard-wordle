<script lang="ts">
	// In-app QWERTY keyboard for all devices + physical-keyboard handling on
	// desktop ($app/browser check). Touch-friendly: no text selection, no
	// double-tap zoom, ≥44px targets. Keyboard state colors are derived from
	// server-confirmed feedback only.
	import { browser } from '$app/environment';
	import { Delete, CornerDownLeft } from '@lucide/svelte';
	import type { KeyState } from '$lib/shared/lib/wordle-ux';

	let {
		keyStates = new Map<string, KeyState>(),
		disabled = false,
		onKey,
		onEnter,
		onBackspace
	}: {
		keyStates?: Map<string, KeyState>;
		disabled?: boolean;
		onKey: (letter: string) => void;
		onEnter: () => void;
		onBackspace: () => void;
	} = $props();

	$effect(() => {
		if (!browser) return;
		function onKeyDown(event: KeyboardEvent) {
			if (disabled) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const key = event.key;
			if (/^[a-zA-Z]$/.test(key)) {
				event.preventDefault();
				onKey(key.toLowerCase());
			} else if (key === 'Enter') {
				event.preventDefault();
				onEnter();
			} else if (key === 'Backspace') {
				event.preventDefault();
				onBackspace();
			}
		}
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});

	const rows = $derived([
		['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
		['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
		['z', 'x', 'c', 'v', 'b', 'n', 'm']
	]);

	function keyClass(letter: string): string {
		const state = keyStates.get(letter);
		if (state === 'green') return 'bg-tile-green text-white';
		if (state === 'yellow') return 'bg-tile-yellow text-white';
		if (state === 'gray') return 'bg-tile-gray/60 text-white';
		return 'bg-key-bg text-key-fg dark:bg-white/15 dark:text-white';
	}
</script>

<div
	class="mx-auto flex w-full max-w-105 flex-col gap-1.5"
	role="group"
	aria-label="Keyboard"
	aria-disabled={disabled}
>
	{#each rows as row, rowIndex (rowIndex)}
		<div class="flex justify-center gap-1.5">
			{#if rowIndex === 2}
				<button
					type="button"
					class="key-button flex h-14 flex-[1.5] items-center justify-center rounded-md bg-key-bg text-key-fg dark:bg-white/15 dark:text-white"
					onclick={onEnter}
					disabled={disabled}
					aria-label="Enter"
				>
					<CornerDownLeft size={18} aria-hidden="true" />
				</button>
			{/if}
			{#each row as letter (letter)}
				<button
					type="button"
					class="key-button flex h-14 flex-1 max-w-11 items-center justify-center rounded-md text-base font-bold uppercase {keyClass(letter)}"
					onclick={() => onKey(letter)}
					disabled={disabled}
					aria-label={`Letter ${letter}`}
					tabindex="-1"
				>
					{letter}
				</button>
			{/each}
			{#if rowIndex === 2}
				<button
					type="button"
					class="key-button flex h-14 flex-[1.5] items-center justify-center rounded-md bg-key-bg text-key-fg dark:bg-white/15 dark:text-white"
					onclick={onBackspace}
					disabled={disabled}
					aria-label="Backspace"
				>
					<Delete size={18} aria-hidden="true" />
				</button>
			{/if}
		</div>
	{/each}
</div>