<script lang="ts">
	// Admin day-detail modal (Phase 4, page-owned) — click a calendar cell to
	// view everything about that day: word, hint, state, lock, and the
	// state-appropriate actions. The calendar cell itself stays word-only;
	// this modal is where badge-level detail lives (user direction).
	import { Lock, TriangleAlert, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import type { AdminPuzzle } from '$server/admin/service';

	type Props = {
		date: string;
		puzzle: AdminPuzzle | null;
		today: string;
		busy?: boolean;
		onEdit: (puzzle: AdminPuzzle) => void;
		onDelete: (puzzle: AdminPuzzle) => void;
		onReplace: (puzzle: AdminPuzzle) => void;
		onSchedule: (date: string) => void;
		onClose: () => void;
	};

	let { date, puzzle, today, busy = false, onEdit, onDelete, onReplace, onSchedule, onClose }:
		Props = $props();

	const formattedDate = $derived(
		new Intl.DateTimeFormat('en', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'Asia/Manila'
		}).format(new Date(`${date}T00:00:00Z`))
	);

	const isFuture = $derived(date > today);
	const isToday = $derived(date === today);
	const editable = $derived(
		puzzle !== null && puzzle.status === 'SCHEDULED' && puzzle.lockedAt === null && isFuture
	);
	const replaceable = $derived(
		puzzle !== null && puzzle.status === 'SCHEDULED' && puzzle.lockedAt === null && isToday
	);

	const stateText = $derived(
		puzzle === null
			? isFuture
				? 'No puzzle scheduled yet'
				: isToday
					? 'No puzzle scheduled today'
					: 'No puzzle'
			: puzzle.status === 'ACTIVE'
				? puzzle.lockedAt
					? 'Live — a player has started (locked)'
					: 'Live'
				: puzzle.status === 'FINALIZED'
					? 'Finalized'
					: isToday
						? 'Scheduled — never started (Replace needed)'
						: 'Scheduled'
	);
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]"
	role="dialog"
	aria-modal="true"
	tabindex="-1"
	aria-label={formattedDate}
	onclick={(e) => {
		if (e.target === e.currentTarget) onClose();
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
>
	<div class="w-full max-w-md rounded-2xl border border-black/10 bg-background p-5 shadow-xl dark:border-white/10">
		<div class="mb-4 flex items-start justify-between gap-3">
			<div>
				<h2 class="text-lg font-bold tracking-tight">{formattedDate}</h2>
				<p class="text-xs text-black/50 dark:text-white/50">{stateText}</p>
			</div>
			<button
				type="button"
				class="grid size-7 place-items-center rounded-md text-black/50 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10"
				aria-label="Close"
				onclick={onClose}
			>
				<X size={15} />
			</button>
		</div>

		{#if puzzle}
			<div class="flex flex-col gap-2">
				<div class="rounded-xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.05]">
					<p class="text-2xl font-bold tracking-tight">{puzzle.word}</p>
					<p class="mt-1 text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
						Hint letter: {puzzle.hintLetter}
					</p>
				</div>
				{#if puzzle.lockedAt}
					<p class="flex items-center gap-1.5 text-xs text-black/55 dark:text-white/55">
						<Lock size={12} aria-hidden="true" /> Locked — a player has started; the word can no
						longer change.
					</p>
				{/if}
			</div>
		{:else if isFuture}
			<p class="text-sm text-black/60 dark:text-white/60">
				This day has no puzzle yet. Schedule an approved word to fill the gap.
			</p>
		{:else}
			<p class="text-sm text-black/60 dark:text-white/60">
				No puzzle was scheduled for this day.
			</p>
		{/if}

		{#if editable}
			<div class="mt-4 flex items-center justify-end gap-2">
				<Button type="button" variant="outline" onclick={() => onEdit(puzzle!)} disabled={busy}>
					Edit
				</Button>
				<Button
					type="button"
					variant="destructive"
					class="bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:text-[#121213] dark:hover:bg-destructive/80"
					onclick={() => onDelete(puzzle!)}
					disabled={busy}
				>
					Delete puzzle
				</Button>
			</div>
		{:else if replaceable}
			<div class="mt-4 flex flex-col gap-2">
				<p class="flex items-start gap-1.5 text-xs text-amber-700/90 dark:text-amber-300/90">
					<TriangleAlert size={13} class="mt-0.5 shrink-0" aria-hidden="true" />
					Cron missed? Replace the answer atomically — no players have started yet.
				</p>
				<Button type="button" variant="green" class="self-end" onclick={() => onReplace(puzzle!)} disabled={busy}>
					Replace today's puzzle
				</Button>
			</div>
		{:else if puzzle === null && isFuture}
			<div class="mt-4 flex justify-end">
				<Button type="button" variant="green" onclick={() => onSchedule(date)} disabled={busy}>
					Schedule puzzle
				</Button>
			</div>
		{/if}
	</div>
</div>
