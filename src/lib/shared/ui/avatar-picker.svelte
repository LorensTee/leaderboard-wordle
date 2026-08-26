<script lang="ts">
	// Curated avatar picker (D4) — grid of 48px+ keyboard-native buttons with
	// a11y labels, shared by onboarding (required) and profile (optional edit).
	// Selection is LOCAL state until the form submits; the server allow-list
	// is authoritative (Spec §15: the client picker is not trusted).
	import { AVATAR_EMOJIS } from '$lib/shared/config/avatar-emojis.generated';
	import { Check } from '@lucide/svelte';

	let {
		value,
		onselect,
		id
	}: {
		/** Currently selected emoji ('' = nothing selected). */
		value: string;
		onselect: (emoji: string) => void;
		/** Optional id for the group label association. */
		id?: string;
	} = $props();
</script>

<div
	class="grid grid-cols-6 gap-2 sm:grid-cols-8"
	role="group"
	aria-label="Choose an avatar"
	{id}
>
	{#each AVATAR_EMOJIS as avatar (avatar.emoji)}
		<button
			type="button"
			onclick={() => onselect(avatar.emoji)}
			aria-label="{avatar.label} avatar"
			aria-pressed={value === avatar.emoji}
			title={avatar.label}
			class={[
				'relative grid size-12 place-items-center rounded-xl border text-2xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tile-green',
				value === avatar.emoji
					? 'border-tile-green bg-tile-green/15'
					: 'border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10'
			].join(' ')}
		>
			<span aria-hidden="true">{avatar.emoji}</span>
			{#if value === avatar.emoji}
				<span
					class="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-tile-green text-white"
					aria-hidden="true"
				>
					<Check size={12} stroke-width={3} />
				</span>
			{/if}
		</button>
	{/each}
</div>