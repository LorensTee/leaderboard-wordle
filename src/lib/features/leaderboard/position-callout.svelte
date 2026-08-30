<script lang="ts">
	// Phase-3 viewer position callout (plan §9.1/§9.2/§9.3, D13/D14) — the
	// shared "your position" block used by BOTH /leaderboard (pinned callout
	// when the viewer is completed/qualified but outside the dense cutoff)
	// and /play (terminal result block; hide silently on fetch failure /
	// unranked — the caller just does not render us).
	//
	// Shows the heading + the viewer's own rank row (rank-row reuse) + an
	// optional note and an optional action slot ("View leaderboard").
	import type { Snippet } from 'svelte';
	import RankRow, { type Props as RankRowProps } from './rank-row.svelte';

	let {
		entry,
		heading,
		note,
		actions
	}: {
		entry: RankRowProps['entry'];
		heading: string;
		note?: string;
		actions?: Snippet;
	} = $props();
</script>

<div
	class="rounded-xl border border-black/10 bg-black/[0.03] p-2.5 dark:border-white/15 dark:bg-white/[0.06]"
	role="status"
>
	<p class="px-1 pb-1 text-sm font-semibold text-black dark:text-white">{heading}</p>
	<RankRow {entry} />
	{#if note}
		<p class="px-1 pt-1.5 text-xs text-black/55 dark:text-white/55">{note}</p>
	{/if}
	{#if actions}
		<div class="mt-2 px-1" data-slot="position-callout-actions">
			{@render actions()}
		</div>
	{/if}
</div>