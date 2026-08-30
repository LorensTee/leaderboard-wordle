<script lang="ts">
	// Admin calendar month grid (Phase 4, D2 page-owned component, plan §9).
	// Each day is a puzzle slot: empty slots offer "Schedule"; future
	// SCHEDULED days show word + hint + edit/delete; today-SCHEDULED shows
	// the "Needs replacement" recovery affordance (D8 — the ONLY today
	// mutation); ACTIVE/FINALIZED/locked days are immutable badges. The
	// calendar is runtime-rendered (no generated artifacts); word data comes
	// from the role-gated API — never statically bundled (secrecy).
	import { CalendarDate, getDayOfWeek } from '@internationalized/date';
	import { CalendarPlus, ChevronLeft, ChevronRight, Lock, Pencil, Trash2 } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import type { AdminPuzzle } from '$server/admin/service';

	type Props = {
		/** First day of the visible month (year+month drive the grid). */
		month: CalendarDate;
		/** Windowed puzzles (already filtered to the month frame). */
		puzzles: AdminPuzzle[];
		/** Today's Asia/Manila date ISO — UI highlight only (server truth rules). */
		today: string;
		busy?: boolean;
		onPrev: () => void;
		onNext: () => void;
		onSchedule: (date: string) => void;
		onEdit: (puzzle: AdminPuzzle) => void;
		onDelete: (puzzle: AdminPuzzle) => void;
		onReplace: (puzzle: AdminPuzzle) => void;
	};

	let {
		month,
		puzzles,
		today,
		busy = false,
		onPrev,
		onNext,
		onSchedule,
		onEdit,
		onDelete,
		onReplace
	}: Props = $props();

	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	const byDate = $derived(new Map(puzzles.map((p) => [p.date, p])));
	const year = $derived(month.year);
	const monthNumber = $derived(month.month);
	const daysInMonth = $derived(month.calendar.getDaysInMonth(month));
	/** Leading empty cells for a Monday-first week (M1 canonical week start). */
	const leadOffset = $derived((getDayOfWeek(month, 'en-US') + 6) % 7);
	const gridDays = $derived(
		Array.from({ length: leadOffset + daysInMonth }, (_, i) => {
			const day = i - leadOffset + 1;
			return day >= 1 && day <= daysInMonth ? new CalendarDate(year, monthNumber, day) : null;
		})
	);

	function iso(d: CalendarDate): string {
		return d.toString(); // 'YYYY-MM-DD'
	}

	function isToday(d: CalendarDate): boolean {
		return iso(d) === today;
	}

	function isFuture(d: CalendarDate): boolean {
		return iso(d) > today;
	}

	/** A future SCHEDULED puzzle is editable/deletable; today's is replace-only. */
	function canEdit(puzzle: AdminPuzzle): boolean {
		return puzzle.status === 'SCHEDULED' && puzzle.lockedAt === null && puzzle.date > today;
	}

	const monthLabel = $derived(
		new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }).format(
			new Date(`${month.toString()}T00:00:00Z`)
		)
	);
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between" aria-label="Calendar month navigation">
		<h2 class="text-sm font-semibold tracking-tight text-black/70 dark:text-white/70">
			{monthLabel}
		</h2>
		<div class="flex items-center gap-1">
			<button
				type="button"
				class="grid size-8 place-items-center rounded-lg text-black/60 hover:bg-black/5 disabled:opacity-40 dark:text-white/60 dark:hover:bg-white/10"
				aria-label="Previous month"
				onclick={onPrev}
			>
				<ChevronLeft size={16} />
			</button>
			<button
				type="button"
				class="grid size-8 place-items-center rounded-lg text-black/60 hover:bg-black/5 disabled:opacity-40 dark:text-white/60 dark:hover:bg-white/10"
				aria-label="Next month"
				onclick={onNext}
			>
				<ChevronRight size={16} />
			</button>
		</div>
	</div>

	<div class="grid grid-cols-7 gap-1.5" aria-busy={busy} aria-label="Puzzle schedule calendar">
		{#each WEEKDAYS as wd (wd)}
			<div class="pb-1 text-center text-xs font-medium text-black/45 dark:text-white/45">{wd}</div>
		{/each}

		{#each gridDays as day, i (day ? iso(day) : `pad-${i}`)}
			{#if day === null}
				<div class="min-h-20 rounded-xl border border-dashed border-black/5 dark:border-white/5"></div>
			{:else}
				{@const date = iso(day)}
				{@const puzzle = byDate.get(date)}
				{@const todayCell = isToday(day)}
				{@const futureCell = isFuture(day)}
				{@const editable = puzzle !== undefined && canEdit(puzzle)}
				<div
					class="relative flex min-h-20 flex-col gap-1 rounded-xl border p-1.5
						{todayCell ? 'border-primary/60 ring-1 ring-primary/30' : 'border-black/10 dark:border-white/10'}"
					aria-current={todayCell ? 'date' : undefined}
					data-date={date}
				>
					<div class="flex items-center justify-between gap-1">
						<span
							class="text-xs font-semibold tabular-nums {todayCell
								? 'text-primary'
								: 'text-black/50 dark:text-white/50'}"
						>
							{day.day}
						</span>
						{#if puzzle?.lockedAt}
							<span class="inline-flex items-center gap-0.5" title="Locked (a player has started)">
								<Lock size={11} class="text-black/45 dark:text-white/45" />
								<span class="text-[10px] font-medium text-black/45 dark:text-white/45">Locked</span>
							</span>
						{/if}
					</div>

					{#if puzzle}
						<div class="flex flex-col gap-1">
							<p class="truncate text-[13px] font-semibold tracking-tight">{puzzle.word}</p>
							<div class="flex flex-wrap items-center gap-1">
								{#if puzzle.status === 'SCHEDULED'}
									{#if puzzle.date === today}
										<Badge variant="outline" class="border-amber-500/40 text-amber-600 dark:text-amber-400">
											Needs replacement
										</Badge>
									{:else if puzzle.date > today}
										<Badge variant="secondary">Scheduled</Badge>
									{:else}
										<Badge variant="outline">Scheduled</Badge>
									{/if}
								{:else if puzzle.status === 'ACTIVE'}
									<Badge>Live</Badge>
								{:else}
									<Badge variant="outline">Finalized</Badge>
								{/if}
								<span class="text-[10px] uppercase text-black/40 dark:text-white/40"
									>hint {puzzle.hintLetter}</span
								>
							</div>
						</div>

						<div class="mt-auto flex items-center gap-1 pt-1">
							{#if editable}
								<button
									type="button"
									class="grid size-6 place-items-center rounded-md text-black/55 hover:bg-black/5 dark:text-white/55 dark:hover:bg-white/10"
									aria-label="Edit puzzle for {date}"
									onclick={() => onEdit(puzzle)}
								>
									<Pencil size={12} />
								</button>
								<button
									type="button"
									class="grid size-6 place-items-center rounded-md text-destructive/80 hover:bg-destructive/10"
									aria-label="Delete puzzle for {date}"
									onclick={() => onDelete(puzzle)}
								>
									<Trash2 size={12} />
								</button>
							{:else if puzzle.status === 'SCHEDULED' && puzzle.date === today && !puzzle.lockedAt}
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
									aria-label="Replace today's puzzle"
									onclick={() => onReplace(puzzle)}
								>
									Replace
								</button>
							{:else if futureCell}
								<span class="text-[10px] text-black/35 dark:text-white/35"
									>Immutable</span
								>
							{/if}
						</div>
					{:else if futureCell}
						<button
							type="button"
							class="mt-auto flex items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-[11px] font-medium text-black/50 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10"
							aria-label="Schedule a puzzle for {date}"
							onclick={() => onSchedule(date)}
						>
							<CalendarPlus size={12} />
							Schedule
						</button>
					{:else}
						<span class="mt-auto text-[10px] text-black/30 dark:text-white/30">—</span>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</div>