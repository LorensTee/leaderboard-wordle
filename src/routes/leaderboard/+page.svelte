<script lang="ts">
	// Leaderboard page (Phase 3) — the four period boards. The server owns
	// ALL aggregation semantics (periods, penalties, qualification); this
	// page only renders server-shaped data (plan §9/D4).
	//
	// - shadcn Tabs (Today default) — local selection state; TanStack keys
	//   `['leaderboard', period]` per tab (shared cache with /play).
	// - rank rows (shared rank-row component), current-user highlight via
	//   the `['me']` cache.
	// - viewer callout: completed/qualified but outside the dense cutoff →
	//   pinned "Your position: #N"; unqualified (week/month) → explanation
	//   using only currentUser.completedDays (no duplicated threshold).
	// - loading (skeleton, aria-busy) / error (retry) / empty per period.
	import { RefreshCw } from '@lucide/svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import PositionCallout from '$lib/features/leaderboard/position-callout.svelte';
	import RankRow from '$lib/features/leaderboard/rank-row.svelte';
	import { positionBlockCopy } from '$lib/features/leaderboard/position-copy';
	import { leaderboardApi, leaderboardKeys } from '$lib/shared/api/leaderboard';
	import { meApi, meKeys } from '$lib/shared/api/me';
	import {
		Tabs,
		TabsContent,
		TabsList,
		TabsTrigger
	} from '$lib/components/ui/tabs';
	import type { LeaderboardPeriod } from '$server/leaderboard/constants';

	type TabId = Extract<LeaderboardPeriod, 'today' | 'yesterday' | 'week' | 'month'>;

	const TAB_ORDER: { id: TabId; label: string }[] = [
		{ id: 'today', label: 'Today' },
		{ id: 'yesterday', label: 'Yesterday' },
		{ id: 'week', label: 'This week' },
		{ id: 'month', label: 'This month' }
	];

	/** Local tab selection — default Today (plan §9.1). */
	let value = $state<TabId>('today');

	// `['me']` — already in the cache via the header flow; shared, no refetch.
	const meQuery = createQuery(() => ({
		queryKey: meKeys.all,
		queryFn: meApi.getMe
	}));

	// Per-period query: key changes with the tab, so switching tabs never
	// refetches a cached period. The /play result block reuses `['leaderboard','today']`.
	const boardQuery = createQuery(() => ({
		queryKey: leaderboardKeys.period(value),
		queryFn: () => leaderboardApi.getBoard(value)
	}));

	const viewerId = $derived(meQuery.data?.id);
	const board = $derived(boardQuery.data);

	/** The viewer is completed/qualified but outside the dense cutoff. */
	const showPositionCallout = $derived(
		Boolean(
			board &&
				viewerId &&
				board.currentUser.entry &&
				!board.entries.some((e) => e.userId === viewerId)
		)
	);
	const viewerEntry = $derived(showPositionCallout ? board?.currentUser.entry ?? null : null);

	/** Week/month only: not yet qualified — explain with server facts only. */
	const showUnqualifiedCallout = $derived(
		Boolean(
			board &&
				(value === 'week' || value === 'month') &&
				board.currentUser.qualified === false
		)
	);

	const completedDays = $derived(board?.currentUser.completedDays ?? 0);
	// Period-aware callout note (F3-2): multi-day boards get the "as the
	// period progresses" copy; the today board keeps the "others finish" note.
	const calloutNote = $derived(
		positionBlockCopy(viewerEntry?.rank ?? null, value)?.note ??
			'Position may change as others finish'
	);
	const emptyCopy = $derived(
		value === 'today'
			? 'No completed results yet today'
			: value === 'yesterday'
				? 'No results yet for yesterday'
				: value === 'week'
					? 'No qualified players this week'
					: 'No qualified players this month'
	);
</script>

<!-- Unqualified explanation (week/month) — server facts only. -->
{#snippet unqualifiedCallout()}
	<div
		class="rounded-xl border border-black/10 bg-black/[0.03] p-3 text-center dark:border-white/15 dark:bg-white/[0.06]"
		role="status"
	>
		<p class="text-sm font-semibold text-black dark:text-white">Not qualified yet</p>
		<p class="mt-1 text-xs text-black/55 dark:text-white/55">
			{#if completedDays === 0}
				You have no completed days this period — play more days to qualify.
			{:else}
				You have {completedDays} completed {completedDays === 1 ? 'day' : 'days'} this
				period — play more days to qualify.
			{/if}
		</p>
	</div>
{/snippet}

<section class="flex flex-1 flex-col gap-3">
	<header>
		<h1 class="text-xl font-bold tracking-tight">Leaderboard</h1>
	</header>

	<Tabs bind:value aria-label="Leaderboard periods">
		<TabsList class="max-w-full overflow-x-auto">
			{#each TAB_ORDER as tab (tab.id)}
				<TabsTrigger value={tab.id}>{tab.label}</TabsTrigger>
			{/each}
		</TabsList>

		<TabsContent value={value} class="mt-3 flex flex-1 flex-col gap-2">
			{#if boardQuery.isPending}
				<div class="flex flex-col gap-2" aria-busy="true" aria-label="Loading leaderboard">
					{#each [0, 1, 2, 3, 4] as i (i)}
						<div
							class="h-11 animate-pulse rounded-xl bg-black/5 dark:bg-white/10"
							role="presentation"
						></div>
					{/each}
				</div>
			{:else if boardQuery.isError || !board}
				<div class="flex flex-col items-center gap-3 py-10 text-center">
					<p class="text-sm text-black/60 dark:text-white/60">
						Could not load the leaderboard.
					</p>
					<button
						type="button"
						class="inline-flex h-10 items-center gap-2 rounded-lg bg-key-bg px-4 font-semibold dark:bg-white/15"
						onclick={() => boardQuery.refetch()}
					>
						<RefreshCw size={16} aria-hidden="true" />
						Try again
					</button>
				</div>
			{:else if board.entries.length === 0}
				<p
					class="py-10 text-center text-sm text-black/60 dark:text-white/60"
					role="status"
				>
					{emptyCopy}
				</p>
				{#if showUnqualifiedCallout}
					{@render unqualifiedCallout()}
				{/if}
			{:else}
				<div class="flex flex-col gap-1" role="table" aria-label="Leaderboard rows">
					<!-- Column hints (visual, not ARIA rows — the values carry
					     their own aria-labels; a hint row must not change
					     row semantics). -->
					<div
						class="flex items-center justify-between px-2 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-black/45 dark:text-white/45"
					>
						<span>Player</span>
						<span>
							{value === 'week' || value === 'month'
								? 'Avg time · Avg guesses · Days'
								: 'Time · Guesses'}
						</span>
					</div>
					{#each board.entries as entry (entry.userId)}
						<RankRow {entry} isCurrentUser={entry.userId === viewerId} />
					{/each}
				</div>

				<!-- Viewer pinned position: completed/qualified but outside the
				     dense cutoff (no duplicate row — the highlight covers it). -->
				{#if viewerEntry && showPositionCallout}
					<PositionCallout
						entry={viewerEntry}
						heading={`Your position: #${viewerEntry.rank}`}
						note={calloutNote}
					/>
				{/if}

				<!-- Week/month only: not yet qualified (server facts only —
				     no duplicated threshold knowledge). -->
				{#if showUnqualifiedCallout && !showPositionCallout}
					{@render unqualifiedCallout()}
				{/if}
			{/if}
		</TabsContent>
	</Tabs>
</section>