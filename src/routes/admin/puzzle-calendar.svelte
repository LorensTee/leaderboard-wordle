<script lang="ts">
	// Admin calendar month grid (Phase 4, D2 page-owned component, plan §9).
	// Day-cell design (user direction, 2026-08-30): each cell shows ONLY the
	// day number + word; state is communicated by the cell COLOR (legend
	// below) + the accessible label; all detail/actions live in the
	// day-detail modal (click a cell). No status badges, no hint micro-text,
	// no inline action buttons — cells never overflow.
	import { CalendarDate, getDayOfWeek } from '@internationalized/date';
	import { CalendarPlus, ChevronLeft, ChevronRight, Lock } from '@lucide/svelte';
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
		onOpenDay: (date: string, puzzle: AdminPuzzle | null) => void;
		onSchedule: (date: string) => void;
	};

	let {
		month,
		puzzles,
		today,
		busy = false,
		onPrev,
		onNext,
		onOpenDay,
		onSchedule
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

	/** State text — the accessible name carries what the color communicates. */
	function stateLabel(p: AdminPuzzle | null, date: string): string {
		if (!p) return date > today ? 'empty, schedule' : date === today ? 'empty today' : 'empty';
		if (p.status === 'ACTIVE') return p.lockedAt ? 'Live — locked (a player has started)' : 'Live';
		if (p.status === 'FINALIZED') return 'Finalized';
		if (p.date === today) return p.lockedAt ? 'Replace needed — locked' : 'Replace needed';
		return 'Scheduled';
	}

	/** Cell accessible name: empty future cells announce the action; puzzle
	 *  cells carry date + state + word (opened on click into day detail). */
	function cellLabel(p: AdminPuzzle | null, date: string): string {
		if (!p && date > today) return `Schedule a puzzle for ${date}`;
		return `${date} — ${stateLabel(p, date)}` + (p ? ` — word ${p.word}` : '');
	}

	/**
	 * Cell tint by state (light + dark). FINALIZED = neutral faint; SCHEDULED
	 * future = green tint; LIVE today = solid green (white text); today
	 * SCHEDULED (cron missed) = amber tint. Lock adds the lock icon.
	 */
	function cellClasses(p: AdminPuzzle | null): string {
		const base = 'border-black/10 bg-transparent dark:border-white/10';
		if (!p) return base;
		if (p.status === 'ACTIVE')
			return 'border-tile-green bg-tile-green text-white dark:border-tile-green dark:bg-tile-green dark:text-white';
		if (p.status === 'FINALIZED')
			return 'border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.05]';
		if (p.date === today)
			return 'border-amber-500/50 bg-amber-500/15 dark:border-amber-500/60 dark:bg-amber-500/20';
		return 'border-tile-green/35 bg-tile-green/10 dark:border-tile-green/45 dark:bg-tile-green/15';
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

	<!-- Full-month grid at every width: cells show ONLY day + word, so the
	     seven columns fit the 390px viewport with no horizontal scroll — no
	     cut columns, no swipe affordance needed (user direction). -->
	<div
		class="grid grid-cols-7 gap-1.5"
		aria-busy={busy}
		aria-label="Puzzle schedule calendar"
	>
			{#each WEEKDAYS as wd (wd)}
				<div class="pb-1 text-center text-xs font-medium text-black/45 dark:text-white/45">{wd}</div>
			{/each}

			{#each gridDays as day, i (day ? iso(day) : `pad-${i}`)}
				{#if day === null}
					<div class="min-h-20 rounded-xl border border-dashed border-black/5 dark:border-white/5"></div>
				{:else}
					{@const date = iso(day)}
					{@const puzzle = byDate.get(date) ?? null}
					{@const todayCell = isToday(day)}
					{@const futureCell = isFuture(day)}
					{@const solid = puzzle?.status === 'ACTIVE'}
					{@const dim = solid ? 'text-white/80' : 'text-black/50 dark:text-white/50'}
					<button
						type="button"
						class={`relative flex min-h-20 flex-col items-start gap-1 rounded-xl border p-1 text-left transition-colors hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring/60 sm:p-1.5 dark:hover:brightness-110 ${cellClasses(puzzle)} ${todayCell ? 'ring-1 ring-primary/40' : ''}`}
						aria-label={cellLabel(puzzle, date)}
						aria-current={todayCell ? 'date' : undefined}
						data-date={date}
						onclick={() => (puzzle ? onOpenDay(date, puzzle) : futureCell ? onSchedule(date) : onOpenDay(date, null))}
					>
						<span class={`flex w-full items-center justify-between text-xs font-semibold tabular-nums ${dim}`}>
							{day.day}
							{#if puzzle?.lockedAt}
								<Lock size={11} class={solid ? 'text-white/70' : 'text-black/45 dark:text-white/45'} aria-hidden="true" />
							{/if}
						</span>
						{#if puzzle}
							<span
								class={`w-full truncate text-xs font-semibold tracking-tight sm:text-[13px] ${solid ? 'text-white' : 'text-black dark:text-white'}`}
							>
								{puzzle.word}
							</span>
						{:else if futureCell}
							<span class="self-end text-[11px] text-black/45 dark:text-white/45" aria-hidden="true">
								<CalendarPlus size={13} />
							</span>
						{/if}
					</button>
				{/if}
			{/each}
		</div>

	<!-- Legend: the color coding is explained in text (not color-only). -->
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-black/55 dark:text-white/55">
		<span class="inline-flex items-center gap-1.5">
			<i class="size-2.5 rounded-[4px] bg-tile-green/25"></i>Scheduled
		</span>
		<span class="inline-flex items-center gap-1.5">
			<i class="size-2.5 rounded-[4px] bg-tile-green"></i>Live today
		</span>
		<span class="inline-flex items-center gap-1.5">
			<i class="size-2.5 rounded-[4px] border border-black/20 bg-black/5 dark:border-white/25 dark:bg-white/10"></i>Finalized
		</span>
		<span class="inline-flex items-center gap-1.5">
			<i class="size-2.5 rounded-[4px] bg-amber-500/60"></i>Needs replacement
		</span>
		<span class="inline-flex items-center gap-1.5">
			<Lock size={10} aria-hidden="true" />Locked
		</span>
	</div>
</div>
