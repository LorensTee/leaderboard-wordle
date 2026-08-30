<script lang="ts">
	// Phase-3 leaderboard rank row (plan §9.1/§9.3, D14) — shared by the
	// /leaderboard list AND the position callout (real reuse). Displays ONLY
	// server-owned values; the UI never computes ranks or periods.
	//
	// - dense rank numeral (restrained crown/medal accent for #1–3)
	// - avatar + display name (user.name)
	// - Today/Yesterday: formatDuration + N/6 guesses
	// - Week/Month: formatDuration(average) + avg guesses (2dp) + N days chip
	// - current user: accent ring + "You" badge (`['me']` id decides)
	import { formatDuration } from '$lib/shared/lib/format-duration';
	import { formatAverageGuesses } from '$lib/shared/lib/leaderboard-format';
	import type {
		LeaderboardEntry,
		MultiDayLeaderboardEntry,
		SingleDayLeaderboardEntry
	} from '$server/leaderboard/service';

	export type Props = {
		entry: LeaderboardEntry;
		isCurrentUser?: boolean;
	};

	let { entry, isCurrentUser = false }: Props = $props();

	// Dense-rank numeral accent: restrained medal tint for #1–3 only.
	const rankClass = $derived(
		entry.rank === 1
			? 'text-[#b8860b] dark:text-[#e6c26b]'
			: entry.rank === 2
				? 'text-[#8b929a] dark:text-[#c9d1d9]'
				: entry.rank === 3
					? 'text-[#a05a2c] dark:text-[#d08a5e]'
					: 'text-black/60 dark:text-white/60'
	);

	const rowClass = $derived(
		[
			'flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5',
			'ring-1 ring-transparent',
			isCurrentUser
				? 'bg-tile-green/10 ring-tile-green/40 dark:bg-tile-green/15 dark:ring-tile-green/50'
				: 'hover:bg-black/5 dark:hover:bg-white/5'
		].join(' ')
	);
</script>

<div class={rowClass} data-current-user={isCurrentUser || undefined} role="row">
	<!-- Rank numeral (dense; ties share the number). -->
	<span
		class={`w-7 shrink-0 text-right font-bold tabular-nums ${rankClass}`}
		aria-label={`Rank ${entry.rank}`}
	>
		{entry.rank}
	</span>

	<!-- Avatar + display name (name is server-owned display data). -->
	<span
		class="grid size-9 shrink-0 place-items-center rounded-full bg-black/5 text-lg dark:bg-white/10"
		aria-hidden="true"
	>
		{entry.avatarEmoji}
	</span>
	<span class="min-w-0 flex-1 truncate text-sm font-medium text-black dark:text-white">
		{entry.displayName}
		{#if isCurrentUser}
			<span
				class="ml-1.5 rounded-full bg-tile-green px-1.5 py-0.5 text-[11px] font-bold text-white"
			>
				You
			</span>
		{/if}
	</span>

	<!-- Values — discriminated server shapes. -->
	{#if 'averageTimeMs' in entry}
		{@const md = entry as MultiDayLeaderboardEntry}
		<span class="flex shrink-0 items-center gap-1.5 text-sm text-black/60 dark:text-white/60">
			<span class="font-semibold tabular-nums">{formatDuration(md.averageTimeMs)}</span>
			<span class="tabular-nums" aria-label="Average guesses">{formatAverageGuesses(md.averageGuesses)}</span>
			<span
				class="rounded-full border border-black/10 px-1.5 py-0.5 text-[11px] font-medium text-black/50 dark:border-white/15 dark:text-white/50"
				aria-label="Completed days"
			>
				{md.completedDays} {md.completedDays === 1 ? 'day' : 'days'}
			</span>
		</span>
	{:else}
		{@const sd = entry as SingleDayLeaderboardEntry}
		<span class="flex shrink-0 items-center gap-1.5 text-sm text-black/60 dark:text-white/60">
			<span class="font-semibold tabular-nums">{formatDuration(sd.completionTimeMs)}</span>
			<span class="tabular-nums" aria-label="Guesses">{sd.guessCount}/6</span>
		</span>
	{/if}
</div>